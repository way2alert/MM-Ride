import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  Image,
  ActivityIndicator,
  Linking
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDriver } from '../context/DriverContext';
import { uploadDriverDocument, completeDocumentSubmission } from '../firebase/api';
import { colors } from '../utils/colors';

const STAGES = [
  {
    key: 'DL',
    title: 'Driving Licence (DL)',
    subtitle: 'Front and Back side live camera capture',
    shortLabel: '1. Driving Licence'
  },
  {
    key: 'AADHAAR',
    title: 'Aadhaar Card',
    subtitle: 'Front and Back side live camera capture',
    shortLabel: '2. Aadhaar Card'
  },
  {
    key: 'SELFIE',
    title: 'Driver Live Selfie',
    subtitle: 'Front camera live photo (Keep face straight and clearly visible)',
    shortLabel: '3. Live Selfie'
  }
];

export default function DocumentUploadScreen({ navigation }) {
  const { currentUser, driverProfile, logout } = useDriver();

  const [currentStageIndex, setCurrentStageIndex] = useState(0);

  // 5 mandatory live photos: DL Front, DL Back, Aadhaar Front, Aadhaar Back, Live Selfie
  const [capturedPhotos, setCapturedPhotos] = useState({
    dlFront: null,
    dlBack: null,
    aadhaarFront: null,
    aadhaarBack: null,
    selfie: null
  });

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Count total captured photos out of 5
  const totalCaptured = Object.values(capturedPhotos).filter(Boolean).length;

  const requestCameraPermission = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera Permission Needed',
          'MM Ride requires live camera access to capture documents. Please grant camera permission in your phone settings.'
        );
        return false;
      }
      return true;
    } catch {
      return true;
    }
  };

  const handleLaunchCamera = async (photoKey, cameraFacing = 'back') => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const cameraOptions = {
        allowsEditing: false,
        quality: 0.7
      };

      if (cameraFacing === 'front' && ImagePicker.CameraType?.front) {
        cameraOptions.cameraType = ImagePicker.CameraType.front;
      } else if (ImagePicker.CameraType?.back) {
        cameraOptions.cameraType = ImagePicker.CameraType.back;
      }

      // Live camera ONLY - no gallery picker
      const result = await ImagePicker.launchCameraAsync(cameraOptions);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setCapturedPhotos(prev => ({
          ...prev,
          [photoKey]: asset.uri
        }));
      }
    } catch (err) {
      Alert.alert('Camera Error', err.message || 'Could not open live camera.');
    }
  };

  const handleNextStage = () => {
    if (currentStageIndex === 0) {
      if (!capturedPhotos.dlFront) {
        Alert.alert('DL Front Photo Required', 'Please take a live photo of the FRONT side of your Driving Licence.');
        return;
      }
      if (!capturedPhotos.dlBack) {
        Alert.alert('DL Back Photo Required', 'Please take a live photo of the BACK side of your Driving Licence.');
        return;
      }
      setCurrentStageIndex(1);
    } else if (currentStageIndex === 1) {
      if (!capturedPhotos.aadhaarFront) {
        Alert.alert('Aadhaar Front Photo Required', 'Please take a live photo of the FRONT side of your Aadhaar card.');
        return;
      }
      if (!capturedPhotos.aadhaarBack) {
        Alert.alert('Aadhaar Back Photo Required', 'Please take a live photo of the BACK side of your Aadhaar card.');
        return;
      }
      setCurrentStageIndex(2);
    } else if (currentStageIndex === 2) {
      if (!capturedPhotos.selfie) {
        Alert.alert('Live Selfie Required', 'Please take a live front-camera selfie to complete your verification.');
        return;
      }
      handleSubmitAll();
    }
  };

  const handleSubmitAll = async () => {
    if (!capturedPhotos.dlFront || !capturedPhotos.dlBack || !capturedPhotos.aadhaarFront || !capturedPhotos.aadhaarBack || !capturedPhotos.selfie) {
      Alert.alert('Missing Photos', 'Please ensure all 5 live photos are captured before submitting.');
      return;
    }

    setUploading(true);
    try {
      // Upload the 5 documents sequentially using native file URI (immune to ArrayBuffer error)
      const uploadList = [
        {
          key: 'DL_FRONT',
          uri: capturedPhotos.dlFront,
          type: 'DL_FRONT',
          docNumber: driverProfile?.dlNumber || 'DL_REGISTERED',
          label: 'Driving Licence Front'
        },
        {
          key: 'DL_BACK',
          uri: capturedPhotos.dlBack,
          type: 'DL_BACK',
          docNumber: driverProfile?.dlNumber || 'DL_REGISTERED',
          label: 'Driving Licence Back'
        },
        {
          key: 'AADHAAR_FRONT',
          uri: capturedPhotos.aadhaarFront,
          type: 'AADHAAR_FRONT',
          docNumber: driverProfile?.aadhaarNumber || 'AADHAAR_CARD',
          label: 'Aadhaar Card Front'
        },
        {
          key: 'AADHAAR_BACK',
          uri: capturedPhotos.aadhaarBack,
          type: 'AADHAAR_BACK',
          docNumber: driverProfile?.aadhaarNumber || 'AADHAAR_CARD',
          label: 'Aadhaar Card Back'
        },
        {
          key: 'PHOTO',
          uri: capturedPhotos.selfie,
          type: 'PHOTO',
          docNumber: 'LIVE_SELFIE',
          label: 'Driver Live Selfie'
        }
      ];

      let count = 0;
      for (const item of uploadList) {
        count++;
        setUploadProgress(`Uploading ${count} of 5: ${item.label}...`);
        await uploadDriverDocument({
          driverId: currentUser.uid,
          type: item.type,
          docNumber: item.docNumber,
          uri: item.uri,
          fileName: `${item.key.toLowerCase()}.jpg`
        });
      }

      setUploadProgress('Finalizing submission...');
      await completeDocumentSubmission(currentUser.uid);

      Alert.alert(
        'Documents Submitted! 🎉',
        'All 5 live photos uploaded successfully. Notify the fleet admin on WhatsApp for fast 5-minute approval.',
        [
          {
            text: '💬 WhatsApp Admin (7200723901)',
            onPress: () => {
              const text = encodeURIComponent(
                `Namaste MM Ride Admin,\nI have registered as a Driver and successfully uploaded all 5 KYC documents on the MM Ride App.\n\n👤 Name: ${driverProfile?.fullName || 'Partner'}\n📱 Mobile: ${driverProfile?.mobileNumber || ''}\n🪪 DL: ${driverProfile?.dlNumber || ''}\n\nPlease review and approve my account!`
              );
              Linking.openURL(`https://wa.me/917200723901?text=${text}`).catch(() => {});
              if (navigation?.navigate) {
                navigation.navigate('VerificationStatus');
              }
            }
          },
          {
            text: 'View Status ➔',
            onPress: () => {
              if (navigation?.navigate) {
                navigation.navigate('VerificationStatus');
              }
            }
          }
        ]
      );
    } catch (err) {
      console.error('Document submission error:', err);
      Alert.alert('Upload Error', err.message || 'Failed to upload photos. Please check your internet connection and retry.');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Top Bar: Go back to Login */}
      <View style={styles.topNavRow}>
        <TouchableOpacity 
          style={styles.backToLoginBtn} 
          onPress={() => {
            Alert.alert(
              'Go Back to Login',
              'Do you want to sign out and return to the login screen?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, Go to Login', style: 'destructive', onPress: logout }
              ]
            );
          }}
        >
          <Text style={styles.backToLoginText}>← Back to Login / Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Top Header & Multi-Step Progress Tracker */}
      <View style={styles.header}>
        <View style={styles.topRow}>
          <Text style={styles.stageIndicatorText}>
            STAGE {currentStageIndex + 1} OF 3
          </Text>
          <View style={styles.counterBadge}>
            <Text style={styles.counterBadgeText}>
              {totalCaptured} of 5 Photos Captured
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarTrack}>
          <View 
            style={[
              styles.progressBarFill, 
              { width: `${((currentStageIndex + 1) / STAGES.length) * 100}%` }
            ]} 
          />
        </View>

        {/* Stage Navigation Tabs */}
        <View style={styles.stagesRow}>
          {STAGES.map((stg, idx) => {
            const isDone = 
              idx === 0 ? (capturedPhotos.dlFront && capturedPhotos.dlBack) :
              idx === 1 ? (capturedPhotos.aadhaarFront && capturedPhotos.aadhaarBack) :
              !!capturedPhotos.selfie;
            const isCurrent = idx === currentStageIndex;

            return (
              <TouchableOpacity
                key={stg.key}
                style={[
                  styles.stageTab,
                  isCurrent && styles.stageTabActive,
                  isDone && styles.stageTabDone
                ]}
                onPress={() => setCurrentStageIndex(idx)}
              >
                <Text style={[
                  styles.stageTabText,
                  isCurrent && styles.stageTabTextActive,
                  isDone && styles.stageTabTextDone
                ]}>
                  {stg.shortLabel} {isDone ? '✓' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ============================================================== */}
      {/* SCREEN 1: DRIVING LICENCE (FRONT & BACK ON SAME SCREEN)        */}
      {/* ============================================================== */}
      {currentStageIndex === 0 && (
        <View style={styles.stageCard}>
          <View style={styles.stageTitleRow}>
            <Text style={styles.stageIcon}>🪪</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stageTitle}>Driving Licence (DL)</Text>
              <Text style={styles.stageSubtitle}>
                Live Camera Only: Front and Back photo capture
              </Text>
            </View>
          </View>

          <View style={styles.instructionBanner}>
            <Text style={styles.instructionBannerText}>
              Please place your physical Driving Licence on a flat, well-lit surface. Take clear live photos of both FRONT and BACK.
            </Text>
          </View>

          {/* DL Front Side Box */}
          <Text style={styles.boxTitle}>A. FRONT SIDE (Samne Ka Hissa) *</Text>
          {capturedPhotos.dlFront ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: capturedPhotos.dlFront }} style={styles.docImagePreview} />
              <View style={styles.successBadgeRow}>
                <Text style={styles.successBadgeText}>✓ DL Front Live Photo Captured</Text>
              </View>
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => handleLaunchCamera('dlFront', 'back')}
              >
                <Text style={styles.retakeBtnText}>📸 Retake Front Photo (Live Camera)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.viewfinderCard}>
              <Text style={styles.viewfinderIcon}>📷</Text>
              <Text style={styles.viewfinderTitle}>DL Front Live Camera</Text>
              <Text style={styles.viewfinderSubtitle}>Make sure name, photo and DL number are sharp</Text>
              <TouchableOpacity
                style={styles.openCameraBtn}
                onPress={() => handleLaunchCamera('dlFront', 'back')}
              >
                <Text style={styles.openCameraBtnText}>📸 Open Live Camera (Front)</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* DL Back Side Box */}
          <Text style={[styles.boxTitle, { marginTop: 20 }]}>B. BACK SIDE (Peeche Ka Hissa) *</Text>
          {capturedPhotos.dlBack ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: capturedPhotos.dlBack }} style={styles.docImagePreview} />
              <View style={styles.successBadgeRow}>
                <Text style={styles.successBadgeText}>✓ DL Back Live Photo Captured</Text>
              </View>
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => handleLaunchCamera('dlBack', 'back')}
              >
                <Text style={styles.retakeBtnText}>📸 Retake Back Photo (Live Camera)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.viewfinderCard}>
              <Text style={styles.viewfinderIcon}>📷</Text>
              <Text style={styles.viewfinderTitle}>DL Back Live Camera</Text>
              <Text style={styles.viewfinderSubtitle}>Capture the reverse side showing address and endorsements</Text>
              <TouchableOpacity
                style={styles.openCameraBtn}
                onPress={() => handleLaunchCamera('dlBack', 'back')}
              >
                <Text style={styles.openCameraBtnText}>📸 Open Live Camera (Back)</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ============================================================== */}
      {/* SCREEN 2: AADHAAR CARD (FRONT & BACK ON SAME SCREEN)           */}
      {/* ============================================================== */}
      {currentStageIndex === 1 && (
        <View style={styles.stageCard}>
          <View style={styles.stageTitleRow}>
            <Text style={styles.stageIcon}>🆔</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stageTitle}>Aadhaar Card Verification</Text>
              <Text style={styles.stageSubtitle}>
                Live Camera Only: Front and Back photo capture
              </Text>
            </View>
          </View>

          <View style={styles.instructionBanner}>
            <Text style={styles.instructionBannerText}>
              Please place your physical Aadhaar card on a flat surface. Take clear live photos of both FRONT (showing photo & details) and BACK (showing address & QR code).
            </Text>
          </View>

          {/* Aadhaar Front Side Box */}
          <Text style={styles.boxTitle}>A. FRONT SIDE (Samne Ka Hissa) *</Text>
          {capturedPhotos.aadhaarFront ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: capturedPhotos.aadhaarFront }} style={styles.docImagePreview} />
              <View style={styles.successBadgeRow}>
                <Text style={styles.successBadgeText}>✓ Aadhaar Front Live Photo Captured</Text>
              </View>
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => handleLaunchCamera('aadhaarFront', 'back')}
              >
                <Text style={styles.retakeBtnText}>📸 Retake Front Photo (Live Camera)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.viewfinderCard}>
              <Text style={styles.viewfinderIcon}>📷</Text>
              <Text style={styles.viewfinderTitle}>Aadhaar Front Live Camera</Text>
              <Text style={styles.viewfinderSubtitle}>Make sure photo and 12-digit number are clear</Text>
              <TouchableOpacity
                style={styles.openCameraBtn}
                onPress={() => handleLaunchCamera('aadhaarFront', 'back')}
              >
                <Text style={styles.openCameraBtnText}>📸 Open Live Camera (Front)</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Aadhaar Back Side Box */}
          <Text style={[styles.boxTitle, { marginTop: 20 }]}>B. BACK SIDE (Peeche Ka Hissa) *</Text>
          {capturedPhotos.aadhaarBack ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: capturedPhotos.aadhaarBack }} style={styles.docImagePreview} />
              <View style={styles.successBadgeRow}>
                <Text style={styles.successBadgeText}>✓ Aadhaar Back Live Photo Captured</Text>
              </View>
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => handleLaunchCamera('aadhaarBack', 'back')}
              >
                <Text style={styles.retakeBtnText}>📸 Retake Back Photo (Live Camera)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.viewfinderCard}>
              <Text style={styles.viewfinderIcon}>📷</Text>
              <Text style={styles.viewfinderTitle}>Aadhaar Back Live Camera</Text>
              <Text style={styles.viewfinderSubtitle}>Flip card and capture address and QR code</Text>
              <TouchableOpacity
                style={styles.openCameraBtn}
                onPress={() => handleLaunchCamera('aadhaarBack', 'back')}
              >
                <Text style={styles.openCameraBtnText}>📸 Open Live Camera (Back)</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ============================================================== */}
      {/* SCREEN 3: DRIVER LIVE SELFIE (FRONT CAMERA ONLY)              */}
      {/* ============================================================== */}
      {currentStageIndex === 2 && (
        <View style={styles.stageCard}>
          <View style={styles.stageTitleRow}>
            <Text style={styles.stageIcon}>🤳</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stageTitle}>Driver Live Selfie</Text>
              <Text style={styles.stageSubtitle}>
                Front Camera Only: Live selfie (No gallery)
              </Text>
            </View>
          </View>

          <View style={styles.instructionBanner}>
            <Text style={styles.instructionBannerText}>
              Look directly into the front camera with good lighting. Please remove any cap, mask, or sunglasses.
            </Text>
          </View>

          {capturedPhotos.selfie ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: capturedPhotos.selfie }} style={styles.selfieImagePreview} />
              <View style={styles.successBadgeRow}>
                <Text style={styles.successBadgeText}>✓ Live Selfie Captured</Text>
              </View>
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => handleLaunchCamera('selfie', 'front')}
              >
                <Text style={styles.retakeBtnText}>📸 Retake Live Selfie (Front Camera)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.selfieViewfinderCard}>
              <Text style={styles.viewfinderIcon}>🤳</Text>
              <Text style={styles.viewfinderTitle}>Live Front Camera Selfie</Text>
              <Text style={styles.viewfinderSubtitle}>
                Live camera only. Gallery selection is disabled for safety.
              </Text>
              <TouchableOpacity
                style={styles.openCameraBtn}
                onPress={() => handleLaunchCamera('selfie', 'front')}
              >
                <Text style={styles.openCameraBtnText}>📸 Open Front Camera & Take Selfie</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Upload Progress Overlay */}
      {uploading && (
        <View style={styles.uploadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.uploadingText}>{uploadProgress}</Text>
          <Text style={styles.uploadingSubtext}>Please keep this screen open while uploading</Text>
        </View>
      )}

      {/* Bottom Navigation Buttons */}
      <View style={styles.bottomNavRow}>
        {currentStageIndex > 0 && (
          <TouchableOpacity
            style={styles.prevBtn}
            onPress={() => setCurrentStageIndex(currentStageIndex - 1)}
            disabled={uploading}
          >
            <Text style={styles.prevBtnText}>◀ Previous</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.nextBtn,
            currentStageIndex === 0 && { flex: 1 },
            uploading && { opacity: 0.6 }
          ]}
          onPress={handleNextStage}
          disabled={uploading}
        >
          <Text style={styles.nextBtnText}>
            {currentStageIndex === 0 
              ? 'Next: Aadhaar Card (2/3) ➔' 
              : currentStageIndex === 1
                ? 'Next: Live Selfie (3/3) ➔'
                : 'Submit All Documents (5/5) 🚀'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Go Back to Login */}
      <TouchableOpacity 
        style={styles.cancelLink}
        onPress={() => {
          Alert.alert(
            'Go Back to Login',
            'Do you want to sign out and return to the login screen?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Yes, Go to Login', style: 'destructive', onPress: logout }
            ]
          );
        }}
      >
        <Text style={styles.cancelLinkText}>Sign Out & Return to Login Screen</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 16,
    paddingBottom: 40
  },
  topNavRow: {
    marginBottom: 12
  },
  backToLoginBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  backToLoginText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '700'
  },
  cancelLink: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 10,
    marginBottom: 20
  },
  cancelLinkText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline'
  },
  header: {
    marginBottom: 16
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  stageIndicatorText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5
  },
  counterBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  counterBadgeText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700'
  },
  progressBarTrack: {
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3
  },
  stagesRow: {
    flexDirection: 'row',
    gap: 6
  },
  stageTab: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  stageTabActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(245, 158, 11, 0.15)'
  },
  stageTabDone: {
    borderColor: colors.success,
    backgroundColor: 'rgba(16, 185, 129, 0.12)'
  },
  stageTabText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted
  },
  stageTabTextActive: {
    color: colors.primaryLight
  },
  stageTabTextDone: {
    color: colors.success
  },
  stageCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20
  },
  stageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  stageIcon: {
    fontSize: 32
  },
  stageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white
  },
  stageSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryLight,
    marginTop: 2
  },
  instructionBanner: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary
  },
  instructionBannerText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18
  },
  boxTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 8
  },
  aadhaarInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderActive,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2
  },
  aadhaarHelpText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    lineHeight: 16,
    marginBottom: 6
  },
  viewfinderCard: {
    height: 180,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.borderActive,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14
  },
  selfieViewfinderCard: {
    height: 260,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16
  },
  viewfinderIcon: {
    fontSize: 36,
    marginBottom: 6
  },
  viewfinderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 2
  },
  viewfinderSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 10
  },
  openCameraBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3
  },
  openCameraBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000'
  },
  previewContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    alignItems: 'center'
  },
  docImagePreview: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    resizeMode: 'cover',
    marginBottom: 8
  },
  selfieImagePreview: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    resizeMode: 'cover',
    marginBottom: 10
  },
  successBadgeRow: {
    backgroundColor: colors.successBg,
    borderColor: colors.success,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8
  },
  successBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success
  },
  retakeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: colors.borderActive,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    width: '100%'
  },
  retakeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryLight
  },
  uploadingBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary
  },
  uploadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
    marginTop: 10
  },
  uploadingSubtext: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4
  },
  bottomNavRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center'
  },
  prevBtn: {
    backgroundColor: colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  prevBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary
  },
  nextBtn: {
    flex: 2,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3
  },
  nextBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000'
  }
});
