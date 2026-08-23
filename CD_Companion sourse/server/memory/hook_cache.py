import json
import logging
import os

from server.memory.constants import SAVE_DIR, HOOK_OFFSETS_FILE

log = logging.getLogger('cd_server')


def _load_hook_offsets():
    try:
        with open(HOOK_OFFSETS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_hook_offsets(data):
    try:
        os.makedirs(SAVE_DIR, exist_ok=True)
        with open(HOOK_OFFSETS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass
