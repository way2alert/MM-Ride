import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadVerificationSelfie, confirmIdentityChallenge } from '../firebase/api';
import { colors } from '../utils/colors';
import { bringAppToFront, showOverlayAlert, dismissOverlayAlert } from '../services/floatingBubbleService';

export default function GlobalSecurityOverlay({
  driverProfile,
  activeDutySession,
  currentLocation
} = {}) {

  const isImmobilized = Boolean(driverProfile?.engineImmobilized);
  const pendingChallenge = driverProfile?.pendingVerification && driverProfile.pendingVerification.status === 'PENDING'
    ? driverProfile.pendingVerification
    : null;

  const [countdown, setCountdown] = useState(90);
  const [selfieUri, setSelfieUri] = useState(null);
  const [submittingSelfie, setSubmittingSelfie] = useState(false);

  // Auto-bring MM Ride to foreground & display overlay banner over Ola/Uber when alerts trigger
  useEffect(() => {
    if (isImmobilized) {
      bringAppToFront();
      showOverlayAlert({
        title: 'ENGINE IMMOBILIZED',
        message: 'இந்த பைக்கின் இன்ஜின் நிர்வாகத்தால் ரிமோட் மூலம் நிறுத்தப்பட்டுள்ளது.',
        alertType: 'IMMOBILIZED',
        autoOpenApp: true
      });
    } else if (pendingChallenge) {
      bringAppToFront();
      showOverlayAlert({
        title: 'LIVE SELFIE (90s)',
        message: 'நிர்வாகம் நேரடி முக சரிபார்ப்பு கோரியுள்ளது. 90 வினாடிகளுக்குள் செல்ஃபி எடுக்கவும்.',
        alertType: 'FACE_CHALLENGE',
        autoOpenApp: true
      });
    } else {
      dismissOverlayAlert();
    }
  }, [isImmobilized, pendingChallenge?.challengeId]);

  // 90s Countdown Timer for Live Identity Selfie Challenge
  useEffect(() => {
    if (!pendingChallenge) {
      setCountdown(90);
      setSelfieUri(null);
      return;
    }

    setCountdown(pendingChallenge.timeoutSeconds || 90);

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [pendingChallenge?.challengeId]);

  const handleCaptureSelfie = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required for live identity verification.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setSelfieUri(result.assets[0].uri);
      }
    } catch (err) {
      Alert.alert('Camera Error', err.message);
    }
  };

  const handleSubmitSelfie = async () => {
    if (!selfieUri || !driverProfile?.id) return;
    setSubmittingSelfie(true);

    try {
      const photoUrl = await uploadVerificationSelfie({
        driverId: driverProfile.id,
        uri: selfieUri,
        prefix: 'live_challenge'
      });

      await confirmIdentityChallenge({
        driverId: driverProfile.id,
        dutyId: activeDutySession?.id || null,
        photoUrl,
        gps: currentLocation || null
      });

      Alert.alert('Identity Verified! ✅', 'Live selfie verification confirmed by Fleet Operations.');
      setSelfieUri(null);
    } catch (err) {
      Alert.alert('Verification Failed', err.message);
    } finally {
      setSubmittingSelfie(false);
    }
  };

  return (
    <>
      {/* 1. Global Remote Engine Immobilizer Lockdown Modal */}
      <Modal visible={isImmobilized} transparent={false} animationType="fade">
        <View style={styles.immobilizedContainer}>
          <View style={styles.warningIconCircle}>
            <Text style={{ fontSize: 44 }}>⚡</Text>
          </View>

          <Text style={styles.immobilizedTitle}>
            VEHICLE ENGINE IMMOBILIZED
          </Text>

          <View style={styles.immobilizedCard}>
            <Text style={styles.tamilNotice}>
              இந்த பைக்கின் இன்ஜின் நிர்வாகத்தால் (MM Ride Operations) ரிமோட் மூலம் நிறுத்தப்பட்டுள்ளது.
            </Text>
            <Text style={styles.englishNotice}>
              Vehicle ignition has been remotely cut off. Real-time GPS coordinates are streaming to Operations. Park safely on the roadside and contact Operations immediately.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.callButton}
            onPress={() => Linking.openURL('tel:18004190123')}
          >
            <Text style={styles.callButtonText}>
              📞 Call Operations Control Room
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* 2. Global Live Face Selfie Challenge Modal */}
      <Modal visible={Boolean(pendingChallenge)} transparent={true} animationType="slide">
        <View style={styles.selfieBackdrop}>
          <View style={styles.selfieCard}>
            <View style={styles.selfieHeader}>
              <Text style={{ fontSize: 24 }}>📸</Text>
              <Text style={styles.selfieTitle}>Live Face Verification</Text>
            </View>

            <Text style={styles.selfieSubtitle}>
              Fleet security requires immediate face verification to confirm the authorized driver is operating the vehicle.
            </Text>

            <View style={[
              styles.countdownBox,
              { borderColor: countdown <= 20 ? colors.danger : colors.warning }
            ]}>
              <Text style={[
                styles.countdownText,
                { color: countdown <= 20 ? '#EF4444' : colors.primaryLight }
              ]}>
                ⏳ Time Remaining: {countdown} seconds
              </Text>
            </View>

            {selfieUri ? (
              <View style={{ alignItems: 'center', marginBottom: 14 }}>
                <Image
                  source={{ uri: selfieUri }}
                  style={styles.selfiePreview}
                />
                <TouchableOpacity onPress={handleCaptureSelfie} style={{ marginTop: 8 }}>
                  <Text style={{ color: colors.primaryLight, fontSize: 13, fontWeight: '700' }}>
                    🔄 Retake Photo
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.openCameraButton}
                onPress={handleCaptureSelfie}
              >
                <Text style={styles.openCameraText}>Open Front Camera 🤳</Text>
              </TouchableOpacity>
            )}

            {selfieUri && (
              <TouchableOpacity
                style={styles.submitSelfieButton}
                onPress={handleSubmitSelfie}
                disabled={submittingSelfie}
              >
                {submittingSelfie ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.submitSelfieText}>Submit Live Selfie & Verify Identity ✅</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  immobilizedContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  warningIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 2,
    borderColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  immobilizedTitle: {
    color: '#EF4444',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5
  },
  immobilizedCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 16,
    marginVertical: 20,
    width: '100%'
  },
  tamilNotice: {
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '700'
  },
  englishNotice: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center'
  },
  callButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12
  },
  callButtonText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 15
  },
  selfieBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  selfieCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)'
  },
  selfieHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10
  },
  selfieTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold'
  },
  selfieSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16
  },
  countdownBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1
  },
  countdownText: {
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 14
  },
  selfiePreview: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#10B981'
  },
  openCameraButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8
  },
  openCameraText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15
  },
  submitSelfieButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4
  },
  submitSelfieText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 15
  }
});
