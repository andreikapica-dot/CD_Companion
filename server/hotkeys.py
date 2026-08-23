import ctypes
import ctypes.wintypes
import json
import os

from server.memory.constants import SAVE_DIR

HOTKEY_SETTINGS_FILE = os.path.join(SAVE_DIR, "cd_hotkeys.json")

DEFAULT_HOTKEYS = {
    "teleport_marker": {"vk": 0x74, "mod": 0,    "enabled": True},   # F5
    "abort":           {"vk": 0x74, "mod": 0x10,  "enabled": True},   # Shift+F5
    "open_nearby":     {"vk": 0x4E, "mod": 0x10,  "enabled": True},   # Shift+N
    "open_waypoints":  {"vk": 0x59, "mod": 0x10,  "enabled": True},   # Shift+Y
    "focus_toggle":    {"vk": 0,    "mod": 0,     "enabled": False},  # disabled by default
}

VK_NAMES = {
    0x70: "F1", 0x71: "F2", 0x72: "F3", 0x73: "F4", 0x74: "F5", 0x75: "F6",
    0x76: "F7", 0x77: "F8", 0x78: "F9", 0x79: "F10", 0x7A: "F11", 0x7B: "F12",
    0x7C: "F13", 0x7D: "F14", 0x7E: "F15", 0x7F: "F16", 0x80: "F17", 0x81: "F18",
    0x82: "F19", 0x83: "F20", 0x84: "F21", 0x85: "F22", 0x86: "F23", 0x87: "F24",
    0x4E: "N", 0x59: "Y", 0x46: "F",
    0x24: "Home", 0x23: "End", 0x2D: "Ins", 0x2E: "Del",
    0x21: "PgUp", 0x22: "PgDown",
    0x26: "Up", 0x28: "Down", 0x25: "Left", 0x27: "Right",
    0x60: "Num+0", 0x61: "Num+1", 0x62: "Num+2", 0x63: "Num+3", 0x64: "Num+4",
    0x65: "Num+5", 0x66: "Num+6", 0x67: "Num+7", 0x68: "Num+8", 0x69: "Num+9",
    0x6A: "Num+*", 0x6B: "Num++", 0x6D: "Num+-", 0x6E: "Num+.", 0x6F: "Num+/",
}
VK_MOD_SHIFT = 0x10
VK_MOD_CTRL  = 0x11
VK_MOD_ALT   = 0x12
MOD_NAMES = {VK_MOD_CTRL: "Ctrl", VK_MOD_ALT: "Alt", VK_MOD_SHIFT: "Shift"}
HOTKEY_MODIFIERS = (VK_MOD_SHIFT, VK_MOD_CTRL, VK_MOD_ALT)

XINPUT_GAMEPAD_DPAD_UP    = 0x0001
XINPUT_GAMEPAD_DPAD_DOWN  = 0x0002
XINPUT_GAMEPAD_DPAD_LEFT  = 0x0004
XINPUT_GAMEPAD_DPAD_RIGHT = 0x0008
XINPUT_GAMEPAD_BACK       = 0x0020
XINPUT_GAMEPAD_LEFT_SHOULDER = 0x0100
XINPUT_GAMEPAD_RIGHT_SHOULDER = 0x0200
XINPUT_GAMEPAD_A          = 0x1000
XINPUT_GAMEPAD_B          = 0x2000
XINPUT_GAMEPAD_Y          = 0x8000
XINPUT_OPEN_NEARBY_MASK   = XINPUT_GAMEPAD_LEFT_SHOULDER | XINPUT_GAMEPAD_DPAD_DOWN
XINPUT_NEARBY_INPUTS = {
    XINPUT_GAMEPAD_DPAD_UP:    "up",
    XINPUT_GAMEPAD_DPAD_DOWN:  "down",
    XINPUT_GAMEPAD_DPAD_LEFT:  "left",
    XINPUT_GAMEPAD_DPAD_RIGHT: "right",
    XINPUT_GAMEPAD_BACK:       "filter",
    XINPUT_GAMEPAD_A:          "toggle",
    XINPUT_GAMEPAD_B:          "close",
}

XINPUT_OPEN_WAYPOINTS_MASK = XINPUT_GAMEPAD_DPAD_DOWN | XINPUT_GAMEPAD_A  # DPad Down+A = 0x1002 (default)

XINPUT_WAYPOINT_INPUTS = {
    XINPUT_GAMEPAD_DPAD_UP:   "up",
    XINPUT_GAMEPAD_DPAD_DOWN: "down",
    XINPUT_GAMEPAD_A:         "select",
    XINPUT_GAMEPAD_B:         "close",
    XINPUT_GAMEPAD_Y:         "delete",
}

