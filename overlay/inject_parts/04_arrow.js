  function updateHeading(newPos) {
    const src = (window.__cdSettings && window.__cdSettings.headingSource) || 'auto';
    let deg = null;
    if (src !== 'delta' && typeof newPos.heading === 'number') {
      deg = newPos.heading;
    } else if (src !== 'entity') {
      if (!lastPos) return;
      const dx = newPos.x - lastPos.x;
      const dz = newPos.z - lastPos.z;
      if (dx*dx + dz*dz < 0.001) return;
      deg = Math.atan2(dx, dz) * 180 / Math.PI;
    }
    if (deg === null) return;
    lastHeading = deg;
    updateArrowRotation();
  }

  function updateArrowRotation() {
    const arrow = document.getElementById('cdArrow');
    if (arrow) {
      const arrowDeg = following && rotateWithCamera
        ? lastHeading - lastCameraHeading
        : (following && rotateWithPlayer ? 0 : lastHeading);
      arrow.style.transform = `translate(-50%,-50%) rotate(${arrowDeg}deg)`;
    }
  }

  function resetMapBearing() {
    const m = getMap();
    if (!m) return;
    if (typeof m.jumpTo === 'function') {
      m.jumpTo({ bearing: 0 });
    } else {
      m.easeTo({ bearing: 0, duration: 0 });
    }
  }

  function liveEaseTo(m, view) {
    if (!m) return;
    if (typeof m.jumpTo === 'function') {
      m.jumpTo(view);
      return;
    }
    if (typeof m.stop === 'function') m.stop();
    m.easeTo(Object.assign({ duration: LIVE_VIEW_DURATION_MS }, view));
  }

  function setRotateWithPlayer(val) {
    rotateWithPlayer = !!val;
    if (rotateWithPlayer) rotateWithCamera = false;
    if (window.__cdSettings) window.__cdSettings.rotateWithPlayer = rotateWithPlayer;
    if (window.__cdSettings) window.__cdSettings.rotateWithCamera = rotateWithCamera;
    updateArrowRotation();
    if (!following || (!rotateWithPlayer && !rotateWithCamera)) resetMapBearing();
  }

  function setRotateWithCamera(val) {
    rotateWithCamera = !!val;
    if (rotateWithCamera) rotateWithPlayer = false;
    if (window.__cdSettings) window.__cdSettings.rotateWithCamera = rotateWithCamera;
    if (window.__cdSettings) window.__cdSettings.rotateWithPlayer = rotateWithPlayer;
    updateArrowRotation();
    if (!following || (!rotateWithCamera && !rotateWithPlayer)) resetMapBearing();
  }

  function isSamePositionMessage(pos, prev) {
    if (!prev) return false;
    return pos.lng === prev.lng &&
      pos.lat === prev.lat &&
      pos.x === prev.x &&
      pos.y === prev.y &&
      pos.z === prev.z &&
      pos.realm === prev.realm &&
      pos.heading === prev.heading;
  }

  function onCameraHeading(msg) {
    if (typeof msg.heading !== 'number') return;
    if (hasCameraHeading && msg.heading === lastCameraHeading) return;
    hasCameraHeading = true;
    lastCameraHeading = msg.heading;
    if (window.__cdSettings) {
      rotateWithCamera = !!window.__cdSettings.rotateWithCamera;
      rotateWithPlayer = !!window.__cdSettings.rotateWithPlayer;
    }
    if (!rotateWithCamera || !following) {
      updateArrowRotation();
      return;
    }
    updateArrowRotation();
    const mm = getMap();
    if (mm) {
      const view = { bearing: lastCameraHeading };
      if (following && !shiftHeld && lastPos && !nearbySelectionActive) {
        view.center = [lastPos.lng, lastPos.lat];
      }
      liveEaseTo(mm, view);
    }
  }

