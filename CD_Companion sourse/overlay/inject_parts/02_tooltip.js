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

