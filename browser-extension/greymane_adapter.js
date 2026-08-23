// Crimson Desert Companion — non-invasive Greymane Codex adapter.
// Finds the MapLibre instance already owned by the site's React component.
(function () {
  'use strict';

  if (window.__cdpGreymaneAdapter) return;
  window.__cdpGreymaneAdapter = true;

  function looksLikeMap(value) {
    return !!value && typeof value === 'object' &&
      typeof value.getCenter === 'function' &&
      typeof value.getContainer === 'function' &&
      typeof value.project === 'function' &&
      typeof value.getSource === 'function';
  }

  function mapFromHookChain(fiber) {
    let currentFiber = fiber;
    for (let level = 0; currentFiber && level < 12; level += 1) {
      let hook = currentFiber.memoizedState;
      for (let index = 0; hook && index < 40; index += 1) {
        const candidates = [
          hook.current,
          hook.memoizedState,
          hook.memoizedState && hook.memoizedState.current,
          hook.baseState,
          hook.baseState && hook.baseState.current,
        ];
        const found = candidates.find(looksLikeMap);
        if (found) return found;
        hook = hook.next;
      }
      currentFiber = currentFiber.return;
    }
    return null;
  }

  function findMap() {
    const styles = document.querySelectorAll('style');
    for (const style of styles) {
      if (!style.textContent.includes('.maplibregl-canvas-container')) continue;
      const fiberKey = Object.getOwnPropertyNames(style)
        .find(key => key.startsWith('__reactFiber$'));
      if (!fiberKey) continue;
      const map = mapFromHookChain(style[fiberKey]);
      if (map) return map;
    }
    return null;
  }

  function findMapLibreUrl() {
    const entry = performance.getEntriesByType('resource')
      .find(item => /\/assets\/maplibre-gl-[^/?]+\.js(?:\?|$)/.test(item.name));
    return entry && entry.name;
  }

  async function publish(map) {
    if (window.map === map && window.mapboxgl && window.maplibregl) return true;
    const moduleUrl = findMapLibreUrl();
    if (!moduleUrl) return false;
    try {
      const imported = await import(moduleUrl);
      const exported = imported.m || imported.default || imported;
      const maplibre = exported.default || exported;
      if (!maplibre || typeof maplibre.Marker !== 'function') return false;
      window.map = map;
      window.maplibregl = maplibre;
      window.mapboxgl = maplibre;
      window.dispatchEvent(new CustomEvent('cdp-map-ready', {
        detail: { provider: 'greymane' },
      }));
      return true;
    } catch (error) {
      console.warn('[CD Companion] Greymane adapter could not load MapLibre', error);
      return false;
    }
  }

  let publishedMap = null;
  const timer = setInterval(async () => {
    const currentContainer = publishedMap && typeof publishedMap.getContainer === 'function'
      ? publishedMap.getContainer()
      : null;
    if (currentContainer && currentContainer.isConnected) return;
    const map = findMap();
    if (map && await publish(map)) publishedMap = map;
  }, 500);
})();
