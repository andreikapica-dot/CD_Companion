  function ensureRoundDragHandle() {
    let handle = document.getElementById('cdRoundDragHandle');
    if (handle) return handle;
    handle = document.createElement('button');
    handle.id = 'cdRoundDragHandle';
    // Do not use pywebview-drag-region here. PyWebView consumes its mouse
    // events before our bridge can start dragging or handle a double-click.
    handle.className = '';
    handle.type = 'button';
    handle.title = 'Drag compact map — double-click to restore Full mode';
    handle.textContent = '⋮⋮  MOVE';
    handle.style.cssText = 'position:fixed;top:7px;left:50%;transform:translateX(-50%);' +
      'z-index:10005;width:92px;height:28px;display:none;align-items:center;justify-content:center;' +
      'border-radius:14px;border:1px solid rgba(255,208,96,.42);' +
      'background:rgba(12,12,18,.72);color:#ffd060;' +
      'font:bold 10px Segoe UI;letter-spacing:.8px;cursor:move;opacity:.42;' +
      'transition:opacity .15s,background .15s';
    handle.addEventListener('mouseenter', () => { handle.style.opacity = '.96'; });
    handle.addEventListener('mouseleave', () => { handle.style.opacity = '.42'; });
    handle.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      // Let the second click reach the dblclick handler used to restore Full.
      if (event.detail > 1) return;
      if (window.pywebview && window.pywebview.api &&
          typeof window.pywebview.api.drag_window === 'function') {
        event.preventDefault();
        event.stopPropagation();
        window.pywebview.api.drag_window();
      }
    });
    handle.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setNativeRoundWindow(false);
    });
    document.body.appendChild(handle);
    return handle;
  }

  function ensureRoundMinimapStyle() {
    if (document.getElementById('cdRoundMinimapStyle')) return;
    const style = document.createElement('style');
    style.id = 'cdRoundMinimapStyle';
    style.textContent = `
      html.cd-round-minimap {
        margin:0 !important; padding:0 !important; width:100% !important;
        height:100% !important; overflow:hidden !important;
        background:#11131b !important;
      }
      html.cd-round-minimap body {
        margin:0 !important; padding:0 !important; width:100% !important;
        height:100% !important; overflow:hidden !important;
        background:#11131b !important; border-radius:0 !important;
        clip-path:none !important;
      }
      html.cd-round-minimap body > header,
      html.cd-round-minimap body > nav,
      html.cd-round-minimap body header,
      html.cd-round-minimap body nav,
      html.cd-round-minimap body aside,
      html.cd-round-minimap .navbar,
      html.cd-round-minimap #left-sidebar,
      html.cd-round-minimap #right-sidebar,
      html.cd-round-minimap .mapboxgl-control-container,
      html.cd-round-minimap .maplibregl-control-container,
      html.cd-round-minimap iframe,
      html.cd-round-minimap #cdOvBar,
      html.cd-round-minimap #cdHotkeySettings,
      html.cd-round-minimap #cdOvPanel,
      html.cd-round-minimap #cdWpPanel,
      html.cd-round-minimap #cdNearbyPanel,
      html.cd-round-minimap #cdWpToggle,
      html.cd-round-minimap #cdNearbyToggle,
      html.cd-round-minimap #cdCenterTp,
      html.cd-round-minimap #cdCenterTpPanel,
      html.cd-round-minimap #cdCenterCrosshair {
        display:none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function applyRoundMapViewport(isRound) {
    ensureRoundMinimapStyle();
    document.documentElement.classList.toggle('cd-round-minimap', !!isRound);

    const applyToMap = () => {
      const map = getMap();
      if (!map || typeof map.getContainer !== 'function') return false;
      const container = map.getContainer();
      if (!container) return false;
      if (isRound) {
        if (!container.dataset.cdRoundOriginalStyle)
          container.dataset.cdRoundOriginalStyle = container.getAttribute('style') || ' ';
        container.style.setProperty('position', 'fixed', 'important');
        container.style.setProperty('inset', '0', 'important');
        container.style.setProperty('width', '100vw', 'important');
        container.style.setProperty('height', '100vh', 'important');
        container.style.setProperty('z-index', '1', 'important');
        container.style.setProperty('border-radius', '0', 'important');
        container.style.setProperty('clip-path', 'none', 'important');
        container.style.setProperty('overflow', 'hidden', 'important');
      } else if (container.dataset.cdRoundOriginalStyle !== undefined) {
        const original = container.dataset.cdRoundOriginalStyle;
        if (original.trim()) container.setAttribute('style', original);
        else container.removeAttribute('style');
        delete container.dataset.cdRoundOriginalStyle;
      }
      setTimeout(() => {
        try { if (typeof map.resize === 'function') map.resize(); } catch (_) {}
      }, 60);
      return true;
    };

    if (applyToMap()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (applyToMap() || attempts >= 40) clearInterval(timer);
    }, 250);
  }

  function applyRoundLayout(isRound) {
    ensureStatusToggleBtn();
    ensureWpToggleBtn();
    ensureNearbyToggleBtn();
    ensureCenterTeleportBtn();
    const bar    = document.getElementById('cdOvBar');
    const expand = document.getElementById('cdOvExpandBtn');
    const follow = document.getElementById('cdOvFollowFloat');
    const wpBtn  = document.getElementById('cdWpToggle');
    const nearbyBtn = document.getElementById('cdNearbyToggle');
    const tpBtn  = document.getElementById('cdCenterTp');
    const dragHandle = ensureRoundDragHandle();
    applyRoundMapViewport(isRound);
    // The status bar may be created later than the map. MOVE must not depend
    // on it, otherwise a round window can become impossible to move or exit.
    dragHandle.style.display = isRound ? 'flex' : 'none';
    if (!bar) return;

    if (isRound) {
      // Botão waypoints: remove position:fixed para entrar no flow do bar
      if (wpBtn) {
        if (wpBtn.parentNode !== bar) bar.insertBefore(wpBtn, bar.firstChild);
        wpBtn.style.cssText = 'width:30px;height:30px;border-radius:50%;flex:0 0 30px;' +
          'background:rgba(12,12,18,.9);border:1px solid rgba(255,208,96,.35);' +
          'color:#ffd060;font:14px "Segoe UI";cursor:pointer;' +
          'box-shadow:0 3px 12px rgba(0,0,0,.5);backdrop-filter:blur(4px);' +
          'display:flex;align-items:center;justify-content:center;';
      }
      if (tpBtn) {
        if (tpBtn.parentNode !== bar) bar.insertBefore(tpBtn, wpBtn ? wpBtn.nextSibling : bar.firstChild);
        tpBtn.style.cssText = 'width:30px;height:30px;border-radius:50%;flex:0 0 30px;' +
          'background:rgba(12,12,18,.9);border:1px solid rgba(100,160,255,.4);' +
          'color:#80b4ff;font:15px "Segoe UI";cursor:pointer;' +
          'box-shadow:0 3px 12px rgba(0,0,0,.5);backdrop-filter:blur(4px);' +
          'display:flex;align-items:center;justify-content:center;';
      }
      if (nearbyBtn && nearbyBtn.parentNode !== bar) {
        bar.insertBefore(nearbyBtn, tpBtn ? tpBtn.nextSibling : bar.firstChild);
      }

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
      if (wpBtn && wpBtn.parentNode === bar) document.body.appendChild(wpBtn);
      if (tpBtn && tpBtn.parentNode === bar) document.body.appendChild(tpBtn);
      if (nearbyBtn && nearbyBtn.parentNode === bar) document.body.appendChild(nearbyBtn);
      const wpPosition = window.__cdMapProvider === 'greymane'
        ? 'left:300px;' : 'left:12px;';
      const tpPosition = window.__cdMapProvider === 'greymane'
        ? 'left:344px;' : 'left:56px;';
      const nearbyPosition = window.__cdMapProvider === 'greymane'
        ? 'left:388px;' : 'left:100px;';
      if (wpBtn) wpBtn.style.cssText = 'position:fixed;bottom:12px;' + wpPosition + 'z-index:10000;' +
        'width:36px;height:36px;border-radius:50%;' +
        'background:rgba(12,12,18,.9);border:1px solid rgba(255,208,96,.35);' +
        'color:#ffd060;font:16px "Segoe UI";cursor:pointer;' +
        'box-shadow:0 3px 12px rgba(0,0,0,.5);' +
        'display:flex;align-items:center;justify-content:center;' +
        'backdrop-filter:blur(4px);transition:border-color .15s,background .15s';
      if (tpBtn) tpBtn.style.cssText = 'position:fixed;bottom:12px;' + tpPosition + 'z-index:10000;' +
        'width:36px;height:36px;border-radius:50%;' +
        'background:rgba(12,12,18,.9);border:1px solid rgba(100,160,255,.4);' +
        'color:#80b4ff;font:18px "Segoe UI";cursor:pointer;' +
        'box-shadow:0 3px 12px rgba(0,0,0,.5);' +
        'display:flex;align-items:center;justify-content:center;' +
        'backdrop-filter:blur(4px);transition:border-color .15s,background .15s';
      if (nearbyBtn) nearbyBtn.style.cssText = 'position:fixed;bottom:12px;' + nearbyPosition + 'z-index:10000;' +
        'width:36px;height:36px;border-radius:50%;' +
        'background:rgba(12,12,18,.9);border:1px solid rgba(255,96,150,.45);' +
        'color:#ff6096;font:16px "Segoe UI";cursor:pointer;' +
        'box-shadow:0 3px 12px rgba(0,0,0,.5);' +
        'display:' + (nearbyControlsEnabled() ? 'flex' : 'none') + ';align-items:center;justify-content:center;' +
        'backdrop-filter:blur(4px)';
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

  // MapGenie and Greymane are single-page applications. Their framework can
  // replace the page body after Compact -> Full has already restored our
  // controls. Repair only when something is actually missing or has the wrong
  // layout, so the watchdog does not continuously resize/repaint the map.
  window.__cdRepairCompanionControls = function(force = false) {
    if (window.__cdRepairControlsBusy) return;
    window.__cdRepairControlsBusy = true;
    try {
      const isCompact = !!(window.__cdSettings && window.__cdSettings.roundWindow);
      const ids = [
        'cdOvBar', 'cdOvSettingsBtn', 'cdOvExpandBtn', 'cdOvFollowFloat',
        'cdWpToggle', 'cdNearbyToggle', 'cdCenterTp'
      ];
      const missing = ids.some((id) => !document.getElementById(id));

      ensureStatusToggleBtn();
      ensureWpToggleBtn();
      ensureNearbyToggleBtn();
      ensureCenterTeleportBtn();

      const bar = document.getElementById('cdOvBar');
      const wp = document.getElementById('cdWpToggle');
      const nearby = document.getElementById('cdNearbyToggle');
      const tp = document.getElementById('cdCenterTp');
      const modeMismatch = document.documentElement.classList.contains('cd-round-minimap') !== isCompact;
      const fullLayoutBroken = !isCompact && (
        !bar || bar.parentNode !== document.body || bar.style.display !== 'flex' ||
        !wp || wp.parentNode !== document.body || wp.style.display !== 'flex' ||
        !tp || tp.parentNode !== document.body || tp.style.display !== 'flex' ||
        !nearby || nearby.parentNode !== document.body ||
        (nearbyControlsEnabled() && nearby.style.display !== 'flex')
      );

      if (force || missing || modeMismatch || fullLayoutBroken) {
        applyRoundLayout(isCompact);
        if (window.__cdUpdateNearbyControls) window.__cdUpdateNearbyControls();
      }
    } finally {
      window.__cdRepairControlsBusy = false;
    }
  };

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

  // Fecha a sidebar e re-tenta ate ela realmente fechar. O botao .sidebar-close
  // vem no HTML server-rendered, mas o handler de clique do React so e ligado
  // depois da hydration. Um unico clique cedo (assim que o elemento aparece)
  // cai num botao ainda sem handler e nao faz nada. Aqui re-clicamos a cada
  // 300ms ate a classe 'closed' aparecer (ou ate o timeout), parando assim que
  // fecha para nao brigar com o usuario caso ele reabra depois.
  function autoHideSidebar(id, timeout = 20000) {
    const deadline = Date.now() + timeout;
    const tick = () => {
      const sidebar = document.getElementById(id);
      if (sidebar && !sidebar.classList.contains('closed')) {
        const btn = sidebar.querySelector('.sidebar-close');
        if (btn) btn.click();
      }
      const closed = sidebar && sidebar.classList.contains('closed');
      if (!closed && Date.now() < deadline) setTimeout(tick, 300);
    };
    tick();
  }

  function applySettings(cfg) {
    if (cfg.autoHideFound) {
      waitForElement('#toggle-found', (btn) => {
        if (!btn.classList.contains('disabled')) btn.click();
      });
    }
    [
      ['left-sidebar', cfg.autoHideLeftSidebar],
      ['right-sidebar', cfg.autoHideRightSidebar],
    ].forEach(([id, enabled]) => {
      if (!enabled) return;
      autoHideSidebar(id);
    });

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
    // Full mode uses Edge WebView2. The old custom scheme is only handled by
    // the legacy Qt browser and otherwise launches an external browser.
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

  // Keep MapGenie login/register navigation inside the Edge WebView2 window.
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
        pointer-events:none;z-index:9990 !important;
      }
      #cdCenterCrosshair::before,
      #cdCenterCrosshair::after {
        content:'';position:absolute;
        background:rgba(255,208,96,.42);
        box-shadow:0 0 4px rgba(0,0,0,.55);
      }
      #cdCenterCrosshair::before {
        top:var(--cd-crosshair-y, 50vh);left:0;width:100%;height:1px;
        transform:translateY(-50%);
      }
      #cdCenterCrosshair::after {
        top:0;left:var(--cd-crosshair-x, 50vw);width:1px;height:100%;
        transform:translateX(-50%);
      }
      #cdCenterCrosshair::before,
      #cdCenterCrosshair::after { display:none; }
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

