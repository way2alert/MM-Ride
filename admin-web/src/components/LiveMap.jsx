import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { formatDateTime } from '../utils/formatters';

// Geodesic distance in meters between two lat/lng pairs
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Great-circle bearing in degrees (0 - 360) from point 1 to point 2
function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return (Math.round((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

// Convert degrees to cardinal compass text (e.g. 45 -> NE)
function getCompassDirection(deg) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(((deg % 360) / 22.5)) % 16;
  return directions[index];
}

// Generate the Top-Down Directional Motorcycle SVG
function getDirectionalBikeSvg() {
  return `
    <svg class="directional-bike-svg" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Front Wheel & Fork -->
      <rect x="18.5" y="4" width="3" height="9" rx="1.5" fill="#FFFFFF"/>
      <rect x="15" y="11" width="10" height="2.5" rx="1" fill="#CBD5E1"/>
      <!-- Handlebars & Grips -->
      <circle cx="13" cy="12" r="1.8" fill="#F8FAFC"/>
      <circle cx="27" cy="12" r="1.8" fill="#F8FAFC"/>
      <!-- Rearview Mirrors -->
      <rect x="11.5" y="9" width="1.5" height="3" rx="0.7" fill="#94A3B8"/>
      <rect x="27" y="9" width="1.5" height="3" rx="0.7" fill="#94A3B8"/>
      <!-- Front Cowl & Headlight -->
      <path d="M17 13 L23 13 L21.5 17 L18.5 17 Z" fill="#FDE047"/>
      <!-- Fuel Tank & Chassis -->
      <path d="M16.5 16 C16 19, 16 23, 17 26 L23 26 C24 23, 24 19, 23.5 16 Z" fill="#FFFFFF"/>
      <!-- Rider Seat & Helmet -->
      <circle cx="20" cy="21" r="3.2" fill="#0F172A" stroke="#FFFFFF" stroke-width="1.2"/>
      <!-- Rear Body & Pillion -->
      <path d="M17.5 26 L22.5 26 L21.5 32 L18.5 32 Z" fill="#E2E8F0"/>
      <!-- Rear Wheel & Taillight -->
      <rect x="18.5" y="30" width="3" height="7" rx="1.5" fill="#334155"/>
      <rect x="18" y="32" width="4" height="1.8" rx="0.8" fill="#EF4444"/>
    </svg>
  `;
}

export default function LiveMap({ drivers = [], hubs = [], selectedDriver = null, onSelectDriver = null }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const vehiclesMapRef = useRef(new Map());
  const circlesRef = useRef([]);
  const hasAutoCenteredRef = useRef(false);
  const lastDriversHashRef = useRef('');
  const animationFrameIdRef = useRef(null);
  const lastFrameTimeRef = useRef(performance.now());
  const isUserInteractingRef = useRef(false);
  const userInteractionTimeoutRef = useRef(null);

  // Map Controls State
  const [showTrails, setShowTrails] = useState(true);
  const [isFollowMode, setIsFollowMode] = useState(true);
  const showTrailsRef = useRef(showTrails);
  const isFollowModeRef = useRef(isFollowMode);

  useEffect(() => {
    showTrailsRef.current = showTrails;
    // Update polyline visibility across all active trails
    vehiclesMapRef.current.forEach(v => {
      if (v.trailPolyline && mapInstanceRef.current) {
        if (showTrails) {
          if (!mapInstanceRef.current.hasLayer(v.trailPolyline)) {
            v.trailPolyline.addTo(mapInstanceRef.current);
          }
        } else {
          if (mapInstanceRef.current.hasLayer(v.trailPolyline)) {
            mapInstanceRef.current.removeLayer(v.trailPolyline);
          }
        }
      }
    });
  }, [showTrails]);

  useEffect(() => {
    isFollowModeRef.current = isFollowMode;
  }, [isFollowMode]);

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = hubs.length > 0 && hubs[0].latitude ? hubs[0].latitude : 28.6139;
      const initialLng = hubs.length > 0 && hubs[0].longitude ? hubs[0].longitude : 77.2090;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 13,
        zoomControl: true,
        preferCanvas: true
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      // Detect user map panning/dragging to temporarily suspend auto-follow
      const handleUserInteraction = () => {
        isUserInteractingRef.current = true;
        if (userInteractionTimeoutRef.current) {
          clearTimeout(userInteractionTimeoutRef.current);
        }
        userInteractionTimeoutRef.current = setTimeout(() => {
          isUserInteractingRef.current = false;
        }, 5000); // Resume auto-follow 5s after user stops dragging
      };

      map.on('movestart', handleUserInteraction);
      map.on('dragstart', handleUserInteraction);
      map.on('zoomstart', handleUserInteraction);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Draw Hub Geofence Circles
    circlesRef.current.forEach(c => map.removeLayer(c));
    circlesRef.current = [];

    hubs.forEach(hub => {
      if (typeof hub.latitude === 'number' && typeof hub.longitude === 'number') {
        const circle = L.circle([hub.latitude, hub.longitude], {
          color: '#F59E0B',
          fillColor: '#F59E0B',
          fillOpacity: 0.15,
          weight: 2,
          radius: hub.radiusMeters || 500
        }).addTo(map);

        circle.bindTooltip(`<b>🏢 ${hub.name}</b><br/>Authorized Depot (${hub.radiusMeters || 500}m Geofence)`, {
          permanent: false,
          direction: 'top'
        });

        circlesRef.current.push(circle);
      }
    });
  }, [hubs]);

  // 2. High-Frequency GPS Telemetry Ingestion (Tracks new pings without snapping)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const activeDriverIds = new Set(drivers.map(d => d.id));
    const nowPerf = performance.now();

    // Clean up removed drivers
    vehiclesMapRef.current.forEach((v, id) => {
      if (!activeDriverIds.has(id)) {
        if (v.marker) map.removeLayer(v.marker);
        if (v.trailPolyline) map.removeLayer(v.trailPolyline);
        vehiclesMapRef.current.delete(id);
      }
    });

    const boundsPoints = [];
    hubs.forEach(h => {
      if (typeof h.latitude === 'number' && typeof h.longitude === 'number') {
        boundsPoints.push([h.latitude, h.longitude]);
      }
    });

    drivers.forEach(driver => {
      const loc = driver.lastKnownLocation;
      if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return;

      boundsPoints.push([loc.latitude, loc.longitude]);
      const now = Date.now();
      const lastPingTime = loc.timestamp ? new Date(loc.timestamp).getTime() : 0;
      const isOutdated = lastPingTime > 0 && (now - lastPingTime) > (5 * 60 * 1000);
      const incomingSpeed = Math.max(0, Math.round(Number(loc.speed) || 0));
      const isMoving = incomingSpeed > 0;
      const isOverspeed = incomingSpeed > 60;
      const driverName = driver.fullName || 'Driver';
      const hasLiveRide = driver.lastPlatformRideEvent?.eventType === 'RIDE_ACCEPTED';
      const speedText = hasLiveRide
        ? `🚖 ${driver.lastPlatformRideEvent.platform || 'ON TRIP'}`
        : isMoving
          ? `${incomingSpeed} km/h`
          : (driver.isCurrentlyOnDuty && !isOutdated) ? '🟢 On Duty' : 'Idle';

      const pillClass = isOverspeed ? 'pill-overspeed' : hasLiveRide ? 'pill-moving' : isMoving ? 'pill-moving' : (driver.isCurrentlyOnDuty && !isOutdated) ? 'pill-moving' : 'pill-idle';
      const bikeClass = isOverspeed ? 'bike-overspeed' : isMoving ? 'bike-moving' : 'bike-idle';

      const popupContent = `
        <div style="font-family: 'Inter', sans-serif; color: #1e293b; font-size: 12px; min-width: 240px; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <div style="font-weight: 800; font-size: 15px; color: #0f172a;">
              ${driverName}
            </div>
            <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 700; background: ${isMoving ? '#dcfce7; color: #166534;' : '#fef3c7; color: #92400e;'}">
              ${isMoving ? '⚡ MOVING' : (driver.isCurrentlyOnDuty && !isOutdated) ? '🟢 ON DUTY' : '⏸️ STATIONARY'}
            </span>
          </div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 8px;">Mobile: <b>${driver.mobileNumber || 'N/A'}</b></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; background: #f8fafc; padding: 4px 8px; border-radius: 4px;">
            <span style="color: #64748b;">Assigned Vehicle:</span>
            <b style="color: #d97706;">${driver.assignedBikeRegistration || 'BIKE'}</b>
          </div>
          ${driver.shiftDistanceKm ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; background: #f0fdf4; padding: 4px 8px; border-radius: 4px; border: 1px solid #bbf7d0;">
            <span style="color: #166534; font-weight: 600;">Shift Traveled:</span>
            <b style="color: #15803d; font-size: 13px;">${driver.shiftDistanceKm} km</b>
          </div>` : ''}
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; padding: 2px 6px;">
            <span style="color: #64748b;">Live Speed:</span>
            <b style="color: ${isOverspeed ? '#dc2626' : isMoving ? '#16a34a' : '#d97706'}; font-size: 13px;">
              ${incomingSpeed} km/h
            </b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; padding: 2px 6px;">
            <span style="color: #64748b;">Duty Status:</span>
            <b style="color: ${driver.isCurrentlyOnDuty ? '#16a34a' : '#64748b'};">
              ${driver.isCurrentlyOnDuty ? '🟢 ON DUTY' : '⚪ OFF DUTY'}
            </b>
          </div>
          ${driver.lastPlatformRideEvent ? `
          <div style="margin-top: 6px; padding: 6px 8px; border-radius: 6px; background: ${
            driver.lastPlatformRideEvent.eventType === 'RIDE_ACCEPTED' ? '#ecfdf5; border: 1px solid #10b981;' :
            driver.lastPlatformRideEvent.eventType === 'RIDE_CANCELLED' ? '#fef2f2; border: 1px solid #ef4444;' :
            '#eff6ff; border: 1px solid #3b82f6;'
          }">
            <div style="font-size: 11px; font-weight: 800; color: ${
              driver.lastPlatformRideEvent.eventType === 'RIDE_ACCEPTED' ? '#047857;' :
              driver.lastPlatformRideEvent.eventType === 'RIDE_CANCELLED' ? '#b91c1c;' :
              '#1d4ed8;'
            }">
              🚖 ${driver.lastPlatformRideEvent.platform || 'GIG'} • ${
                driver.lastPlatformRideEvent.eventType === 'RIDE_ACCEPTED' ? '🟢 ON TRIP (ACCEPTED)' :
                driver.lastPlatformRideEvent.eventType === 'RIDE_CANCELLED' ? '🔴 CANCELLED' :
                driver.lastPlatformRideEvent.eventType === 'RIDE_COMPLETED' ? '🏁 COMPLETED' :
                driver.lastPlatformRideEvent.eventType
              }
            </div>
            <div style="font-size: 10px; color: #475569; margin-top: 2px;">
              ${driver.lastPlatformRideEvent.timestamp ? formatDateTime(driver.lastPlatformRideEvent.timestamp) : ''}
            </div>
          </div>` : ''}
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 11px;">
            ${isOutdated ? 
              '<span style="color: #dc2626; font-weight: 700;">⚠️ Old GPS Ping</span>' : 
              `<span style="color: #16a34a; font-weight: 700;">🟢 Live Telemetry: ${formatDateTime(loc.timestamp)}</span>`
            }
          </div>
        </div>
      `;

      const onMarkerClick = () => {
        if (onSelectDriver) {
          onSelectDriver(driver);
        }
      };

      if (!vehiclesMapRef.current.has(driver.id)) {
        // Create Custom HTML Marker with Directional Top-Down Motorcycle & Headlight Cone
        const customIcon = L.divIcon({
          className: 'driver-marker-wrapper',
          html: `
            <div class="driver-marker-container" id="marker-container-${driver.id}">
              <div class="driver-name-pill ${pillClass}" id="marker-pill-${driver.id}">
                <span class="status-pulse-dot"></span>
                <span class="driver-pill-name" title="${driverName}">${driverName}</span>
                <span class="driver-pill-speed" id="marker-speed-${driver.id}">${speedText}</span>
              </div>
              <div class="bike-rotator-wrapper ${isMoving ? 'is-moving' : ''}" id="bike-rotator-${driver.id}">
                <div class="headlight-cone"></div>
                <div class="bike-avatar-circle ${bikeClass}" id="bike-avatar-${driver.id}">
                  ${getDirectionalBikeSvg()}
                  <div class="bike-pulse-ring"></div>
                </div>
              </div>
            </div>
          `,
          iconSize: [140, 74],
          iconAnchor: [70, 52],
          popupAnchor: [0, -54]
        });

        const marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon }).addTo(map);
        marker.bindPopup(popupContent);
        marker.on('click', onMarkerClick);

        // Create glowing Breadcrumb Route Polyline
        const trailPolyline = L.polyline([[loc.latitude, loc.longitude]], {
          color: isOverspeed ? '#EF4444' : '#10B981',
          weight: 3.5,
          opacity: 0.75,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: null
        });

        if (showTrailsRef.current) {
          trailPolyline.addTo(map);
        }

        const initialHeading = typeof loc.heading === 'number' ? loc.heading : 0;

        vehiclesMapRef.current.set(driver.id, {
          driverId: driver.id,
          driverData: driver,
          marker,
          trailPolyline,
          trailPoints: [[loc.latitude, loc.longitude]],
          lastTrailAppendTime: nowPerf,

          // Physics Positions
          currentLat: loc.latitude,
          currentLng: loc.longitude,
          fromLat: loc.latitude,
          fromLng: loc.longitude,
          targetLat: loc.latitude,
          targetLng: loc.longitude,

          // Rotation (Degrees 0-360)
          currentBearing: initialHeading,
          targetBearing: initialHeading,

          // Speed (km/h)
          displaySpeed: incomingSpeed,
          targetSpeed: incomingSpeed,

          // Packet Timing & Dead Reckoning
          lastPacketTime: nowPerf,
          packetInterval: 1500,
          isExtrapolating: false,
          extrapolatedMeters: 0,

          // Cached DOM elements
          pillEl: null,
          speedEl: null,
          rotatorEl: null,
          avatarEl: null
        });
      } else {
        // Vehicle already exists: calculate physics transition without snapping
        const v = vehiclesMapRef.current.get(driver.id);
        v.driverData = driver;
        v.marker.getPopup().setContent(popupContent);
        v.marker.off('click').on('click', onMarkerClick);

        const coordsChanged = Math.abs(v.targetLat - loc.latitude) > 0.000005 || Math.abs(v.targetLng - loc.longitude) > 0.000005;

        if (coordsChanged) {
          const distMeters = getDistanceMeters(v.currentLat, v.currentLng, loc.latitude, loc.longitude);
          
          // Smoothly continue from where the bike is visually right now
          v.fromLat = v.currentLat;
          v.fromLng = v.currentLng;
          v.targetLat = loc.latitude;
          v.targetLng = loc.longitude;
          v.targetSpeed = incomingSpeed;

          // Compute road trajectory bearing if vehicle moved >= 1.5m, otherwise keep native heading
          if (distMeters >= 1.5) {
            v.targetBearing = calculateBearing(v.fromLat, v.fromLng, v.targetLat, v.targetLng);
          } else if (typeof loc.heading === 'number' && loc.heading >= 0) {
            v.targetBearing = loc.heading;
          }

          if (v.lastPacketTime > 0) {
            const timeSinceLast = nowPerf - v.lastPacketTime;
            v.packetInterval = Math.max(800, Math.min(3500, timeSinceLast));
          }

          v.lastPacketTime = nowPerf;
          v.isExtrapolating = false;
          v.extrapolatedMeters = 0;
        } else {
          v.targetSpeed = incomingSpeed;
          if (typeof loc.heading === 'number') {
            v.targetBearing = loc.heading;
          }
        }

        // Update CSS pill classes
        const container = v.marker.getElement();
        if (container) {
          const pill = container.querySelector('.driver-name-pill');
          const avatar = container.querySelector('.bike-avatar-circle');
          const rotator = container.querySelector('.bike-rotator-wrapper');
          if (pill) {
            pill.className = `driver-name-pill ${pillClass}`;
          }
          if (avatar) {
            avatar.className = `bike-avatar-circle ${bikeClass}`;
          }
          if (rotator) {
            if (isMoving) rotator.classList.add('is-moving');
            else rotator.classList.remove('is-moving');
          }
        }
      }
    });

    // Auto-fit default viewport covering all bikes on initial load or when fleet composition changes
    const fleetIdsHash = drivers.filter(d => d.lastKnownLocation?.latitude).map(d => d.id).sort().join('|');
    if (boundsPoints.length > 0) {
      const isInitialFit = !hasAutoCenteredRef.current;
      const hasFleetMembershipChanged = lastDriversHashRef.current !== fleetIdsHash && boundsPoints.length > 0;

      if (isInitialFit || hasFleetMembershipChanged) {
        if (boundsPoints.length >= 2) {
          map.fitBounds(L.latLngBounds(boundsPoints), {
            padding: [75, 75],
            maxZoom: 15,
            animate: true
          });
        } else if (boundsPoints.length === 1) {
          map.setView(boundsPoints[0], 14, { animate: true });
        }
        hasAutoCenteredRef.current = true;
        lastDriversHashRef.current = fleetIdsHash;
      }
    }
  }, [drivers, hubs]);

  // 3. 60 FPS Continuous Real-Time Physics Interpolation & Dead Reckoning Engine
  useEffect(() => {
    let active = true;

    const physicsLoop = (timeNow) => {
      if (!active) return;
      const dt = Math.min(0.1, (timeNow - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = timeNow;

      const map = mapInstanceRef.current;

      vehiclesMapRef.current.forEach((v) => {
        if (!v.marker) return;

        const timeSincePacket = timeNow - v.lastPacketTime;
        const expectedDuration = Math.max(800, Math.min(3000, v.packetInterval || 1500));

        // --- STEP A: INCH-BY-INCH POSITION INTERPOLATION & SPEED-BASED DEAD RECKONING ---
        if (timeSincePacket <= expectedDuration) {
          // Standard Hermite ease-out / linear interpolation
          const progress = timeSincePacket / expectedDuration;
          v.currentLat = v.fromLat + (v.targetLat - v.fromLat) * progress;
          v.currentLng = v.fromLng + (v.targetLng - v.fromLng) * progress;
          v.isExtrapolating = false;
        } else {
          // Extrapolation / Dead Reckoning (packet is delayed in cellular network; don't freeze vehicle!)
          const overdueMs = timeSincePacket - expectedDuration;
          if (v.targetSpeed > 2 && v.extrapolatedMeters < 35 && overdueMs < 2500) {
            v.isExtrapolating = true;
            // Slight natural deceleration damping factor
            const decay = Math.max(0.65, 1 - (overdueMs / 3000));
            const effectiveSpeed = v.targetSpeed * decay;
            const speedMps = (effectiveSpeed * 1000) / 3600;
            const frameDist = speedMps * dt;

            const rad = (v.currentBearing * Math.PI) / 180;
            const dLat = (frameDist / 6378137) * Math.cos(rad) * (180 / Math.PI);
            const latRad = (v.currentLat * Math.PI) / 180;
            const dLng = (frameDist / (6378137 * Math.cos(latRad))) * Math.sin(rad) * (180 / Math.PI);

            v.currentLat += dLat;
            v.currentLng += dLng;
            v.extrapolatedMeters += frameDist;
          }
        }

        // --- STEP B: SHORTEST-ARC SMOOTH BEARING ROTATION ---
        // Prevents spinning 360 degrees when crossing 0°/360° North
        const diff = ((v.targetBearing - v.currentBearing + 540) % 360) - 180;
        v.currentBearing += diff * Math.min(1, 9 * dt);
        v.currentBearing = (v.currentBearing + 360) % 360;

        // --- STEP C: SMOOTH SPEEDOMETER NUMERICAL INTERPOLATION ---
        v.displaySpeed += (v.targetSpeed - v.displaySpeed) * Math.min(1, 6 * dt);

        // --- STEP D: DIRECT GPU-ACCELERATED DOM UPDATE ---
        v.marker.setLatLng([v.currentLat, v.currentLng]);

        const markerEl = v.marker.getElement();
        if (markerEl) {
          if (!v.rotatorEl) v.rotatorEl = markerEl.querySelector('.bike-rotator-wrapper');
          if (!v.speedEl) v.speedEl = markerEl.querySelector('.driver-pill-speed');

          if (v.rotatorEl) {
            v.rotatorEl.style.transform = `rotate(${Math.round(v.currentBearing)}deg)`;
          }

          if (v.speedEl && v.driverData) {
            const hasLiveRide = v.driverData.lastPlatformRideEvent?.eventType === 'RIDE_ACCEPTED';
            const spd = Math.round(v.displaySpeed);
            if (hasLiveRide) {
              v.speedEl.textContent = `🚖 ${v.driverData.lastPlatformRideEvent.platform || 'TRIP'}`;
            } else if (spd > 0) {
              v.speedEl.textContent = `${spd} km/h`;
            } else if (v.driverData.isCurrentlyOnDuty) {
              v.speedEl.textContent = '🟢 On Duty';
            } else {
              v.speedEl.textContent = 'Idle';
            }
          }
        }

        // --- STEP E: LIVE BREADCRUMB ROUTE TRAIL UPDATE ---
        if (showTrailsRef.current && (timeNow - v.lastTrailAppendTime > 250)) {
          v.lastTrailAppendTime = timeNow;
          const lastPoint = v.trailPoints[v.trailPoints.length - 1];
          if (!lastPoint || getDistanceMeters(lastPoint[0], lastPoint[1], v.currentLat, v.currentLng) >= 2) {
            v.trailPoints.push([v.currentLat, v.currentLng]);
            if (v.trailPoints.length > 25) {
              v.trailPoints.shift();
            }
            if (v.trailPolyline) {
              v.trailPolyline.setLatLngs(v.trailPoints);
            }
          }
        }

        // --- STEP F: SMOOTH AUTO-FOLLOW CAMERA ---
        if (selectedDriver?.id === v.driverId && isFollowModeRef.current && !isUserInteractingRef.current && map) {
          map.panTo([v.currentLat, v.currentLng], { animate: false });
        }
      });

      animationFrameIdRef.current = requestAnimationFrame(physicsLoop);
    };

    animationFrameIdRef.current = requestAnimationFrame(physicsLoop);

    return () => {
      active = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [selectedDriver]);

  // 4. Handle Selected Driver Fly-To
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedDriver) return;
    const map = mapInstanceRef.current;
    map.invalidateSize();

    const loc = selectedDriver.lastKnownLocation;
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      map.setView([loc.latitude, loc.longitude], Math.max(map.getZoom(), 16), { animate: true });
      setTimeout(() => {
        map.invalidateSize();
        map.panTo([loc.latitude, loc.longitude], { animate: true, duration: 0.3 });
        const v = vehiclesMapRef.current.get(selectedDriver.id);
        if (v && v.marker) {
          v.marker.openPopup();
        }
      }, 100);
    }
  }, [selectedDriver]);

  // Recenter / Auto-Fit All Fleet Bikes
  const handleRecenter = () => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const points = [];

    vehiclesMapRef.current.forEach(v => {
      points.push([v.currentLat, v.currentLng]);
    });

    hubs.forEach(h => {
      if (typeof h.latitude === 'number' && typeof h.longitude === 'number') {
        points.push([h.latitude, h.longitude]);
      }
    });

    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [75, 75], maxZoom: 15, animate: true });
    } else if (points.length === 1) {
      map.setView(points[0], 15, { animate: true });
    } else {
      const fallbackLat = hubs.length > 0 && hubs[0].latitude ? hubs[0].latitude : 28.6139;
      const fallbackLng = hubs.length > 0 && hubs[0].longitude ? hubs[0].longitude : 77.2090;
      map.setView([fallbackLat, fallbackLng], 12, { animate: true });
    }
  };

  const activeBikesCount = drivers.filter(d => d.lastKnownLocation?.latitude && d.lastKnownLocation?.longitude).length;
  const movingBikesCount = drivers.filter(d => (d.lastKnownLocation?.speed || 0) > 0).length;

  return (
    <div className="map-container" style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }}></div>

      {/* Floating Modern Fleet Telemetry HUD Controls */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        pointerEvents: 'auto'
      }}>
        {/* Real-time Status Badge */}
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          backdropFilter: 'blur(10px)',
          color: '#10B981',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: '12px',
          fontWeight: 700,
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: movingBikesCount > 0 ? '#10B981' : '#F59E0B',
            display: 'inline-block',
            boxShadow: `0 0 8px ${movingBikesCount > 0 ? '#10B981' : '#F59E0B'}`
          }}></span>
          <span>{activeBikesCount} {activeBikesCount === 1 ? 'Bike' : 'Bikes'} Live ({movingBikesCount} Moving)</span>
        </div>

        {/* Route Trails Toggle Button */}
        <button
          onClick={() => setShowTrails(prev => !prev)}
          style={{
            backgroundColor: showTrails ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.9)',
            color: showTrails ? '#10B981' : '#94A3B8',
            border: `1px solid ${showTrails ? '#10B981' : 'rgba(255, 255, 255, 0.15)'}`,
            backdropFilter: 'blur(8px)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.2s ease'
          }}
          title="Toggle visible street trajectory route trails behind moving bikes"
        >
          <span>🛣️</span>
          <span>Trails: {showTrails ? 'ON' : 'OFF'}</span>
        </button>

        {/* Auto-Follow Selected Bike Toggle Button */}
        {selectedDriver && (
          <button
            onClick={() => setIsFollowMode(prev => !prev)}
            style={{
              backgroundColor: isFollowMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(30, 41, 59, 0.9)',
              color: isFollowMode ? '#60A5FA' : '#94A3B8',
              border: `1px solid ${isFollowMode ? '#3B82F6' : 'rgba(255, 255, 255, 0.15)'}`,
              backdropFilter: 'blur(8px)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.2s ease'
            }}
            title="Toggle smooth camera tracking following selected bike along streets"
          >
            <span>🎥</span>
            <span>Follow: {isFollowMode ? 'ON' : 'OFF'}</span>
          </button>
        )}

        {/* Auto-Fit / Recenter Button */}
        <button
          onClick={handleRecenter}
          style={{
            backgroundColor: '#F59E0B',
            color: '#000',
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.2s ease'
          }}
          title="Auto-Fit map view so all bikes are visible simultaneously"
        >
          🎯 Auto-Fit All Bikes
        </button>
      </div>
    </div>
  );
}
