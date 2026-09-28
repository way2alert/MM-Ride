import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  TextInput,
  Modal,
  Image,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, where, getDocs, updateDoc, doc, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDriver } from '../context/DriverContext';
import { colors } from '../utils/colors';
import { logGpsBreadcrumb, uploadVerificationSelfie, confirmIdentityChallenge } from '../firebase/api';
import Header from '../components/Header';
import BigButton from '../components/BigButton';

export default function ActiveDutyScreen({ navigation }) {
  const { 
    driverProfile, 
    assignedBike, 
    activeDutySession, 
    currentLocation, 
    currentSpeed,
    systemSettings,
    todayDutyMinutes 
  } = useDriver();

  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [idleAlertDoc, setIdleAlertDoc] = useState(null);
  const [idleReasonText, setIdleReasonText] = useState('');
  const [submittingReason, setSubmittingReason] = useState(false);
  const [isSimulatingMovement, setIsSimulatingMovement] = useState(false);
  const [simStep, setSimStep] = useState(0);

  // In-Shift Live Face / Selfie Verification State
  const [identityPrompt, setIdentityPrompt] = useState(null);
  const [selfieUri, setSelfieUri] = useState(null);
  const [countdown, setCountdown] = useState(90);
  const [submittingSelfie, setSubmittingSelfie] = useState(false);

  // Continuous Live GPS Heartbeat & Test Ride Movement Telemetry
  useEffect(() => {
    if (!driverProfile?.id || !activeDutySession?.id) return;

    const baseLat = currentLocation?.latitude || 13.0827;
    const baseLng = currentLocation?.longitude || 80.2707;

    const timer = setInterval(async () => {
      let lat = baseLat;
      let lng = baseLng;
      let speed = currentSpeed || 0;

      if (isSimulatingMovement) {
        setSimStep(prev => prev + 1);
        const offset = (simStep % 50) * 0.0005;
        lat = 13.0827 + offset;
        lng = 80.2707 + (offset * 0.7);
        speed = 28 + Math.floor(Math.abs(Math.sin(simStep)) * 8);
      }

      try {
        await logGpsBreadcrumb({
          driverId: driverProfile.id,
          dutyId: activeDutySession.id,
          latitude: lat,
          longitude: lng,
          speed,
          isMock: isSimulatingMovement,
          deviceId: 'android_telemetry_live'
        });
      } catch (err) {
        // silent
      }
    }, 6000);

    return () => clearInterval(timer);
  }, [driverProfile?.id, activeDutySession?.id, isSimulatingMovement, simStep, currentLocation, currentSpeed]);

  // Calculate duty elapsed time from server startTime
  useEffect(() => {
    if (!activeDutySession?.startTime) return;

    const interval = setInterval(() => {
      const startMs = new Date(activeDutySession.startTime).getTime();
      const diffMins = Math.floor((Date.now() - startMs) / (1000 * 60));
      setElapsedMinutes(diffMins);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeDutySession?.startTime]);

  // Check for active idle alert for this driver
  useEffect(() => {
    async function checkIdleAlerts() {
      if (!driverProfile?.id) return;
      try {
        const snap = await getDocs(
          query(
            collection(db, 'idleAlerts'),
            where('driverId', '==', driverProfile.id),
            where('status', '==', 'PENDING_DRIVER_REASON')
          )
        );
        if (!snap.empty) {
          setIdleAlertDoc({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
          setIdleAlertDoc(null);
        }
      } catch (err) {
        // silent
      }
    }

    const idleTimer = setInterval(checkIdleAlerts, 15000);
    checkIdleAlerts();

    return () => clearInterval(idleTimer);
  }, [driverProfile?.id]);

  // Listen for Live Identity / Selfie Challenges triggered by Admin or Policy
  useEffect(() => {
    if (!driverProfile?.id) return;
    const unsub = onSnapshot(doc(db, 'drivers', driverProfile.id), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.pendingVerification && d.pendingVerification.status === 'PENDING') {
          setIdentityPrompt(d.pendingVerification);
          setCountdown(d.pendingVerification.timeoutSeconds || 90);
        } else {
          setIdentityPrompt(null);
          setSelfieUri(null);
        }
      }
    });
    return () => unsub();
  }, [driverProfile?.id]);

  // Countdown timer for identity challenge
  useEffect(() => {
    if (!identityPrompt) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleChallengeTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [identityPrompt]);

  const handleCaptureSelfie = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Front camera permission is required for identity verification.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        quality: 0.6
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setSelfieUri(res.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    }
  };

  const handleSubmitSelfie = async () => {
    if (!selfieUri) {
      Alert.alert('Selfie Required', 'Please take your front-camera face selfie first.');
      return;
    }
    setSubmittingSelfie(true);
    try {
      const url = await uploadVerificationSelfie({
        driverId: driverProfile.id,
        dutyId: activeDutySession?.id,
        uri: selfieUri
      });
      await confirmIdentityChallenge({
        driverId: driverProfile.id,
        dutyId: activeDutySession?.id,
        photoUrl: url,
        gps: currentLocation
      });
      setIdentityPrompt(null);
      setSelfieUri(null);
      Alert.alert('Verified! ✅', 'Your face identity has been confirmed. You may continue your shift.');
    } catch (err) {
      Alert.alert('Upload Error', err.message);
    } finally {
      setSubmittingSelfie(false);
    }
  };

  const handleChallengeTimeout = async () => {
    try {
      if (driverProfile?.id) {
        await updateDoc(doc(db, 'drivers', driverProfile.id), {
          pendingVerification: null,
          accountStatus: 'SUSPENDED',
          suspensionReason: 'MISSED_LIVE_FACE_CHALLENGE'
        });
        await addDoc(collection(db, 'securityAlerts'), {
          type: 'DRIVER_IDENTITY_CHALLENGE_FAILED',
          driverId: driverProfile.id,
          dutyId: activeDutySession?.id || null,
          severity: 'CRITICAL',
          message: 'Driver failed to complete live selfie verification within time limit.',
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('Timeout action failed:', e);
    }
    Alert.alert(
      'Shift Locked ⚠️',
      'Face verification was not completed within the time limit. Your shift has been locked. Contact Depot Owner.'
    );
  };

  const handleSendIdleReason = async () => {
    if (!idleReasonText.trim()) {
      Alert.alert('Reason Required', 'Please enter your reason for remaining stationary.');
      return;
    }
    setSubmittingReason(true);
    try {
      if (idleAlertDoc?.id) {
        await updateDoc(doc(db, 'idleAlerts', idleAlertDoc.id), {
          driverReason: idleReasonText,
          status: 'REASON_SUBMITTED',
          reasonSubmittedAt: new Date().toISOString()
        });
      }
      setIdleAlertDoc(null);
      setIdleReasonText('');
      Alert.alert('Reason Submitted', 'Your status explanation has been sent to Operations.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmittingReason(false);
    }
  };

  const speedLimit = Number(systemSettings?.speedAlertThresholdKmh) || 60;
  const maxDutyHours = Number(systemSettings?.maxDutyHoursPerDay) || 12;
  const maxDutyMinutes = maxDutyHours * 60;
  
  // Total cumulative duty today (past shifts today + current active shift)
  const totalTodayMinutes = (todayDutyMinutes || 0) + elapsedMinutes;
  const remainingTodayMinutes = Math.max(0, maxDutyMinutes - totalTodayMinutes);
  const isNearLimit = totalTodayMinutes >= ((maxDutyHours - 1) * 60); // 1 hr warning before max
  const isLimitReached = totalTodayMinutes >= maxDutyMinutes;
  const isOverspeed = currentSpeed > speedLimit;

  return (
    <View style={styles.screen}>
      <Header
        title="ON DUTY – ACTIVE SHIFT"
        subtitle={`Bike: ${assignedBike?.registrationNumber || driverProfile?.assignedBikeRegistration || 'Vehicle'}`}
        onSosPress={() => navigation?.navigate && navigation.navigate('EmergencySOS')}
        onProfilePress={() => navigation?.navigate && navigation.navigate('Profile')}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Speedometer & Live Telemetry Gauge */}
        <View style={[styles.speedCard, isOverspeed && styles.speedCardAlert]}>
          <Text style={styles.speedLabel}>LIVE GPS SPEED (Raftar)</Text>
          <View style={styles.speedValueRow}>
            <Text style={[styles.speedValue, isOverspeed && styles.speedAlertText]}>
              {currentSpeed}
            </Text>
            <Text style={styles.speedUnit}>KM/H</Text>
          </View>
          <Text style={[styles.speedSub, isOverspeed ? styles.speedAlertText : styles.speedOkText]}>
            {isOverspeed
              ? `⚠️ SPEED LIMIT EXCEEDED (Max: ${speedLimit} km/h). Kripya dheere chalayein!`
              : `🟢 Within Safe Speed Limit (${speedLimit} km/h) • Safe riding`}
          </Text>
        </View>

        {/* 12-Hour Duty Duration HUD */}
        <View style={[styles.timerCard, (isLimitReached || isNearLimit) && styles.timerNearLimit]}>
          <Text style={styles.timerLabel}>CURRENT SHIFT DURATION (Shift Samay)</Text>
          <Text style={styles.timerValue}>
            {Math.floor(elapsedMinutes / 60)}h {elapsedMinutes % 60}m
          </Text>
          <Text style={styles.timerSub}>
            Daily Cumulative: {Math.floor(totalTodayMinutes / 60)}h {totalTodayMinutes % 60}m / Max {maxDutyHours} Hours
          </Text>
          {isLimitReached ? (
            <View style={[styles.limitWarningBadge, { backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.5)' }]}>
              <Text style={[styles.limitWarningText, { color: '#F87171' }]}>
                🛑 MAXIMUM DAILY DUTY OF {maxDutyHours} HOURS REACHED. Kripya turant depot laut kar duty samapt karein.
              </Text>
            </View>
          ) : isNearLimit ? (
            <View style={styles.limitWarningBadge}>
              <Text style={styles.limitWarningText}>
                ⚠️ Approaching {maxDutyHours}-Hour Daily Limit ({remainingTodayMinutes}m remaining). Kripya jald depot laut kar duty samapt karein.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Shift Metrics */}
        <View style={styles.statsRow}>
          <View style={styles.miniCard}>
            <Text style={styles.miniLabel}>PICKUP ODOMETER</Text>
            <Text style={styles.miniVal}>{activeDutySession?.pickupOdometer || '—'} km</Text>
          </View>
          <View style={styles.miniCard}>
            <Text style={styles.miniLabel}>START TIME</Text>
            <Text style={styles.miniVal}>
              {activeDutySession?.startTime ? new Date(activeDutySession.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
            </Text>
          </View>
        </View>

        {/* Live Fleet Telemetry & Ride Movement Simulation */}
        <View style={styles.telemetryCard}>
          <View style={styles.telemetryHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={[styles.pulseDot, isSimulatingMovement ? styles.pulseDotActive : styles.pulseDotIdle]} />
              <Text style={styles.telemetryTitle} numberOfLines={1}>
                {isSimulatingMovement ? 'RIDE ACTIVE (Moving Live)' : 'LIVE GPS TRANSMITTING'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.simButton, isSimulatingMovement && styles.simButtonActive]}
              onPress={() => setIsSimulatingMovement(!isSimulatingMovement)}
              activeOpacity={0.8}
            >
              <Text style={[styles.simButtonText, isSimulatingMovement && styles.simButtonTextActive]}>
                {isSimulatingMovement ? '⏹️ Stop' : '🏍️ Test Ride'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.telemetrySub}>
            Location & speed are broadcast to Admin Live Monitoring every 6 seconds.
          </Text>
        </View>

        {/* Primary Controls */}
        <View style={styles.controlsSection}>
          <BigButton
            title="Take a Break (Break Lein) ⏸️"
            onPress={() => navigation?.navigate && navigation.navigate('Break')}
            variant="secondary"
            style={{ marginBottom: 12 }}
          />

          <BigButton
            title="Return Bike / End Duty (Shift Khatam Karein) 🏁"
            onPress={() => navigation?.navigate && navigation.navigate('EndDuty')}
            variant="primary"
            style={{ marginBottom: 12 }}
          />

          <BigButton
            title="EMERGENCY SOS 🚨"
            onPress={() => navigation?.navigate && navigation.navigate('EmergencySOS')}
            variant="danger"
          />
        </View>
      </ScrollView>

      {/* 30-Minute Idle Alert Modal */}
      <Modal
        visible={!!idleAlertDoc}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.idleEmoji}>⚠️</Text>
            <Text style={styles.idleTitle}>Stationary Idle Alert</Text>
            <Text style={styles.idleTitleHindi}>(Aap 30 min se ruke hue hain)</Text>
            <Text style={styles.idleMessage}>
              You have been inactive / stationary for over 30 minutes. Please enter your reason for Operations record.
            </Text>

            <TextInput
              style={styles.idleInput}
              placeholder="e.g. Waiting for ride, tyre puncture, customer delay..."
              placeholderTextColor={colors.textMuted}
              value={idleReasonText}
              onChangeText={setIdleReasonText}
            />

            <BigButton
              title="Submit Reason to Operations"
              onPress={handleSendIdleReason}
              loading={submittingReason}
              variant="primary"
              style={{ marginTop: 12, width: '100%' }}
            />
          </View>
        </View>
      </Modal>

      {/* Live In-Shift Face Verification Modal */}
      <Modal
        visible={!!identityPrompt}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { borderColor: colors.primary, borderWidth: 2 }]}>
            <Text style={styles.idleEmoji}>📸</Text>
            <Text style={[styles.idleTitle, { color: colors.primaryLight }]}>
              Live Face Verification Required
            </Text>
            <Text style={styles.idleTitleHindi}>
              (நேரடி முக சரிபார்ப்பு கட்டாயம்)
            </Text>
            <Text style={styles.idleMessage}>
              Depot security requires periodic face verification to ensure the registered driver is operating the vehicle.
            </Text>

            <View style={{
              backgroundColor: countdown <= 20 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.15)',
              padding: 8,
              borderRadius: 8,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: countdown <= 20 ? colors.danger : colors.warning
            }}>
              <Text style={{
                color: countdown <= 20 ? '#F87171' : colors.primaryLight,
                fontWeight: 'bold',
                textAlign: 'center',
                fontSize: 13
              }}>
                ⏳ Time Remaining: {countdown} seconds
              </Text>
            </View>

            {selfieUri ? (
              <View style={{ alignItems: 'center', marginBottom: 14 }}>
                <Image
                  source={{ uri: selfieUri }}
                  style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: colors.success }}
                />
                <TouchableOpacity
                  onPress={handleCaptureSelfie}
                  style={{ marginTop: 8 }}
                >
                  <Text style={{ color: colors.primaryLight, fontSize: 12, fontWeight: '700' }}>
                    🔄 Retake Photo
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <BigButton
                title="Open Front Camera 🤳"
                onPress={handleCaptureSelfie}
                variant="secondary"
                style={{ width: '100%', marginBottom: 8 }}
              />
            )}

            {selfieUri && (
              <BigButton
                title="Verify Face & Continue Shift ✅"
                onPress={handleSubmitSelfie}
                loading={submittingSelfie}
                variant="success"
                style={{ width: '100%' }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  container: {
    padding: 18,
    paddingBottom: 40
  },
  speedCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: 16
  },
  speedCardAlert: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.1)'
  },
  speedLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 4
  },
  speedValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6
  },
  speedValue: {
    fontSize: 56,
    fontWeight: '900',
    color: colors.white
  },
  speedAlertText: {
    color: colors.danger
  },
  speedOkText: {
    color: colors.success
  },
  speedUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary
  },
  speedSub: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6
  },
  timerCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: 16
  },
  timerNearLimit: {
    borderColor: colors.warning,
    backgroundColor: 'rgba(245, 158, 11, 0.1)'
  },
  timerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4
  },
  timerValue: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.primaryLight
  },
  timerSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4
  },
  limitWarningBadge: {
    backgroundColor: colors.warningBg,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.warning
  },
  limitWarningText: {
    fontSize: 12,
    color: colors.primaryLight,
    fontWeight: '700',
    textAlign: 'center'
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  miniCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4
  },
  miniVal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white
  },
  controlsSection: {
    marginTop: 6
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.warning
  },
  idleEmoji: {
    fontSize: 44,
    marginBottom: 8
  },
  idleTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white
  },
  idleTitleHindi: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 8
  },
  idleMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16
  },
  idleInput: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.white,
    fontSize: 14,
    minHeight: 50
  },
  telemetryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16
  },
  telemetryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  pulseDotActive: {
    backgroundColor: '#10B981'
  },
  pulseDotIdle: {
    backgroundColor: '#F59E0B'
  },
  telemetryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.3
  },
  simButton: {
    backgroundColor: '#334155',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569'
  },
  simButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#EF4444'
  },
  simButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryLight
  },
  simButtonTextActive: {
    color: '#F87171'
  },
  telemetrySub: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16
  }
});
