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
  setInterval(() => {
    if (window.mapManager && typeof window.mapManager.updateFoundLocationsStyle === 'function')
      window.mapManager.updateFoundLocationsStyle();
  }, 50);
})();
