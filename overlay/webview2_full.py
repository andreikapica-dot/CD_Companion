# -*- coding: utf-8 -*-
"""Modern Full-mode host backed by the installed Microsoft Edge WebView2."""

import os
import ctypes
import json
import socket
import subprocess
import sys
import threading
import time


class _FullModeApi:
    """Small native bridge used by the WebView2 Full-mode controls."""

    GWL_STYLE = -16
    GWL_EXSTYLE = -20
    WS_CAPTION = 0x00C00000
    WS_THICKFRAME = 0x00040000
    WS_MINIMIZEBOX = 0x00020000
    WS_MAXIMIZEBOX = 0x00010000
    WS_SYSMENU = 0x00080000
    WS_EX_TRANSPARENT = 0x00000020
    SWP_NOZORDER = 0x0004
    SWP_SHOWWINDOW = 0x0040
    SWP_FRAMECHANGED = 0x0020
    WM_NCLBUTTONDOWN = 0x00A1
    HTCAPTION = 2
    GW_CHILD = 5
    GW_HWNDNEXT = 2

    class RECT(ctypes.Structure):
        _fields_ = [
            ('left', ctypes.c_long), ('top', ctypes.c_long),
            ('right', ctypes.c_long), ('bottom', ctypes.c_long),
        ]

    class POINT(ctypes.Structure):
        _fields_ = [('x', ctypes.c_long), ('y', ctypes.c_long)]

    def __init__(self, cfg, settings, persist_config):
        self.cfg = cfg
        self.settings = settings
        self.persist_config = persist_config
        self.window = None
        self._square_style = None
        self._native_round = False
        self._dragging = False
        self._managed_region = None
        self._lock = threading.RLock()
        self.user32 = ctypes.windll.user32
        self.gdi32 = ctypes.windll.gdi32
        hwnd_t = ctypes.c_void_p
        self.user32.GetWindowRect.argtypes = [hwnd_t, ctypes.POINTER(self.RECT)]
        self.user32.GetWindowRect.restype = ctypes.c_int
        self.user32.GetWindowLongW.argtypes = [hwnd_t, ctypes.c_int]
        self.user32.GetWindowLongW.restype = ctypes.c_long
        self.user32.SetWindowLongW.argtypes = [hwnd_t, ctypes.c_int, ctypes.c_long]
        self.user32.SetWindowLongW.restype = ctypes.c_long
        self.user32.SetWindowPos.argtypes = [
            hwnd_t, hwnd_t, ctypes.c_int, ctypes.c_int,
            ctypes.c_int, ctypes.c_int, ctypes.c_uint,
        ]
        self.user32.SetWindowPos.restype = ctypes.c_int
        self.user32.SetWindowRgn.argtypes = [hwnd_t, ctypes.c_void_p, ctypes.c_int]
        self.user32.SetWindowRgn.restype = ctypes.c_int
        self.user32.GetWindow.argtypes = [hwnd_t, ctypes.c_uint]
        self.user32.GetWindow.restype = hwnd_t
        self.user32.SendMessageW.argtypes = [
            hwnd_t, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p,
        ]
        self.user32.SendMessageW.restype = ctypes.c_void_p
        self.user32.GetCursorPos.argtypes = [ctypes.POINTER(self.POINT)]
        self.user32.GetCursorPos.restype = ctypes.c_int
        self.user32.GetAsyncKeyState.argtypes = [ctypes.c_int]
        self.user32.GetAsyncKeyState.restype = ctypes.c_short
        self.gdi32.CreateEllipticRgn.argtypes = [
            ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
        ]
        self.gdi32.CreateEllipticRgn.restype = ctypes.c_void_p
        self.gdi32.DeleteObject.argtypes = [ctypes.c_void_p]
        self.gdi32.DeleteObject.restype = ctypes.c_int

    def bind(self, window):
        self.window = window

    def _hwnd(self):
        native = getattr(self.window, 'native', None) if self.window else None
        if native is None:
            return None
        handle = getattr(native, 'Handle', None)
        if handle is None:
            return None
        try:
            return int(handle.ToInt64())
        except Exception:
            try:
                return int(handle.ToInt32())
            except Exception:
                return None

    def _scale(self):
        try:
            return max(0.5, float(getattr(self.window.native, '_scale', 1.0)))
        except Exception:
            return 1.0

    def _rect(self, hwnd):
        rect = self.RECT()
        if not self.user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return None
        return rect

    def _save_rect(self, prefix, rect, scale):
        self.cfg[f'{prefix}X'] = round(rect.left / scale)
        self.cfg[f'{prefix}Y'] = round(rect.top / scale)
        self.cfg[f'{prefix}Width'] = max(1, round((rect.right - rect.left) / scale))
        if prefix == 'square':
            self.cfg[f'{prefix}Height'] = max(1, round((rect.bottom - rect.top) / scale))

    def _persist(self):
        if self.persist_config:
            self.persist_config(self.cfg)

    def _set_transparent_corners(self, enabled):
        """Use the WinForms transparency key behind the clipped WebView."""
        native = getattr(self.window, 'native', None) if self.window else None
        if native is None:
            return
        try:
            from System import Action
            from System.Drawing import Color

            def apply():
                if enabled:
                    key = Color.FromArgb(1, 0, 1)
                    native.AllowTransparency = True
                    native.BackColor = key
                    native.TransparencyKey = key
                else:
                    native.TransparencyKey = Color.Empty
                    native.BackColor = Color.Black

            if native.InvokeRequired:
                native.Invoke(Action(apply))
            else:
                apply()
        except Exception as exc:
            print(f'[!] Cannot update circular window transparency: {exc}')

    def _set_managed_region(self, enabled, width=0, height=0):
        """Clip the WinForms host itself, including WebView2 composition."""
        native = getattr(self.window, 'native', None) if self.window else None
        if native is None:
            return
        try:
            from System import Action
            from System.Drawing import Region
            from System.Drawing.Drawing2D import GraphicsPath

            def apply():
                old_region = self._managed_region
                if not enabled:
                    native.Region = None
                    self._managed_region = None
                else:
                    path = GraphicsPath()
                    path.AddEllipse(0, 0, max(1, int(width)), max(1, int(height)))
                    region = Region(path)
                    native.Region = region
                    self._managed_region = region
                    path.Dispose()
                if old_region is not None and old_region is not self._managed_region:
                    old_region.Dispose()

            if native.InvokeRequired:
                native.Invoke(Action(apply))
            else:
                apply()
        except Exception as exc:
            print(f'[!] Cannot update managed circular region: {exc}')

    def _set_child_regions(self, hwnd, enabled, width=0, height=0):
        """Clip the native WebView host child, which can outdraw its parent."""
        child = self.user32.GetWindow(hwnd, self.GW_CHILD)
        while child:
            if enabled:
                region = self.gdi32.CreateEllipticRgn(
                    0, 0, max(1, int(width)), max(1, int(height)))
                if region and not self.user32.SetWindowRgn(child, region, True):
                    self.gdi32.DeleteObject(region)
            else:
                self.user32.SetWindowRgn(child, None, True)
            child = self.user32.GetWindow(child, self.GW_HWNDNEXT)

    def _make_children_interactive(self, hwnd):
        """Undo pywebview's click-through flag without losing transparency."""
        child = self.user32.GetWindow(hwnd, self.GW_CHILD)
        while child:
            exstyle = int(self.user32.GetWindowLongW(child, self.GWL_EXSTYLE))
            if exstyle & self.WS_EX_TRANSPARENT:
                self.user32.SetWindowLongW(
                    child, self.GWL_EXSTYLE,
                    ctypes.c_long(exstyle & ~self.WS_EX_TRANSPARENT).value)
            child = self.user32.GetWindow(child, self.GW_HWNDNEXT)

    def _apply_shape(self, enabled, remember_current=True):
        with self._lock:
            hwnd = self._hwnd()
            if not hwnd:
                return {'ok': False, 'roundWindow': self._native_round,
                        'error': 'WebView2 window is not ready'}

            user32 = self.user32
            gdi32 = self.gdi32
            scale = self._scale()
            current = self._rect(hwnd)
            if current is None:
                return {'ok': False, 'roundWindow': self._native_round,
                        'error': 'Cannot read window geometry'}

            style = int(user32.GetWindowLongW(hwnd, self.GWL_STYLE))
            if self._square_style is None:
                self._square_style = style

            if enabled:
                if remember_current and not self._native_round:
                    self._save_rect('square', current, scale)

                size = max(240, int(self.cfg.get('roundWidth', 360)))
                x = int(self.cfg.get('roundX', round(current.left / scale)))
                y = int(self.cfg.get('roundY', round(current.top / scale)))
                width_px = max(1, round(size * scale))
                height_px = width_px

                # Do not use WinForms TransparencyKey here. WebView2 is drawn
                # by a separate composition surface, so Windows sees only the
                # transparent key underneath it and sends every mouse event to
                # the game. Native regions below provide the circular shape
                # while keeping the whole minimap interactive.
                self._set_transparent_corners(False)

                # Compact mode is a regular resizable square/rectangle. Keep
                # WS_THICKFRAME so every edge and corner can resize it, while
                # removing only the title bar and its window buttons.
                borderless = style & ~(
                    self.WS_CAPTION | self.WS_MINIMIZEBOX |
                    self.WS_MAXIMIZEBOX | self.WS_SYSMENU)
                user32.SetWindowLongW(
                    hwnd, self.GWL_STYLE, ctypes.c_long(borderless).value)
                user32.SetWindowPos(
                    hwnd, None, round(x * scale), round(y * scale),
                    width_px, height_px,
                    self.SWP_NOZORDER | self.SWP_SHOWWINDOW | self.SWP_FRAMECHANGED,
                )
                # Clear any ellipse left by an older circular build. WebView2
                # renders on a separate composition surface, so a rectangular
                # compact window is the reliable, fully interactive option.
                self._set_managed_region(False)
                user32.SetWindowRgn(hwnd, None, True)
                self._set_child_regions(hwnd, False)
                self._make_children_interactive(hwnd)
                self._native_round = True
                self.cfg['roundWindow'] = True
                self.settings['roundWindow'] = True
            else:
                if remember_current and self._native_round:
                    self._save_rect('round', current, scale)

                self._set_managed_region(False)
                self._set_child_regions(hwnd, False)
                self._set_transparent_corners(False)
                user32.SetWindowRgn(hwnd, None, True)
                user32.SetWindowLongW(
                    hwnd, self.GWL_STYLE, ctypes.c_long(self._square_style).value)
                width = max(800, int(self.cfg.get('squareWidth', self.cfg.get('width', 1280))))
                height = max(600, int(self.cfg.get('squareHeight', self.cfg.get('height', 800))))
                x = int(self.cfg.get('squareX', self.cfg.get('x', round(current.left / scale))))
                y = int(self.cfg.get('squareY', self.cfg.get('y', round(current.top / scale))))
                user32.SetWindowPos(
                    hwnd, None, round(x * scale), round(y * scale),
                    round(width * scale), round(height * scale),
                    self.SWP_NOZORDER | self.SWP_SHOWWINDOW | self.SWP_FRAMECHANGED,
                )
                self._native_round = False
                self.cfg['roundWindow'] = False
                self.settings['roundWindow'] = False

            self._persist()
            return {'ok': True, 'roundWindow': self._native_round}

    def apply_initial_shape(self):
        if bool(self.cfg.get('roundWindow', False)):
            # The native form exists when the shown event fires.
            time.sleep(0.05)
            self._apply_shape(True, remember_current=False)

    def set_round_window(self, enabled):
        return self._apply_shape(bool(enabled), remember_current=True)

    def toggle_round_window(self):
        return self._apply_shape(not self._native_round, remember_current=True)

    def drag_window(self):
        hwnd = self._hwnd()
        if not hwnd or self._dragging:
            return False

        def worker():
            self._dragging = True
            try:
                start_cursor = self.POINT()
                start_rect = self._rect(hwnd)
                if start_rect is None or not self.user32.GetCursorPos(ctypes.byref(start_cursor)):
                    return
                while self.user32.GetAsyncKeyState(0x01) & 0x8000:
                    cursor = self.POINT()
                    if self.user32.GetCursorPos(ctypes.byref(cursor)):
                        self.user32.SetWindowPos(
                            hwnd, None,
                            start_rect.left + cursor.x - start_cursor.x,
                            start_rect.top + cursor.y - start_cursor.y,
                            0, 0, self.SWP_NOZORDER | 0x0001,
                        )
                    time.sleep(0.01)
                rect = self._rect(hwnd)
                if rect is not None:
                    self._save_rect('round' if self._native_round else 'square', rect, self._scale())
                    self._persist()
            finally:
                self._dragging = False

        threading.Thread(target=worker, name='cd-round-drag', daemon=True).start()
        return True

    def save_geometry(self):
        hwnd = self._hwnd()
        if not hwnd:
            return
        rect = self._rect(hwnd)
        if rect is None:
            return
        scale = self._scale()
        if self._native_round:
            self._save_rect('round', rect, scale)
        else:
            self.cfg['x'] = round(rect.left / scale)
            self.cfg['y'] = round(rect.top / scale)
            self.cfg['width'] = max(800, round((rect.right - rect.left) / scale))
            self.cfg['height'] = max(600, round((rect.bottom - rect.top) / scale))
        self._persist()


def run(cfg, url, inject_js, start_server_thread, app_dir, settings,
        map_provider='mapgenie', greymane_adapter_js='', persist_config=None):
    """Run the selected interactive map while the game server is isolated."""
    import webview

    # Qt's event stack can block asyncio's Windows socket initialization when
    # both live in one process. Keep the game server in a small child process.
    child_env = os.environ.copy()
    # A frozen child must unpack independently. Reusing the parent's _MEI
    # directory keeps DLLs locked and makes PyInstaller show a cleanup warning
    # after a forced window close.
    child_env.pop('_PYI_APPLICATION_HOME_DIR', None)
    child_env['PYINSTALLER_RESET_ENVIRONMENT'] = '1'
    server_process = subprocess.Popen(
        [sys.executable, '--server-child', f'--parent-pid={os.getpid()}'],
        cwd=app_dir,
        env=child_env,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
    )

    # Do not silently open a disconnected UI if the in-process server failed.
    server_online = False
    server_error = ''
    # A frozen child now unpacks into its own temporary directory so it cannot
    # lock the GUI's _MEI folder. On slower disks/antivirus scans the 120 MB
    # one-file executable can need considerably longer than the old 7-second
    # window before Python imports reach the WebSocket bind.
    server_deadline = time.monotonic() + 60.0
    while time.monotonic() < server_deadline:
        exit_code = server_process.poll()
        if exit_code is not None:
            server_error = f'server child exited with code {exit_code}'
            break
        try:
            with socket.create_connection(('127.0.0.1', 7891), timeout=0.25):
                server_online = True
                break
        except OSError as exc:
            server_error = str(exc)
            time.sleep(0.15)

    diagnostic_path = os.path.join(app_dir, 'cd_webview2.log')
    try:
        with open(diagnostic_path, 'a', encoding='utf-8') as log:
            stamp = time.strftime('%Y-%m-%d %H:%M:%S')
            log.write(f'{stamp} server_online={server_online} error={server_error}\n')
    except OSError:
        pass

    if not server_online:
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            None,
            'The internal CD Companion server did not start.\n\n'
            f'Details: {server_error}\n\nLog: {diagnostic_path}',
            'CD Companion — Server error',
            0x10,
        )
        try:
            server_process.terminate()
        except OSError:
            pass
        return

    width = max(800, int(cfg.get('width', 1280)))
    height = max(600, int(cfg.get('height', 800)))
    x = cfg.get('x')
    y = cfg.get('y')

    native_api = _FullModeApi(cfg, settings, persist_config)
    window = webview.create_window(
        'CD Companion — Full',
        url=url,
        width=width,
        height=height,
        x=int(x) if isinstance(x, (int, float)) else None,
        y=int(y) if isinstance(y, (int, float)) else None,
        min_size=(240, 240),
        on_top=True,
        background_color='#000000',
        transparent=False,
        shadow=False,
    )
    native_api.bind(window)

    # Do not pass the native bridge object as js_api. PyWebView recursively
    # scans every public attribute on such an object; ctypes WinDLL attributes
    # make that scan effectively unbounded and freeze the loading thread.
    # Expose only the two operations that the page is allowed to call.
    def set_round_window(enabled):
        return native_api.set_round_window(enabled)

    def drag_window():
        return native_api.drag_window()

    window.expose(set_round_window, drag_window)
    window.events.shown += native_api.apply_initial_shape
    window.events.closing += native_api.save_geometry

    def inject_overlay():
        try:
            prelude = (
                'window.__cdSettings = ' + json.dumps(settings) + ';'
                'window.__cdNativeRealtimeEnabled = false;'
                'window.__cdWebView2 = true;'
                'window.__cdMapProvider = ' + json.dumps(map_provider) + ';'
            )
            adapter = greymane_adapter_js if map_provider == 'greymane' else ''
            window.evaluate_js(prelude + adapter + inject_js)
        except Exception as exc:
            print(f'[!] WebView2 overlay injection failed: {exc}')

    # Re-inject after every top-level navigation (including login redirects).
    window.events.loaded += inject_overlay

    def stop_server():
        native_api.save_geometry()
        if server_process.poll() is None:
            try:
                server_process.terminate()
                server_process.wait(timeout=5)
            except OSError:
                pass
            except subprocess.TimeoutExpired:
                server_process.kill()
                server_process.wait(timeout=2)

    window.events.closed += stop_server

    storage_path = os.path.join(app_dir, 'webview2_profile')
    webview.start(
        gui='edgechromium',
        debug=False,
        private_mode=False,
        storage_path=storage_path,
    )
