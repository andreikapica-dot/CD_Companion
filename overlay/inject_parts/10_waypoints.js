  // ── Botão flutuante para abrir/fechar waypoints ───────────────────
  let _wpNavIndex = -1;       // indice selecionado na lista; -1 = nenhum
  let _wpPendingFocusLast = false;  // apos save bem-sucedido, focar ultimo item

  function ensureWpToggleBtn() {
    if (document.getElementById('cdWpToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'cdWpToggle';
    btn.title = _t('waypoints.btn_title');
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
    btn.title = _t('waypoints.center_btn_title');
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
        <span style="color:#80b4ff;font-weight:600;flex:1;font-size:12px">${_t('waypoints.center_title')}</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px">
        <span style="color:#bbb;font-size:11px;white-space:nowrap">Y <span id="cdCenterPanelYVal">${Math.round(getCenterTeleportY())}</span></span>
        <input type="range" id="cdCenterPanelY" min="0" max="5000" step="5"
          value="${getCenterTeleportY()}"
          style="flex:1;min-width:110px;accent-color:#80b4ff;cursor:pointer">
      </div>
      <button id="cdCenterPanelTp" title="${_t('waypoints.teleport_title')}"
        style="background:rgba(100,160,255,.14);border:1px solid rgba(100,160,255,.45);
        color:#80b4ff;font:11px 'Segoe UI';padding:4px 8px;border-radius:4px;
        cursor:pointer;width:100%">
        ${_t('waypoints.teleport_btn')}
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

  function _triggerWpSave(doc) {
    // Usar o prompt do contexto do popup para que o foco volte para ele automaticamente
    const promptFn = (doc && doc.defaultView && doc.defaultView.prompt)
      ? doc.defaultView.prompt.bind(doc.defaultView)
      : prompt;
    const name = promptFn(_t('waypoints.prompt_name'), lastPos
      ? (lastPos.realm === 'abyss'
          ? _t('waypoints.default_name_abyss').replace('{0}', Math.round(lastPos.x)).replace('{1}', Math.round(lastPos.z))
          : _t('waypoints.default_name').replace('{0}', Math.round(lastPos.x)).replace('{1}', Math.round(lastPos.z)))
      : 'Waypoint');
    if (name !== null) {
      _wpPendingFocusLast = true;
      sendCmd({ cmd: 'save_waypoint', name });
    } else {
      // cancelou — foca a lista dentro do popup
      if (doc) {
        const list = doc.getElementById('cdWpPopupList');
        if (list) {
          list.setAttribute('tabindex', '-1');
          list.focus();
        }
      }
    }
  }

  function _wpFocusSaveBtn(doc) {
    const btn = doc.getElementById('cdWpPopupSave');
    if (!btn) return;
    btn.style.borderColor = 'rgba(255,208,96,.9)';
    btn.style.boxShadow   = '0 0 0 2px rgba(255,208,96,.35)';
    btn.focus();
    btn.addEventListener('blur', () => {
      btn.style.borderColor = '';
      btn.style.boxShadow   = '';
    }, { once: true });
  }

  function _wpClearSaveBtnFocus(doc) {
    const btn = doc.getElementById('cdWpPopupSave');
    if (!btn) return;
    btn.style.borderColor = '';
    btn.style.boxShadow   = '';
  }

  function _bindWaypointKeyboard(doc) {
    const getList = () => doc.getElementById('cdWpPopupList');
    const getSave = () => doc.getElementById('cdWpPopupSave');
    const getFilter = () => doc.getElementById('cdWpPopupFilter');

    doc.addEventListener('keydown', (e) => {
      const filterFocused = doc.activeElement === getFilter();
      const saveFocused   = doc.activeElement === getSave();

      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        _triggerWpSave(doc);
        return;
      }
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        getFilter()?.focus();
        return;
      }

      if (filterFocused) {
        const list = getList();
        const rows = list ? list.querySelectorAll('[data-tp]') : [];
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (rows.length > 0) {
            getFilter().blur();
            _wpNavIndex = 0;
            _wpApplyHighlight(list);
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          getFilter().blur();
          _wpFocusSaveBtn(doc);
        }
        return;
      }

      if (saveFocused) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          _triggerWpSave(doc);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          _wpClearSaveBtnFocus(doc);
          getSave().blur();
          _wpNavIndex = -1;
        } else if (e.key === 'Escape') {
          _wpClearSaveBtnFocus(doc);
          getSave().blur();
        }
        return;
      }

      const list = getList();
      const rows = list ? list.querySelectorAll('[data-tp]') : [];
      const count = rows.length;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (_wpNavIndex <= 0) {
          _wpNavIndex = -1;
          _wpApplyHighlight(list);
          _wpFocusSaveBtn(doc);
        } else {
          _wpNavIndex--;
          _wpApplyHighlight(list);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        _wpNavIndex = count === 0 ? -1 : (_wpNavIndex >= count - 1 ? count - 1 : _wpNavIndex + 1);
        _wpApplyHighlight(list);
      } else if ((e.key === 'Enter' || e.key === ' ') && _wpNavIndex >= 0 && _wpNavIndex < count) {
        e.preventDefault();
        rows[_wpNavIndex].click();
      } else if (e.key === 'Delete' && _wpNavIndex >= 0 && _wpNavIndex < count) {
        e.preventDefault();
        rows[_wpNavIndex].closest('div')?.querySelector('[data-del]')?.click();
      }
    });
  }

  function bindWaypointPopupControls(doc) {
    const save = doc.getElementById('cdWpPopupSave');
    const filter = doc.getElementById('cdWpPopupFilter');
    if (filter) {
      filter.value = waypointFilter;
      filter.addEventListener('input', () => setWaypointFilter(filter.value));
    }
    if (save) save.addEventListener('click', () => _triggerWpSave(doc));
    _bindWaypointKeyboard(doc);
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
          <title>${_t('waypoints.window_title')}</title>
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
            .btn:focus{outline:none}
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
              <div class="title">${_t('waypoints.title')}</div>
              <button id="cdWpPopupSave" class="btn">${_t('waypoints.save')}</button>
            </div>
            <input id="cdWpPopupFilter" class="filter" placeholder="${_t('waypoints.filter_placeholder')}">
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
      font:13px/1.5 'Segoe UI',system-ui,sans-serif;
      border:1px solid rgba(255,208,96,.25);border-radius:7px;
      padding:10px 12px;width:260px;max-height:560px;
      backdrop-filter:blur(5px);box-shadow:0 4px 18px rgba(0,0,0,.5);
      display:none;flex-direction:column;gap:8px;overflow:hidden;`;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="color:#ffd060;font-weight:600;flex:1;font-size:13px">⭕ ${_t('waypoints.title')}</span>
        <button id="cdWpSave" title="${_t('waypoints.save_btn_title')}"
          style="background:rgba(255,208,96,.15);border:1px solid rgba(255,208,96,.4);
          color:#ffd060;font:13px 'Segoe UI';padding:6px 14px;border-radius:5px;cursor:pointer">
          ${_t('waypoints.save')}
        </button>
      </div>
      <input id="cdWpFilter" placeholder="${_t('waypoints.filter_placeholder')}"
        style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);
        color:#e8e8e8;font:13px 'Segoe UI';padding:8px 10px;border-radius:5px;outline:none">
      <div id="cdWpList" style="overflow-y:auto;max-height:220px;display:flex;
        flex-direction:column;gap:6px;flex-shrink:0"></div>
    `;
    document.body.appendChild(el);

    document.getElementById('cdWpFilter').addEventListener('input', (e) => setWaypointFilter(e.target.value));
    document.getElementById('cdWpSave').addEventListener('click', () => {
      const name = prompt(_t('waypoints.prompt_name'), lastPos
        ? (lastPos.realm === 'abyss'
            ? _t('waypoints.default_name_abyss').replace('{0}', Math.round(lastPos.x)).replace('{1}', Math.round(lastPos.z))
            : _t('waypoints.default_name').replace('{0}', Math.round(lastPos.x)).replace('{1}', Math.round(lastPos.z)))
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

  function _wpApplyHighlight(list) {
    if (!list) return;
    const rows = list.querySelectorAll('[data-tp]');
    rows.forEach((btn, i) => {
      const row = btn.closest('div');
      if (row) row.style.background = i === _wpNavIndex
        ? 'rgba(255,208,96,.18)' : 'rgba(255,255,255,.04)';
    });
  }

  function renderWaypointList(list) {
    if (!list) return;
    if (waypoints.length === 0) {
      list.innerHTML = `<div style="color:#555;font-size:11px;text-align:center;padding:4px 0">
        ${_t('waypoints.empty')}</div>`;
      return;
    }
    const items = waypoints
      .map((wp, i) => ({ wp, i }))
      .filter(item => matchesWaypointFilter(item.wp));
    if (items.length === 0) {
      list.innerHTML = `<div style="color:#555;font-size:11px;text-align:center;padding:4px 0">
        ${_t('waypoints.not_found')}</div>`;
      return;
    }
    list.innerHTML = items.map(({ wp, i }) => `
      <div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.04);
        border-radius:5px;padding:8px 10px;min-height:44px;">
        <span style="flex:1;font-size:13px;white-space:nowrap;overflow:hidden;
          text-overflow:ellipsis;color:#ccc" title="${wp.name}">${wp.name}</span>
        <button data-tp="${i}" title="${_t('waypoints.teleport_title')}"
          style="background:rgba(255,208,96,.15);border:1px solid rgba(255,208,96,.35);
          color:#ffd060;font:12px 'Segoe UI';padding:5px 10px;border-radius:4px;
          cursor:pointer;flex-shrink:0;min-height:36px">${_t('waypoints.teleport_btn')}</button>
        <button data-del="${i}" title="${_t('waypoints.delete_btn_title')}"
          style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
          color:#888;font:14px monospace;cursor:pointer;padding:0;flex-shrink:0;
          width:36px;height:36px;border-radius:4px;display:flex;align-items:center;
          justify-content:center">✕</button>
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
    if (_wpPendingFocusLast && list.id === 'cdWpPopupList') {
      _wpNavIndex = items.length - 1;
      _wpPendingFocusLast = false;
    } else if (_wpNavIndex >= items.length) {
      _wpNavIndex = items.length - 1;
    }
    _wpApplyHighlight(list);
  }

  function renderWaypoints() {
    ensureWaypointPanel();
    renderWaypointList(document.getElementById('cdWpList'));
    renderWaypointList(getWaypointPopupDoc()?.getElementById('cdWpPopupList'));
  }

  function waypointNavInput(action) {
    const doc = getWaypointPopupDoc();
    if (!doc) return;
    const list = doc.getElementById('cdWpPopupList');
    if (!list) return;
    const rows = list.querySelectorAll('[data-tp]');
    const count = rows.length;
    if (action === 'up') {
      const filterFocused = doc.activeElement === doc.getElementById('cdWpPopupFilter');
      if (filterFocused || _wpNavIndex === 0) {
        doc.activeElement?.blur();
        _wpNavIndex = -1;
        _wpApplyHighlight(list);
        _wpFocusSaveBtn(doc);
      } else {
        _wpNavIndex = count === 0 ? -1 : (_wpNavIndex < 0 ? count - 1 : _wpNavIndex - 1);
        _wpApplyHighlight(list);
      }
    } else if (action === 'down') {
      _wpClearSaveBtnFocus(doc);
      _wpNavIndex = count === 0 ? -1 : (_wpNavIndex >= count - 1 ? 0 : _wpNavIndex + 1);
      _wpApplyHighlight(list);
    } else if (action === 'select') {
      if (doc.activeElement === doc.getElementById('cdWpPopupSave')) {
        _triggerWpSave(doc);
      } else if (_wpNavIndex >= 0 && _wpNavIndex < count) {
        rows[_wpNavIndex].click();
      }
    } else if (action === 'delete') {
      if (_wpNavIndex >= 0 && _wpNavIndex < count) {
        rows[_wpNavIndex].closest('div')?.querySelector('[data-del]')?.click();
      }
    } else if (action === 'close') {
      try { if (waypointPopup && !waypointPopup.closed) waypointPopup.close(); } catch (_) {}
      waypointPopup = null;
      _wpNavIndex = -1;
      sendCmd({ cmd: 'waypoints_state', open: false });
    }
  }

  function toggleWaypointPanelFromHotkey() {
    // Full mode deliberately has no secondary browser window.  The old
    // popup-based code below is retained for legacy Qt mode only.
    if (window.__cdWebView2) {
      ensureWaypointPanel();
      const panel = document.getElementById('cdWpPanel');
      if (!panel) return;
      const visible = panel.style.display !== 'none';
      panel.style.display = visible ? 'none' : 'flex';
      sendCmd({ cmd: 'waypoints_state', open: !visible });
      return;
    }
    try {
      if (waypointPopup && !waypointPopup.closed) {
        waypointPopup.close();
        waypointPopup = null;
        _wpNavIndex = -1;
        sendCmd({ cmd: 'waypoints_state', open: false });
        return;
      }
    } catch (_) { waypointPopup = null; }
    if (ensureWaypointPopup()) {
      sendCmd({ cmd: 'waypoints_state', open: true });
    }
  }

  // ── Layout adaptativo para janela circular ────────────────────────
