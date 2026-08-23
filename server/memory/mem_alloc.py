import logging

from server.memory.constants import (
    k32, MEM_COMMIT, MEM_RESERVE, PAGE_EXECUTE_READWRITE,
)

log = logging.getLogger('cd_server')


class MemAllocMixin:
    """Alocacao de memoria no processo remoto.

    Acessa self.hook_a, self.hook_b, self.hook_c, self.hook_d, self.hook_e,
    self.hook_cam, self.block, self.td, self.inv, self.md, self.tp,
    self.OFF_TD, self.OFF_INV, self.OFF_MD, self.OFF_TP, self.BLOCK_SZ,
    self._far_mode, self.pm — todos definidos em TeleportEngine.__init__.
    """

    def _alloc_near(self, handle, near, size):
        for offset in range(0x10000, 0x7FFF0000, 0x10000):
            for addr in [near + offset, near - offset]:
                if addr <= 0:
                    continue
                result = k32.VirtualAllocEx(
                    handle, addr, size, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE)
                if result:
                    return result
        return 0

    def _alloc_block(self):
        handle = self.pm.process_handle
        for anchor in [self.hook_a, self.hook_b, self.hook_c, self.hook_d, self.hook_e, self.hook_cam]:
            if not anchor:
                continue
            result = self._alloc_near(handle, anchor, self.BLOCK_SZ)
            if result:
                self.block = result
                self.td  = result + self.OFF_TD
                self.inv = result + self.OFF_INV
                self.md  = result + self.OFF_MD
                self.tp  = result + self.OFF_TP
                self._far_mode = False
                return
        result = k32.VirtualAllocEx(
            handle, 0, self.BLOCK_SZ, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE)
        if not result:
            raise RuntimeError("Could not allocate memory for code caves.")
        self.block = result
        self.td  = result + self.OFF_TD
        self.inv = result + self.OFF_INV
        self.md  = result + self.OFF_MD
        self.tp  = result + self.OFF_TP
        self._far_mode = True
