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
