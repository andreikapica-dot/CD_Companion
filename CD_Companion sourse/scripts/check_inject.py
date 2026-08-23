"""
Valida a sintaxe do inject.js concatenando os fragmentos de inject_parts/.
Uso: python scripts/check_inject.py
"""
import os
import subprocess
import sys
import tempfile

_INJECT_PARTS = [
    '00_bootstrap.js', '01_state.js', '02_tooltip.js', '03_marker.js',
    '04_arrow.js', '05_panel.js', '06_teleport.js', '07_location_sync.js',
    '08_nearby.js', '09_websocket.js', '10_waypoints.js', '11_layout.js',
    '12_init.js',
]

def main():
    parts_dir = os.path.join(os.path.dirname(__file__), '..', 'overlay', 'inject_parts')

    missing = [p for p in _INJECT_PARTS if not os.path.isfile(os.path.join(parts_dir, p))]
    if missing:
        print(f'FAIL — fragmentos ausentes: {", ".join(missing)}')
        sys.exit(1)

    concat = ''
    for p in _INJECT_PARTS:
        with open(os.path.join(parts_dir, p), encoding='utf-8') as f:
            concat += f.read()

    tmp = os.path.join(tempfile.gettempdir(), 'inject_check.js')
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(concat)

    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    if r.returncode == 0:
        print('OK — inject syntax valid')
    else:
        print('FAIL — erro de sintaxe:')
        print(r.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
