# Crimson Desert Companion — Chrome Extension

Chrome/Edge/Opera GX extension for [CD Companion](https://github.com/andreikapica-dot/CD_Companion) that shows your real-time player position on either the [MapGenie](https://mapgenie.io/crimson-desert/maps/pywel) or [Greymane Codex](https://crimsondesert.co/ru/map) interactive map.

Requires the CD Companion server running on your PC.

---

## Installation

1. Download or clone this repository
2. Open `chrome://extensions` in Chrome, `edge://extensions` in Edge, or `opera://extensions` in Opera GX
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select this folder
5. Open either [MapGenie](https://mapgenie.io/crimson-desert/maps/pywel) or [Greymane Codex](https://crimsondesert.co/ru/map)
6. The companion overlay appears automatically on the map page

When replacing an older extension build, remove it first or use its **Reload** button, then refresh the map tab.

---

## Features

- Real-time player marker on MapGenie and Greymane Codex
- Directional arrow showing character facing direction
- Camera-based map rotation
- Teleport to any point on the map (requires teleport enabled in CD Companion)
- Personal waypoints — save, filter, teleport
- Nearby locations — adjustable radius, quick map focus, and per-location teleport
- Center-screen teleport with adjustable Y height
- In-game map marker displayed on MapGenie
- Location sync across all connected clients (overlay, Chrome, Firefox)
- Configurable server host/port (default: localhost:7891)

---

## Configuration

Click the extension icon to open the popup:

- **Server host/port**: configure if the server runs on a different machine
- **Follow**: toggle auto-pan to player position
- **Center Y**: height for center-screen teleport
- **Icon size**: player marker size
- **Default zoom**: initial zoom level
- **Nearby**: show/hide the radius and Nearby panel; adjust its search radius
- **Hide found/left/right**: auto-hide MapGenie panels
- **Rotate by camera**: rotate the map to match the in-game camera

---

## How it works

The extension connects to the CD Companion WebSocket server via the background service worker. Position data is relayed to the map page, which renders the player marker and handles map interactions. The Greymane adapter exposes the site's MapLibre instance to Companion without replacing its map data.

```
background.js  ←→  WebSocket (CD Companion server)
     ↕ chrome.runtime port
bridge.js      ←→  window.postMessage
     ↕
content.js     (map page — marker, nearby, waypoints, teleport)
```

---

## Related

- [CD Companion fork](https://github.com/andreikapica-dot/CD_Companion) — current application (overlay + server)
- [Original CD Companion](https://github.com/leandrodiogenes/cd-companion) — original project by Leandro Diogenes
