// =============================================================================
// NAO EDITAR ESTE ARQUIVO DIRETAMENTE.
//
// Este arquivo e gerado/fallback. A fonte de verdade sao os fragmentos em:
//   overlay/inject_parts/
//
// Para editar qualquer comportamento do JS injetado:
//   1. Identifique o fragmento correto em overlay/inject_parts/ (ver AGENTS.md
//      em research/inject_parts_agents.md)
//   2. Edite o fragmento correspondente
//   3. Valide: python scripts/check_inject.py
// =============================================================================

(function () {
  const iv = setInterval(() => {
    if (!window.isEmbedded) {
      window.isEmbedded = true;
      window.dispatchEvent(new Event('resize'))
    }
  }, 500);
  setTimeout(() => clearInterval(iv), 30000);
})();

(function () {
  if (window.__cdOverlay) return;
  window.__cdOverlay = true;

  const WS_URL = '$WS_URL';
  const RECONNECT_MS = 3000;
  const LIVE_VIEW_DURATION_MS = 16;
  const NATIVE_REALTIME = !!window.__cdNativeRealtimeEnabled;
  const CENTER_TELEPORT_Y_KEY = 'cd_center_teleport_y';
  const NEARBY_RESPECT_MAP_VISIBILITY_KEY = 'cd_nearby_respect_map_visibility';
  const CLIENT_ID = (window.crypto && typeof window.crypto.randomUUID === 'function')
    ? window.crypto.randomUUID()
    : `overlay-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  let ws              = null;
  let marker          = null;
  let mapMarker       = null;
  let mapDestLng      = null;
  let mapDestLat      = null;
  let map             = null;
  let following       = true;
  let shiftHeld       = false;
  let lastPos         = null;
  let lastHeading     = 0;
  let lastCameraHeading = 0;
  let hasCameraHeading = false;
  let rotateWithPlayer = !!(window.__cdSettings && window.__cdSettings.rotateWithPlayer);
  let rotateWithCamera = !!(window.__cdSettings && window.__cdSettings.rotateWithCamera);
  let waypoints       = [];
  let waypointPopup   = null;
  let nearbyPopup     = null;
  let nearbyInputHandler = null;
  let nearbySelectionActive = false;
  let waypointFilter  = '';
  let hasPreTeleport  = false;
  let teleportEnabled = !(window.__cdSettings && window.__cdSettings.teleportEnabled === false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Shift') shiftHeld = true;  });
  document.addEventListener('keyup',   (e) => { if (e.key === 'Shift') shiftHeld = false; });

  // ── Tooltip de localização (hover sobre ícones do mapa) ──────────────
  let _tooltip = null;
  function ensureTooltip() {
    if (_tooltip) return _tooltip;
    _tooltip = document.createElement('div');
    _tooltip.id = 'cdLocTooltip';
    _tooltip.style.cssText = `
      position:fixed;z-index:20000;pointer-events:none;
      background:rgba(12,12,18,.92);color:#e8e8e8;
      font:12px/1.4 'Segoe UI',system-ui,sans-serif;
      border:1px solid rgba(255,208,96,.35);border-radius:6px;
      padding:5px 10px;max-width:220px;white-space:normal;
      box-shadow:0 3px 12px rgba(0,0,0,.5);backdrop-filter:blur(4px);
      display:none;
    `;
    document.body.appendChild(_tooltip);
    return _tooltip;
  }

  function initLocationTooltip(m) {
    const tip = ensureTooltip();
    m.on('mousemove', (e) => {
      const features = m.queryRenderedFeatures(e.point);
      const f = features.find(ft =>
        ft.properties && (ft.properties.title || ft.properties.name));
      if (f) {
        const label = f.properties.title || f.properties.name;
        tip.textContent = label;
        tip.style.display = 'block';
        tip.style.left = (e.originalEvent.clientX + 14) + 'px';
        tip.style.top  = (e.originalEvent.clientY - 8)  + 'px';
        m.getCanvas().style.cursor = 'pointer';
      } else {
        tip.style.display = 'none';
        m.getCanvas().style.cursor = '';
      }
    });
    m.on('mouseout', () => {
      tip.style.display = 'none';
      m.getCanvas().style.cursor = '';
    });
  }

  function adjustIconSize() {
    try {
      if (!map) return;
      const zoom    = map.getZoom();
      const maxZoom = map.getMaxZoom();
      const minZoom = map.getMinZoom();
      const iconSizeAtMaxZoom = 0.35;
      const iconSizeAtMinZoom = 0.25;
      const rawScale = window.__cdSettings && window.__cdSettings.mapIconScale;
      const iconScale = (typeof rawScale === 'number' && rawScale > 0) ? rawScale : 1.0;
      const scale = Math.max(0,
        Math.log(iconSizeAtMaxZoom / iconSizeAtMinZoom) /
        Math.log(maxZoom / minZoom) *
        Math.log(zoom / minZoom)) * 2.5 * iconScale;
      if (window.mapManager && typeof window.mapManager.setIconSize === 'function')
        window.mapManager.setIconSize(scale);
    } catch (_) {}
  }
  window.__cdUpdateMapIconSize = adjustIconSize;

  function getMap() {
    if (map) return map;
    if (window.map && typeof window.map.easeTo === 'function') {
      map = window.map;
      createMarker();
      createMapMarker();
      adjustIconSize();
      map.on('zoom', adjustIconSize);
      initLocationTooltip(map);
    }
    return map;
  }
  const mapIv = setInterval(() => { if (getMap()) clearInterval(mapIv); }, 500);

  function createMapMarker() {
    if (mapMarker || !map) return;
    const el = document.createElement('div');
    el.id = 'cdMapDestinationMarker';
    el.style.cssText = 'position:relative;width:0;height:0;cursor:pointer;z-index:10001!important';
    const img = document.createElement('img');
    img.src = 'https://raw.githubusercontent.com/leandrodiogenes/cd-companion/main/mark.png';
    img.style.cssText = 'position:absolute;width:32px;height:32px;transform:translate(-50%,-100%);filter:drop-shadow(0 0 4px rgba(255,80,80,.9));';
    el.appendChild(img);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showMapMarkerPopup(el);
    });
    mapMarker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([0, 0]).addTo(map);
    mapMarker.getElement().style.setProperty('z-index', '10001', 'important');
    mapMarker.getElement().style.display = 'none';
  }

  function showMapMarkerPopup(anchorEl) {
    let popup = document.getElementById('cdMapMarkerPopup');
    if (popup) { popup.remove(); return; }
    if (!teleportEnabled) return;
    popup = document.createElement('div');
    popup.id = 'cdMapMarkerPopup';
    const rect = anchorEl.getBoundingClientRect();
    popup.style.cssText = `
      position:fixed;z-index:99999;
      left:${rect.left}px;top:${rect.top - 40}px;
      transform:translate(-50%,-100%);
      background:rgba(12,12,18,.95);
      border:1px solid rgba(255,80,80,.45);border-radius:6px;
      padding:6px 10px;box-shadow:0 3px 12px rgba(0,0,0,.5);
      display:flex;flex-direction:column;align-items:center;gap:6px;
      font:12px 'Segoe UI',sans-serif;color:#e8e8e8;white-space:nowrap;
    `;
    popup.innerHTML = `
      <span style="font-size:11px;color:#aaa">Map Marker</span>
      <button id="cdMapMarkerTpBtn"
        style="background:rgba(255,80,80,.2);border:1px solid rgba(255,80,80,.5);
        color:#ff6666;font:11px 'Segoe UI';padding:3px 10px;border-radius:4px;cursor:pointer">
        📍 Teleport here
      </button>
    `;
    document.body.appendChild(popup);
    popup.querySelector('#cdMapMarkerTpBtn').addEventListener('click', () => {
      sendCmd({ cmd: 'teleport_marker' });
      popup.remove();
    });
    const close = (e) => { if (!popup.contains(e.target) && e.target !== anchorEl) { popup.remove(); document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  // ── Off-screen map destination indicator ──────────────────────────
  function ensureEdgeIndicator() {
    if (document.getElementById('cdEdgeIndicator')) return;
    const el = document.createElement('div');
    el.id = 'cdEdgeIndicator';
    el.style.cssText = `
      position:fixed;z-index:9000;width:28px;height:28px;
      pointer-events:none;display:none;
      transform-origin:center center;
    `;
    el.innerHTML = `
      <img src="https://raw.githubusercontent.com/leandrodiogenes/cd-companion/main/mark.png"
        style="width:28px;height:28px;filter:drop-shadow(0 0 4px rgba(255,80,80,.9));display:block;">
    `;
    document.body.appendChild(el);
  }

  function updateEdgeIndicator() {
    const el = document.getElementById('cdEdgeIndicator');
    if (!el || mapDestLng === null || mapDestLat === null) return;

    const container = map.getContainer();
    const rect = container.getBoundingClientRect();
    const pt = map.project([mapDestLng, mapDestLat]);

    const pad = 14;
    const isRound = !!(window.__cdSettings && window.__cdSettings.roundWindow);
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const hw = cx - pad;
    const hh = cy - pad;

    let inView;
    if (isRound) {
      const dx = (pt.x - cx) / hw;
      const dy = (pt.y - cy) / hh;
      inView = dx * dx + dy * dy <= 1;
    } else {
      inView = pt.x >= pad && pt.x <= rect.width - pad &&
               pt.y >= pad && pt.y <= rect.height - pad;
    }

    if (inView) { el.style.display = 'none'; return; }

    el.style.display = 'block';

    const angle = Math.atan2(pt.y - cy, pt.x - cx);
    let ex, ey;
    if (isRound) {
      ex = rect.left + cx + hw * Math.cos(angle);
      ey = rect.top  + cy + hh * Math.sin(angle);
    } else {
      const tx = Math.cos(angle);
      const ty = Math.sin(angle);
      const scale = Math.min(Math.abs(hw / (tx || 1e-9)), Math.abs(hh / (ty || 1e-9)));
      ex = rect.left + cx + tx * scale;
      ey = rect.top  + cy + ty * scale;
    }

    el.style.left = (ex - 14) + 'px';
    el.style.top  = (ey - 14) + 'px';
  }

  function installEdgeIndicatorListener() {
    if (map.__cdEdgeListener) return;
    map.__cdEdgeListener = true;
    map.on('move', updateEdgeIndicator);
    map.on('zoom', updateEdgeIndicator);
  }

  function createMarker() {
    if (marker || !map) return;
    const el = document.createElement('div');
    el.id = 'cdPlayerMarker';
    el.style.cssText = 'position:relative;width:0;height:0;pointer-events:none;z-index:10002!important';
    el.innerHTML = `
      <svg id="cdArrow" viewBox="-12 -12 24 24" xmlns="http://www.w3.org/2000/svg"
        style="position:absolute;width:24px;height:24px;transform:translate(-50%,-50%);
        filter:drop-shadow(0 0 4px rgba(255,208,96,.9));">
        <polygon points="0,-10 7,6 0,2 -7,6" fill="#ffd060" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
      <div style="position:absolute;width:16px;height:16px;
        border:2px solid rgba(255,208,96,.5);border-radius:50%;
        transform:translate(-50%,-50%);animation:cdPulse 2s ease-out infinite;"></div>
    `;
    if (!document.getElementById('cdOverlayStyle')) {
      const s = document.createElement('style');
      s.id = 'cdOverlayStyle';
      s.textContent = '@keyframes cdPulse{0%{width:16px;height:16px;opacity:.8}100%{width:38px;height:38px;opacity:0}}';
      document.head.appendChild(s);
    }
    marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([0, 0]).addTo(map);
    marker.getElement().style.setProperty('z-index', '10002', 'important');
  }

  function updateHeading(newPos) {
    const src = (window.__cdSettings && window.__cdSettings.headingSource) || 'auto';
    let deg = null;
    if (src !== 'delta' && typeof newPos.heading === 'number') {
      deg = newPos.heading;
    } else if (src !== 'entity') {
      if (!lastPos) return;
      const dx = newPos.x - lastPos.x;
      const dz = newPos.z - lastPos.z;
      if (dx*dx + dz*dz < 0.001) return;
      deg = Math.atan2(dx, dz) * 180 / Math.PI;
    }
    if (deg === null) return;
    lastHeading = deg;
    updateArrowRotation();
  }

  function updateArrowRotation() {
    const arrow = document.getElementById('cdArrow');
    if (arrow) {
      const arrowDeg = following && rotateWithCamera
        ? lastHeading - lastCameraHeading
        : (following && rotateWithPlayer ? 0 : lastHeading);
      arrow.style.transform = `translate(-50%,-50%) rotate(${arrowDeg}deg)`;
    }
  }

  function resetMapBearing() {
    const m = getMap();
    if (!m) return;
    if (typeof m.jumpTo === 'function') {
      m.jumpTo({ bearing: 0 });
    } else {
      m.easeTo({ bearing: 0, duration: 0 });
    }
  }

  function liveEaseTo(m, view) {
    if (!m) return;
    if (typeof m.jumpTo === 'function') {
      m.jumpTo(view);
      return;
    }
    if (typeof m.stop === 'function') m.stop();
    m.easeTo(Object.assign({ duration: LIVE_VIEW_DURATION_MS }, view));
  }

  function setRotateWithPlayer(val) {
    rotateWithPlayer = !!val;
    if (rotateWithPlayer) rotateWithCamera = false;
    if (window.__cdSettings) window.__cdSettings.rotateWithPlayer = rotateWithPlayer;
    if (window.__cdSettings) window.__cdSettings.rotateWithCamera = rotateWithCamera;
    updateArrowRotation();
    if (!following || (!rotateWithPlayer && !rotateWithCamera)) resetMapBearing();
  }

  function setRotateWithCamera(val) {
    rotateWithCamera = !!val;
    if (rotateWithCamera) rotateWithPlayer = false;
    if (window.__cdSettings) window.__cdSettings.rotateWithCamera = rotateWithCamera;
    if (window.__cdSettings) window.__cdSettings.rotateWithPlayer = rotateWithPlayer;
    updateArrowRotation();
    if (!following || (!rotateWithCamera && !rotateWithPlayer)) resetMapBearing();
  }

  function isSamePositionMessage(pos, prev) {
    if (!prev) return false;
    return pos.lng === prev.lng &&
      pos.lat === prev.lat &&
      pos.x === prev.x &&
      pos.y === prev.y &&
      pos.z === prev.z &&
      pos.realm === prev.realm &&
      pos.heading === prev.heading;
  }

  function onCameraHeading(msg) {
    if (typeof msg.heading !== 'number') return;
    if (hasCameraHeading && msg.heading === lastCameraHeading) return;
    hasCameraHeading = true;
    lastCameraHeading = msg.heading;
    if (window.__cdSettings) {
      rotateWithCamera = !!window.__cdSettings.rotateWithCamera;
      rotateWithPlayer = !!window.__cdSettings.rotateWithPlayer;
    }
    if (!rotateWithCamera || !following) {
      updateArrowRotation();
      return;
    }
    updateArrowRotation();
    const mm = getMap();
    if (mm) {
      const view = { bearing: lastCameraHeading };
      if (following && !shiftHeld && lastPos && !nearbySelectionActive) {
        view.center = [lastPos.lng, lastPos.lat];
      }
      liveEaseTo(mm, view);
    }
  }

  // ── Botão flutuante status (direita) — toggle follow + expandir ───
  function toggleFollow() {
    following = !following;
    updatePanel();
    updateArrowRotation();
    if (!following) resetMapBearing();
    else if (lastPos && !rotateWithCamera) pan(lastPos.lng, lastPos.lat);
  }

  function ensureStatusToggleBtn() {
    if (document.getElementById('cdOvBar')) return;
    const bar = document.createElement('div');
    bar.id = 'cdOvBar';
    bar.style.cssText = `position:fixed;bottom:12px;right:12px;z-index:10000;
      display:flex;gap:4px;align-items:center`;

    // Botão expand/collapse (abre o painel completo)
    const expand = document.createElement('button');
    expand.id = 'cdOvExpandBtn';
    expand.title = 'Expandir painel';
    expand.textContent = '⊞';
    expand.style.cssText = `width:28px;height:36px;border-radius:6px;
      background:rgba(12,12,18,.9);border:1px solid rgba(255,208,96,.25);
      color:#555;font:14px monospace;cursor:pointer;
      box-shadow:0 3px 12px rgba(0,0,0,.5);backdrop-filter:blur(4px);
      transition:color .15s,border-color .15s`;
    expand.addEventListener('mouseenter', () => { expand.style.color='#ffd060'; expand.style.borderColor='rgba(255,208,96,.6)'; });
    expand.addEventListener('mouseleave', () => { expand.style.color='#555'; expand.style.borderColor='rgba(255,208,96,.25)'; });
    expand.addEventListener('click', () => {
      const panel = document.getElementById('cdOvPanel');
      if (!panel) { ensurePanel(); return; }
      const visible = panel.style.display !== 'none';
      panel.style.display = visible ? 'none' : 'block';
      expand.textContent = visible ? '⊞' : '⊟';
    });

    // Botão follow (sempre visível, reflete estado)
    const followBtn = document.createElement('button');
    followBtn.id = 'cdOvFollowFloat';
    followBtn.title = 'Toggle Follow';
    followBtn.style.cssText = `height:36px;padding:0 12px;border-radius:6px;
      background:rgba(12,30,20,.95);border:1.5px solid rgba(80,220,120,.6);
      color:#60e890;font:bold 11px 'Segoe UI',sans-serif;cursor:pointer;
      box-shadow:0 3px 12px rgba(0,0,0,.6);backdrop-filter:blur(6px);
      white-space:nowrap;transition:background .15s,border-color .15s,color .15s`;
    followBtn.textContent = '🗺 Follow: ON';
    followBtn.addEventListener('click', toggleFollow);

    bar.appendChild(expand);
    bar.appendChild(followBtn);
    document.body.appendChild(bar);
  }

  // ── Painel de status (direita, oculto por padrão) ─────────────────
  function ensurePanel() {
    if (document.getElementById('cdOvPanel')) return;
    const el = document.createElement('div');
    el.id = 'cdOvPanel';
    el.style.cssText = `position:fixed;bottom:56px;right:12px;z-index:9999;
      background:rgba(12,12,18,.88);color:#e8e8e8;
      font:12px/1.5 'Segoe UI',system-ui,sans-serif;
      border:1px solid rgba(255,208,96,.3);border-radius:7px;
      padding:7px 11px;min-width:210px;backdrop-filter:blur(5px);
      box-shadow:0 4px 18px rgba(0,0,0,.5);user-select:none;display:none`;
    el.innerHTML = `
      <div id="cdOvCoords" style="font:11px/1.5 Consolas,monospace;color:#bbb;margin-bottom:2px">--</div>
      <div id="cdOvStatus" style="font-size:10px;color:#e07070">Connecting…</div>
      <div id="cdOvTeleportRow" style="display:flex;gap:4px;margin-top:5px${teleportEnabled ? '' : ';display:none'}">
        <button id="cdOvMarker" title="Teleport to the browser map crosshair"
          style="flex:1;background:rgba(100,160,255,.15);border:1px solid rgba(100,160,255,.4);
          color:#80b4ff;font:10px 'Segoe UI';padding:3px 5px;border-radius:4px;cursor:pointer">
          ⌖ Go to Crosshair
        </button>
        <button id="cdOvSetF5" title="Save the crosshair as the F5 teleport target"
          style="flex:1;background:rgba(255,208,96,.12);border:1px solid rgba(255,208,96,.38);
          color:#ffd060;font:10px 'Segoe UI';padding:3px 5px;border-radius:4px;cursor:pointer">
          F5 Target
        </button>
        <button id="cdOvAbort" title="Return to position before last teleport"
          style="flex:1;background:rgba(255,100,100,.12);border:1px solid rgba(255,100,100,.35);
          color:#ff8080;font:10px 'Segoe UI';padding:3px 5px;border-radius:4px;
          cursor:pointer;opacity:.35;pointer-events:none">
          ↩ Abort
        </button>
      </div>
    `;
    document.body.appendChild(el);
    document.getElementById('cdOvMarker').addEventListener('click', () => {
      // The MapGenie crosshair is the visible center of the browser map.
      // This avoids relying on the game's destination-marker memory hook.
      teleportMapCenter();
    });
    document.getElementById('cdOvSetF5').addEventListener('click', () => {
      saveCrosshairTarget();
    });
    document.getElementById('cdOvAbort').addEventListener('click', () => {
      if (!hasPreTeleport) return;
      hasPreTeleport = false;
      sendCmd({ cmd: 'abort' });
      updatePanel();
    });
  }

  function updatePanel() {
    ensureStatusToggleBtn();
    ensurePanel();

    // Botão flutuante de follow
    const followFloat = document.getElementById('cdOvFollowFloat');
    if (followFloat) {
      const isRound = !!(window.__cdSettings && window.__cdSettings.roundWindow);
      followFloat.textContent  = isRound ? 'F' : `🗺 Follow: ${following ? 'ON' : 'OFF'}`;
      followFloat.title = `Toggle Follow (${following ? 'ON' : 'OFF'})`;
      followFloat.style.background  = following ? 'rgba(12,30,20,.95)'  : 'rgba(30,20,0,.95)';
      followFloat.style.borderColor = following ? 'rgba(80,220,120,.6)' : 'rgba(255,208,96,.6)';
      followFloat.style.color       = following ? '#60e890' : '#ffd060';
    }

    // Painel expandido
    const coords  = document.getElementById('cdOvCoords');
    const status  = document.getElementById('cdOvStatus');
    const abort   = document.getElementById('cdOvAbort');
    if (coords && lastPos)
      coords.textContent = `X ${lastPos.x.toFixed(0)}  Z ${lastPos.z.toFixed(0)}  Y ${lastPos.y.toFixed(0)}`;
    if (status) {
      const ok = ws && ws.readyState === 1;
      status.textContent = ok
        ? (lastPos ? `Realm: ${lastPos.realm}` : 'Move the character to start')
        : 'Server offline';
      status.style.color = ok ? '#60e890' : '#e07070';
    }
    if (abort) {
      abort.style.opacity       = hasPreTeleport ? '1'    : '.35';
      abort.style.pointerEvents = hasPreTeleport ? 'auto' : 'none';
    }
  }

  function setStatus(text, color, ms) {
    const s = document.getElementById('cdOvStatus');
    if (!s) return;
    s.textContent = text;
    s.style.color = color || '#ffd060';
    if (ms) setTimeout(() => updatePanel(), ms);
  }

  function pan(lng, lat) {
    const m = getMap();
    liveEaseTo(m, { center: [lng, lat] });
  }

  function panToLocationId(locationId) {
    const loc = _getLocationDetails(locationId);
    const lng = loc?.longitude;
    const lat = loc?.latitude;
    if (typeof lng === 'number' && typeof lat === 'number') {
      pan(lng, lat);
    }
  }

  function createCenterCrosshair() {
    if (document.getElementById('cdCenterCrosshair')) return;
    const el = document.createElement('div');
    el.id = 'cdCenterCrosshair';
    document.body.appendChild(el);
  }

  function sendCmd(obj) {
    if (!ws || ws.readyState !== 1) return;
    const payload = obj && obj.cmd === 'location_toggle'
      ? { ...obj, sourceClientId: CLIENT_ID }
      : obj;
    ws.send(JSON.stringify(payload));
  }

  function syncCenterTeleportInputs() {
    ['cdCenterY', 'cdCenterPanelY'].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = getCenterTeleportY();
    });
    ['cdCenterYVal', 'cdCenterPanelYVal'].forEach(id => {
      const label = document.getElementById(id);
      if (label) label.textContent = Math.round(getCenterTeleportY()).toString();
    });
  }

  function setCenterTeleportY(value) {
    const y = Number(value);
    if (!Number.isFinite(y)) return false;
    if (!window.__cdSettings) window.__cdSettings = {};
    window.__cdSettings.centerTeleportY = y;
    try { localStorage.setItem(CENTER_TELEPORT_Y_KEY, String(y)); } catch (_) {}
    syncCenterTeleportInputs();
    return true;
  }

  function getCenterTeleportY() {
    let raw = null;
    try { raw = localStorage.getItem(CENTER_TELEPORT_Y_KEY); } catch (_) {}
    if (raw === null || raw === '') raw = window.__cdSettings && window.__cdSettings.centerTeleportY;
    const y = Number(raw);
    return Number.isFinite(y) ? y : 1000;
  }

  function teleportMapCenter() {
    const m = getMap();
    if (!m || typeof m.getCenter !== 'function') {
      setStatus('Map is not ready yet', '#e07070', 3500);
      return;
    }
    if (!ws || ws.readyState !== 1) {
      setStatus('Server offline', '#e07070', 3500);
      return;
    }
    const center = m.getCenter();
    const realm = (lastPos && lastPos.realm) || 'pywel';
    setStatus(`Crosshair: ${center.lng.toFixed(4)}, ${center.lat.toFixed(4)}`, '#80b4ff', 5000);
    sendCmd({ cmd: 'teleport_map', lng: center.lng, lat: center.lat, y: getCenterTeleportY(), realm });
  }

  function saveCrosshairTarget() {
    const m = getMap();
    if (!m || typeof m.getCenter !== 'function') {
      setStatus('Map is not ready yet', '#e07070', 3500);
      return;
    }
    if (!ws || ws.readyState !== 1) {
      setStatus('Server offline', '#e07070', 3500);
      return;
    }
    const center = m.getCenter();
    const realm = (lastPos && lastPos.realm) || 'pywel';
    sendCmd({ cmd: 'set_crosshair_target', lng: center.lng, lat: center.lat, y: getCenterTeleportY(), realm });
  }

  // ── MapGenie location sync ────────────────────────────────────────
  let _replayingToggle = false;
  function setUserLocationFound(locationId, found) {
    if (!window.user?.locations) return;
    const id = String(locationId);
    if (found) window.user.locations[id] = true;
    else delete window.user.locations[id];
  }

  (function () {
    // ── Fetch patch ──
    const _origFetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await _origFetch.apply(this, args);
      if (!_replayingToggle && res.ok) {
        try {
          const url = typeof args[0] === 'string' ? args[0]
            : (args[0] instanceof Request ? args[0].url : '');
          const method = ((args[1] && args[1].method) ||
            (args[0] instanceof Request ? args[0].method : 'GET')).toUpperCase();
          const parts = url.split('/api/v1/user/locations/');
          if (parts.length > 1 && (method === 'PUT' || method === 'DELETE')) {
            const locationId = parts[1].split('/')[0].split('?')[0];
            if (locationId) {
              sendCmd({ cmd: 'location_toggle', locationId, found: method === 'PUT' });
              setUserLocationFound(locationId, method === 'PUT');
            }
          }
        } catch (_) {}
      }
      return res;
    };

    // ── XHR patch ──
    const _origOpen = XMLHttpRequest.prototype.open;
    const _origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._cdMethod = method ? method.toUpperCase() : 'GET';
      this._cdUrl    = typeof url === 'string' ? url : String(url);
      return _origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      const xhr = this;
      xhr.addEventListener('load', function () {
        if (_replayingToggle) return;
        if (xhr.status < 200 || xhr.status >= 300) return;
        const parts = (xhr._cdUrl || '').split('/api/v1/user/locations/');
        if (parts.length > 1 && (xhr._cdMethod === 'PUT' || xhr._cdMethod === 'DELETE')) {
          const locationId = parts[1].split('/')[0].split('?')[0];
          if (locationId) {
            sendCmd({ cmd: 'location_toggle', locationId, found: xhr._cdMethod === 'PUT' });
            setUserLocationFound(locationId, xhr._cdMethod === 'PUT');
          }
        }
      });
      return _origSend.apply(this, args);
    };
  })();

  function _showLocationToast(locationId, found) {
    let toast = document.getElementById('cdLocSyncToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cdLocSyncToast';
      toast.style.cssText = 'position:fixed;bottom:56px;left:50%;transform:translateX(-50%);z-index:99999;' +
        'background:rgba(12,12,18,.93);color:#e8e8e8;' +
        "font:12px/1.5 'Segoe UI',system-ui,sans-serif;" +
        'border:1px solid rgba(255,208,96,.45);border-radius:6px;' +
        'padding:6px 14px;pointer-events:none;' +
        'box-shadow:0 3px 12px rgba(0,0,0,.5);' +
        'transition:opacity .3s;opacity:0;white-space:nowrap';
      document.body.appendChild(toast);
    }
    const action = found ? 'marcado' : 'desmarcado';
    toast.textContent = 'Location #' + locationId + ' ' + action + ' em outro cliente';
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
  }

  function _onLocationToggle(locationId, found) {
    _showLocationToast(locationId, found);
    setUserLocationFound(locationId, found);
    if (typeof window.mapManager?.markLocationAsFound === 'function') {
      _replayingToggle = true;
      window.mapManager.markLocationAsFound(parseInt(locationId, 10), found);
      setTimeout(() => { _replayingToggle = false; }, 2000);
    }
  }

  // ── Nearby Locations ─────────────────────────────────────────────
  // Threshold em coordenadas lng/lat do Mapbox — ajustar conforme necessário.
  // O mapa usa valores aprox. entre -1 e 1; 0.005 equivale a uma área pequena.
  const NEARBY_REFRESH_MS = 500;
  let _catCache = null;
  let _locCache = null;
  function _getCategoryName(id) {
    if (!_catCache) {
      _catCache = {};
      try {
        for (const g of window.mapData?.groups || [])
          for (const c of g.categories || [])
            _catCache[String(c.id)] = { title: c.title, icon: c.icon || '' };
      } catch (_) {}
    }
    return _catCache[String(id)] || null;  // { title, icon }
  }
  function _nearbyThreshold() {
    const v = window.__cdSettings && window.__cdSettings.nearbyThreshold;
    return (typeof v === 'number' && v > 0) ? v : 0.005;
  }
  function _nearbyRespectMapVisibility() {
    try {
      const saved = localStorage.getItem(NEARBY_RESPECT_MAP_VISIBILITY_KEY);
      if (saved === '1') return true;
      if (saved === '0') return false;
    } catch (_) {}
    return !(window.__cdSettings && window.__cdSettings.nearbyRespectMapVisibility === false);
  }
  function _setNearbyRespectMapVisibility(value) {
    const enabled = !!value;
    if (!window.__cdSettings) window.__cdSettings = {};
    window.__cdSettings.nearbyRespectMapVisibility = enabled;
    try {
      localStorage.setItem(NEARBY_RESPECT_MAP_VISIBILITY_KEY, enabled ? '1' : '0');
    } catch (_) {}
    return enabled;
  }
  function _isMapGenieCategoryVisible(categoryId) {
    if (!_nearbyRespectMapVisibility()) return true;
    const categoriesMap = window.__cdMapGeniePatch?.categories?.categoriesMap;
    if (!categoriesMap || categoryId === undefined || categoryId === null) return true;
    const category = categoriesMap[String(categoryId)];
    return !category || category.visible !== false;
  }
  function _getLocationDetails(id) {
    try {
      if (!_locCache) {
        _locCache = {};
        for (const item of window.mapData?.locations || []) _locCache[String(item.id)] = item;
      }
      return _locCache[String(id)] || null;
    } catch (_) {
      return null;
    }
  }
  function _escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
  function _renderInlineMarkdown(value) {
    return _escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        (_m, text, url) => {
          const match = url.match(/[?&]locationIds=(\d+)/);
          if (match) return `<a href="#" data-location-id="${match[1]}">${text}</a>`;
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        });
  }
  function _renderDescription(value) {
    if (!value) return '';
    return String(value)
      .split(/\n{2,}/)
      .map(part => `<p>${_renderInlineMarkdown(part).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }
  const _NR_SRC   = 'cd-nearby-radius';
  const _NR_FILL  = 'cd-nearby-radius-fill';
  const _NR_LINE  = 'cd-nearby-radius-line';
  const _NS_SRC   = 'cd-nearby-selected';
  const _NS_FILL  = 'cd-nearby-selected-fill';
  const _NS_LINE  = 'cd-nearby-selected-line';
  let _nearbyCircleKey = '';
  let _nearbySelectionKey = '';

  function _buildNearbyCircleGeoJSON(lng, lat) {
    const steps = 64;
    const r = _nearbyThreshold();
    const coords = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      coords.push([lng + r * Math.cos(a), lat + r * Math.sin(a)]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } };
  }

  function updateNearbyCircle() {
    const m = getMap();
    if (!m) return;
    const show = nearbyControlsEnabled() && !!lastPos;
    const circleKey = show
      ? `${lastPos.lng.toFixed(5)},${lastPos.lat.toFixed(5)},${_nearbyThreshold()}`
      : 'hidden';
    if (circleKey === _nearbyCircleKey) return;
    _nearbyCircleKey = circleKey;
    try {
      if (!m.getSource(_NR_SRC)) {
        if (!show) return;
        m.addSource(_NR_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: _NR_FILL, type: 'fill', source: _NR_SRC,
          paint: { 'fill-color': '#ffd060', 'fill-opacity': 0.15 } });
        m.addLayer({ id: _NR_LINE, type: 'line', source: _NR_SRC,
          paint: { 'line-color': '#ffd060', 'line-width': 1.5,
                   'line-opacity': 0.8, 'line-dasharray': [4, 3] } });
      }
      m.getSource(_NR_SRC).setData(
        show ? _buildNearbyCircleGeoJSON(lastPos.lng, lastPos.lat)
             : { type: 'FeatureCollection', features: [] }
      );
    } catch (_) {}
  }

  function _emptyFeatureCollection() {
    return { type: 'FeatureCollection', features: [] };
  }

  function _selectedLocationFeature(lng, lat) {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {}
    };
  }

  function updateNearbySelection(item, shouldPan) {
    const m = getMap();
    if (!m || !item || typeof item.lng !== 'number' || typeof item.lat !== 'number') {
      clearNearbySelection(false);
      return;
    }
    const key = `${item.id}:${item.lng.toFixed(6)},${item.lat.toFixed(6)}`;
    nearbySelectionActive = true;
    try {
      if (!m.getSource(_NS_SRC)) {
        m.addSource(_NS_SRC, { type: 'geojson', data: _emptyFeatureCollection() });
        m.addLayer({ id: _NS_FILL, type: 'circle', source: _NS_SRC,
          paint: {
            'circle-radius': 15,
            'circle-color': 'rgba(255,40,40,0.18)',
            'circle-stroke-color': '#ff3838',
            'circle-stroke-width': 3,
            'circle-stroke-opacity': 0.95
          } });
        m.addLayer({ id: _NS_LINE, type: 'circle', source: _NS_SRC,
          paint: {
            'circle-radius': 22,
            'circle-color': 'rgba(255,40,40,0)',
            'circle-stroke-color': '#ff3838',
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.6
          } });
      }
      if (key !== _nearbySelectionKey) {
        m.getSource(_NS_SRC).setData(_selectedLocationFeature(item.lng, item.lat));
        _nearbySelectionKey = key;
      }
      if (shouldPan) pan(item.lng, item.lat);
    } catch (_) {}
  }

  function clearNearbySelection(restorePlayer) {
    const m = getMap();
    nearbySelectionActive = false;
    _nearbySelectionKey = '';
    try {
      if (m && m.getSource(_NS_SRC)) m.getSource(_NS_SRC).setData(_emptyFeatureCollection());
    } catch (_) {}
    if (restorePlayer && lastPos) pan(lastPos.lng, lastPos.lat);
  }

  function nearbyControlsEnabled() {
    return !!(window.__cdSettings && window.__cdSettings.nearbyControlsEnabled);
  }

  window.__cdUpdateNearbyControls = function() {
    updateNearbyCircle();
    if (nearbyControlsEnabled()) return;
    const popup = nearbyPopup;
    nearbyPopup = null;
    nearbyInputHandler = null;
    clearNearbySelection(true);
    try { if (popup && !popup.closed) popup.close(); } catch (_) {}
  };

  function isNearbyPopupOpen() {
    try {
      return !!(nearbyPopup && !nearbyPopup.closed);
    } catch (_) {
      return false;
    }
  }

  function _sortNearbyItems(a, b) {
    if (a.found !== b.found) return a.found ? 1 : -1;
    return a.dist - b.dist;
  }

  function getNearbyLocations() {
    if (!lastPos || !map) return [];
    try {
      const features = map.getStyle().sources['locations-data']?.data?.features;
      if (!features) return [];
      const t = _nearbyThreshold();
      return features
        .reduce((acc, f) => {
          const categoryId = f.properties.category_id;
          if (!_isMapGenieCategoryVisible(categoryId)) return acc;
          const [lng, lat] = f.geometry.coordinates;
          const dx = lng - lastPos.lng, dy = lat - lastPos.lat;
          const d2 = dx * dx + dy * dy;
          const details = _getLocationDetails(f.properties.locationId);
          const category = details?.category || _getCategoryName(categoryId);
          if (d2 <= t * t) acc.push({
            id: String(f.properties.locationId),
            title: details?.title || f.properties.title || `Location ${f.properties.locationId}`,
            found: !!(window.user?.locations?.[f.properties.locationId]),
            lng,
            lat,
            dist: Math.sqrt(d2),
            category,
            details
          });
          return acc;
        }, [])
        .sort(_sortNearbyItems);
    } catch (_) { return []; }
  }

  // Exposto globalmente para que o popup possa chamar mesmo sem window.opener funcionar
  window.__cdToggleLocation = function(locationId, found) {
    const csrf = document.head.querySelector('meta[name="csrf-token"]')?.content || '';
    fetch(`/api/v1/user/locations/${locationId}`, {
      method: found ? 'PUT' : 'DELETE',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
        'X-CSRF-TOKEN': csrf,
      }
    }).catch(() => {});
  };

  function openNearbyPopup() {
    if (!nearbyControlsEnabled()) return;
    if (isNearbyPopupOpen()) {
      closeNearbyPopup();
      return;
    }
    nearbyPopup = null;
    nearbyInputHandler = null;

    let items = getNearbyLocations();

    nearbyPopup = window.open('', 'cdNearbyLocations',
      'width=860,height=460,resizable=yes,scrollbars=no');
    if (!nearbyPopup) return;

    let selectedIndex = 0;
    let activeFoundList = items.some(item => !item.found) ? false : items.some(item => item.found);
    let lastDetailsId = null;
    let lastDetailsFound = null;
    const doc = nearbyPopup.document;
    const _iconCssHref = document.head.querySelector('link[href*="crimson-desert-icons"]')?.href || '';
    doc.open();
    doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Nearby Locations</title>
  ${_iconCssHref ? `<link rel="stylesheet" href="${_iconCssHref}">` : ''}
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;
      background:#0f0f1a;color:#e8e8e8;
      font:12px/1.5 'Segoe UI',system-ui,sans-serif}
    *{box-sizing:border-box}
    .wrap{height:100%;display:flex;flex-direction:column;
      background:rgba(12,12,18,.97);border:1px solid rgba(255,208,96,.25)}
    .header{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.07);
      display:flex;align-items:center;gap:8px;flex-shrink:0}
    .header-title{flex:1;font-size:13px;font-weight:600;color:#ffd060}
    .header-count{font-size:11px;color:#555}
    .header-toggle{height:24px;padding:0 9px;border-radius:4px;border:1px solid rgba(255,208,96,.28);background:rgba(255,208,96,.08);color:#cfc4ad;font:10px 'Segoe UI',sans-serif;cursor:pointer;white-space:nowrap}
    .header-toggle.on{border-color:rgba(96,232,144,.45);background:rgba(96,232,144,.12);color:#60e890}
    .header-toggle.off{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#777}
    .content{flex:1;min-height:0;display:flex}
    .lists{width:430px;flex-shrink:0;display:flex;min-width:0;border-right:1px solid rgba(255,255,255,.07)}
    .list-pane{width:50%;min-width:0;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,.06);background:rgba(10,10,15,.72)}
    .list-pane:last-child{border-right:0}
    .list-head{height:30px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 9px;border-bottom:1px solid rgba(255,255,255,.06);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#6e7280}
    .list-pane.active .list-head{background:rgba(255,208,96,.08);color:#ffd060}
    .list-count{color:#555}
    .list-pane.active .list-count{color:#a88d40}
    .list{flex:1;min-height:0;overflow-y:auto;padding:4px}
    .details{flex:1;min-width:0;overflow-y:auto;background:rgba(8,8,12,.96)}
    .details-empty{height:100%;display:flex;align-items:center;justify-content:center;color:#555;font-size:12px}
    .detail-media{height:155px;background:#07070a;border-bottom:1px solid rgba(255,208,96,.25);display:flex;align-items:center;justify-content:center;overflow:hidden}
    .detail-media img{width:100%;height:100%;object-fit:cover}
    .detail-body{padding:12px}
    .detail-title{font-size:20px;line-height:1.15;font-weight:700;color:#f4f0e8;margin:0 0 4px}
    .detail-category{font-style:italic;color:#cfc4ad;font-size:12px;margin-bottom:14px}
    .detail-desc{color:#eee;font-size:12px;line-height:1.55}
    .detail-desc p{margin:0 0 10px}
    .detail-desc strong{color:#fff}
    .detail-desc a{color:#2fa7ff;text-decoration:none}
    .detail-found{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,208,96,.25);display:flex;align-items:center;justify-content:center;gap:8px;text-transform:uppercase;font-weight:700;color:#ddd}
    .detail-box{width:20px;height:20px;border:2px solid rgba(255,208,96,.45);display:flex;align-items:center;justify-content:center;color:#60e890}
    .empty{padding:24px;text-align:center;color:#555;font-size:12px}
    .empty.small{padding:18px 8px;font-size:11px}
    .item{display:flex;align-items:center;gap:8px;
      padding:6px 7px;border-radius:5px;cursor:pointer;
      border:1px solid transparent;margin-bottom:2px}
    .item.selected{background:rgba(255,208,96,.12);border-color:rgba(255,208,96,.4)}
    .item:not(.selected):hover{background:rgba(255,255,255,.04)}
    .check{font-size:14px;width:18px;flex-shrink:0;text-align:center}
    .found .check{color:#60e890}
    .notfound .check{color:#444}
    .item-name{flex:1;overflow:hidden;display:flex;flex-direction:column;gap:2px}
    .item-icon-wrap{position:relative;width:30px;height:32px;flex-shrink:0;align-self:center;display:flex;align-items:center;justify-content:center;overflow:visible}
    .item-icon-wrap .icon{transform:scale(1.55);transform-origin:center}
    .item-badge{position:absolute;bottom:2px;right:1px;width:13px;height:13px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold;line-height:1;border:1.5px solid #0f0f1a}
    .found .item-badge{background:rgba(96,232,144,.95);color:#0a1a0a}
    .notfound .item-badge{background:rgba(20,20,30,.9);color:#555;border-color:#333}
    .item-title{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .found .item-title{color:#e8e8e8}
    .notfound .item-title{color:#999}
    .item-cat{font-size:10px;color:#4a5568;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .selected .item-cat{color:#718096}
    .item-dist{font-size:10px;color:#555;flex-shrink:0;min-width:26px;text-align:right;align-self:center}
    .selected .item-dist{color:#888}
    .footer{padding:5px 12px;border-top:1px solid rgba(255,255,255,.07);
      flex-shrink:0;font-size:10px;color:#444;display:flex;gap:14px}
    .footer b{color:#666}
  </style>
</head>
<body tabindex="0">
  <div class="wrap">
    <div class="header">
      <div class="header-title">📍 Nearby</div>
      <div class="header-count" id="hcount"></div>
      <button class="header-toggle" id="mapFilterToggle" title="Respect the categories currently visible on the map">Map filters</button>
    </div>
    <div class="content">
      <div class="lists">
        <div class="list-pane" id="notfoundPane">
          <div class="list-head"><span>Not found</span><span class="list-count" id="notfoundCount"></span></div>
          <div class="list" id="notfoundList"></div>
        </div>
        <div class="list-pane" id="foundPane">
          <div class="list-head"><span>Found</span><span class="list-count" id="foundCount"></span></div>
          <div class="list" id="foundList"></div>
        </div>
      </div>
      <div class="details" id="details"></div>
    </div>
    <div class="footer">
      <span style="margin-right: 5px"><b>Left/Right</b> List</span>
      <span style="margin-right: 5px"><b>Up/Down, W/S, D-pad</b> Navigate</span>
      <span style="margin-right: 5px"><b>Enter, Space, A</b> Mark</span>
      <span style="margin-right: 5px"><b>Select/View</b> Filters</span>
      <span><b>Esc, B</b> Close</span>
    </div>
  </div>
  <script>
    // Foco chamado de dentro da própria janela — Qt honra isso
    window.focus();
    document.body.focus();
  </script>
</body>
</html>`);
    doc.close();

    function syncMapFilterToggle() {
      const btn = doc.getElementById('mapFilterToggle');
      if (!btn) return;
      const enabled = _nearbyRespectMapVisibility();
      btn.className = `header-toggle ${enabled ? 'on' : 'off'}`;
      btn.textContent = enabled ? 'Map filters ON' : 'Map filters OFF';
      btn.title = enabled
        ? 'Nearby follows the categories currently visible on the map'
        : 'Nearby shows all categories, ignoring map category visibility';
    }

    function toggleMapFilterMode() {
      _setNearbyRespectMapVisibility(!_nearbyRespectMapVisibility());
      syncMapFilterToggle();
      refreshNearbyItems();
    }

    function renderLegacySingleList() {
      const list   = doc.getElementById('list');
      const hcount = doc.getElementById('hcount');
      if (!list) return;
      if (items.length === 0) {
        list.innerHTML = '<div class="empty">No location nearby</div>';
        if (hcount) hcount.textContent = '';
        renderDetails(null);
        clearNearbySelection(false);
        return;
      }
      if (hcount) hcount.textContent = `${items.length} location${items.length !== 1 ? 's' : ''}`;
      syncMapFilterToggle();

      // Fingerprint: skip render se ids, found e seleção não mudaram
      const fp = items.map(it => `${it.id}:${it.found}`).join(',') + '|' + selectedIndex;
      if (fp === list._fp) {
        // Só atualiza distâncias (mudam sem alterar a estrutura)
        items.forEach((item, i) => {
          const el = list.querySelector(`.item[data-id="${item.id}"]`);
          if (el) { const d = el.querySelector('.item-dist'); if (d) d.textContent = (item.dist * 1000).toFixed(1); }
        });
        renderDetails(items[selectedIndex]);
        syncSelectedNearby(false);
        return;
      }
      list._fp = fp;

      // Keyed update: atualiza elementos existentes, cria novos, remove obsoletos
      const existing = {};
      list.querySelectorAll('.item[data-id]').forEach(el => { existing[el.dataset.id] = el; });
      const newIds = new Set(items.map(it => it.id));
      Object.keys(existing).forEach(id => { if (!newIds.has(id)) existing[id].remove(); });

      function buildItemEl(item, i) {
        const cls = item.found ? 'found' : 'notfound';
        const sel = i === selectedIndex ? ' selected' : '';
        const cat = item.category;
        const badge = `<span class="item-badge">${item.found ? '✓' : '○'}</span>`;
        const iconName = String(cat?.icon || '').replace(/[^a-z0-9_-]/gi, '');
        const iconHtml = cat?.icon
          ? `<div class="item-icon-wrap"><span class="icon icon-${iconName}"></span>${badge}</div>` : '';
        const catHtml = cat ? `<div class="item-cat">${_escapeHtml(cat.title)}</div>` : '';
        const el = doc.createElement('div');
        el.className = `item ${cls}${sel}`;
        el.dataset.id = item.id;
        el.innerHTML = `
          ${iconHtml || `<div class="check">${item.found ? '✓' : '○'}</div>`}
          <div class="item-name">
            <div class="item-title" title="${_escapeHtml(item.title)}">${_escapeHtml(item.title)}</div>
            ${catHtml}
          </div>
          <div class="item-dist">${(item.dist * 1000).toFixed(1)}</div>`;
        el.addEventListener('click', () => {
          selectNearbyIndex(items.findIndex(it => it.id === item.id), true);
          render();
          doToggle();
        });
        return el;
      }

      items.forEach((item, i) => {
        const cls = item.found ? 'found' : 'notfound';
        const sel = i === selectedIndex ? ' selected' : '';
        let el = existing[item.id];
        if (!el) {
          el = buildItemEl(item, i);
        } else {
          // Atualiza classe e conteúdo dinâmico sem recriar o elemento
          el.className = `item ${cls}${sel}`;
          const badge = el.querySelector('.item-badge');
          if (badge) badge.textContent = item.found ? '✓' : '○';
          const check = el.querySelector('.check');
          if (check) check.textContent = item.found ? '✓' : '○';
          const d = el.querySelector('.item-dist');
          if (d) d.textContent = (item.dist * 1000).toFixed(1);
        }
        list.appendChild(el); // move para posição correta (ordem por distância)
      });

      const selEl = list.querySelector('.selected');
      if (selEl) selEl.scrollIntoView({ block: 'nearest' });
      renderDetails(items[selectedIndex]);
      syncSelectedNearby(false);
    }

    function selectedNearbyItem() {
      return items[selectedIndex] || null;
    }

    function nearbyGroup(found) {
      return items.filter(item => !!item.found === !!found);
    }

    function selectedGroupIndex() {
      const item = selectedNearbyItem();
      if (!item) return -1;
      return nearbyGroup(!!item.found).findIndex(groupItem => groupItem.id === item.id);
    }

    function selectNearbyGroupIndex(found, groupIndex, shouldPan) {
      const group = nearbyGroup(found);
      if (!group.length) return;
      const nextGroupIndex = Math.max(0, Math.min(groupIndex, group.length - 1));
      const nextItem = group[nextGroupIndex];
      const nextIndex = items.findIndex(item => item.id === nextItem.id);
      const changed = nextIndex !== selectedIndex || activeFoundList !== !!found;
      activeFoundList = !!found;
      selectedIndex = nextIndex >= 0 ? nextIndex : selectedIndex;
      if (changed || shouldPan) syncSelectedNearby(shouldPan);
    }

    function ensureNearbySelection() {
      if (!items.length) {
        selectedIndex = 0;
        activeFoundList = false;
        return;
      }
      if (selectedIndex < 0 || selectedIndex >= items.length) selectedIndex = 0;
      const item = selectedNearbyItem();
      if (item) {
        activeFoundList = !!item.found;
        return;
      }
      activeFoundList = nearbyGroup(false).length ? false : true;
      selectNearbyGroupIndex(activeFoundList, 0, false);
    }

    function moveNearbyVertical(delta) {
      if (!items.length) return;
      const current = Math.max(0, selectedGroupIndex());
      selectNearbyGroupIndex(activeFoundList, current + delta, true);
      render();
    }

    function moveNearbyHorizontal(delta) {
      if (!items.length) return;
      const targetFound = delta > 0;
      if (targetFound === activeFoundList) return;
      const targetGroup = nearbyGroup(targetFound);
      if (!targetGroup.length) return;
      const current = Math.max(0, selectedGroupIndex());
      selectNearbyGroupIndex(targetFound, Math.min(current, targetGroup.length - 1), true);
      render();
    }

    function renderList(list, group) {
      if (!list) return;
      if (!group.length) {
        list.innerHTML = '<div class="empty small">No locations</div>';
        return;
      }

      list.querySelectorAll('.empty').forEach(el => el.remove());
      const existing = {};
      list.querySelectorAll('.item[data-id]').forEach(el => { existing[el.dataset.id] = el; });
      const newIds = new Set(group.map(it => it.id));
      Object.keys(existing).forEach(id => { if (!newIds.has(id)) existing[id].remove(); });

      function buildItemEl(item) {
        const el = doc.createElement('div');
        el.dataset.id = item.id;
        el.addEventListener('click', () => {
          const nextIndex = items.findIndex(it => it.id === item.id);
          if (nextIndex >= 0) selectNearbyIndex(nextIndex, true);
          render();
          doToggle();
        });
        return el;
      }

      group.forEach(item => {
        const i = items.findIndex(it => it.id === item.id);
        const cls = item.found ? 'found' : 'notfound';
        const sel = i === selectedIndex ? ' selected' : '';
        const cat = item.category;
        const badge = `<span class="item-badge">${item.found ? '✓' : '○'}</span>`;
        const iconName = String(cat?.icon || '').replace(/[^a-z0-9_-]/gi, '');
        const iconHtml = cat?.icon
          ? `<div class="item-icon-wrap"><span class="icon icon-${iconName}"></span>${badge}</div>` : '';
        const catHtml = cat ? `<div class="item-cat">${_escapeHtml(cat.title)}</div>` : '';
        const el = existing[item.id] || buildItemEl(item);
        el.className = `item ${cls}${sel}`;
        el.innerHTML = `
          ${iconHtml || `<div class="check">${item.found ? '✓' : '○'}</div>`}
          <div class="item-name">
            <div class="item-title" title="${_escapeHtml(item.title)}">${_escapeHtml(item.title)}</div>
            ${catHtml}
          </div>
          <div class="item-dist">${(item.dist * 1000).toFixed(1)}</div>`;
        list.appendChild(el);
      });
    }

    function render() {
      const notfoundList = doc.getElementById('notfoundList');
      const foundList = doc.getElementById('foundList');
      const notfoundPane = doc.getElementById('notfoundPane');
      const foundPane = doc.getElementById('foundPane');
      const notfoundCount = doc.getElementById('notfoundCount');
      const foundCount = doc.getElementById('foundCount');
      const hcount = doc.getElementById('hcount');
      if (!notfoundList || !foundList) return;

      syncMapFilterToggle();
      ensureNearbySelection();
      const notfoundItems = nearbyGroup(false);
      const foundItems = nearbyGroup(true);
      if (hcount) hcount.textContent = `${items.length} location${items.length !== 1 ? 's' : ''}`;
      if (notfoundCount) notfoundCount.textContent = String(notfoundItems.length);
      if (foundCount) foundCount.textContent = String(foundItems.length);
      if (notfoundPane) notfoundPane.classList.toggle('active', !activeFoundList);
      if (foundPane) foundPane.classList.toggle('active', activeFoundList);

      if (items.length === 0) {
        notfoundList.innerHTML = '<div class="empty small">No location nearby</div>';
        foundList.innerHTML = '<div class="empty small">No location nearby</div>';
        if (hcount) hcount.textContent = '';
        renderDetails(null);
        clearNearbySelection(false);
        return;
      }

      renderList(notfoundList, notfoundItems);
      renderList(foundList, foundItems);
      const selEl = (activeFoundList ? foundList : notfoundList).querySelector('.selected');
      if (selEl) selEl.scrollIntoView({ block: 'nearest' });
      renderDetails(selectedNearbyItem());
      syncSelectedNearby(false);
    }

    function syncSelectedNearby(shouldPan) {
      if (!items.length) {
        clearNearbySelection(false);
        return;
      }
      updateNearbySelection(selectedNearbyItem(), shouldPan);
    }

    function selectNearbyIndex(index, shouldPan) {
      if (!items.length) return;
      const nextIndex = Math.max(0, Math.min(index, items.length - 1));
      const changed = nextIndex !== selectedIndex;
      selectedIndex = nextIndex;
      activeFoundList = !!items[selectedIndex]?.found;
      if (changed || shouldPan) syncSelectedNearby(shouldPan);
    }

    function renderDetails(item) {
      const detailEl = doc.getElementById('details');
      if (!detailEl) return;
      if (!item) {
        lastDetailsId = null;
        lastDetailsFound = null;
        detailEl.innerHTML = '<div class="details-empty">Select a nearby location</div>';
        return;
      }
      if (lastDetailsId === item.id && lastDetailsFound === item.found) return;
      lastDetailsId = item.id;
      lastDetailsFound = item.found;
      const location = item.details || _getLocationDetails(item.id) || {};
      const category = location.category || item.category || {};
      const media = Array.isArray(location.media) ? location.media.find(m => m.type === 'image' && m.url) : null;
      const title = location.title || item.title;
      const categoryTitle = category.title || item.category?.title || '';
      const desc = _renderDescription(location.description || '');
      detailEl.innerHTML = `
        ${media ? `<div class="detail-media"><img src="${_escapeHtml(media.url)}" alt=""></div>` : ''}
        <div class="detail-body">
          <h2 class="detail-title">${_escapeHtml(title)}</h2>
          ${categoryTitle ? `<div class="detail-category">${_escapeHtml(categoryTitle)}</div>` : ''}
          <div class="detail-desc">${desc || '<p>No description available.</p>'}</div>
          <div class="detail-found">Found <span class="detail-box">${item.found ? '✓' : ''}</span></div>
        </div>`;
      detailEl.querySelectorAll('[data-location-id]').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          sendCmd({ cmd: 'pan_location', locationId: link.dataset.locationId });
        });
      });
    }

    function refreshNearbyItems() {
      const selectedId = selectedNearbyItem()?.id || null;
      const previousGroupIndex = Math.max(0, selectedGroupIndex());
      items = getNearbyLocations();
      if (selectedId) {
        const nextIndex = items.findIndex(item => item.id === selectedId);
        if (nextIndex >= 0) {
          selectedIndex = nextIndex;
          activeFoundList = !!items[selectedIndex].found;
        } else if (nearbyGroup(activeFoundList).length) {
          selectNearbyGroupIndex(activeFoundList, previousGroupIndex, false);
        } else {
          activeFoundList = nearbyGroup(false).length ? false : true;
          selectNearbyGroupIndex(activeFoundList, 0, false);
        }
      } else {
        activeFoundList = nearbyGroup(false).length ? false : true;
        selectNearbyGroupIndex(activeFoundList, 0, false);
      }
      render();
    }

    const mapFilterToggle = doc.getElementById('mapFilterToggle');
    if (mapFilterToggle) {
      mapFilterToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleMapFilterMode();
      });
      mapFilterToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleMapFilterMode();
        }
      });
    }

    function doToggle() {
      if (!items.length) return;
      const item = items[selectedIndex];
      item.found = !item.found;
      setUserLocationFound(item.id, item.found);
      // Delega ao mapManager: atualiza UI, faz o fetch interno e o nosso patch intercepta
      // (sem _replayingToggle = true, então o broadcast é disparado normalmente)
      if (typeof window.mapManager?.markLocationAsFound === 'function') {
        window.mapManager.markLocationAsFound(parseInt(item.id, 10), item.found);
      }
      items.sort(_sortNearbyItems);
      selectedIndex = items.findIndex(nextItem => nextItem.id === item.id);
      activeFoundList = !!item.found;
      render();
    }

    function closeNearbyPopup() {
      const popup = nearbyPopup;
      nearbyPopup = null;
      nearbyInputHandler = null;
      if (popup) popup.close();
      clearNearbySelection(true);
      updateNearbyCircle();
    }

    nearbyInputHandler = function(action) {
      if (action === 'close') {
        closeNearbyPopup();
      } else if (action === 'down') {
        moveNearbyVertical(1);
      } else if (action === 'up') {
        moveNearbyVertical(-1);
      } else if (action === 'left') {
        moveNearbyHorizontal(-1);
      } else if (action === 'right') {
        moveNearbyHorizontal(1);
      } else if (action === 'toggle') {
        doToggle();
      } else if (action === 'filter') {
        toggleMapFilterMode();
      }
    };

    function keyHandler(e) {
      if (e.key === 'Escape') {
        closeNearbyPopup();
        return;
      }
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
        e.preventDefault();
        moveNearbyVertical(1);
      } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        e.preventDefault();
        moveNearbyVertical(-1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveNearbyHorizontal(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveNearbyHorizontal(1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doToggle();
      }
    }

    // Listener apenas no window do popup — doc.addEventListener dispara em duplicata
    nearbyPopup.addEventListener('keydown', keyHandler);
    const refreshTimer = setInterval(() => {
      if (!isNearbyPopupOpen()) {
        nearbyPopup = null;
        nearbyInputHandler = null;
        clearNearbySelection(true);
        clearInterval(refreshTimer);
        return;
      }
      refreshNearbyItems();
    }, NEARBY_REFRESH_MS);

    render();
    syncMapFilterToggle();
    syncSelectedNearby(true);
    updateNearbyCircle();
    // Delay para Qt processar a criação da janela antes de focar
    setTimeout(() => {
      try {
        if (nearbyPopup && !nearbyPopup.closed) {
          nearbyPopup.resizeTo(860, 460);
          nearbyPopup.focus();
        }
      } catch (_) {}
    }, 150);
  }

  // ── WebSocket ─────────────────────────────────────────────────────
  function handlePositionMessage(msg) {
    if (isSamePositionMessage(msg, lastPos)) return;
    updateHeading(msg);
    lastPos = msg;
    if (marker) marker.setLngLat([msg.lng, msg.lat]);
    updateNearbyCircle();
    const mm = window.mapManager && window.mapManager.map;
    if (rotateWithCamera) {
      // camera_heading controla bearing e centro nesse modo.
    } else if (following && !shiftHeld && !nearbySelectionActive && rotateWithPlayer && mm) {
      liveEaseTo(mm, { center: [msg.lng, msg.lat], bearing: lastHeading });
    } else if (following && !shiftHeld && !nearbySelectionActive) {
      pan(msg.lng, msg.lat);
    }
    updatePanel();
  }

  function handleMapMarkerMessage(msg) {
    mapDestLng = msg.lng;
    mapDestLat = msg.lat;
    if (!mapMarker) createMapMarker();
    ensureEdgeIndicator();
    installEdgeIndicatorListener();
    if (mapMarker) {
      mapMarker.setLngLat([msg.lng, msg.lat]);
      mapMarker.getElement().style.display = '';
    }
    updateEdgeIndicator();
  }

  function handleMapMarkerCleared() {
    mapDestLng = null;
    mapDestLat = null;
    if (mapMarker) mapMarker.getElement().style.display = 'none';
    const ei = document.getElementById('cdEdgeIndicator');
    if (ei) ei.style.display = 'none';
  }

  function processRealtimeEvents(events) {
    if (!Array.isArray(events)) return;
    events.forEach(function(ev) {
      if (ev.type === 'position') {
        handlePositionMessage(ev);
      } else if (ev.type === 'camera_heading') {
        onCameraHeading(ev);
      } else if (ev.type === 'map_marker') {
        handleMapMarkerMessage(ev);
      } else if (ev.type === 'map_marker_cleared') {
        handleMapMarkerCleared();
      }
    });
  }

  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    ws = new WebSocket(WS_URL);
    ws.onopen  = () => {
      sendCmd({
        cmd: 'client_options',
        clientName: 'overlay',
        realtimeBundle: true,
        nativeRealtime: NATIVE_REALTIME
      });
      updatePanel();
    };
    ws.onclose = () => { updatePanel(); setTimeout(connect, RECONNECT_MS); };
    ws.onerror = () => updatePanel();
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === 'realtime' && Array.isArray(msg.events)) {
          processRealtimeEvents(msg.events);

        } else if (msg.type === 'position') {
          handlePositionMessage(msg);

        } else if (msg.type === 'camera_heading') {
          onCameraHeading(msg);

        } else if (msg.type === 'waypoints') {
          waypoints = msg.data || [];
          renderWaypoints();

        } else if (msg.type === 'teleport_marker_result') {
          if (msg.ok) {
            hasPreTeleport = true; updatePanel();
          } else {
            setStatus(msg.err || 'No map marker set', '#e07070', 3000);
          }

        } else if (msg.type === 'teleport_map_result') {
          if (msg.ok) {
            hasPreTeleport = true;
            setStatus(`Teleported: X ${msg.x.toFixed(0)} Z ${msg.z.toFixed(0)}`, '#60e890', 5000);
            updatePanel();
          } else {
            hasPreTeleport = false; updatePanel();
            setStatus(msg.err || 'Map teleport failed', '#e07070', 3000);
          }

        } else if (msg.type === 'crosshair_target_result') {
          if (msg.ok) {
            setStatus(`F5 target: X ${msg.x.toFixed(0)} Z ${msg.z.toFixed(0)}`, '#ffd060', 5000);
          } else {
            setStatus(msg.err || 'Could not set F5 target', '#e07070', 3000);
          }

        } else if (msg.type === 'location_toggle') {
          if (msg.sourceClientId && msg.sourceClientId === CLIENT_ID) return;
          _onLocationToggle(msg.locationId, msg.found);

        } else if (msg.type === 'open_nearby') {
          if (nearbyControlsEnabled()) openNearbyPopup();

        } else if (msg.type === 'nearby_input') {
          if (nearbyControlsEnabled() && nearbyInputHandler) nearbyInputHandler(msg.action);

        } else if (msg.type === 'pan_location') {
          panToLocationId(msg.locationId);

        } else if (msg.type === 'map_marker') {
          handleMapMarkerMessage(msg);

        } else if (msg.type === 'map_marker_cleared') {
          handleMapMarkerCleared();
        }

        // backward-compat: mensagens sem type são posição
        if (!msg.type && typeof msg.lng === 'number') {
          handlePositionMessage(msg);
        }
      } catch (_) {}
    };
  }

  window.__cdNativeRealtime = function(frame) {
    if (!frame || !Array.isArray(frame.events)) return;
    processRealtimeEvents(frame.events);
  };

  // ── Botão flutuante para abrir/fechar waypoints ───────────────────
  function ensureWpToggleBtn() {
    if (document.getElementById('cdWpToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'cdWpToggle';
    btn.title = 'Waypoints  (abrir/fechar)';
    btn.textContent = '⭕';
    btn.style.cssText = `position:fixed;bottom:12px;left:12px;z-index:10000;
      width:36px;height:36px;border-radius:50%;
      background:rgba(12,12,18,.9);border:1px solid rgba(255,208,96,.35);
      color:#ffd060;font:16px 'Segoe UI';cursor:pointer;
      box-shadow:0 3px 12px rgba(0,0,0,.5);
      display:flex;align-items:center;justify-content:center;
      backdrop-filter:blur(4px);transition:border-color .15s,background .15s`;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255,208,96,.18)';
      btn.style.borderColor = 'rgba(255,208,96,.7)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(12,12,18,.9)';
      btn.style.borderColor = 'rgba(255,208,96,.35)';
    });
    btn.addEventListener('click', () => {
      if (ensureWaypointPopup()) return;
      const panel = document.getElementById('cdWpPanel');
      if (!panel) { ensureWaypointPanel(); return; }
      const visible = panel.style.display !== 'none';
      panel.style.display = visible ? 'none' : 'flex';
    });
    document.body.appendChild(btn);
  }

  function ensureCenterTeleportBtn() {
    if (document.getElementById('cdCenterTp')) return;
    const btn = document.createElement('button');
    btn.id = 'cdCenterTp';
    btn.title = 'Abrir teleporte para o centro da tela';
    btn.textContent = '◎';
    btn.style.cssText = `position:fixed;bottom:12px;left:56px;z-index:10000;
      width:36px;height:36px;border-radius:50%;
      background:rgba(12,12,18,.9);border:1px solid rgba(100,160,255,.4);
      color:#80b4ff;font:18px 'Segoe UI';cursor:pointer;
      box-shadow:0 3px 12px rgba(0,0,0,.5);
      display:flex;align-items:center;justify-content:center;
      backdrop-filter:blur(4px);transition:border-color .15s,background .15s`;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(100,160,255,.18)';
      btn.style.borderColor = 'rgba(100,160,255,.75)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(12,12,18,.9)';
      btn.style.borderColor = 'rgba(100,160,255,.4)';
    });
    btn.addEventListener('click', () => {
      const panel = document.getElementById('cdCenterTpPanel');
      if (!panel) { ensureCenterTeleportPanel(); return; }
      const visible = panel.style.display !== 'none';
      panel.style.display = visible ? 'none' : 'flex';
    });
    document.body.appendChild(btn);
  }

  function ensureCenterTeleportPanel() {
    if (document.getElementById('cdCenterTpPanel')) return;
    const el = document.createElement('div');
    el.id = 'cdCenterTpPanel';
    el.style.cssText = `position:fixed;bottom:56px;left:56px;z-index:9999;
      background:rgba(12,12,18,.92);color:#e8e8e8;
      font:12px/1.5 'Segoe UI',system-ui,sans-serif;
      border:1px solid rgba(100,160,255,.3);border-radius:7px;
      padding:8px 10px;width:210px;backdrop-filter:blur(5px);
      box-shadow:0 4px 18px rgba(0,0,0,.5);
      display:none;flex-direction:column;gap:7px;overflow:hidden`;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px">
        <span style="color:#80b4ff;font-weight:600;flex:1;font-size:12px">Centro da tela</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px">
        <span style="color:#bbb;font-size:11px;white-space:nowrap">Y <span id="cdCenterPanelYVal">${Math.round(getCenterTeleportY())}</span></span>
        <input type="range" id="cdCenterPanelY" min="-5000" max="5000" step="10"
          value="${getCenterTeleportY()}"
          style="flex:1;min-width:110px;accent-color:#80b4ff;cursor:pointer">
      </div>
      <button id="cdCenterPanelTp" title="Teleportar para o centro da tela"
        style="background:rgba(100,160,255,.14);border:1px solid rgba(100,160,255,.45);
        color:#80b4ff;font:11px 'Segoe UI';padding:4px 8px;border-radius:4px;
        cursor:pointer;width:100%">
        Teleportar
      </button>
    `;
    document.body.appendChild(el);
    document.getElementById('cdCenterPanelY').addEventListener('input', (e) => {
      if (!setCenterTeleportY(e.target.value)) e.target.value = getCenterTeleportY();
    });
    document.getElementById('cdCenterPanelTp').addEventListener('click', teleportMapCenter);
  }

  function getWaypointPopupDoc() {
    try {
      if (waypointPopup && !waypointPopup.closed && waypointPopup.document)
        return waypointPopup.document;
    } catch (_) {}
    return null;
  }

  function bindWaypointPopupControls(doc) {
    const save = doc.getElementById('cdWpPopupSave');
    const filter = doc.getElementById('cdWpPopupFilter');
    if (filter) {
      filter.value = waypointFilter;
      filter.addEventListener('input', () => setWaypointFilter(filter.value));
    }
    if (save) save.addEventListener('click', () => {
      const name = prompt('Nome do waypoint:', lastPos
        ? `${lastPos.realm === 'abyss' ? '[Abyss] ' : ''}${Math.round(lastPos.x)}, ${Math.round(lastPos.z)}`
        : 'Waypoint');
      if (name !== null) sendCmd({ cmd: 'save_waypoint', name });
    });
  }

  function ensureWaypointPopup() {
    // WebView2 treats window.open('', ...) as an external about:blank link.
    // The inline panel already has every waypoint control, so always use it.
    ensureWaypointPanel();
    const inlinePanel = document.getElementById('cdWpPanel');
    if (inlinePanel) inlinePanel.style.display = 'flex';
    return true;

    try {
      if (waypointPopup && !waypointPopup.closed) {
        waypointPopup.focus();
        return true;
      }
    } catch (_) {
      waypointPopup = null;  // janela Qt destruída — reseta referência
    }
    try {
      waypointPopup = window.open('', 'cdOverlayWaypoints',
        'width=300,height=560,resizable=yes,scrollbars=no');
      if (!waypointPopup) return false;
      const doc = waypointPopup.document;
      doc.open();
      doc.write(`<!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>CD Waypoints</title>
          <style>
            html,body{
              margin:0;width:100%;height:100%;overflow:hidden;
              background:#0f0f1a;color:#e8e8e8;
              font:12px/1.5 'Segoe UI',system-ui,sans-serif;
            }
            *{box-sizing:border-box}
            button{font-family:'Segoe UI',system-ui,sans-serif}
            .wrap{
              height:100%;display:flex;flex-direction:column;gap:7px;
              padding:10px;background:rgba(12,12,18,.96);
              border:1px solid rgba(255,208,96,.25);
            }
            .row{display:flex;align-items:center;gap:6px;flex-shrink:0}
            .title{flex:1;font-size:12px;font-weight:600;color:#ffd060}
            .list{
              display:flex;flex-direction:column;gap:3px;overflow-y:auto;
              min-height:72px;border-radius:5px;
            }
            #cdWpPopupList{flex:1}
            .sep{height:1px;background:rgba(255,255,255,.07);flex-shrink:0}
            .filter{
              width:100%;flex-shrink:0;border-radius:5px;
              background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);
              color:#e8e8e8;padding:5px 8px;outline:none;
            }
            .filter:focus{border-color:rgba(255,208,96,.45)}
            .btn{
              border-radius:4px;cursor:pointer;padding:3px 8px;
              background:rgba(255,208,96,.13);
              border:1px solid rgba(255,208,96,.35);color:#ffd060;
            }
            .btn.blue{
              background:rgba(100,160,255,.11);
              border-color:rgba(100,160,255,.35);color:#80b4ff;
            }
            .full{width:100%;flex-shrink:0}
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="row">
              <div class="title">Waypoints</div>
              <button id="cdWpPopupSave" class="btn">+ Salvar</button>
            </div>
            <input id="cdWpPopupFilter" class="filter" placeholder="Filtrar waypoints">
            <div id="cdWpPopupList" class="list"></div>
          </div>
        </body>
        </html>`);
      doc.close();
      bindWaypointPopupControls(doc);
      renderWaypoints();
      waypointPopup.focus();
      return true;
    } catch (_) {
      waypointPopup = null;
      return false;
    }
  }

  // ── Painel de Waypoints (esquerda) ────────────────────────────────
  function ensureWaypointPanel() {
    if (document.getElementById('cdWpPanel')) return;
    const el = document.createElement('div');
    el.id = 'cdWpPanel';
    el.style.cssText = `position:fixed;bottom:56px;left:12px;z-index:9999;
      background:rgba(12,12,18,.92);color:#e8e8e8;
      font:12px/1.5 'Segoe UI',system-ui,sans-serif;
      border:1px solid rgba(255,208,96,.25);border-radius:7px;
      padding:8px 10px;width:224px;max-height:520px;
      backdrop-filter:blur(5px);box-shadow:0 4px 18px rgba(0,0,0,.5);
      display:none;flex-direction:column;gap:5px;overflow:hidden;`;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px">
        <span style="color:#ffd060;font-weight:600;flex:1;font-size:12px">⭕ Waypoints</span>
        <button id="cdWpSave" title="Save current position"
          style="background:rgba(255,208,96,.15);border:1px solid rgba(255,208,96,.4);
          color:#ffd060;font:11px 'Segoe UI';padding:2px 8px;border-radius:4px;cursor:pointer">
          + Salvar
        </button>
      </div>
      <input id="cdWpFilter" placeholder="Filtrar waypoints"
        style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);
        color:#e8e8e8;font:11px 'Segoe UI';padding:4px 7px;border-radius:4px;outline:none">
      <div id="cdWpList" style="overflow-y:auto;max-height:170px;display:flex;
        flex-direction:column;gap:3px;flex-shrink:0"></div>
    `;
    document.body.appendChild(el);

    document.getElementById('cdWpFilter').addEventListener('input', (e) => setWaypointFilter(e.target.value));
    document.getElementById('cdWpSave').addEventListener('click', () => {
      const name = prompt('Nome do waypoint:', lastPos
        ? `${lastPos.realm === 'abyss' ? '[Abyss] ' : ''}${Math.round(lastPos.x)}, ${Math.round(lastPos.z)}`
        : 'Waypoint');
      if (name !== null) sendCmd({ cmd: 'save_waypoint', name });
    });
  }

  function setWaypointFilter(value) {
    waypointFilter = (value || '').trim().toLowerCase();
    const panelInput = document.getElementById('cdWpFilter');
    const popupInput = getWaypointPopupDoc()?.getElementById('cdWpPopupFilter');
    if (panelInput && panelInput.value !== value) panelInput.value = value || '';
    if (popupInput && popupInput.value !== value) popupInput.value = value || '';
    renderWaypoints();
  }

  function matchesWaypointFilter(wp) {
    if (!waypointFilter) return true;
    const text = [
      wp.name,
      wp.realm,
      wp.absX, wp.absY, wp.absZ,
      wp.x, wp.y, wp.z
    ].filter(v => v !== undefined && v !== null).join(' ').toLowerCase();
    return text.includes(waypointFilter);
  }

  function renderWaypointList(list) {
    if (!list) return;
    if (waypoints.length === 0) {
      list.innerHTML = `<div style="color:#555;font-size:11px;text-align:center;padding:4px 0">
        Nenhum waypoint salvo</div>`;
      return;
    }
    const items = waypoints
      .map((wp, i) => ({ wp, i }))
      .filter(item => matchesWaypointFilter(item.wp));
    if (items.length === 0) {
      list.innerHTML = `<div style="color:#555;font-size:11px;text-align:center;padding:4px 0">
        Nenhum waypoint encontrado</div>`;
      return;
    }
    list.innerHTML = items.map(({ wp, i }) => `
      <div style="display:flex;align-items:center;gap:4px;background:rgba(255,255,255,.04);
        border-radius:4px;padding:3px 6px;">
        <span style="flex:1;font-size:11px;white-space:nowrap;overflow:hidden;
          text-overflow:ellipsis;color:#ccc" title="${wp.name}">${wp.name}</span>
        <button data-tp="${i}" title="Teleportar"
          style="background:rgba(255,208,96,.15);border:1px solid rgba(255,208,96,.35);
          color:#ffd060;font:10px 'Segoe UI';padding:1px 5px;border-radius:3px;
          cursor:pointer;flex-shrink:0">⭕</button>
        <button data-del="${i}" title="Remover"
          style="background:transparent;border:none;color:#555;font:12px monospace;
          cursor:pointer;padding:0 2px;flex-shrink:0">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-tp]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wp = waypoints[+btn.dataset.tp];
        if (wp) {
          hasPreTeleport = true;
          updatePanel();
          sendCmd({ cmd: 'teleport', x: wp.absX, y: wp.absY, z: wp.absZ });
        }
      });
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        sendCmd({ cmd: 'delete_waypoint', index: +btn.dataset.del });
      });
    });
  }

  function renderWaypoints() {
    ensureWaypointPanel();
    renderWaypointList(document.getElementById('cdWpList'));
    renderWaypointList(getWaypointPopupDoc()?.getElementById('cdWpPopupList'));
  }

  // ── Layout adaptativo para janela circular ────────────────────────
  function applyRoundLayout(isRound) {
    ensureStatusToggleBtn();
    ensureWpToggleBtn();
    ensureCenterTeleportBtn();
    const bar    = document.getElementById('cdOvBar');
    const expand = document.getElementById('cdOvExpandBtn');
    const follow = document.getElementById('cdOvFollowFloat');
    const wpBtn  = document.getElementById('cdWpToggle');
    const tpBtn  = document.getElementById('cdCenterTp');
    if (!bar || !wpBtn || !tpBtn) return;

    if (isRound) {
      // Botão waypoints: remove position:fixed para entrar no flow do bar
      if (wpBtn.parentNode !== bar) bar.insertBefore(wpBtn, bar.firstChild);
      if (tpBtn.parentNode !== bar) bar.insertBefore(tpBtn, wpBtn.nextSibling);
      wpBtn.style.cssText = 'width:30px;height:30px;border-radius:50%;flex:0 0 30px;' +
        'background:rgba(12,12,18,.9);border:1px solid rgba(255,208,96,.35);' +
        'color:#ffd060;font:14px "Segoe UI";cursor:pointer;' +
        'box-shadow:0 3px 12px rgba(0,0,0,.5);backdrop-filter:blur(4px);' +
        'display:flex;align-items:center;justify-content:center;';
      tpBtn.style.cssText = 'width:30px;height:30px;border-radius:50%;flex:0 0 30px;' +
        'background:rgba(12,12,18,.9);border:1px solid rgba(100,160,255,.4);' +
        'color:#80b4ff;font:15px "Segoe UI";cursor:pointer;' +
        'box-shadow:0 3px 12px rgba(0,0,0,.5);backdrop-filter:blur(4px);' +
        'display:flex;align-items:center;justify-content:center;';

      // Bar centralizada dentro da largura útil do círculo, invisível por padrão
      bar.style.cssText = 'position:fixed;bottom:30px;left:50%;' +
        'transform:translateX(-50%);z-index:10000;display:flex;gap:5px;' +
        'align-items:center;justify-content:center;max-width:132px;' +
        'opacity:0;transition:opacity .16s;pointer-events:none;';
      if (expand) expand.style.display = 'none';
      if (follow) {
        follow.style.width = '30px';
        follow.style.height = '30px';
        follow.style.padding = '0';
        follow.style.borderRadius = '50%';
        follow.style.flex = '0 0 30px';
        follow.style.font = 'bold 12px "Segoe UI",sans-serif';
        follow.textContent = 'F';
      }

      // Hover na borda inferior -> mostra botões; sair da zona oculta de novo.
      if (!window.__cdRoundBottomBound) {
        window.__cdRoundBottomBound = true;
        let _roundBottomOverBar = false;
        let _roundBottomHideTimer = null;
        window.__cdSetRoundBottomVisible = (visible) => {
          const b = document.getElementById('cdOvBar');
          if (!b) return;
          b.style.opacity = visible ? '1' : '0';
          b.style.pointerEvents = visible ? 'auto' : 'none';
        };
        document.addEventListener('mousemove', (e) => {
          const b = document.getElementById('cdOvBar');
          if (!b) return;
          if (!(window.__cdSettings && window.__cdSettings.roundWindow)) return;
          const inBottomHoverZone = e.clientY >= window.innerHeight - 76;
          if (inBottomHoverZone || _roundBottomOverBar) {
            clearTimeout(_roundBottomHideTimer);
            window.__cdSetRoundBottomVisible(true);
          } else {
            clearTimeout(_roundBottomHideTimer);
            _roundBottomHideTimer = setTimeout(() => {
              if (!_roundBottomOverBar) window.__cdSetRoundBottomVisible(false);
            }, 180);
          }
        });
        bar.addEventListener('mouseenter', () => {
          _roundBottomOverBar = true;
          clearTimeout(_roundBottomHideTimer);
          window.__cdSetRoundBottomVisible(true);
        });
        bar.addEventListener('mouseleave', () => {
          _roundBottomOverBar = false;
          _roundBottomHideTimer = setTimeout(() => window.__cdSetRoundBottomVisible(false), 180);
        });
      }
    } else {
      // Restaura waypoints button para body com estilo original
      if (wpBtn.parentNode === bar) document.body.appendChild(wpBtn);
      if (tpBtn.parentNode === bar) document.body.appendChild(tpBtn);
      wpBtn.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:10000;' +
        'width:36px;height:36px;border-radius:50%;' +
        'background:rgba(12,12,18,.9);border:1px solid rgba(255,208,96,.35);' +
        'color:#ffd060;font:16px "Segoe UI";cursor:pointer;' +
        'box-shadow:0 3px 12px rgba(0,0,0,.5);' +
        'display:flex;align-items:center;justify-content:center;' +
        'backdrop-filter:blur(4px);transition:border-color .15s,background .15s';
      tpBtn.style.cssText = 'position:fixed;bottom:12px;left:56px;z-index:10000;' +
        'width:36px;height:36px;border-radius:50%;' +
        'background:rgba(12,12,18,.9);border:1px solid rgba(100,160,255,.4);' +
        'color:#80b4ff;font:18px "Segoe UI";cursor:pointer;' +
        'box-shadow:0 3px 12px rgba(0,0,0,.5);' +
        'display:flex;align-items:center;justify-content:center;' +
        'backdrop-filter:blur(4px);transition:border-color .15s,background .15s';
      bar.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:10000;' +
        'display:flex;gap:4px;align-items:center;opacity:1;pointer-events:auto;';
      if (expand) expand.style.display = '';
      if (follow) {
        follow.style.width = '';
        follow.style.height  = '36px';
        follow.style.padding = '0 12px';
        follow.style.borderRadius = '6px';
        follow.style.flex = '';
        follow.style.font    = 'bold 11px "Segoe UI",sans-serif';
      }
    }
  }

  // ── Map settings ──────────────────────────────────────────────────
  const POSITION_KEY = 'mgxbox_last_position';

  function waitForElement(selector, callback, timeout = 15000) {
    const el = document.querySelector(selector);
    if (el) { callback(el); return; }
    const iv = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) { clearInterval(iv); callback(el); }
    }, 300);
    setTimeout(() => clearInterval(iv), timeout);
  }

  function saveMapPosition(m) {
    const c = m.getCenter();
    localStorage.setItem(POSITION_KEY, JSON.stringify(
      { lng: c.lng, lat: c.lat, zoom: m.getZoom() }));
  }

  function restoreMapPosition(m) {
    try {
      const saved = localStorage.getItem(POSITION_KEY);
      if (!saved) return;
      const { lng, lat, zoom } = JSON.parse(saved);
      m.jumpTo({ center: [lng, lat], zoom });
    } catch (_) {}
  }

  function applySettings(cfg) {
    if (cfg.autoHideFound) {
      waitForElement('#toggle-found', (btn) => {
        if (!btn.classList.contains('disabled')) btn.click();
      });
    }
    if (cfg.autoHideLeftSidebar) {
      waitForElement('.sidebar-close .left-arrow, .sidebar-close', (btn) => btn.click());
    }
    if (cfg.autoHideRightSidebar) {
      waitForElement('#right-sidebar .sidebar-close', (btn) => btn.click());
    }

    const waitMap = setInterval(() => {
      const m = getMap();
      if (!m) return;
      clearInterval(waitMap);
      if (cfg.restoreLastPosition) restoreMapPosition(m);
      m.on('moveend', () => saveMapPosition(m));
    }, 300);
    setTimeout(() => clearInterval(waitMap), 30000);
    applyRoundLayout(!!cfg.roundWindow);
    setRotateWithPlayer(!!cfg.rotateWithPlayer);
    setRotateWithCamera(!!cfg.rotateWithCamera);
  }

  window.__cdApplyRotationSettings = function(cfg) {
    if (!cfg) return;
    const rwp = !!cfg.rotateWithPlayer;
    const rwc = !!cfg.rotateWithCamera;
    setRotateWithPlayer(rwp);
    setRotateWithCamera(rwc);
  };

  window.__cdApplyRoundLayout = function(cfg) {
    applyRoundLayout(!!(cfg && cfg.roundWindow));
    updatePanel();
  };

  // ── Detecção de login necessário ───────────────────────────────────
  (function detectLogin() {
    if (window.__cdWebView2) return;
    if (window.location.pathname.includes('login')) return;
    setTimeout(() => {
      const needsLogin =
        document.querySelector('a[href="https://mapgenie.io/crimson-desert/logout"]') === null ||
        (window.Inertia && !window.__page?.props?.auth?.user);
      if (needsLogin) {
        window.location.href = 'cdcompanion://login-needed';
      }
    }, 3000);
  })();

  (function keepLoginInOverlay() {
    if (!window.__cdWebView2) return;
    const isMapGenie = (url) => {
      try { return new URL(url, window.location.href).hostname.endsWith('mapgenie.io'); }
      catch (_) { return false; }
    };
    document.addEventListener('click', (event) => {
      const link = event.target && event.target.closest && event.target.closest('a[href]');
      if (!link || !isMapGenie(link.href)) return;
      if (link.target === '_blank') {
        event.preventDefault();
        window.location.assign(link.href);
      }
    }, true);
    const nativeOpen = window.open;
    window.open = function(url, name, features) {
      if (url && url !== 'about:blank' && isMapGenie(url)) {
        window.location.assign(url);
        return window;
      }
      return nativeOpen.call(window, url, name, features);
    };
  })();

  // ── CSS overrides ──────────────────────────────────────────────────
  (function injectCSS() {
    if (document.getElementById('cdOverrideCSS')) return;
    const s = document.createElement('style');
    s.id = 'cdOverrideCSS';
    s.textContent = `
      @media (max-width: 767.98px) {
        body.map .navbar { display: none !important; }
        #left-sidebar, #right-sidebar { display: block !important; }
      }
      #left-sidebar { z-index: 2 !important; }
      #cdMapDestinationMarker { z-index: 10001 !important; }
      #cdPlayerMarker { z-index: 10002 !important; }
      .mapboxgl-ctrl-bottom-right, #map-type-control { display: none !important; }
      #cdCenterCrosshair {
        position:fixed;inset:0;width:100vw;height:100vh;
        pointer-events:none;z-index:1;
      }
      #cdCenterCrosshair::before,
      #cdCenterCrosshair::after {
        content:'';position:absolute;
        background:rgba(255,208,96,.42);
        box-shadow:0 0 4px rgba(0,0,0,.55);
      }
      #cdCenterCrosshair::before {
        top:50%;left:0;width:100%;height:1px;
        transform:translateY(-50%);
      }
      #cdCenterCrosshair::after {
        top:0;left:50%;width:1px;height:100%;
        transform:translateX(-50%);
      }
    `;
    document.head.appendChild(s);
  })();

  window.__cdApplySettings = applySettings;
  applySettings(window.__cdSettings || {});

  // ── Teleport visibility (reage a mudanças em tempo real) ──────────
  function updateTeleportVisibility() {
    teleportEnabled = !(window.__cdSettings && window.__cdSettings.teleportEnabled === false);
    const display = teleportEnabled ? '' : 'none';
    const wpBtn = document.getElementById('cdWpToggle');
    const ctBtn = document.getElementById('cdCenterTp');
    const wpPanel = document.getElementById('cdWpPanel');
    const ctPanel = document.getElementById('cdCenterTpPanel');
    const tpRow = document.getElementById('cdOvTeleportRow');
    if (wpBtn) wpBtn.style.display = display;
    if (ctBtn) ctBtn.style.display = display;
    if (tpRow) tpRow.style.display = teleportEnabled ? 'flex' : 'none';
    if (!teleportEnabled) {
      if (wpPanel) wpPanel.style.display = 'none';
      if (ctPanel) ctPanel.style.display = 'none';
    }
  }
  window.__cdUpdateTeleportVisibility = updateTeleportVisibility;

  createCenterCrosshair();
  ensureStatusToggleBtn();
  updatePanel();
  ensureWpToggleBtn();
  ensureCenterTeleportBtn();
  ensureCenterTeleportPanel();
  applyRoundLayout(!!(window.__cdSettings && window.__cdSettings.roundWindow));
  // ambos os painéis começam ocultos
  ensureWaypointPanel();
  renderWaypoints();
  updateTeleportVisibility();
  connect();
  setInterval(() => {
    if (window.mapManager && typeof window.mapManager.updateFoundLocationsStyle === 'function')
      window.mapManager.updateFoundLocationsStyle();
  }, 50);
})();
