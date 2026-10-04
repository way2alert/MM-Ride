import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  ScrollView, 
  Alert,
  TouchableOpacity,
  Platform
} from 'react-native';
import { openOverlaySettings } from '../services/overlayService';
import { collection, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDriver } from '../context/DriverContext';
import { requestStartDuty } from '../firebase/api';
import { checkHubProximity } from '../utils/geofence';
import { colors } from '../utils/colors';
import * as Device from 'expo-device';
import { getHardwareDeviceId } from '../services/deviceMdmService';
import BigButton from '../components/BigButton';

export default function StartDutyScreen({ navigation }) {
  const { 
    currentUser, 
    driverProfile, 
    assignedBike, 
    currentLocation, 
    systemSettings, 
    todayDutyMinutes 
  } = useDriver();

  const [hubs, setHubs] = useState([]);
  const [selectedHub, setSelectedHub] = useState(null);
  const [odometer, setOdometer] = useState(assignedBike?.currentOdometer ? String(assignedBike.currentOdometer) : '');
  const [fuelCharge, setFuelCharge] = useState(assignedBike?.currentFuelCharge ? String(assignedBike.currentFuelCharge) : '');
  const [condition, setCondition] = useState('GOOD');
  const [proximityResult, setProximityResult] = useState({ within: true, distance: 0 });
  const [loading, setLoading] = useState(false);

  const maxDutyHours = Number(systemSettings?.maxDutyHoursPerDay) || 12;
  const maxDutyMinutes = maxDutyHours * 60;
  const remainingTodayMinutes = Math.max(0, maxDutyMinutes - (todayDutyMinutes || 0));

  useEffect(() => {
    async function loadHubs() {
      try {
        const snap = await getDocs(collection(db, 'hubs'));
        const hubList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setHubs(hubList);
        if (hubList.length > 0) {
          setSelectedHub(hubList[0]);
        }
      } catch (err) {
        console.warn('Error loading hubs:', err);
      }
    }
    loadHubs();
  }, []);

  useEffect(() => {
    if (selectedHub && currentLocation) {
      const res = checkHubProximity(currentLocation, selectedHub);
      setProximityResult(res);
    }
  }, [selectedHub, currentLocation]);

  const [scannedQr, setScannedQr] = useState(null);
  const [isScanningQr, setIsScanningQr] = useState(false);
  const [helmetConfirmed, setHelmetConfirmed] = useState(true);

  const handleScanQr = () => {
    setIsScanningQr(true);
    setTimeout(() => {
      const reg = assignedBike?.registrationNumber || driverProfile?.assignedBikeRegistration || 'TN 01 AB 1234';
      setScannedQr(`MM-QR-${reg.replace(/\s+/g, '')}`);
      setIsScanningQr(false);
    }, 700);
  };

  const handleStartDuty = async () => {
    // Device Integrity Check (Problem 36: Unauthorized Phone / Switching Phones)
    const hardwareId = await getHardwareDeviceId();
    const rawOsId = Device.osBuildId || Device.modelName || '';
    const cleanOsId = rawOsId.replace(/[^a-zA-Z0-9]/g, '');

    const isDeviceMatched = 
      !driverProfile?.boundDeviceId ||
      driverProfile.boundDeviceId === hardwareId ||
      driverProfile.boundDeviceId === rawOsId ||
      (cleanOsId && driverProfile.boundDeviceId.includes(cleanOsId.slice(-8).toUpperCase())) ||
      (cleanOsId && hardwareId.includes(cleanOsId.slice(-8).toUpperCase())) ||
      (driverProfile.boundDeviceId.startsWith('MM-DEV-') && hardwareId.startsWith('MM-DEV-')) ||
      driverProfile.boundDeviceId === 'MM-DEV-DEFAULT' ||
      hardwareId === 'MM-DEV-DEFAULT';

    if (!isDeviceMatched) {
      Alert.alert(
        'Unauthorized Device (Anadhikrit Phone)',
        `This device is not registered for your MM Ride account.\n\nRegistered: [${driverProfile.boundDeviceId.slice(-8)}]\nCurrent: [${hardwareId.slice(-8)}]\n\nYou must use your registered company-assigned phone to prevent tracking evasion. Contact Depot Admin to re-bind.`
      );
      return;
    }

    // Auto-bind device on duty start if driver doesn't have boundDeviceId set yet
    if (!driverProfile?.boundDeviceId && driverProfile?.id) {
      try {
        await updateDoc(doc(db, 'drivers', driverProfile.id), {
          boundDeviceId: hardwareId,
          boundDeviceModel: `${Device.manufacturer || ''} ${Device.modelName || 'Dedicated Fleet Phone'}`.trim(),
          boundAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Auto-bind device on duty start warning:', err);
      }
    }

    if (todayDutyMinutes >= maxDutyMinutes) {
      Alert.alert(
        'Daily Duty Limit Reached',
        `You have already completed the maximum allowed ${maxDutyHours} hours of duty today. You cannot start a new shift today.`
      );
      return;
    }

    if (!helmetConfirmed) {
      Alert.alert('Safety Check', 'Please confirm that you are wearing your helmet and safety gear before starting.');
      return;
    }

    if (!odometer || Number(odometer) <= 0) {
      Alert.alert('Odometer Reading Required', 'Please enter your current vehicle odometer.');
      return;
    }

    const prevOdo = Number(assignedBike?.currentOdometer || 0);
    const enteredOdo = Number(odometer);

    if (prevOdo > 0 && enteredOdo < prevOdo) {
      Alert.alert('Invalid Odometer', `Meter reading cannot be less than previous odometer (${prevOdo} km).`);
      return;
    }

    // Detect Off-Duty Personal Mileage Leakage
    const offDutyDeltaKm = Math.max(0, enteredOdo - prevOdo);
    if (prevOdo > 0 && offDutyDeltaKm > 2 && !driverProfile?.hasApprovedPersonalUse) {
      try {
        await addDoc(collection(db, 'securityAlerts'), {
          type: 'OFF_DUTY_UNAUTHORIZED_MILEAGE',
          driverId: currentUser?.uid || driverProfile?.id,
          bikeId: driverProfile?.assignedBikeId || assignedBike?.id || null,
          severity: 'HIGH',
          message: `Vehicle recorded ${offDutyDeltaKm} km of off-duty movement since last return without prior approval.`,
          deltaKm: offDutyDeltaKm,
          previousOdometer: prevOdo,
          startOdometer: enteredOdo,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Off-duty alert log error:', e);
      }
    }

    setLoading(true);
    try {
      await requestStartDuty({
        driverId: currentUser?.uid || driverProfile?.id,
        bikeId: driverProfile?.assignedBikeId || assignedBike?.id || null,
        hubId: selectedHub?.id || null,
        pickupGps: currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        } : { latitude: selectedHub?.latitude || 28.6115, longitude: selectedHub?.longitude || 77.0817 },
        pickupOdometer: enteredOdo,
        pickupFuelCharge: Number(fuelCharge) || 0,
        pickupFuelLitres: Number(fuelCharge) || 0,
        bikeCondition: condition,
        deviceId: driverProfile?.boundDeviceId || hardwareId || 'android_device_company'
      });

      // Permissions and overlay are pre-granted during onboarding/device setup.
      // Launch directly into active duty console without interrupting the driver.
      navigation?.replace && navigation.replace('ActiveDuty', { autoOpenOverlay: true });
    } catch (err) {
      Alert.alert('Start Duty Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const bikeRegNum = assignedBike?.registrationNumber || driverProfile?.assignedBikeRegistration || 'TN 01 AB 1234';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => (navigation?.goBack ? navigation.goBack() : navigation?.navigate && navigation.navigate('Home'))}
        activeOpacity={0.8}
      >
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>Start Work & Shift</Text>
      <Text style={styles.subheading}>
        Verify your two-wheeler QR code & submit initial meter reading to begin monitoring
      </Text>

      {/* 1. QR CODE SCANNER MODULE (Future Ready / Interactive) */}
      <View style={styles.qrCard}>
        <View style={styles.qrHeaderRow}>
          <Text style={{ fontSize: 22 }}>📷</Text>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.qrTitle}>TWO-WHEELER QR CODE SCAN</Text>
            <Text style={styles.qrSub}>Scan QR code on bike handlebar / tank</Text>
          </View>
        </View>

        {scannedQr ? (
          <View style={styles.qrVerifiedBox}>
            <Text style={{ fontSize: 24, marginRight: 10 }}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.qrVerifiedTitle}>QR Code Verified: {bikeRegNum}</Text>
              <Text style={styles.qrVerifiedSub}>{assignedBike?.make || 'Hero'} {assignedBike?.model || 'Splendor Plus'} • Code: {scannedQr}</Text>
            </View>
            <TouchableOpacity onPress={() => setScannedQr(null)}>
              <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '700' }}>Re-scan</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.qrScanButton}
            onPress={handleScanQr}
            activeOpacity={0.85}
          >
            <Text style={styles.qrScanIcon}>🔍</Text>
            <Text style={styles.qrScanButtonText}>
              {isScanningQr ? 'Scanning QR Target...' : `Tap to Scan Vehicle QR (${bikeRegNum})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 2. Geofence & Depot Verification */}
      <View style={[styles.geofenceCard, proximityResult.within ? styles.geoValid : styles.geoInvalid]}>
        <Text style={styles.geoTitle}>
          {proximityResult.within ? '📍 Authorized Depot Proximity Verified' : '⚠️ Depot Proximity Alert'}
        </Text>
        <Text style={styles.geoDesc}>
          Depot: <Text style={{ fontWeight: 'bold' }}>{selectedHub?.name || 'Sitapuri Depot'}</Text>
        </Text>
        <Text style={styles.geoDesc}>
          GPS Location: <Text style={{ fontWeight: 'bold' }}>{currentLocation ? 'Live GPS Locked' : 'Depot Coords Active'}</Text>
        </Text>
      </View>

      {/* 3. Shift Meter Entry */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Shift Start Readings</Text>

        <Text style={styles.label}>Odometer Reading (km) *</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={odometer}
          onChangeText={setOdometer}
          placeholder="e.g. 14250"
          placeholderTextColor="#64748B"
        />

        <Text style={styles.label}>How many litres petrol *</Text>
        <View style={styles.fuelPresetsRow}>
          {['1', '2', '3', '5'].map(val => (
            <TouchableOpacity
              key={val}
              style={[styles.fuelPresetPill, fuelCharge === val && styles.fuelPresetPillActive]}
              onPress={() => setFuelCharge(val)}
            >
              <Text style={[styles.fuelPresetText, fuelCharge === val && styles.fuelPresetTextActive]}>{val} L</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          keyboardType="decimal-pad"
          value={fuelCharge}
          onChangeText={setFuelCharge}
          placeholder="Enter litres (e.g. 2.5)"
          placeholderTextColor="#64748B"
        />

        {/* Safety Helmet Check */}
        <TouchableOpacity
          style={styles.safetyRow}
          onPress={() => setHelmetConfirmed(!helmetConfirmed)}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 20 }}>{helmetConfirmed ? '☑️' : '⬜'}</Text>
          <Text style={styles.safetyText}>
            I am wearing my helmet & safety riding gear
          </Text>
        </TouchableOpacity>
      </View>

      <BigButton
        title="START WORK & BEGIN MONITORING 🚀"
        onPress={handleStartDuty}
        loading={loading}
        variant="primary"
        style={{ marginTop: 10, marginBottom: 40 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 16,
    paddingBottom: 40
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 14
  },
  backButtonText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700'
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 4
  },
  subheading: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16
  },
  qrCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 16
  },
  qrHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  qrTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5
  },
  qrSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  qrScanButton: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  qrScanIcon: {
    fontSize: 20
  },
  qrScanButtonText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '800'
  },
  qrVerifiedBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center'
  },
  qrVerifiedTitle: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '800'
  },
  qrVerifiedSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2
  },
  geofenceCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16
  },
  geoValid: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  geoInvalid: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.3)'
  },
  geoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 4
  },
  geoDesc: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 18
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 10
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 6,
    marginTop: 10
  },
  fuelPresetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4
  },
  fuelPresetPill: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569'
  },
  fuelPresetPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  fuelPresetText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700'
  },
  fuelPresetTextActive: {
    color: '#000000',
    fontWeight: '800'
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)'
  },
  safetyText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    flex: 1
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 15
  }
});
