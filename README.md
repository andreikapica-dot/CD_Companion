# Crimson Desert — CD Companion

A real-time map companion for Crimson Desert. It reads the player's live position from
`CrimsonDesert.exe`, displays it on an interactive map, and provides teleport, waypoints,
nearby locations, global hotkeys, and Full/Server Only modes.

Supported map websites:

- [MapGenie](https://mapgenie.io/crimson-desert)
- [Greymane Codex](https://crimsondesert.co/map)

### Chrome Extension

Use either supported map in Chrome, Edge, Opera, Vivaldi, or another Chromium-based browser.
The current unpacked extension source is included in [`browser-extension/`](browser-extension/).

To install it, open the browser extensions page, enable **Developer mode**, choose
**Load unpacked**, and select the `browser-extension` folder.

### Android App

Use your phone or tablet as a second screen — the map with your live position, connected to the companion over Wi-Fi.
Download the APK from the [cd-companion-apk](https://github.com/leandrodiogenes/cd-companion-apk/releases/latest) releases page.

---

## Architecture

```
CrimsonDesert.exe
       │  (pymem — memory reading via code caves / hooks)
       ▼
CD_Companion.exe  (single process, no console)
  ├── Daemon thread: server/main.py   ← WebSocket server in background
  │     ws://0.0.0.0:7891
  │
  └── Main thread: overlay/main.py    ← only visible window (PyQt5)
        └── QWebEngineView → mapgenie.io + inject.js
```

---

## Requirements

```
pip install pymem websockets PyQt5 PyQtWebEngine
```

Python **≥ 3.10**.

---

## Usage

### Easy mode — Compiled executable

Run `CD_Companion.exe` (or `python launcher.py`).

The executable:
1. Requests UAC elevation automatically
2. Starts the WebSocket server as a daemon thread
3. Opens the PyQt5 overlay — **a single window, no extra consoles**
4. Logs are written to `cd_server.log` in the executable's directory

### Manual mode (development)

```bat
:: Overlay + embedded server (single window)
python -m overlay.main

:: Or standalone server (for debugging)
python -m server.main
```

### Building the executable

```bat
scripts\build_launcher.bat
```

Produces `dist\CD_Companion.exe` with `--noconsole` (no console window).

---

## Interface

### Main window (overlay)

| Element | Description |
|---|---|
| Hover at top | Shows the control bar (normal mode) or floating buttons (circular mode) |
| `◀` | Back (WebView history) |
| `⚙` | Settings |
| `–` | Minimize (same as Ctrl+Shift+M) |
| `✕` | Close and save position/size |
| Resize | Any edge or corner of the window |
| Drag title bar | Move the window (native drag, no lag) |
| **Ctrl + drag** | Move the window by dragging anywhere |

**Global hotkey:** `Ctrl+Shift+M` — show / hide the window

### Follow button (bottom-right corner of the map)

| Action | Effect |
|---|---|
| Click | Toggle "follow player" |
| `⊞` (next to it) | Opens the full panel (coordinates, status, teleport) |
| Hold **Shift** | Temporarily pauses follow |

### Status panel

- Real-time coordinates: X, Z, Y + Realm (Pywel / Abyss)
- **📍 Go to Marker** — teleports to the in-game map marker
- **↩ Abort** — returns to the position before the last teleport
- **🎯 Calibration** — calibration mode

### Waypoints panel (bottom-left corner, ⭕ button)

- **+ Save** — saves current position with a name
- **⭕** — teleport to waypoint
- **✕** — delete waypoint
- Text filter

### Center-screen teleport (◎ button)

- Y height slider
- Teleports to the coordinates at the visible center of the map

### In-game map marker

When a destination marker is set in-game, a red pin appears on MapGenie at the same location. Click the pin to open a teleport popup. If the marker is outside the visible map area, a smaller indicator floats on the window border pointing in its direction.

---

## Teleport

All teleports automatically apply:
- **HEIGHT_BOOST +10 units** on the Y axis (prevents clipping into the ground)
- **10 seconds of invulnerability** after each teleport

Personal waypoints are stored at:
```
%LOCALAPPDATA%\CD_Teleport\cd_overlay_waypoints.json
```

---

## Coordinate calibration

The system converts game coordinates (X, Z) to MapGenie lng/lat using an affine
transformation calibrated with reference points.

**Default calibrations** (Pywel and Abyss) are built-in.

**To recalibrate:**
1. Open the full panel and click **🎯 Calibration: OFF** to enable the mode
2. In-game, go to a recognizable location
3. On the map (MapGenie), click exactly on that location
4. The point is saved to `%LOCALAPPDATA%\CD_Teleport\cd_calibration_pywel.json`
5. With **≥ 3 points**, the affine calibration replaces the default linear one
6. To reset: send `reset_calibration` command via WebSocket

---

## Settings

Accessible via the `⚙` button in the bar (hover at the top of the window):

| Option | Default | Description |
|---|---|---|
| Enable teleport | ✅ | When disabled, teleport hooks (hook_e, hook_c) are not injected — avoids conflicts with other mods. Restart overlay and game to apply |
| Restore last map position | ✅ | Returns to the location and zoom from the last visit |
| Hide Found Locations | ✅ | Automatically disables "Found Locations" |
| Hide Left Panel | ☐ | Closes the left sidebar on load |
| Hide Right Panel | ☐ | Closes the right sidebar on load |
| Circular/oval window | ☐ | Applies an elliptical mask; resizes to 240×240 |
| Follow game window | ☐ | Moves the overlay along with the game window |
| Transparency | 0% | Window opacity (0% to 90%) |
| Direction arrow | Auto | `Auto` / `Entity vector` / `Position delta` |
| Rotate map with player | ☐ | Map bearing follows the player's heading |
| Rotate map with camera | ☐ | Map bearing follows the game camera |
| Disable GPU vsync | ☐ | Fixes FPS cap when using the overlay on a secondary monitor with a different refresh rate (requires restart) |

Saved in `overlay_config.json` (in the executable's or script's directory).

### Language

The overlay ships with **English** and **Português (Brasil)**. The language can be
changed in **Settings > Window > Language**.

To add a community translation, create a `locales/` folder next to `CD_Companion.exe`
and place a JSON file there. See [`overlay/locales/README.md`](overlay/locales/README.md)
for the format and contribution instructions.

---

## Global hotkeys

| Hotkey | Action |
|---|---|
| `Ctrl+Shift+M` | Show / hide overlay |
| `F5` | Teleport to in-game map marker |
| `Shift+F5` | Abort (return to pre-teleport position) |

Hotkeys are configurable in `%LOCALAPPDATA%\CD_Teleport\cd_hotkeys.json`.

---

## WebSocket protocol

### Server → Clients

```json
{ "type": "position", "lng": -0.72, "lat": 0.61,
  "x": -8432.1, "y": 12.4, "z": 3201.7, "realm": "pywel",
  "heading": 45.2 }
```

```json
{ "type": "camera_heading", "heading": 33.7, "raw": 0.5882 }
```

```json
{ "type": "waypoints", "data": [ { "name": "...", "absX": 0, "absY": 0, "absZ": 0, "realm": "pywel" } ] }
```

```json
{ "type": "engine_status", "status": "attached", "teleportEnabled": true }
```

```json
{ "type": "location_toggle", "locationId": "549771", "found": true }
```

```json
{ "type": "map_marker", "lng": -0.51, "lat": 0.43, "x": -6100.0, "y": 12.0, "z": 2800.0 }
```

```json
{ "type": "map_marker_cleared" }
```

### Clients → Server

| `cmd` | Parameters | Effect |
|---|---|---|
| `teleport` | `x, y, z` | Teleport to absolute coordinates |
| `teleport_map` | `lng, lat, y, realm` | Teleport to a point clicked on the map |
| `teleport_marker` | | Teleport to the in-game map marker |
| `abort` | | Return to pre-teleport position |
| `move` | `dx, dy, dz` | Inject a position delta via physics hook |
| `save_waypoint` | `name` | Save current position |
| `delete_waypoint` | `index` | Remove waypoint by index |
| `rename_waypoint` | `index, name` | Rename waypoint |
| `add_calibration` | `lng, lat, realm` | Add a calibration point |
| `reset_calibration` | `realm` | Remove saved calibration |
| `location_toggle` | `locationId, found` | Propagate location mark to other clients |

---

## Location sync across clients

When any client marks or unmarks a location on MapGenie, the change is automatically
propagated to all other connected clients.

1. The injected JS intercepts `fetch`/`XMLHttpRequest` to detect PUT/DELETE on `/api/v1/user/locations/{id}`
2. Sends `location_toggle` to the server
3. The server broadcasts to all other clients
4. Each client calls `window.mapManager.markLocationAsFound(id, found)` to update visually

---

## File structure

```
├── launcher.py              # Entry point — UAC elevation + calls overlay.main
├── server/
│   ├── main.py              # WebSocket server + position broadcast
│   └── memory/engine.py     # TeleportEngine: attach, AOB scan, hooks, teleport
├── overlay/
│   ├── main.py              # OverlayWindow + server as daemon thread
│   ├── inject.js            # JS injected into MapGenie (Template with $WS_URL)
│   ├── widgets.py           # SettingsDialog, TitleBar, InterceptPage, LoginPrompt
│   └── config_defaults.py   # SETTING_DEFAULTS
├── shared/
│   └── coord_math.py        # Pure functions: calibration, conversion, heading
├── tests/
│   └── test_coords.py       # Unit tests (shared.coord_math)
└── scripts/
    ├── build_launcher.bat   # Compiles launcher.py → dist/CD_Companion.exe
    ├── gen_cert.py          # Generates SSL certificate for WSS
    └── gen_icon.py          # Generates launcher icon
```

---

## How the memory hook works

1. **AOB Scan**: searches for byte patterns in the `CrimsonDesert.exe` module
2. **Code Cave**: allocates memory and writes assembly that captures XYZ
3. **JMP Patch**: replaces the original instruction with a `JMP` to the cave (trampoline)
4. **Reading**: the server reads XYZ floats from the allocated block every ~16 ms (60 Hz)
5. **World**: local coordinates + world offset = absolute position

Based on the [CDTT project (dencoexe)](https://github.com/dencoexe/CDTT).

---

## License

This project is provided for educational purposes. Use at your own risk.
