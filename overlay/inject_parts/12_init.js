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
  // Map sites may replace injected body children during hydration or later SPA
  // updates. Restore the complete Full-mode control layout when that happens.
  setInterval(() => {
    createCenterCrosshair();
    if (window.__cdRepairCompanionControls) {
      window.__cdRepairCompanionControls(false);
    }
    updateTeleportVisibility();
  }, 750);
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
