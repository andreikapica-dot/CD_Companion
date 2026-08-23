
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
    const action = _t(found ? 'sync.marked' : 'sync.unmarked');
    toast.textContent = _t('sync.location_toast').replace('{0}', locationId).replace('{1}', action);
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

