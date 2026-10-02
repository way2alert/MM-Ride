import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  ScrollView, 
  Alert,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Modal
} from 'react-native';
import * as Location from 'expo-location';
import { useDriver } from '../context/DriverContext';
import { registerDriverProfile, submitDriverAddress } from '../firebase/api';
import { colors } from '../utils/colors';
import BigButton from '../components/BigButton';

export default function RegistrationScreen({ navigation }) {
  const { currentUser, driverProfile, logout } = useDriver();

  const [form, setForm] = useState({
    dlNumber: driverProfile?.dlNumber || '',
    fullName: driverProfile?.fullName || '',
    currentAddress: driverProfile?.currentAddress || '',
    emergencyContactPhone: driverProfile?.emergencyContactPhone || '',
    upiId: driverProfile?.upiId || ''
  });

  const loggedInMobile = (
    currentUser?.phoneNumber?.replace(/\D/g, '').slice(-10) ||
    driverProfile?.mobileNumber?.replace(/\D/g, '').slice(-10) ||
    ''
  );
  const cleanedEmergencyPhone = form.emergencyContactPhone.replace(/\D/g, '').slice(-10);
  const isSameAsDriverPhone = (
    loggedInMobile.length === 10 &&
    cleanedEmergencyPhone === loggedInMobile
  );

  const [isLocating, setIsLocating] = useState(false);
  const [isLocationLocked, setIsLocationLocked] = useState(false);

  const [consentAll, setConsentAll] = useState(false);
  const [loading, setLoading] = useState(false);

  // Modals for full details
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showGpsModal, setShowGpsModal] = useState(false);

  // 1. Auto-fetch Live Location on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setIsLocating(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const geocoded = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          });
          if (isMounted && geocoded && geocoded.length > 0) {
            const place = geocoded[0];
            const areaParts = [
              place.name || place.street,
              place.district || place.subregion || place.city,
              place.city || place.region
            ].filter(Boolean);
            const uniqueParts = [...new Set(areaParts)];
            const detectedArea = uniqueParts.slice(0, 2).join(', ') || 'Chennai, Tamil Nadu';
            setForm(prev => ({
              ...prev,
              currentAddress: prev.currentAddress || detectedArea
            }));
            setIsLocationLocked(true);
          }
        } else {
          if (isMounted) {
            setForm(prev => ({ ...prev, currentAddress: prev.currentAddress || 'Chennai, Tamil Nadu' }));
          }
        }
      } catch (err) {
        console.warn('Live location reverse geocode error:', err);
        if (isMounted) {
          setForm(prev => ({ ...prev, currentAddress: prev.currentAddress || 'Chennai, Tamil Nadu' }));
        }
      } finally {
        if (isMounted) setIsLocating(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Format Driving Licence Number
  const handleDlChange = (val) => {
    const cleaned = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setForm(prev => ({ ...prev, dlNumber: cleaned }));
  };

  const handleSubmit = async () => {
    const trimmedDl = form.dlNumber.trim().toUpperCase();
    const trimmedName = form.fullName.trim();
    const trimmedAddress = form.currentAddress.trim();
    const trimmedPhone = form.emergencyContactPhone.trim();
    const trimmedUpi = form.upiId.trim();

    if (!trimmedDl) {
      Alert.alert('Missing Field', 'Please enter your Driving Licence (DL) number.');
      return;
    }
    if (!trimmedName) {
      Alert.alert('Missing Field', 'Please enter your Full Legal Name as per Driving Licence / Aadhaar.');
      return;
    }
    if (!trimmedAddress) {
      Alert.alert('Missing Field', 'Please enter your Current City or Residential Area.');
      return;
    }
    if (!trimmedPhone || trimmedPhone.length < 10) {
      Alert.alert('Missing Field', 'Please enter a valid 10-digit Emergency Contact mobile number.');
      return;
    }
    if (isSameAsDriverPhone) {
      Alert.alert(
        'Invalid Family Number',
        `Family/Emergency contact number cannot be the same as your logged-in mobile number (+91 ${loggedInMobile}). Please provide a family member or relative number.`
      );
      return;
    }
    if (!trimmedUpi) {
      Alert.alert('Missing Field', 'Please enter your UPI ID or GPay/PhonePe number for daily 50% payout settlements.');
      return;
    }
    if (!consentAll) {
      Alert.alert('Agreement Required', 'Please accept the MM Ride Driver Agreement and Work GPS terms to proceed.');
      return;
    }

    if (!currentUser?.uid) {
      Alert.alert('Session Expired', 'Driver authentication session is missing. Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      const mobileNumber =
        currentUser?.phoneNumber?.replace('+91', '') ||
        currentUser?.email?.replace('driver_', '')?.replace('@mmride.driver.com', '') ||
        driverProfile?.mobileNumber ||
        form.emergencyContactPhone ||
        '';

      await registerDriverProfile(currentUser.uid, {
        fullName: trimmedName,
        dlNumber: trimmedDl,
        currentAddress: trimmedAddress,
        permanentAddress: trimmedAddress,
        emergencyContactName: 'Family Contact',
        emergencyContactPhone: trimmedPhone,
        nomineeName: 'As per KYC / DL',
        nomineeRelationship: 'Family',
        upiId: trimmedUpi,
        bankAccountNumber: `UPI: ${trimmedUpi}`,
        bankIfsc: 'UPI',
        dob: 'As per DL',
        mobileNumber,
        consentAgreement: true,
        consentGps: true,
        consentPrivacy: true,
        consentAgreedAt: new Date().toISOString()
      });

      await submitDriverAddress(currentUser.uid, {
        currentAddress: trimmedAddress,
        permanentAddress: trimmedAddress
      });

      Alert.alert('Details Saved!', 'Profile registered successfully. Now take live camera photos of your Driving Licence and Selfie.');
      if (navigation?.navigate) {
        navigation.navigate('DocumentUpload');
      }
    } catch (err) {
      Alert.alert('Registration Error', err.message);
    } finally {
      setLoading(false);
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
          <Text style={styles.backToLoginText}>← Back to Login / Change Number</Text>
        </TouchableOpacity>
      </View>

      {/* Header Badge & Title */}
      <View style={styles.header}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepText}>STEP 1 OF 2 • 1 MINUTE SIGNUP</Text>
        </View>
        <Text style={styles.heading}>Driver Quick Registration</Text>
        <Text style={styles.subheading}>
          Enter essential details to register with the MM Ride fleet.
        </Text>
      </View>

      {/* Main Details Card */}
      <View style={styles.card}>
        {/* 1. Driving Licence Number */}
        <Text style={styles.label}>1. Driving Licence (DL) Number *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. TN88Z20220000412"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          maxLength={20}
          value={form.dlNumber}
          onChangeText={handleDlChange}
        />

        {/* 2. Full Legal Name */}
        <Text style={[styles.label, { marginTop: 14 }]}>
          2. Full Legal Name (As on Driving Licence / Aadhaar) *
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your full legal name"
          placeholderTextColor={colors.textMuted}
          value={form.fullName}
          onChangeText={(v) => setForm({ ...form, fullName: v })}
          autoCapitalize="words"
        />

        {/* 3. Current City / Residential Area */}
        <Text style={[styles.label, { marginTop: 14 }]}>3. Current City / Residential Area *</Text>
        {isLocationLocked && form.currentAddress ? (
          <View style={styles.locationContainer}>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationValueText}>{form.currentAddress}</Text>
              <Text style={styles.locationHelpText}>📍 Auto-detected via live GPS</Text>
            </View>
            <TouchableOpacity
              style={styles.changeLocationBtn}
              onPress={() => setIsLocationLocked(false)}
            >
              <Text style={styles.changeLocationBtnText}>Change?</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <TextInput
              style={styles.input}
              placeholder="e.g. Vadapalani, Chennai"
              placeholderTextColor={colors.textMuted}
              value={form.currentAddress}
              onChangeText={(v) => setForm({ ...form, currentAddress: v })}
            />
            {isLocating && (
              <View style={styles.locatingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.locatingText}>Detecting live GPS location...</Text>
              </View>
            )}
          </View>
        )}

        {/* 4. Emergency Contact */}
        <Text style={[styles.label, { marginTop: 14 }]}>
          4. Emergency Contact Mobile (Family Phone Number) *
        </Text>
        <TextInput
          style={[
            styles.input,
            isSameAsDriverPhone && { borderColor: colors.danger, borderWidth: 1.5 }
          ]}
          placeholder="10-digit family mobile number"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          maxLength={10}
          value={form.emergencyContactPhone}
          onChangeText={(v) => setForm({ ...form, emergencyContactPhone: v.replace(/\D/g, '').slice(0, 10) })}
        />
        {isSameAsDriverPhone && (
          <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4, fontWeight: '700' }}>
            ⚠️ Family number cannot be the same as your logged-in mobile number (+91 {loggedInMobile})
          </Text>
        )}

        {/* 5. UPI ID */}
        <Text style={[styles.label, { marginTop: 14 }]}>
          5. Daily Payout UPI ID / GPay / PhonePe *
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. yourname@okhdfcbank or yourname@upi"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          value={form.upiId}
          onChangeText={(v) => setForm({ ...form, upiId: v })}
        />
        <Text style={styles.helperText}>
          Your 50% daily net earnings will be settled directly to this UPI ID.
        </Text>
      </View>

      {/* Agreement Card with Clickable Underlined Links */}
      <View style={styles.consentCard}>
        <View style={styles.consentHeaderRow}>
          <Switch
            value={consentAll}
            onValueChange={setConsentAll}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={consentAll ? colors.white : colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.consentHeaderText}>
              I Accept MM Ride{' '}
              <Text 
                style={styles.underlinedLink}
                onPress={() => setShowTermsModal(true)}
              >
                Terms & Conditions
              </Text>
              {' '}and{' '}
              <Text 
                style={styles.underlinedLink}
                onPress={() => setShowGpsModal(true)}
              >
                GPS Safety Policy
              </Text>
            </Text>
            <Text style={styles.clickPromptText}>(Tap underlined links to view full details)</Text>
          </View>
        </View>

        {/* Quick summary points for fast scanning */}
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>
            • <Text style={styles.boldText}>50/50 Ride Split:</Text> Daily 50% net earnings paid out via UPI every evening.
          </Text>
          <Text style={styles.bulletItem}>
            • <Text style={styles.boldText}>Zero Fuel Cost:</Text> Vehicle petrol & maintenance paid 100% by owner.
          </Text>
          <Text style={styles.bulletItem}>
            • <Text style={styles.boldText}>Shift Safety GPS:</Text> Location monitored strictly during active duty hours.
          </Text>
        </View>
      </View>

      {/* Primary Action Button */}
      <BigButton
        title="Next: Upload Documents (2 Min)"
        onPress={handleSubmit}
        loading={loading}
        style={{ marginBottom: 12 }}
      />

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

      {/* Modal 1: Terms & Conditions Full Details */}
      <Modal
        visible={showTermsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📄 MM Ride Driver Terms</Text>
              <TouchableOpacity onPress={() => setShowTermsModal(false)}>
                <Text style={styles.modalCloseText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.clauseHeading}>1. 50/50 Daily Revenue Split</Text>
              <Text style={styles.clauseText}>
                Every day, your total net earnings from Ola, Uber, and Rapido platforms are split equally (50% to Driver, 50% to Fleet). Settled directly to your UPI ID every evening with zero hidden deductions.
              </Text>

              <Text style={styles.clauseHeading}>2. Zero Fuel & Zero Maintenance</Text>
              <Text style={styles.clauseText}>
                All vehicle expenses including petrol, EV battery charging, periodic oil changes, and tire maintenance are 100% covered by the MM Ride fleet. You do not pay anything from your pocket.
              </Text>

              <Text style={styles.clauseHeading}>3. Vehicle Allocation & Care</Text>
              <Text style={styles.clauseText}>
                A dedicated, fully maintained two-wheeler is allocated to you from your designated Central Hub. The driver is responsible for safe driving, helmet usage, and reporting any accidental damage immediately.
              </Text>

              <Text style={styles.clauseHeading}>4. Emergency Assistance & Support</Text>
              <Text style={styles.clauseText}>
                24x7 roadside assistance and emergency helpline is available through the app. In case of breakdown or incident, the fleet support team dispatches immediate on-ground support.
              </Text>
            </ScrollView>

            <TouchableOpacity 
              style={styles.modalAgreeBtn}
              onPress={() => {
                setConsentAll(true);
                setShowTermsModal(false);
              }}
            >
              <Text style={styles.modalAgreeBtnText}>I Understand & Accept Terms ✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal 2: GPS Safety Policy Full Details */}
      <Modal
        visible={showGpsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGpsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📍 Shift GPS Safety Policy</Text>
              <TouchableOpacity onPress={() => setShowGpsModal(false)}>
                <Text style={styles.modalCloseText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.clauseHeading}>1. Shift-Only Location Tracking</Text>
              <Text style={styles.clauseText}>
                GPS tracking is activated ONLY when you tap "START DUTY" in the driver app and stops automatically when you tap "END DUTY". Zero tracking occurs during your off-duty or break periods.
              </Text>

              <Text style={styles.clauseHeading}>2. Purpose of GPS Monitoring</Text>
              <Text style={styles.clauseText}>
                Live telemetry protects both driver and vehicle. It allows the operations team to locate you instantly during an Emergency SOS, verify kilometers traveled for daily settlements, and dispatch roadside assistance.
              </Text>

              <Text style={styles.clauseHeading}>3. Privacy & Battery Protection</Text>
              <Text style={styles.clauseText}>
                Telemetry is recorded strictly for fleet operations and is never shared with third-party advertising services. The background GPS engine uses optimized geofencing to conserve phone battery life.
              </Text>
            </ScrollView>

            <TouchableOpacity 
              style={styles.modalAgreeBtn}
              onPress={() => {
                setConsentAll(true);
                setShowGpsModal(false);
              }}
            >
              <Text style={styles.modalAgreeBtnText}>I Understand GPS Policy ✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 20
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
    paddingVertical: 12,
    marginBottom: 30
  },
  cancelLinkText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline'
  },
  header: {
    marginBottom: 20
  },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)'
  },
  stepText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5
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
    lineHeight: 18
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6
  },
  dlInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 15
  },
  inputLocked: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    color: colors.white,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  dlInlineSpinner: {
    paddingHorizontal: 12
  },
  verifyDlBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: colors.primary,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10
  },
  verifyDlBtnText: {
    color: colors.primaryLight,
    fontWeight: '700',
    fontSize: 12
  },
  dlVerifiedChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12
  },
  dlVerifiedText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '600'
  },
  nameHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6
  },
  editNameLink: {
    fontSize: 12,
    color: colors.primaryLight,
    fontWeight: '700',
    textDecorationLine: 'underline'
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10
  },
  locationValueText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700'
  },
  locationHelpText: {
    color: colors.primaryLight,
    fontSize: 11,
    marginTop: 2
  },
  changeLocationBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)'
  },
  changeLocationBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700'
  },
  locatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6
  },
  locatingText: {
    fontSize: 12,
    color: colors.textMuted
  },
  helperText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    fontStyle: 'italic'
  },
  consentCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    marginBottom: 20
  },
  consentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  consentHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
    lineHeight: 18
  },
  clickPromptText: {
    fontSize: 11,
    color: colors.primaryLight,
    marginTop: 2
  },
  underlinedLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
    fontWeight: '800'
  },
  bulletList: {
    paddingLeft: 4,
    gap: 6
  },
  bulletItem: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18
  },
  boldText: {
    fontWeight: '700',
    color: colors.text
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.border
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white
  },
  modalCloseText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '700'
  },
  modalScroll: {
    marginBottom: 16
  },
  clauseHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primaryLight,
    marginTop: 10,
    marginBottom: 4
  },
  clauseText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18
  },
  modalAgreeBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalAgreeBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800'
  }
});

