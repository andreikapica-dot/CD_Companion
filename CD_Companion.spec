# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all

pythonnet_datas, pythonnet_binaries, pythonnet_hiddenimports = collect_all('pythonnet')
clr_loader_datas, clr_loader_binaries, clr_loader_hiddenimports = collect_all('clr_loader')

a = Analysis(
    ['launcher.py'],
    pathex=['../marker_build2'],
    binaries=pythonnet_binaries + clr_loader_binaries,
    datas=[
        ('server', 'server'),
        ('overlay', 'overlay'),
        ('shared', 'shared'),
        ('launcher.ico', '.'),
        # Bottle is a single-file module used by pywebview's embedded server.
        # Bundle the source explicitly because it is loaded outside pywebview's
        # regular import graph on Python 3.14.
        ('../marker_build2/bottle.py', '.'),
        ('../marker_build2/typing_extensions.py', '.'),
    ] + pythonnet_datas + clr_loader_datas,
    # pywebview imports its embedded HTTP server lazily, so PyInstaller does
    # not discover Bottle by itself on a clean build.
    hiddenimports=[
        'webview.platforms.edgechromium',
        # Bottle is distributed as a one-file module. Its imports must also
        # be listed explicitly when the module itself is bundled as data.
        'bottle', 'argparse', 'base64', 'calendar', 'email.utils', 'hmac',
        'mimetypes', 'tempfile', 'hashlib', 'datetime', 'traceback',
        'unicodedata', 'json', 'http.client', 'urllib.parse', 'http.cookies',
        'collections.abc', 'pickle', 'configparser', 'inspect',
        'importlib.util', 'wsgiref.handlers', 'wsgiref.simple_server',
        'socket', 'asyncio', 'subprocess',
        'clr', 'pythonnet', 'clr_loader',
    ] + pythonnet_hiddenimports + clr_loader_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='CD_Companion',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['launcher.ico'],
)
