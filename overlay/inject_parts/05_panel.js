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
    expand.title = _t('panel.expand');
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
      expand.title = visible ? _t('panel.expand') : _t('panel.collapse');
    });

    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'cdOvSettingsBtn';
    settingsBtn.title = 'Hotkey settings';
    settingsBtn.textContent = '⚙';
    settingsBtn.style.cssText = `width:28px;height:36px;border-radius:6px;
      background:rgba(12,12,18,.9);border:1px solid rgba(255,208,96,.25);
      color:#bbb;font:15px 'Segoe UI';cursor:pointer;`;
    settingsBtn.addEventListener('click', toggleHotkeySettings);

    // Botão follow (sempre visível, reflete estado)
    const followBtn = document.createElement('button');
    followBtn.id = 'cdOvFollowFloat';
    followBtn.title = _t('panel.toggle_follow');
    followBtn.style.cssText = `height:36px;padding:0 12px;border-radius:6px;
      background:rgba(12,30,20,.95);border:1.5px solid rgba(80,220,120,.6);
      color:#60e890;font:bold 11px 'Segoe UI',sans-serif;cursor:pointer;
      box-shadow:0 3px 12px rgba(0,0,0,.6);backdrop-filter:blur(6px);
      white-space:nowrap;transition:background .15s,border-color .15s,color .15s`;
    followBtn.textContent = _t('panel.follow_on');
    followBtn.addEventListener('click', toggleFollow);

    bar.appendChild(settingsBtn);
    bar.appendChild(expand);
    bar.appendChild(followBtn);
    document.body.appendChild(bar);
  }

  const _hotkeyDraft = {
    teleport_marker: { vk: 0x74, mods: [] },
    abort: { vk: 0x74, mods: [0x10] },
    open_nearby: { vk: 0x4E, mods: [0x10] },
    open_waypoints: { vk: 0x59, mods: [0x10] },
  };
  const _hotkeyNames = {
    teleport_marker: 'Teleport', abort: 'Return / cancel',
    open_nearby: 'Nearby', open_waypoints: 'Waypoints',
  };

  function _setFullSettingsStatus(message, ok = true) {
    const status = document.getElementById('cdFullSettingsStatus');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = ok ? '#70df92' : '#ff7777';
  }

  function setCalibrationMode(enabled) {
    calibrationMode = !!enabled;
    const btn = document.getElementById('cdCalibrateMarker');
    if (btn) btn.textContent = calibrationMode
      ? 'Click your exact position on the map…' : 'Calibrate marker';
    if (!calibrationMode) return;

    const liveMap = getMap();
    if (!liveMap || typeof liveMap.once !== 'function') {
      calibrationMode = false;
      if (btn) btn.textContent = 'Calibrate marker';
      _setFullSettingsStatus('Map is not ready yet. Try again in a moment.', false);
      return;
    }

    _setFullSettingsStatus('Now click your exact in-game position on the map.');
    liveMap.once('click', (event) => {
      if (!calibrationMode) return;
      calibrationMode = false;
      if (btn) btn.textContent = 'Calibrate marker';
      const lngLat = event && event.lngLat;
      if (!lngLat) {
        _setFullSettingsStatus('The map click did not provide coordinates.', false);
        return;
      }
      sendCmd({
        cmd: 'add_calibration',
        lng: lngLat.lng,
        lat: lngLat.lat,
        realm: lastPos && lastPos.realm ? lastPos.realm : 'pywel',
      });
      _setFullSettingsStatus('Calibration point sent. Move in game to refresh the marker.');
    });
  }

  async function setNativeRoundWindow(enabled) {
    const checkbox = document.getElementById('cdRoundWindow');
    try {
      if (!(window.pywebview && window.pywebview.api &&
            typeof window.pywebview.api.set_round_window === 'function')) {
        throw new Error('Round window is available only in the Full desktop version.');
      }
      const result = await window.pywebview.api.set_round_window(!!enabled);
      if (!result || result.ok === false) {
        throw new Error(result && result.error ? result.error : 'Cannot change the window shape.');
      }
      if (!window.__cdSettings) window.__cdSettings = {};
      window.__cdSettings.roundWindow = !!result.roundWindow;
      if (checkbox) checkbox.checked = !!result.roundWindow;
      applyRoundLayout(!!result.roundWindow);
      _setFullSettingsStatus(result.roundWindow
        ? 'Circular minimap enabled. Drag it using the handle at the top.'
        : 'Full window restored.');
    } catch (error) {
      if (checkbox) checkbox.checked = !enabled;
      _setFullSettingsStatus(String(error && (error.message || error)), false);
    }
  }

  function _hotkeyText(hk) {
    const mods = (hk.mods || []).map(m => ({16:'Shift',17:'Ctrl',18:'Alt'}[m])).filter(Boolean);
    const vk = hk.vk;
    const key = vk >= 0x70 && vk <= 0x87 ? `F${vk - 0x6F}`
      : (vk >= 0x41 && vk <= 0x5A ? String.fromCharCode(vk) : `0x${vk.toString(16)}`);
    return [...mods, key].join('+');
  }

  function _eventToHotkey(e) {
    let vk = 0;
    if (/^F([1-9]|1\d|2[0-4])$/.test(e.code)) vk = 0x6F + Number(e.code.slice(1));
    else if (/^Key[A-Z]$/.test(e.code)) vk = e.code.charCodeAt(3);
    if (!vk) return null;
    const mods = [];
    if (e.shiftKey) mods.push(0x10);
    if (e.ctrlKey) mods.push(0x11);
    if (e.altKey) mods.push(0x12);
    return { vk, mods };
  }

  function _refreshHotkeyInputs() {
    Object.entries(_hotkeyDraft).forEach(([id, hk]) => {
      const input = document.getElementById(`cdHk_${id}`);
      if (input) input.value = _hotkeyText(hk);
    });
  }

  function ensureHotkeySettings() {
    let panel = document.getElementById('cdHotkeySettings');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'cdHotkeySettings';
    panel.style.cssText = `position:fixed;right:12px;bottom:56px;z-index:10002;width:270px;
      padding:11px 12px;background:rgba(12,12,18,.96);color:#e8e8e8;
      border:1px solid rgba(255,208,96,.35);border-radius:7px;box-shadow:0 4px 18px rgba(0,0,0,.55);
      font:12px/1.4 'Segoe UI',system-ui,sans-serif;display:none`;
    panel.innerHTML = `<div style="display:flex;align-items:center;margin-bottom:8px"><b style="color:#ffd060;flex:1">⚙ Settings</b><button id="cdHkClose" style="border:0;background:transparent;color:#bbb;font:18px Segoe UI;cursor:pointer">×</button></div>
      <label style="display:flex;align-items:center;gap:7px;margin:0 0 9px;color:#ddd;cursor:pointer"><input id="cdNearbyEnabled" type="checkbox"> Nearby — show radius and list</label>
      <label style="display:flex;align-items:center;gap:7px;margin:0 0 9px;color:#ddd;cursor:pointer"><input id="cdRoundWindow" type="checkbox"> Circular minimap window</label>
      <div style="display:flex;gap:6px;margin:0 0 8px">
        <button id="cdCalibrateMarker" style="flex:1;background:#20202b;color:#ffd060;border:1px solid rgba(255,208,96,.35);border-radius:4px;padding:6px;cursor:pointer">Calibrate marker</button>
        <button id="cdResetCalibration" style="background:#20202b;color:#ddd;border:1px solid #444;border-radius:4px;padding:6px;cursor:pointer">Reset</button>
      </div>
      <div id="cdFullSettingsStatus" style="min-height:14px;color:#999;font-size:10px;margin:0 0 8px"></div>
      <div style="color:#999;font-size:11px;margin-bottom:8px">Click a field, then press a key combination.</div>
      ${Object.entries(_hotkeyNames).map(([id, title]) => `<label style="display:block;margin:6px 0;color:#ccc">${title}<input id="cdHk_${id}" data-hotkey="${id}" readonly style="box-sizing:border-box;width:100%;margin-top:2px;background:#191923;color:#ffd060;border:1px solid rgba(255,208,96,.3);border-radius:4px;padding:5px 7px;cursor:pointer"></label>`).join('')}
      <button id="cdHkSave" style="width:100%;margin-top:7px;background:rgba(255,208,96,.15);color:#ffd060;border:1px solid rgba(255,208,96,.45);border-radius:4px;padding:6px;cursor:pointer">Save hotkeys</button>
      <div style="font-size:10px;color:#888;margin-top:7px">These four hotkeys work while Crimson Desert is active.</div>`;
    document.body.appendChild(panel);
    const nearbyEnabled = document.getElementById('cdNearbyEnabled');
    nearbyEnabled.checked = typeof nearbyControlsEnabled === 'function' && nearbyControlsEnabled();
    nearbyEnabled.addEventListener('change', () => {
      if (typeof setNearbyControlsEnabled === 'function') {
        setNearbyControlsEnabled(nearbyEnabled.checked);
      }
    });
    const roundWindow = document.getElementById('cdRoundWindow');
    roundWindow.checked = !!(window.__cdSettings && window.__cdSettings.roundWindow);
    roundWindow.addEventListener('change', () => {
      setNativeRoundWindow(roundWindow.checked);
    });
    document.getElementById('cdCalibrateMarker').addEventListener('click', () => {
      setCalibrationMode(!calibrationMode);
    });
    document.getElementById('cdResetCalibration').addEventListener('click', () => {
      setCalibrationMode(false);
      sendCmd({
        cmd: 'reset_calibration',
        realm: lastPos && lastPos.realm ? lastPos.realm : 'pywel',
      });
      _setFullSettingsStatus('Calibration reset. Move in game to refresh the marker.');
    });
    document.getElementById('cdHkClose').addEventListener('click', () => {
      panel.style.display = 'none';
      sendCmd({ cmd: 'hotkey_editing', active: false });
    });
    panel.querySelectorAll('input[data-hotkey]').forEach(input => input.addEventListener('keydown', e => {
      const hk = _eventToHotkey(e);
      if (!hk) return;
      e.preventDefault();
      _hotkeyDraft[input.dataset.hotkey] = hk;
      _refreshHotkeyInputs();
    }));
    document.getElementById('cdHkSave').addEventListener('click', () => sendCmd({ cmd: 'set_hotkeys', hotkeys: _hotkeyDraft }));
    _refreshHotkeyInputs();
    return panel;
  }

  function toggleHotkeySettings() {
    const panel = ensureHotkeySettings();
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    sendCmd({ cmd: 'hotkey_editing', active: show });
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
      <div id="cdOvStatus" style="font-size:10px;color:#e07070">${_t('panel.connecting')}</div>
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
          ${_t('panel.abort')}
        </button>
      </div>
    `;
    document.body.appendChild(el);
    document.getElementById('cdOvMarker').addEventListener('click', () => {
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
      followFloat.textContent  = isRound ? _t('panel.follow_short') : (following ? _t('panel.follow_on') : _t('panel.follow_off'));
      followFloat.title = _t('panel.toggle_follow_state').replace('{0}', following ? 'ON' : 'OFF');
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
        ? (lastPos ? _t('panel.realm').replace('{0}', lastPos.realm) : _t('panel.move_to_start'))
        : _t('panel.server_offline');
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