XINPUT_BUTTON_NAMES = {
    XINPUT_GAMEPAD_DPAD_UP:       "DPad Up",
    XINPUT_GAMEPAD_DPAD_DOWN:     "DPad Down",
    XINPUT_GAMEPAD_DPAD_LEFT:     "DPad Left",
    XINPUT_GAMEPAD_DPAD_RIGHT:    "DPad Right",
    XINPUT_GAMEPAD_BACK:          "Back",
    XINPUT_GAMEPAD_LEFT_SHOULDER: "LB",
    XINPUT_GAMEPAD_RIGHT_SHOULDER: "RB",
    XINPUT_GAMEPAD_A:             "A",
    XINPUT_GAMEPAD_B:             "B",
    XINPUT_GAMEPAD_Y:             "Y",
}

CONTROLLER_HOTKEYS_FILE = os.path.join(SAVE_DIR, "cd_controller_hotkeys.json")

XINPUT_FOCUS_TOGGLE_MASK = 0  # disabled by default

DEFAULT_CONTROLLER_HOTKEYS = {
    "open_waypoints": XINPUT_OPEN_WAYPOINTS_MASK,
    "open_nearby": XINPUT_OPEN_NEARBY_MASK,
    "focus_toggle": XINPUT_FOCUS_TOGGLE_MASK,
    "toggle_overlay": 0,  # disabled by default
    "toggle_shape": 0,    # disabled by default
}


def mask_to_name(mask):
    parts = [name for btn, name in sorted(XINPUT_BUTTON_NAMES.items()) if mask & btn]
    return " + ".join(parts) if parts else "None"


def _load_controller_hotkey_settings():
    try:
        with open(CONTROLLER_HOTKEYS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return {
            hk_id: int(data[hk_id]) if hk_id in data else default_mask
            for hk_id, default_mask in DEFAULT_CONTROLLER_HOTKEYS.items()
        }
    except Exception:
        return dict(DEFAULT_CONTROLLER_HOTKEYS)


def _save_controller_hotkey_settings(hotkeys):
    os.makedirs(SAVE_DIR, exist_ok=True)
    with open(CONTROLLER_HOTKEYS_FILE, 'w', encoding='utf-8') as f:
        json.dump(hotkeys, f, indent=2)


class XINPUT_GAMEPAD(ctypes.Structure):
    _fields_ = [
        ("wButtons",      ctypes.wintypes.WORD),
        ("bLeftTrigger",  ctypes.wintypes.BYTE),
        ("bRightTrigger", ctypes.wintypes.BYTE),
        ("sThumbLX",      ctypes.wintypes.SHORT),
        ("sThumbLY",      ctypes.wintypes.SHORT),
        ("sThumbRX",      ctypes.wintypes.SHORT),
        ("sThumbRY",      ctypes.wintypes.SHORT),
    ]


class XINPUT_STATE(ctypes.Structure):
    _fields_ = [
        ("dwPacketNumber", ctypes.wintypes.DWORD),
        ("Gamepad",        XINPUT_GAMEPAD),
    ]


def _load_xinput_get_state():
    for dll_name in ("xinput1_4.dll", "xinput1_3.dll", "xinput9_1_0.dll"):
        try:
            dll = ctypes.WinDLL(dll_name)
            fn = dll.XInputGetState
            fn.argtypes = [ctypes.wintypes.DWORD, ctypes.POINTER(XINPUT_STATE)]
            fn.restype = ctypes.wintypes.DWORD
            return fn
        except Exception:
            continue
    return None


def _controller_buttons(get_state):
    if not get_state:
        return 0
    state = XINPUT_STATE()
    buttons = 0
    for idx in range(4):
        if get_state(idx, ctypes.byref(state)) == 0:
            buttons |= state.Gamepad.wButtons
    return buttons


def _normalize_hotkey_config(saved, default):
    cfg = dict(default)
    if not saved or "vk" not in saved:
        saved = {}
    cfg["vk"] = int(saved.get("vk", cfg.get("vk", 0)))
    if "mods" in saved:
        raw_mods = saved.get("mods") or []
        if not isinstance(raw_mods, list):
            raw_mods = [raw_mods]
        mods = []
        for mod in raw_mods:
            try:
                mod = int(mod)
            except Exception:
                continue
            if mod in HOTKEY_MODIFIERS and mod not in mods:
                mods.append(mod)
    else:
        mod = int(saved.get("mod", cfg.get("mod", 0)) or 0)
        mods = [mod] if mod in HOTKEY_MODIFIERS else []
    cfg["mods"] = mods
    cfg["mod"] = mods[0] if len(mods) == 1 else 0
    cfg["enabled"] = bool(saved.get("enabled", cfg.get("enabled", True)))
    return cfg


def _load_hotkey_settings():
    try:
        with open(HOTKEY_SETTINGS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        result = {}
        for hk_id, default in DEFAULT_HOTKEYS.items():
            result[hk_id] = _normalize_hotkey_config(data.get(hk_id), default)
        return result
    except Exception:
        return {k: _normalize_hotkey_config(None, v) for k, v in DEFAULT_HOTKEYS.items()}


def _save_hotkey_settings(hotkeys):
    os.makedirs(SAVE_DIR, exist_ok=True)
    with open(HOTKEY_SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(hotkeys, f, indent=2)


def _nearby_controls_enabled():
    return os.environ.get('CD_NEARBY_CONTROLS_ENABLED', '0') == '1'
