# -*- coding: utf-8 -*-
"""Modern Full-mode host backed by the installed Microsoft Edge WebView2."""

import os
import json
import socket
import subprocess
import sys
import time


def run(cfg, url, inject_js, start_server_thread, app_dir, settings,
        map_provider='mapgenie', greymane_adapter_js=''):
    """Run the selected interactive map while the game server is isolated."""
    import webview

    # Qt's event stack can block asyncio's Windows socket initialization when
    # both live in one process. Keep the game server in a small child process.
    server_process = subprocess.Popen(
        [sys.executable, '--server-child'],
        cwd=app_dir,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
    )

    # Do not silently open a disconnected UI if the in-process server failed.
    server_online = False
    server_error = ''
    for _ in range(20):
        try:
            with socket.create_connection(('127.0.0.1', 7891), timeout=0.25):
                server_online = True
                break
        except OSError as exc:
            server_error = str(exc)
            time.sleep(0.1)

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

    window = webview.create_window(
        'CD Companion — Full',
        url=url,
        width=width,
        height=height,
        x=int(x) if isinstance(x, (int, float)) else None,
        y=int(y) if isinstance(y, (int, float)) else None,
        min_size=(800, 600),
        on_top=True,
        background_color='#000000',
    )

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
        if server_process.poll() is None:
            try:
                server_process.terminate()
            except OSError:
                pass

    window.events.closed += stop_server

    storage_path = os.path.join(app_dir, 'webview2_profile')
    webview.start(
        gui='edgechromium',
        debug=False,
        private_mode=False,
        storage_path=storage_path,
    )
