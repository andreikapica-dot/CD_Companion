import struct
import logging

from shared.coord_math import (
    player_heading as _calc_player_heading,
    camera_heading as _calc_camera_heading,
)
from server.memory.constants import _REDACT

_HEADING_PACK = struct.Struct('<f')

log = logging.getLogger('cd_server')


class ReaderMixin:
    """Metodos de leitura de estado do jogo. Sem __init__, sem atributos proprios.

    Acessa self.pm, self.xyz_addr, self.phys_pos_addr, self.td, self.tp, self.world_offset_addr,
    self.block, self.OFF_CAM_YAW, self.hook_cam, self.md — todos definidos
    em TeleportEngine.__init__.
    """

    def get_player_pos(self):
        # Preferir leitura direta dos globais estáticos (não requer hook)
        x_addr, y_addr, z_addr = self.xyz_addr
        if x_addr:
            try:
                x = self.pm.read_float(x_addr)
                y = self.pm.read_float(y_addr)
                z = self.pm.read_float(z_addr)
                if x == 0.0 and y == 0.0 and z == 0.0:
                    return None
                return x, y, z
            except Exception:
                pass
        if getattr(self, 'phys_pos_addr', 0):
            try:
                raw = self.pm.read_bytes(self.phys_pos_addr, 12)
                x, y, z = struct.unpack('<fff', raw)
                if x != 0.0 or y != 0.0 or z != 0.0:
                    return x, y, z
            except Exception:
                pass
        # Fallback: bloco td instalado pelo hook_a
        if not self.td:
            return None
        try:
            raw = self.pm.read_bytes(self.td + 0x20, 12)
            x, y, z = struct.unpack('<fff', raw)
            if x == 0.0 and y == 0.0 and z == 0.0:
                return None
            return x, y, z
        except Exception:
            return None

    def get_world_offsets(self):
        if not self.world_offset_addr:
            return None
        try:
            raw = self.pm.read_bytes(self.world_offset_addr, 16)
            return struct.unpack('<ffff', raw)
        except Exception:
            return None

    def get_player_abs(self):
        pos = self.get_player_pos()
        if not pos:
            return None
        off = self.get_world_offsets()
        if off:
            return pos[0] + off[0], pos[1], pos[2] + off[2]
        return pos

    def get_entity_base(self):
        if not self.td:
            return 0
        try:
            return self.pm.read_ulonglong(self.td + 0x18)
        except Exception:
            return 0

    def get_player_heading(self):
        """Retorna heading em graus via forward vector (RBX+0x80/0x88 do hook_e).
        RBX é salvo em tp+0x28 pela cave_e a cada frame do physics loop.
        Resultado também escrito em block+OFF_PLYR_HDG para leitura direta no CE.
        Retorna None se hook_e não instalado ou vetor zero."""
        if not self.tp:
            return None
        try:
            entity = self.pm.read_ulonglong(self.tp + 0x28)
            if not entity:
                return None
            if not getattr(self, '_plyr_hdg_logged', False):
                if not _REDACT:
                    log.info(
                        "Player heading source: entity=%#x  fx=%#x  fz=%#x",
                        entity, entity + 0x80, entity + 0x88,
                    )
                self._plyr_hdg_logged = True
            fx = self.pm.read_float(entity + 0x80)
            fz = self.pm.read_float(entity + 0x88)
            heading = _calc_player_heading(fx, fz)
            if heading is not None and self.block:
                self.pm.write_bytes(
                    self.block + self.OFF_PLYR_HDG,
                    _HEADING_PACK.pack(heading),
                    4,
                )
            return heading
        except Exception:
            return None

    def get_camera_heading(self):
        """Retorna (heading, raw) onde heading é o valor processado e raw é o float
        lido diretamente da cave (antes de qualquer conversão).
        Retorna (None, None) se hook não instalado ou valor ainda zerado."""
        if not self.hook_cam or not self.block:
            return None, None
        try:
            raw = self.pm.read_float(self.block + self.OFF_CAM_YAW)
            heading = _calc_camera_heading(raw)
            return heading, raw
        except Exception:
            return None, None

    def get_map_dest(self):
        """Retorna (x, y, z) do marcador de destino do mapa in-game, ou None."""
        if not self.md:
            return None
        try:
            raw = self.pm.read_bytes(self.md, 16)
            x, y, z, flag = struct.unpack('<fffI', raw)
            if flag != 1:
                return None
            return x, y, z
        except Exception:
            return None
