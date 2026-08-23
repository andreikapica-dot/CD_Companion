"""
Gera launcher.ico para o CD_Launcher.exe.
Produz um pin de mapa em vermelho carmesim sobre fundo escuro.
Uso: python scripts/gen_icon.py
"""

import math
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT  = os.path.join(ROOT, 'launcher.ico')

# Paleta
BG_OUTER  = (18,  10,  10)   # quase preto
BG_INNER  = (35,  12,  12)   # fundo do badge
CRIMSON   = (180, 20,  30)   # vermelho principal
CRIMSON_D = (130, 10,  18)   # sombra / borda
GOLD      = (240, 200, 80)   # anel dourado
WHITE     = (255, 255, 255)
WHITE_T   = (255, 255, 255, 180)


def draw_icon(size: int) -> Image.Image:
    s = size
    img  = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # ── fundo circular ────────────────────────────────────────────────
    pad  = int(s * 0.04)
    draw.ellipse([pad, pad, s - pad, s - pad], fill=BG_OUTER)

    pad2 = int(s * 0.08)
    draw.ellipse([pad2, pad2, s - pad2, s - pad2], fill=BG_INNER)

    # ── anel dourado fino ─────────────────────────────────────────────
    lw = max(1, int(s * 0.025))
    draw.ellipse([pad2, pad2, s - pad2, s - pad2],
                 outline=GOLD, width=lw)

    # ── pin de mapa ───────────────────────────────────────────────────
    # O pin ocupa ~55 % da altura e está centralizado horizontalmente.
    pw   = int(s * 0.40)          # largura do pin
    ph   = int(s * 0.55)          # altura total do pin
    px   = (s - pw) // 2          # x esquerdo
    py   = int(s * 0.18)          # y topo

    head_r = pw // 2              # raio da cabeça circular
    head_cx = px + head_r
    head_cy = py + head_r

    tail_tip_x = head_cx
    tail_tip_y = py + ph

    # sombra do pin (deslocada 1-2 px)
    off = max(1, int(s * 0.015))
    _draw_pin(draw, head_cx + off, head_cy + off, head_r,
              tail_tip_x + off, tail_tip_y + off, CRIMSON_D)

    # pin principal
    _draw_pin(draw, head_cx, head_cy, head_r,
              tail_tip_x, tail_tip_y, CRIMSON)

    # borda do pin
    _draw_pin_outline(draw, head_cx, head_cy, head_r,
                      tail_tip_x, tail_tip_y, CRIMSON_D,
                      max(1, int(s * 0.018)))

    # ponto central branco (buraco do pin)
    dot_r = max(1, int(head_r * 0.32))
    draw.ellipse([head_cx - dot_r, head_cy - dot_r,
                  head_cx + dot_r, head_cy + dot_r],
                 fill=WHITE)

    # brilho sutil no topo-esquerdo da cabeça
    shine_r = max(1, int(head_r * 0.22))
    shine_x = head_cx - int(head_r * 0.30)
    shine_y = head_cy - int(head_r * 0.30)
    shine = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shine)
    sd.ellipse([shine_x - shine_r, shine_y - shine_r,
                shine_x + shine_r, shine_y + shine_r],
               fill=(255, 255, 255, 90))
    img = Image.alpha_composite(img, shine)

    return img


def _draw_pin(draw, cx, cy, r, tip_x, tip_y, color):
    """Desenha o corpo sólido de um pin (círculo + triângulo)."""
    # triângulo (cauda)
    half = int(r * 0.72)
    triangle = [
        (cx - half, cy),
        (cx + half, cy),
        (tip_x,     tip_y),
    ]
    draw.polygon(triangle, fill=color)
    # cabeça circular por cima
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def _draw_pin_outline(draw, cx, cy, r, tip_x, tip_y, color, lw):
    """Contorno do pin."""
    half = int(r * 0.72)
    # contorno da cabeça
    draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                 outline=color, width=lw)
    # linhas laterais da cauda
    draw.line([(cx - half, cy), (tip_x, tip_y)], fill=color, width=lw)
    draw.line([(cx + half, cy), (tip_x, tip_y)], fill=color, width=lw)


# ── Gera os tamanhos e salva ──────────────────────────────────────────
sizes = [256, 128, 64, 48, 32, 16]
frames = [draw_icon(sz).convert('RGBA') for sz in sizes]

frames[0].save(
    OUT,
    format='ICO',
    append_images=frames[1:],
    sizes=[(sz, sz) for sz in sizes],
)

print(f'[OK] {os.path.abspath(OUT)}')
