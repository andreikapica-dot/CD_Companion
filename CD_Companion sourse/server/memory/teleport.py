import struct
import logging

log = logging.getLogger('cd_server')


class TeleportMixin:
    """Operacoes de teleport e invulnerabilidade.

    Acessa self.teleport_enabled, self.inv, self.tp, self.hook_e,
    self.xyz_addr, self.pm — todos definidos em TeleportEngine.__init__.
    """

    def set_invuln(self, on: bool):
        if not self.teleport_enabled:
            return
        if self.inv:
            try:
                self.pm.write_bytes(self.inv, b'\x01' if on else b'\x00', 1)
            except Exception:
                pass

    def teleport_to_abs(self, abs_x, abs_y, abs_z):
        if not self.teleport_enabled:
            return False, "Teleport is disabled in settings"
        if self.tp and self.hook_e and (self.xyz_addr[0] or getattr(self, 'phys_pos_addr', 0)):
            try:
                # hook_e operates in origin-relative physics space. Convert an
                # absolute map target back to that space when worldOffset is known.
                target_x, target_y, target_z = abs_x, abs_y, abs_z
                if getattr(self, 'phys_pos_addr', 0):
                    world = self.get_world_offsets()
                    if world:
                        target_x -= world[0]
                        target_y -= world[1]
                        target_z -= world[2]
                    # A one-shot flag may be consumed by another physics
                    # object. The hook captures the authoritative [r13]
                    # position vector, so write the requested target directly.
                    ptr = self.pm.read_ulonglong(self.block + self.OFF_PHYS_PTR)
                    if ptr:
                        self.pm.write_bytes(
                            ptr,
                            struct.pack('<fff', target_x, target_y, target_z),
                            12,
                        )
                        log.info("Teleport applied directly: (%.1f, %.1f, %.1f)",
                                 abs_x, abs_y, abs_z)
                        return True, ""
                data = struct.pack('<ffffI', target_x, target_y, target_z, 0.0, 1)
                self.pm.write_bytes(self.tp, data, len(data))
                log.info("Teleport queued: (%.1f, %.1f, %.1f)", abs_x, abs_y, abs_z)
                return True, ""
            except Exception as e:
                return False, str(e)
        return False, "Physics delta hook not installed — hook_e AOB not found for this patch"
