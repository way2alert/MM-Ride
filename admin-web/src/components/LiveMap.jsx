import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { formatDateTime } from '../utils/formatters';

export default function LiveMap({ drivers = [], hubs = [], selectedDriver = null, onSelectDriver = null }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const circlesRef = useRef([]);
  const hasAutoCenteredRef = useRef(false);
  const lastDriversHashRef = useRef('');

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Default center: Delhi NCR operations area
      const initialLat = hubs.length > 0 && hubs[0].latitude ? hubs[0].latitude : 28.6139;
      const initialLng = hubs.length > 0 && hubs[0].longitude ? hubs[0].longitude : 77.2090;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 12,
        zoomControl: true
      });

      // Official OpenStreetMap tiles (100% Free, Zero API Key, No watermark)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Draw Hub Geofence Circles
    circlesRef.current.forEach(c => map.removeLayer(c));
    circlesRef.current = [];

    const boundsPoints = [];

    hubs.forEach(hub => {
      if (typeof hub.latitude === 'number' && typeof hub.longitude === 'number') {
        boundsPoints.push([hub.latitude, hub.longitude]);
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

    // Update Driver Markers
    const activeDriverIds = new Set(drivers.map(d => d.id));
    Object.keys(markersRef.current).forEach(id => {
      if (!activeDriverIds.has(id)) {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });

    const driversWithCoords = [];

    drivers.forEach(driver => {
      const loc = driver.lastKnownLocation;
      if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return;

      driversWithCoords.push(driver);
      boundsPoints.push([loc.latitude, loc.longitude]);

      const now = Date.now();
      const lastPingTime = loc.timestamp ? new Date(loc.timestamp).getTime() : 0;
      const isOutdated = lastPingTime > 0 && (now - lastPingTime) > (5 * 60 * 1000); // > 5 mins
      const speed = Math.max(0, Math.round(loc.speed || 0));
      const isOverspeed = speed > 60;
      const isMoving = speed > 0;

      const driverName = driver.fullName || 'Driver';
      const speedText = isMoving ? `${speed} km/h` : 'Idle';
      const pillClass = isOverspeed ? 'pill-overspeed' : isMoving ? 'pill-moving' : 'pill-idle';
      const bikeClass = isOverspeed ? 'bike-overspeed' : isMoving ? 'bike-moving' : 'bike-idle';

      // Custom Floating Tag Marker: Prominently shows driver's name on top of the bike
      const customIcon = L.divIcon({
        className: 'driver-marker-wrapper',
        html: `
          <div class="driver-marker-container">
            <div class="driver-name-pill ${pillClass}">
              <span class="status-pulse-dot"></span>
              <span class="driver-pill-name" title="${driverName}">${driverName}</span>
              <span class="driver-pill-speed">${speedText}</span>
            </div>
            <div class="bike-avatar-circle ${bikeClass}">
              🏍️
            </div>
            <div class="bike-marker-pointer"></div>
          </div>
        `,
        iconSize: [140, 72],
        iconAnchor: [70, 71],
        popupAnchor: [0, -70]
      });

      const popupContent = `
        <div style="font-family: 'Inter', sans-serif; color: #1e293b; font-size: 12px; min-width: 230px; padding: 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <div style="font-weight: 800; font-size: 15px; color: #0f172a;">
              ${driverName}
            </div>
            <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 700; background: ${isMoving ? '#dcfce7; color: #166534;' : '#fef3c7; color: #92400e;'}">
              ${isMoving ? '⚡ MOVING' : '⏸️ STATIONARY'}
            </span>
          </div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 8px;">Mobile: <b>${driver.mobileNumber || 'N/A'}</b></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; background: #f8fafc; padding: 4px 8px; border-radius: 4px;">
            <span style="color: #64748b;">Assigned Vehicle:</span>
            <b style="color: #d97706;">${driver.assignedBikeRegistration || 'BIKE'}</b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; padding: 2px 6px;">
            <span style="color: #64748b;">Live Speed:</span>
            <b style="color: ${isOverspeed ? '#dc2626' : isMoving ? '#16a34a' : '#d97706'}; font-size: 13px;">
              ${speed} km/h
            </b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; padding: 2px 6px;">
            <span style="color: #64748b;">Duty Status:</span>
            <b style="color: ${driver.isCurrentlyOnDuty ? '#16a34a' : '#64748b'};">
              ${driver.isCurrentlyOnDuty ? '🟢 ON DUTY' : '⚪ OFF DUTY'}
            </b>
          </div>
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 11px;">
            ${isOutdated ? 
              '<span style="color: #dc2626; font-weight: 700;">⚠️ Old GPS Ping</span>' : 
              `<span style="color: #16a34a; font-weight: 700;">🟢 Live Ping: ${formatDateTime(loc.timestamp)}</span>`
            }
          </div>
        </div>
      `;

      const onMarkerClick = () => {
        map.invalidateSize();
        map.setView([loc.latitude, loc.longitude], Math.max(map.getZoom(), 15), { animate: true });
        setTimeout(() => {
          map.invalidateSize();
          map.panTo([loc.latitude, loc.longitude], { animate: true, duration: 0.3 });
        }, 100);
        if (onSelectDriver) {
          onSelectDriver(driver);
        }
      };

      if (markersRef.current[driver.id]) {
        // Smoothly update existing marker position
        const marker = markersRef.current[driver.id];
        marker.setLatLng([loc.latitude, loc.longitude]);
        marker.setIcon(customIcon);
        marker.getPopup().setContent(popupContent);
        marker.off('click').on('click', onMarkerClick);
      } else {
        // Create new marker
        const marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon }).addTo(map);
        marker.bindPopup(popupContent);
        marker.on('click', onMarkerClick);
        markersRef.current[driver.id] = marker;
      }
    });

    // Auto-fit default viewport covering ALL bikes (e.g. Manivel in New Delhi & driver in Uttam Nagar)
    const driversHash = driversWithCoords.map(d => `${d.id}_${d.lastKnownLocation?.latitude?.toFixed(4)}_${d.lastKnownLocation?.longitude?.toFixed(4)}`).sort().join('|');

    if (boundsPoints.length > 0) {
      const isInitialFit = !hasAutoCenteredRef.current;
      const hasDriversChanged = lastDriversHashRef.current !== driversHash && driversWithCoords.length > 0;

      if (isInitialFit || hasDriversChanged) {
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
        lastDriversHashRef.current = driversHash;
      }
    }

  }, [drivers, hubs]);

  // Handle selected driver centering & fly-to
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    map.invalidateSize();

    if (!selectedDriver) return;
    const loc = selectedDriver.lastKnownLocation;
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      map.setView([loc.latitude, loc.longitude], Math.max(map.getZoom(), 15), { animate: true });
      setTimeout(() => {
        map.invalidateSize();
        map.panTo([loc.latitude, loc.longitude], { animate: true, duration: 0.3 });
        if (markersRef.current[selectedDriver.id]) {
          markersRef.current[selectedDriver.id].openPopup();
        }
      }, 100);
    }
  }, [selectedDriver]);

  const handleRecenter = () => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const points = [];
    drivers.forEach(d => {
      if (typeof d.lastKnownLocation?.latitude === 'number' && typeof d.lastKnownLocation?.longitude === 'number') {
        points.push([d.lastKnownLocation.latitude, d.lastKnownLocation.longitude]);
      }
    });
    hubs.forEach(h => { 
      if (typeof h.latitude === 'number' && typeof h.longitude === 'number') {
        points.push([h.latitude, h.longitude]); 
      }
    });

    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [75, 75], maxZoom: 15, animate: true });
    } else if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
    } else {
      const fallbackLat = hubs.length > 0 && hubs[0].latitude ? hubs[0].latitude : 28.6139;
      const fallbackLng = hubs.length > 0 && hubs[0].longitude ? hubs[0].longitude : 77.2090;
      map.setView([fallbackLat, fallbackLng], 12, { animate: true });
    }
  };

  const activeBikesCount = drivers.filter(d => d.lastKnownLocation?.latitude && d.lastKnownLocation?.longitude).length;

  return (
    <div className="map-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }}></div>

      {/* Floating Status Pill & Auto-Fit Control */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(8px)',
          color: '#10B981',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: '12px',
          fontWeight: 700,
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', display: 'inline-block', boxShadow: '0 0 8px #10B981' }}></span>
          <span>{activeBikesCount} {activeBikesCount === 1 ? 'Bike' : 'Bikes'} Live on Map</span>
        </div>

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
          🎯 Auto-Fit All Bikes (Cover All)
        </button>
      </div>
    </div>
  );
}
