import ctypes
import ctypes.wintypes
import logging
import os
import sys

log = logging.getLogger('cd_server')

_REDACT = getattr(sys, 'frozen', False)

PROCESS_NAME = "CrimsonDesert.exe"
SAVE_DIR = os.path.join(os.environ.get("LOCALAPPDATA", ""), "CD_Teleport")
HOOK_OFFSETS_FILE = os.path.join(SAVE_DIR, "cd_hook_offsets.json")
HEIGHT_BOOST = 10.0

k32 = ctypes.windll.kernel32
k32.VirtualAllocEx.restype = ctypes.c_ulonglong
k32.VirtualAllocEx.argtypes = [
    ctypes.c_void_p, ctypes.c_ulonglong, ctypes.c_size_t,
    ctypes.c_ulong, ctypes.c_ulong,
]
k32.VirtualFreeEx.argtypes = [
    ctypes.c_void_p, ctypes.c_ulonglong, ctypes.c_size_t, ctypes.c_ulong,
]

MEM_COMMIT  = 0x1000
MEM_RESERVE = 0x2000
MEM_RELEASE = 0x8000
PAGE_EXECUTE_READWRITE = 0x40
