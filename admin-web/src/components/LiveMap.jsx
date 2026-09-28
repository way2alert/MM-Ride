import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { formatDateTime } from '../utils/formatters';

export default function LiveMap({ drivers = [], hubs = [], onSelectDriver = null }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const circlesRef = useRef([]);
  const hasAutoCenteredRef = useRef(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Default center: Chennai operations area (13.0827, 80.2707)
      const initialLat = hubs.length > 0 && hubs[0].latitude ? hubs[0].latitude : 13.0827;
      const initialLng = hubs.length > 0 && hubs[0].longitude ? hubs[0].longitude : 80.2707;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 13,
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
      if (hub.latitude && hub.longitude) {
        boundsPoints.push([hub.latitude, hub.longitude]);
        const circle = L.circle([hub.latitude, hub.longitude], {
          color: '#F59E0B',
          fillColor: '#F59E0B',
          fillOpacity: 0.15,
          weight: 2,
          radius: hub.radiusMeters || 400
        }).addTo(map);

        circle.bindTooltip(`<b>🏢 ${hub.name}</b><br/>Authorized Depot (${hub.radiusMeters || 400}m Geofence)`, {
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

    drivers.forEach(driver => {
      const loc = driver.lastKnownLocation;
      if (!loc || !loc.latitude || !loc.longitude) return;

      boundsPoints.push([loc.latitude, loc.longitude]);

      const now = Date.now();
      const lastPingTime = loc.timestamp ? new Date(loc.timestamp).getTime() : 0;
      const isOutdated = (now - lastPingTime) > (5 * 60 * 1000); // > 5 mins
      const isOverspeed = (loc.speed || 0) > 60;
      const isMoving = (loc.speed || 0) > 0;

      let markerClass = 'driver-marker-inner';
      if (isOverspeed) markerClass += ' overspeed';
      else if (isMoving) markerClass += ' moving';
      else markerClass += ' idle';

      const customIcon = L.divIcon({
        className: 'driver-marker-pulse',
        html: `
          <div class="${markerClass}" style="
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: ${isOverspeed ? '#EF4444' : isMoving ? '#10B981' : '#F59E0B'};
            border: 3px solid #FFFFFF;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            box-shadow: 0 0 16px ${isMoving ? 'rgba(16, 185, 129, 0.8)' : 'rgba(245, 158, 11, 0.6)'};
            transition: all 0.3s ease;
          ">
            🏍️
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const popupContent = `
        <div style="font-family: 'Inter', sans-serif; color: #1e293b; font-size: 12px; min-width: 220px; padding: 2px;">
          <div style="font-weight: 800; font-size: 14px; margin-bottom: 2px; color: #0f172a;">
            ${driver.fullName || 'Driver'}
          </div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 8px;">Mobile: ${driver.mobileNumber || 'N/A'}</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; background: #f8fafc; padding: 4px 6px; borderRadius: 4px;">
            <span style="color: #64748b;">Vehicle:</span>
            <b style="color: #d97706;">${driver.assignedBikeRegistration || 'Assigned Bike'}</b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; padding: 2px 6px;">
            <span style="color: #64748b;">Speed:</span>
            <b style="color: ${isOverspeed ? '#dc2626' : isMoving ? '#16a34a' : '#d97706'}; font-size: 13px;">
              ${loc.speed || 0} km/h ${isMoving ? '⚡ Moving' : '⏸️ Stationary'}
            </b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; padding: 2px 6px;">
            <span style="color: #64748b;">Status:</span>
            <b style="color: ${driver.isCurrentlyOnDuty ? '#16a34a' : '#64748b'};">
              ${driver.isCurrentlyOnDuty ? '🟢 ON ACTIVE DUTY' : '⚪ IDLE'}
            </b>
          </div>
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 11px;">
            ${isOutdated ? 
              '<span style="color: #dc2626; font-weight: 700;">⚠️ Old GPS Ping</span>' : 
              `<span style="color: #16a34a; font-weight: 700;">🟢 Live: ${formatDateTime(loc.timestamp)}</span>`
            }
          </div>
        </div>
      `;

      if (markersRef.current[driver.id]) {
        // Smoothly update existing marker position
        const marker = markersRef.current[driver.id];
        marker.setLatLng([loc.latitude, loc.longitude]);
        marker.setIcon(customIcon);
        marker.getPopup().setContent(popupContent);
      } else {
        // Create new marker
        const marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon }).addTo(map);
        marker.bindPopup(popupContent);
        if (onSelectDriver) {
          marker.on('click', () => onSelectDriver(driver));
        }
        markersRef.current[driver.id] = marker;
      }
    });

    // Auto-fit bounds on initial load or when drivers are present
    if (boundsPoints.length > 0 && !hasAutoCenteredRef.current) {
      if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 14);
      } else {
        map.fitBounds(boundsPoints, { padding: [50, 50], maxZoom: 15 });
      }
      hasAutoCenteredRef.current = true;
    }

  }, [drivers, hubs]);

  const handleRecenter = () => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const points = [];
    hubs.forEach(h => { if (h.latitude && h.longitude) points.push([h.latitude, h.longitude]); });
    drivers.forEach(d => {
      if (d.lastKnownLocation?.latitude && d.lastKnownLocation?.longitude) {
        points.push([d.lastKnownLocation.latitude, d.lastKnownLocation.longitude]);
      }
    });

    if (points.length === 1) {
      map.setView(points[0], 14);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [60, 60], maxZoom: 15 });
    } else {
      map.setView([13.0827, 80.2707], 13);
    }
  };

  return (
    <div className="map-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }}></div>
      <button
        onClick={handleRecenter}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          zIndex: 1000,
          backgroundColor: '#1E293B',
          color: '#F8FAFC',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        🎯 Focus Fleet & Hubs
      </button>
    </div>
  );
}
