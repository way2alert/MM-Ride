import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Animated,
  Dimensions,
  Platform,
  Alert
} from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../utils/colors';

const { width, height } = Dimensions.get('window');

/**
 * Calculate Haversine distance in kilometers between two GPS coordinates
 */
function getHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Calculate compass bearing in degrees from start point to destination
 */
function getBearingDegrees(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const radLat1 = lat1 * (Math.PI / 180);
  const radLat2 = lat2 * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const y = Math.sin(dLon) * Math.cos(radLat2);
  const x =
    Math.cos(radLat1) * Math.sin(radLat2) -
    Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
}

export default function InAppNavigationModal({
  visible,
  onClose,
  hub,
  bike,
  currentLocation,
  currentSpeed = 0,
  onArrivedAtDepot
}) {
  const webViewRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pickup target coordinates (Depot or Host Location)
  const hubLat = hub?.pickupLatitude || hub?.latitude || 28.611529;
  const hubLng = hub?.pickupLongitude || hub?.longitude || 77.081742;
  const hubName = hub?.providerName || hub?.name || 'Sitapuri Operations Hub';
  const hubAddress = hub?.pickupAddress || hub?.address || 'Gali Number 3, Sitapuri, New Delhi';
  const managerPhone = hub?.providerPhone || hub?.managerContact || '+91 9876543210';

  // Driver GPS coords (defaults to current real coordinates if available)
  const driverLat = currentLocation?.latitude || 28.6116;
  const driverLng = currentLocation?.longitude || 77.0818;

  const distanceKm = getHaversineDistanceKm(driverLat, driverLng, hubLat, hubLng);
  // Estimate ETA based on 25 km/h urban two-wheeler speed
  const etaMinutes = Math.max(1, Math.round((distanceKm / 25) * 60));
  const bearing = getBearingDegrees(driverLat, driverLng, hubLat, hubLng);

  // Pulse animation for HUD beacon
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 900,
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true
        })
      ])
    ).start();
  }, [pulseAnim]);

  // Open native voice turn-by-turn navigation via Google Maps (ZERO API KEY REQUIRED!)
  const handleOpenGoogleVoiceMaps = () => {
    const lat = hubLat;
    const lng = hubLng;
    const label = encodeURIComponent(hubName);

    if (Platform.OS === 'android') {
      // Android Intent launches Google Maps directly in turn-by-turn voice drive mode
      const navUrl = `google.navigation:q=${lat},${lng}&mode=d`;
      Linking.canOpenURL(navUrl)
        .then((supported) => {
          if (supported) {
            return Linking.openURL(navUrl);
          } else {
            return Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
          }
        })
        .catch(() => {
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
        });
    } else {
      // iOS / Web fallback
      const iosUrl = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
      Linking.canOpenURL(iosUrl)
        .then((supported) => {
          if (supported) {
            return Linking.openURL(iosUrl);
          } else {
            return Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
          }
        })
        .catch(() => {
          Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
        });
    }
  };

  const handleCallManager = () => {
    if (!managerPhone) return;
    const cleanNumber = managerPhone.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${cleanNumber}`).catch(() => {
      Alert.alert('Contact Depot', `Call hub manager at: ${managerPhone}`);
    });
  };

  // Generate lightweight, responsive Leaflet Map HTML (NO API KEY REQUIRED, 100% Free OpenStreetMap)
  const mapHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body, html { width: 100%; height: 100%; background: #0F172A; overflow: hidden; }
          #map { width: 100%; height: 100%; background: #0F172A; }
          
          .driver-beacon {
            width: 22px;
            height: 22px;
            background: #10B981;
            border: 3px solid #FFFFFF;
            border-radius: 50%;
            box-shadow: 0 0 16px #10B981, 0 0 30px rgba(16, 185, 129, 0.6);
            animation: pulse-ring 1.8s infinite;
          }
          @keyframes pulse-ring {
            0% { transform: scale(0.9); opacity: 1; }
            50% { transform: scale(1.3); opacity: 0.8; }
            100% { transform: scale(0.9); opacity: 1; }
          }
          
          .hub-pin {
            width: 32px;
            height: 32px;
            background: #F59E0B;
            border: 3px solid #FFFFFF;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 0 20px #F59E0B;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .hub-pin-inner {
            transform: rotate(45deg);
            font-size: 14px;
            color: #000;
            font-weight: 900;
          }
          
          .leaflet-popup-content-wrapper {
            background: #1E293B;
            color: #F8FAFC;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 10px;
            font-family: sans-serif;
          }
          .leaflet-popup-tip {
            background: #1E293B;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const driverLat = ${driverLat};
          const driverLng = ${driverLng};
          const hubLat = ${hubLat};
          const hubLng = ${hubLng};
          const hubName = "${hubName.replace(/"/g, '\\"')}";

          const map = L.map('map', {
            zoomControl: false,
            attributionControl: false
          }).setView([${(driverLat + hubLat) / 2}, ${(driverLng + hubLng) / 2}], 13);

          // Clean OpenStreetMap tiles (100% Free, Zero API Key, Zero watermark)
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
          }).addTo(map);

          // Hub Marker
          const hubIcon = L.divIcon({
            className: 'custom-hub-icon',
            html: '<div class="hub-pin"><span class="hub-pin-inner">🏢</span></div>',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          });
          const hubMarker = L.marker([hubLat, hubLng], { icon: hubIcon }).addTo(map);
          hubMarker.bindPopup('<b>' + hubName + '</b><br>Vehicle Depot').openPopup();

          // Driver Location Marker
          const driverIcon = L.divIcon({
            className: 'custom-driver-icon',
            html: '<div class="driver-beacon"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          });
          const driverMarker = L.marker([driverLat, driverLng], { icon: driverIcon }).addTo(map);
          driverMarker.bindPopup('<b>Your Live Position</b><br>Riding to Depot');

          // Route Polyline
          const routeLine = L.polyline([
            [driverLat, driverLng],
            [hubLat, hubLng]
          ], {
            color: '#F59E0B',
            weight: 4,
            opacity: 0.85,
            dashArray: '8, 8',
            lineJoin: 'round'
          }).addTo(map);

          // Fit both pins neatly in viewport
          const bounds = L.latLngBounds([
            [driverLat, driverLng],
            [hubLat, hubLng]
          ]);
          map.fitBounds(bounds, { padding: [50, 50] });
        </script>
      </body>
    </html>
  `;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* TOP HUD: Turn-by-Turn Guidance & Telemetry Bar */}
        <View style={styles.topHudContainer}>
          <View style={styles.topHudRow}>
            {/* Compass / Direction Arrow */}
            <View style={styles.compassBox}>
              <Text style={{ fontSize: 24, transform: [{ rotate: `${bearing}deg` }] }}>
                ⬆️
              </Text>
            </View>

            {/* Maneuver & Destination Guidance */}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.maneuverText}>Head to Depot Hub</Text>
              <Text style={styles.destinationStreetText} numberOfLines={1}>
                {hubAddress}
              </Text>
            </View>

            {/* Close Button */}
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Metrics Bar (Distance, ETA, Speed) */}
          <View style={styles.metricsRow}>
            <View style={styles.metricBadge}>
              <Text style={styles.metricLabel}>DISTANCE</Text>
              <Text style={styles.metricValue}>{distanceKm} km</Text>
            </View>

            <View style={styles.metricBadge}>
              <Text style={styles.metricLabel}>EST. TIME</Text>
              <Text style={[styles.metricValue, { color: '#F59E0B' }]}>{etaMinutes} min</Text>
            </View>

            <View style={styles.metricBadge}>
              <Text style={styles.metricLabel}>SPEED</Text>
              <Text style={[styles.metricValue, { color: '#34D399' }]}>
                {currentSpeed > 0 ? `${currentSpeed} km/h` : 'LIVE GPS'}
              </Text>
            </View>
          </View>
        </View>

        {/* SCROLLABLE BODY */}
        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* CENTER: Interactive In-App Leaflet Map */}
          <View style={styles.mapWrapper}>
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{ html: mapHtml }}
              style={styles.webView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              scrollEnabled={false}
              bounces={false}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.mapLoadingOverlay}>
                  <ActivityIndicator size="small" color="#10B981" />
                  <Text style={styles.mapLoadingText}>Loading Map GPS...</Text>
                </View>
              )}
            />

            {/* Live Floating Status Pill on Map */}
            <View style={styles.floatingGpsPill}>
              <Animated.View style={[styles.glowingDot, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={styles.floatingGpsText}>
                In-App Live Navigation (Live GPS)
              </Text>
            </View>
          </View>

          {/* Depot Details & Google Navigation Card */}
          <View style={styles.hubDetailsCard}>
            <View style={styles.hubDetailsRow}>
              <View style={styles.hubIconCircle}>
                <Text style={{ fontSize: 22 }}>🏢</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.hubTitle}>{hubName}</Text>
                <Text style={styles.hubSubText}>
                  {hubAddress}
                </Text>
                {bike?.registrationNumber && (
                  <Text style={styles.bikePillText}>
                    🏍️ Vehicle Ready: <Text style={{ color: '#F59E0B', fontWeight: 'bold' }}>{bike.registrationNumber}</Text>
                  </Text>
                )}
              </View>
            </View>

            {/* Google Maps Voice Navigation */}
            <TouchableOpacity
              style={styles.voiceNavButton}
              onPress={handleOpenGoogleVoiceMaps}
              activeOpacity={0.85}
            >
              <Text style={styles.voiceNavButtonIcon}>🧭</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.voiceNavButtonTitle}>Turn-by-Turn Voice Navigation</Text>
                <Text style={styles.voiceNavButtonSub}>Launch Google Maps spoken directions</Text>
              </View>
              <Text style={{ fontSize: 18, color: '#000' }}>→</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* STICKY BOTTOM ACTION FOOTER (ALWAYS VISIBLE & RESPONSIVE) */}
        <View style={styles.stickyBottomFooter}>
          <TouchableOpacity
            style={styles.callManagerButton}
            onPress={handleCallManager}
            activeOpacity={0.8}
          >
            <Text style={styles.callButtonText}>📞 Call Hub</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.arrivedButton}
            onPress={() => {
              onClose();
              if (onArrivedAtDepot) onArrivedAtDepot();
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.arrivedButtonText}>Arrived at Depot 🏁</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  topHudContainer: {
    backgroundColor: '#1E293B',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 10
  },
  topHudRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  compassBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569'
  },
  maneuverText: {
    color: '#34D399',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  destinationStreetText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeButtonText: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700'
  },
  metricsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8
  },
  metricBadge: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2
  },
  scrollBody: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 24
  },
  mapWrapper: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
    marginBottom: 14,
    backgroundColor: '#0F172A'
  },
  webView: {
    flex: 1,
    backgroundColor: '#0F172A'
  },
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center'
  },
  mapLoadingText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600'
  },
  floatingGpsPill: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  glowingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 8
  },
  floatingGpsText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600'
  },
  hubDetailsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  hubDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  hubIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  hubTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700'
  },
  hubSubText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2
  },
  bikePillText: {
    color: '#E2E8F0',
    fontSize: 12,
    marginTop: 4
  },
  voiceNavButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 4
  },
  voiceNavButtonIcon: {
    fontSize: 22,
    marginRight: 12
  },
  voiceNavButtonTitle: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800'
  },
  voiceNavButtonSub: {
    color: '#78350F',
    fontSize: 11,
    fontWeight: '600'
  },
  stickyBottomFooter: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 24 : 34,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    gap: 12,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 8
  },
  callManagerButton: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569'
  },
  callButtonText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700'
  },
  arrivedButton: {
    flex: 1.5,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4
  },
  arrivedButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800'
  }
});
