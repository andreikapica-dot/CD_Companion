  // ── WebSocket ─────────────────────────────────────────────────────
  function handlePositionMessage(msg) {
    if (isSamePositionMessage(msg, lastPos)) return;
    updateHeading(msg);
    lastPos = msg;
    if (marker) marker.setLngLat([msg.lng, msg.lat]);
    updateNearbyCircle();
    const mm = window.mapManager && window.mapManager.map;
    if (rotateWithCamera && following && !shiftHeld && !nearbySelectionActive && mm) {
      // Centraliza no player a cada posição; bearing vem do último camera_heading.
      liveEaseTo(mm, { center: [msg.lng, msg.lat], bearing: lastCameraHeading });
    } else if (following && !shiftHeld && !nearbySelectionActive && rotateWithPlayer && mm) {
      liveEaseTo(mm, { center: [msg.lng, msg.lat], bearing: lastHeading });
    } else if (following && !shiftHeld && !nearbySelectionActive) {
      pan(msg.lng, msg.lat);
    }
    updatePanel();
  }

  function handleMapMarkerMessage(msg) {
    mapDestLng = msg.lng;
    mapDestLat = msg.lat;
    if (!mapMarker) createMapMarker();
    ensureEdgeIndicator();
    installEdgeIndicatorListener();
    if (mapMarker) {
      mapMarker.setLngLat([msg.lng, msg.lat]);
      mapMarker.getElement().style.display = '';
    }
    updateEdgeIndicator();
  }

  function handleMapMarkerCleared() {
    mapDestLng = null;
    mapDestLat = null;
    if (mapMarker) mapMarker.getElement().style.display = 'none';
    const ei = document.getElementById('cdEdgeIndicator');
    if (ei) ei.style.display = 'none';
  }

  function processRealtimeEvents(events) {
    if (!Array.isArray(events)) return;
    events.forEach(function(ev) {
      if (ev.type === 'position') {
        handlePositionMessage(ev);
      } else if (ev.type === 'camera_heading') {
        onCameraHeading(ev);
      } else if (ev.type === 'map_marker') {
        handleMapMarkerMessage(ev);
      } else if (ev.type === 'map_marker_cleared') {
        handleMapMarkerCleared();
      }
    });
  }

  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    ws = new WebSocket(WS_URL);
    ws.onopen  = () => {
      sendCmd({
        cmd: 'client_options',
        clientName: 'overlay',
        realtimeBundle: true,
        nativeRealtime: NATIVE_REALTIME
      });
      updatePanel();
    };
    ws.onclose = () => { updatePanel(); setTimeout(connect, RECONNECT_MS); };
    ws.onerror = () => updatePanel();
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === 'realtime' && Array.isArray(msg.events)) {
          processRealtimeEvents(msg.events);

        } else if (msg.type === 'position') {
          handlePositionMessage(msg);

        } else if (msg.type === 'camera_heading') {
          onCameraHeading(msg);

        } else if (msg.type === 'waypoints') {
          waypoints = msg.data || [];
          renderWaypoints();

        } else if (msg.type === 'teleport_marker_result') {
          if (msg.ok) {
            hasPreTeleport = true; updatePanel();
          } else {
            setStatus(msg.err || _t('teleport.no_marker'), '#e07070', 3000);
          }

        } else if (msg.type === 'teleport_map_result') {
          if (msg.ok) {
            hasPreTeleport = true;
            setStatus(`Teleported: X ${msg.x.toFixed(0)} Z ${msg.z.toFixed(0)}`, '#60e890', 5000);
            updatePanel();
          } else {
            hasPreTeleport = false; updatePanel();
            setStatus(msg.err || _t('teleport.map_failed'), '#e07070', 3000);
          }

        } else if (msg.type === 'crosshair_target_result') {
          if (msg.ok) {
            setStatus(`F5 target: X ${msg.x.toFixed(0)} Z ${msg.z.toFixed(0)}`, '#ffd060', 5000);
          } else {
            setStatus(msg.err || 'Could not set F5 target', '#e07070', 3000);
          }

        } else if (msg.type === 'hotkeys_saved') {
          setStatus(msg.ok ? 'Hotkeys saved' : (msg.err || 'Could not save hotkeys'),
            msg.ok ? '#60e890' : '#e07070', 3500);

        } else if (msg.type === 'calibration_result') {
          const text = msg.ok
            ? (msg.reset ? 'Calibration reset.' : `Calibration saved (${msg.count || 1} point${msg.count === 1 ? '' : 's'}).`)
            : (msg.err || 'Calibration failed.');
          _setFullSettingsStatus(text, !!msg.ok);
          setStatus(text, msg.ok ? '#60e890' : '#e07070', 4000);

        } else if (msg.type === 'location_toggle') {
          if (msg.sourceClientId && msg.sourceClientId === CLIENT_ID) return;
          _onLocationToggle(msg.locationId, msg.found);

        } else if (msg.type === 'open_nearby') {
          if (nearbyControlsEnabled()) openNearbyPopup();

        } else if (msg.type === 'nearby_input') {
          if (nearbyControlsEnabled() && nearbyInputHandler) nearbyInputHandler(msg.action);

        } else if (msg.type === 'open_waypoints') {
          toggleWaypointPanelFromHotkey();

        } else if (msg.type === 'waypoint_input_wp') {
          waypointNavInput(msg.action);

        } else if (msg.type === 'pan_location') {
          panToLocationId(msg.locationId);

        } else if (msg.type === 'map_marker') {
          handleMapMarkerMessage(msg);

        } else if (msg.type === 'map_marker_cleared') {
          handleMapMarkerCleared();
        }

        // backward-compat: mensagens sem type são posição
        if (!msg.type && typeof msg.lng === 'number') {
          handlePositionMessage(msg);
        }
      } catch (_) {}
    };
  }

  window.__cdNativeRealtime = function(frame) {
    if (!frame || !Array.isArray(frame.events)) return;
    processRealtimeEvents(frame.events);
  };

