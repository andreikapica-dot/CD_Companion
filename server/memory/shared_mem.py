import ctypes
import logging

from server.memory.constants import k32

log = logging.getLogger('cd_server')


class SharedMemoryMixin:
    """Integracao com Freedom Flyer via shared memory.

    Acessa self.use_shared_memory_entity, self.td, self.pm — definidos em TeleportEngine.__init__.

    ATENCAO: o bloco try/except abaixo executa no momento em que a classe e definida,
    nao em __init__. Manter esse padrao.
    """

    FF_SHARED_MEMORY_NAME = "CrimsonDesert_PlayerBase_SharedMem_Bambozu"

    try:
        _k32 = ctypes.windll.kernel32
        _k32.OpenFileMappingW.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_wchar_p]
        _k32.OpenFileMappingW.restype  = ctypes.c_void_p
        _k32.MapViewOfFile.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_size_t]
        _k32.MapViewOfFile.restype  = ctypes.c_void_p
        _k32.UnmapViewOfFile.argtypes = [ctypes.c_void_p]
        _k32.UnmapViewOfFile.restype  = ctypes.c_int
        _k32.CloseHandle.argtypes = [ctypes.c_void_p]
        _k32.CloseHandle.restype  = ctypes.c_int
    except Exception:
        pass

    def _read_ff_shared_entity(self):
        try:
            FILE_MAP_READ = 0x0004
            handle = k32.OpenFileMappingW(FILE_MAP_READ, 0, self.FF_SHARED_MEMORY_NAME)
            if not handle:
                return 0
            try:
                ptr = k32.MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 8)
                if not ptr:
                    return 0
                try:
                    return ctypes.c_ulonglong.from_address(ptr).value
                finally:
                    k32.UnmapViewOfFile(ptr)
            finally:
                k32.CloseHandle(handle)
        except Exception:
            return 0

    def refresh_entity_base(self):
        if not self.use_shared_memory_entity or not self.td or not self.pm:
            return False
        entity = self._read_ff_shared_entity()
        if not entity:
            return False
        try:
            self.pm.write_ulonglong(self.td + 0x18, entity)
            return True
        except Exception:
            return False
