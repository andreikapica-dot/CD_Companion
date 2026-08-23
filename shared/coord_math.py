"""
Funções puras de calibração e conversão de coordenadas.
Extraídas de position_server.py para permitir testes sem dependências pesadas.
"""

import math

# ── Calibrações padrão ───────────────────────────────────────────────

DEFAULT_CALIBRATIONS = {
    "pywel": [
        {"game": [-12127.138259887695, 7.692434787750244],
         "map": [-0.9052420615140191, 0.7787327582867241]},
        {"game": [-3690.7935791015625, -6117.512298583984],
         "map": [-0.5555426902317491, 0.5248899410143244]},
    ],
    "abyss": [
        {"game": [-10679.2001953125, -3686.5693359375],
         "map": [-1.3021820027444733, 0.6476022163899415]},
        {"game": [-12273.085479736328, -4988.257263183594],
         "map": [-1.3517201468401367, 0.6072151985198246]},
    ],
}

# ── Álgebra linear (3x3) ────────────────────────────────────────────

def det3(rows):
    (a, b, c), (d, e, f), (g, h, i) = rows
    return (a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g))


def solve_3x3(rows, values):
    det = det3(rows)
    if abs(det) < 1e-12:
        return None
    mx = [(values[0], rows[0][1], rows[0][2]),
          (values[1], rows[1][1], rows[1][2]),
          (values[2], rows[2][1], rows[2][2])]
    my = [(rows[0][0], values[0], rows[0][2]),
          (rows[1][0], values[1], rows[1][2]),
          (rows[2][0], values[2], rows[2][2])]
    mz = [(rows[0][0], rows[0][1], values[0]),
          (rows[1][0], rows[1][1], values[1]),
          (rows[2][0], rows[2][1], values[2])]
    return det3(mx) / det, det3(my) / det, det3(mz) / det


# ── Transformações de coordenadas ────────────────────────────────────

def build_affine_transform(cal):
    if len(cal) < 3:
        return None
    pts = cal[:3]
    rows, lng_vals, lat_vals = [], [], []
    for pt in pts:
        gx, gz = pt["game"]
        lng, lat = pt["map"]
        rows.append((gx, gz, 1.0))
        lng_vals.append(lng)
        lat_vals.append(lat)
    lng_coeffs = solve_3x3(rows, lng_vals)
    lat_coeffs = solve_3x3(rows, lat_vals)
    if not lng_coeffs or not lat_coeffs:
        return None
    ax, az, ao = lng_coeffs
    bx, bz, bo = lat_coeffs
    if abs(ax * bz - az * bx) < 1e-12:
        return None
    return {"mode": "affine", "lng": lng_coeffs, "lat": lat_coeffs}


def build_coord_transform(cal):
    affine = build_affine_transform(cal)
    if affine:
        return affine
    p0, p1 = cal[0], cal[1]
    gx0, gz0 = p0["game"]
    lng0, lat0 = p0["map"]
    gx1, gz1 = p1["game"]
    lng1, lat1 = p1["map"]
    dx = gx1 - gx0
    dz = gz1 - gz0
    if abs(dx) < 1e-6 or abs(dz) < 1e-6:
        return {"mode": "linear", "sx": 1.0, "ox": 0.0, "sz": 1.0, "oz": 0.0}
    sx = (lng1 - lng0) / dx
    ox = lng0 - gx0 * sx
    sz = (lat1 - lat0) / dz
    oz = lat0 - gz0 * sz
    return {"mode": "linear", "sx": sx, "ox": ox, "sz": sz, "oz": oz}


def game_to_lnglat(gx, gz, cal):
    tx = build_coord_transform(cal)
    if tx["mode"] == "affine":
        ax, az, ao = tx["lng"]
        bx, bz, bo = tx["lat"]
        return gx * ax + gz * az + ao, gx * bx + gz * bz + bo
    return gx * tx["sx"] + tx["ox"], gz * tx["sz"] + tx["oz"]


def lnglat_to_game(lng, lat, cal):
    tx = build_coord_transform(cal)
    if tx["mode"] == "affine":
        ax, az, ao = tx["lng"]
        bx, bz, bo = tx["lat"]
        det = ax * bz - az * bx
        if abs(det) < 1e-12:
            return None
        dlng = lng - ao
        dlat = lat - bo
        gx = (dlng * bz - az * dlat) / det
        gz = (ax * dlat - dlng * bx) / det
        return gx, gz
    sx = tx["sx"]
    sz = tx["sz"]
    if abs(sx) < 1e-12 or abs(sz) < 1e-12:
        return None
    return (lng - tx["ox"]) / sx, (lat - tx["oz"]) / sz


def calibration_span(cal):
    if len(cal) < 2:
        return 0.0
    best = 0.0
    for i in range(len(cal)):
        gx0, gz0 = cal[i]["game"]
        for j in range(i + 1, len(cal)):
            gx1, gz1 = cal[j]["game"]
            dist = ((gx1 - gx0) ** 2 + (gz1 - gz0) ** 2) ** 0.5
            best = max(best, dist)
    return best


def is_calibration_usable(cal, realm="pywel"):
    if len(cal) < 2:
        return False
    span = calibration_span(cal)
    default_span = calibration_span(DEFAULT_CALIBRATIONS[realm])
    if len(cal) == 2 and span < max(1200.0, default_span * 0.2):
        return False
    if len(cal) >= 3 and build_affine_transform(cal) is None:
        return False
    return True


def player_heading(fx, fz):
    """Calcula heading em graus a partir do backward vector (fx, fz).
    Nega os componentes porque entity+0x80/0x88 aponta para trás."""
    if fx * fx + fz * fz < 1e-6:
        return None
    return math.atan2(-fx, -fz) * 180.0 / math.pi


def camera_heading(raw_degrees):
    """Returns camera heading as-is (signed degrees, -180..180).
    Matches what CE displays; Mapbox bearing accepts the same range."""
    if raw_degrees == 0.0:
        return None
    return raw_degrees
