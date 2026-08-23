(function () {
  if (window.__cdOverlay) return;
  window.__cdOverlay = true;

  const WS_URL = '$WS_URL';
  const RECONNECT_MS = 3000;
  const LIVE_VIEW_DURATION_MS = 16;
  const NATIVE_REALTIME = !!window.__cdNativeRealtimeEnabled;
  const CENTER_TELEPORT_Y_KEY = 'cd_center_teleport_y';
  const NEARBY_RESPECT_MAP_VISIBILITY_KEY = 'cd_nearby_respect_map_visibility';
  const NEARBY_STAY_IN_LIST_KEY = 'cd_nearby_stay_in_list';
  const CLIENT_ID = (window.crypto && typeof window.crypto.randomUUID === 'function')
    ? window.crypto.randomUUID()
    : `overlay-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  let ws              = null;
  let marker          = null;
  let mapMarker       = null;
  let mapDestLng      = null;
  let mapDestLat      = null;
  let map             = null;
  let following       = true;
  let shiftHeld       = false;
  let lastPos         = null;
  let lastHeading     = 0;
  let lastCameraHeading = 0;
  let hasCameraHeading = false;
  let rotateWithPlayer = !!(window.__cdSettings && window.__cdSettings.rotateWithPlayer);
  let rotateWithCamera = !!(window.__cdSettings && window.__cdSettings.rotateWithCamera);
  let waypoints       = [];
  let waypointPopup   = null;
  let nearbyPopup     = null;
  let nearbyInputHandler = null;
  let nearbySelectionActive = false;
  let waypointFilter  = '';
  let hasPreTeleport  = false;
  let teleportEnabled = !(window.__cdSettings && window.__cdSettings.teleportEnabled === false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Shift') shiftHeld = true;  });
  document.addEventListener('keyup',   (e) => { if (e.key === 'Shift') shiftHeld = false; });

  function _t(key) {
    const dict = window.__cdSettings && window.__cdSettings.i18n;
    if (!dict || typeof dict[key] === 'undefined') return key;
    return dict[key];
  }

