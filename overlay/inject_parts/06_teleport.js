  function createCenterCrosshair() {
    let el = document.getElementById('cdCenterCrosshair');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cdCenterCrosshair';
      el.innerHTML = `
        <div id="cdCrosshairH" style="position:absolute;left:0;width:100vw;height:1px;background:rgba(255,208,96,.42);box-shadow:0 0 4px rgba(0,0,0,.55)"></div>
        <div id="cdCrosshairV" style="position:absolute;top:0;width:1px;height:100vh;background:rgba(255,208,96,.42);box-shadow:0 0 4px rgba(0,0,0,.55)"></div>
      `;
      document.body.appendChild(el);
      if (!crosshairListenersBound) {
        crosshairListenersBound = true;
        window.addEventListener('resize', updateCenterCrosshairViewport);
        window.addEventListener('orientationchange', updateCenterCrosshairViewport);
        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', updateCenterCrosshairViewport);
          window.visualViewport.addEventListener('scroll', updateCenterCrosshairViewport);
        }
      }
    }
    updateCenterCrosshairViewport();
  }

  function updateCenterCrosshairViewport() {
    const el = document.getElementById('cdCenterCrosshair');
    if (!el) return;
    const liveMap = getMap();
    const container = liveMap && typeof liveMap.getContainer === 'function'
      ? liveMap.getContainer()
      : null;
    const rect = container && container.isConnected
      ? container.getBoundingClientRect()
      : null;
    let projected = null;
    try {
      if (liveMap && typeof liveMap.getCenter === 'function' && typeof liveMap.project === 'function')
        projected = liveMap.project(liveMap.getCenter());
    } catch (_) {}
    const cx = rect && rect.width
      ? rect.left + (projected && Number.isFinite(projected.x) ? projected.x : rect.width / 2)
      : window.innerWidth / 2;
    const cy = rect && rect.height
      ? rect.top + (projected && Number.isFinite(projected.y) ? projected.y : rect.height / 2)
      : window.innerHeight / 2;
    el.style.setProperty('--cd-crosshair-x', `${cx}px`);
    el.style.setProperty('--cd-crosshair-y', `${cy}px`);
    const horizontal = document.getElementById('cdCrosshairH');
    const vertical = document.getElementById('cdCrosshairV');
    if (horizontal) horizontal.style.top = `${cy}px`;
    if (vertical) vertical.style.left = `${cx}px`;
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
