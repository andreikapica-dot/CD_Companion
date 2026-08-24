  createCenterCrosshair();
  ensureStatusToggleBtn();
  updatePanel();
  ensureWpToggleBtn();
  ensureNearbyToggleBtn();
  ensureCenterTeleportBtn();
  ensureCenterTeleportPanel();
  applyRoundLayout(!!(window.__cdSettings && window.__cdSettings.roundWindow));
  // ambos os painéis começam ocultos
  ensureWaypointPanel();
  renderWaypoints();
  updateTeleportVisibility();
  // Greymane's React hydration may remove early body children. Restore only
  // missing Companion controls without disturbing panels that are already open.
  setInterval(() => {
    createCenterCrosshair();
    ensureWpToggleBtn();
    ensureCenterTeleportBtn();
    ensureNearbyToggleBtn();
    updateTeleportVisibility();
    if (window.__cdUpdateNearbyControls) window.__cdUpdateNearbyControls();
  }, 500);
  connect();
  // MapGenie can expose several thousand marker elements at once. Running its
  // full style pass every 50 ms blocks WebView2 while the page is hydrating.
  // Keep the compatibility refresh, but never overlap calls and run it at a
  // human-visible cadence instead of on every few animation frames.
  let foundStyleRefreshBusy = false;
  setInterval(() => {
    if (document.hidden || foundStyleRefreshBusy) return;
    if (!window.mapManager ||
        typeof window.mapManager.updateFoundLocationsStyle !== 'function') return;
    foundStyleRefreshBusy = true;
    try {
      window.mapManager.updateFoundLocationsStyle();
    } finally {
      foundStyleRefreshBusy = false;
    }
  }, 1000);
})();
