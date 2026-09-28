import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity
} from 'react-native';
import { signInWithPhoneNumber, PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { auth, db, firebaseConfig } from '../firebase/config';
import { colors } from '../utils/colors';
import BigButton from '../components/BigButton';
import FirebaseRecaptchaModal from '../components/FirebaseRecaptchaModal';

export default function LoginScreen({ navigation }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [showRecaptcha, setShowRecaptcha] = useState(false);

  const handleInitiateSendOtp = () => {
    const cleanedPhone = phoneNumber.trim().replace(/\D/g, '').slice(-10);
    if (!cleanedPhone || cleanedPhone.length !== 10) {
      Alert.alert('Invalid Mobile Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    // Launch Google reCAPTCHA verification challenge modal
    setShowRecaptcha(true);
  };

  const handleRecaptchaVerify = async (token) => {
    setShowRecaptcha(false);
    setLoading(true);

    const cleanedPhone = phoneNumber.trim().replace(/\D/g, '').slice(-10);
    const fullPhone = `+91${cleanedPhone}`;

    try {
      let confirmation;
      try {
        // ApplicationVerifier interface for Firebase Auth
        const appVerifier = {
          type: 'recaptcha',
          verify: async () => token,
          _reset: () => {},
          clear: () => {},
          render: async () => 0
        };

        // Dispatches real SMS via Google Firebase Phone Authentication
        confirmation = await signInWithPhoneNumber(auth, fullPhone, appVerifier);
      } catch (sdkError) {
        console.warn('SDK signInWithPhoneNumber error, executing direct Google Identity Platform REST endpoint:', sdkError.message || sdkError);
        // Direct call to Google Identity Platform sendVerificationCode
        const resp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${firebaseConfig.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phoneNumber: fullPhone,
              recaptchaToken: token
            })
          }
        );
        const resData = await resp.json();
        if (!resp.ok) {
          const errMsg = resData?.error?.message || 'Failed to dispatch SMS';
          const err = new Error(errMsg);
          err.code = resData?.error?.message;
          throw err;
        }
        const sessionInfo = resData.sessionInfo;
        confirmation = {
          verificationId: sessionInfo,
          confirm: async (code) => {
            const cred = PhoneAuthProvider.credential(sessionInfo, code);
            return await signInWithCredential(auth, cred);
          }
        };
      }

      setConfirmationResult(confirmation);
      setOtpSent(true);
      setOtp('');

      Alert.alert(
        'Official SMS Dispatched 📲',
        `A 6-digit verification code has been sent via SMS to ${fullPhone}. Please enter it below to sign in.`
      );
    } catch (error) {
      console.error('Firebase signInWithPhoneNumber error:', error);
      const msg = error.message || String(error);
      if (msg.includes('SMS unable to be sent until this region enabled') || msg.includes('region enabled by the app developer')) {
        Alert.alert(
          'SMS Region Policy (Firebase Action Required)',
          'Google requires allowing India (+91) in Firebase Console before sending SMS:\n\n1. Open Firebase Console (mm-ride-6899f)\n2. Go to Authentication > Settings > SMS region policy\n3. Add / Allow "India (+91)"\n\nOnce added, tap "Get SMS Verification Code" again.'
        );
      } else if (error.code === 'auth/operation-not-allowed' || msg.includes('OPERATION_NOT_ALLOWED')) {
        Alert.alert(
          'Phone Sign-In Not Enabled',
          'Phone authentication is currently disabled in your Firebase Console.\n\nPlease enable it:\nFirebase Console > Authentication > Sign-in method > Phone (Enable).'
        );
      } else if (error.code === 'auth/quota-exceeded' || msg.includes('QUOTA_EXCEEDED')) {
        Alert.alert(
          'SMS Quota Exceeded',
          'Daily Firebase SMS quota has been reached. Upgrade to the Blaze plan in Firebase Console or add test numbers under Phone Auth settings.'
        );
      } else if (error.code === 'auth/invalid-phone-number' || msg.includes('INVALID_PHONE_NUMBER')) {
        Alert.alert('Invalid Phone Number', 'The phone number format is invalid. Please check the 10-digit number.');
      } else if (error.code === 'auth/too-many-requests' || msg.includes('TOO_MANY_ATTEMPTS')) {
        Alert.alert('Too Many Requests', 'Requests are temporarily blocked due to unusual activity. Please try again after a few minutes.');
      } else {
        Alert.alert('SMS Delivery Error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const enteredOtp = otp ? otp.trim() : '';
    if (!enteredOtp || enteredOtp.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the complete 6-digit verification code received in the SMS.');
      return;
    }

    if (!confirmationResult) {
      Alert.alert('Session Expired', 'Please tap "Resend SMS" to request a new code.');
      return;
    }

    setLoading(true);
    try {
      // 1. Authenticate with real Firebase SMS OTP
      const userCredential = await confirmationResult.confirm(enteredOtp);
      const user = userCredential.user;
      // Get unique Android Hardware / Device ID
      let hardwareId = 'device_company_default';
      try {
        if (Application.getAndroidId) {
          const aid = await Application.getAndroidId();
          if (aid) hardwareId = aid;
        }
      } catch (e) {
        console.warn('Android ID error:', e);
      }
      const deviceModel = `${Device.manufacturer || ''} ${Device.modelName || 'Android Device'}`.trim();

      // 2. Ensure driver profile exists and enforce Device Binding
      const driverRef = doc(db, 'drivers', user.uid);
      const driverSnap = await getDoc(driverRef);

      if (driverSnap.exists()) {
        const dData = driverSnap.data();

        // Enforce Device Binding for approved / active drivers
        if (dData.boundDeviceId && dData.boundDeviceId !== hardwareId) {
          await auth.signOut();
          Alert.alert(
            'Unauthorized Device (அங்கீகரிக்கப்படாத சாதனம்)',
            `This driver account is bound to Company Device ID [${dData.boundDeviceId.slice(-6)}].\n\nYou cannot log in from an unapproved or personal phone.\n\nஇந்த கணக்கு நிறுவனம் வழங்கிய அதிகாரப்பூர்வ மொபைலில் மட்டுமே இயங்கும். ஓனரை தொடர்பு கொள்ளவும்.`
          );
          return;
        }

        // Auto-bind device on vehicle assignment or first active shift if not already bound
        const isReadyForBinding = ['BIKE_ASSIGNED', 'BIKE_HANDOVER_PENDING', 'ACTIVE_DRIVER'].includes(dData.accountStatus);
        if (!dData.boundDeviceId && isReadyForBinding) {
          await updateDoc(driverRef, {
            boundDeviceId: hardwareId,
            boundDeviceModel: deviceModel,
            boundAt: new Date().toISOString()
          });
        }
      } else {
        // Initial registration: Do not prematurely lock to driver's personal phone
        await setDoc(driverRef, {
          mobileNumber: cleanedPhone,
          authPhone: user.phoneNumber || `+91${cleanedPhone}`,
          verificationStatus: 'PENDING',
          approvalStatus: 'PENDING',
          accountStatus: 'REGISTERED',
          boundDeviceId: null,
          boundDeviceModel: null,
          registeredAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (err) {
      console.error('Confirmation error:', err);
      if (err.code === 'auth/invalid-verification-code') {
        Alert.alert('Incorrect Code', 'The verification code entered does not match the SMS. Please check and try again.');
      } else if (err.code === 'auth/code-expired') {
        Alert.alert('Code Expired', 'The verification code has expired. Please tap "Resend SMS" to request a new code.');
      } else {
        Alert.alert('Login Error', err.message || 'Could not verify code.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Security reCAPTCHA Verification Modal */}
      <FirebaseRecaptchaModal
        visible={showRecaptcha}
        firebaseConfig={firebaseConfig}
        onVerify={handleRecaptchaVerify}
        onCancel={() => setShowRecaptcha(false)}
        onError={(err) => {
          setShowRecaptcha(false);
          Alert.alert('Security Challenge Error', err);
        }}
      />

      <View style={styles.logoSection}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>MM</Text>
        </View>
        <Text style={styles.appName}>MM RIDE</Text>
        <Text style={styles.tagline}>Driver Partner Application</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Driver Sign In / Registration</Text>
        <Text style={styles.cardSubtitle}>
          Enter your 10-digit mobile number to receive an SMS verification code
        </Text>

        <Text style={styles.label}>Mobile Phone Number</Text>
        <View style={styles.phoneInputContainer}>
          <Text style={styles.countryCode}>+91</Text>
          <TextInput
            style={styles.phoneInput}
            placeholder="Enter 10-digit number"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={14}
            value={phoneNumber}
            onChangeText={(v) => {
              const digitsOnly = v.replace(/\D/g, '');
              if (digitsOnly.length > 10 && digitsOnly.startsWith('91')) {
                setPhoneNumber(digitsOnly.slice(2, 12));
              } else {
                setPhoneNumber(digitsOnly.slice(0, 10));
              }
            }}
            editable={!otpSent}
          />
        </View>

        {otpSent && (
          <>
            <Text style={styles.label}>SMS Verification Code</Text>
            <TextInput
              style={styles.otpInput}
              placeholder="Enter 6-digit code"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
              autoFocus={true}
            />
            <View style={styles.otpActionRow}>
              <TouchableOpacity onPress={handleInitiateSendOtp} style={styles.resendBtn}>
                <Text style={styles.resendText}>📩 Resend SMS</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setOtpSent(false)} style={styles.changePhoneBtn}>
                <Text style={styles.changePhoneText}>✏️ Change Number</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {!otpSent ? (
          <BigButton
            title="Get SMS Verification Code"
            onPress={handleInitiateSendOtp}
            loading={loading}
            style={{ marginTop: 12 }}
          />
        ) : (
          <BigButton
            title="Verify & Enter"
            onPress={handleVerifyOtp}
            loading={loading}
            style={{ marginTop: 14 }}
          />
        )}
      </View>

      <View style={styles.noticeSection}>
        <Text style={styles.noticeText}>
          MM Ride bike-taxi driver management system. Real carrier SMS verification is protected by Google Firebase Security.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: 'center'
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 30
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 12
  },
  logoText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#000'
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.5
  },
  tagline: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 4
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    marginBottom: 16,
    height: 52
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    marginRight: 10
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: colors.white,
    fontWeight: '600'
  },
  otpInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 18,
    letterSpacing: 4,
    color: colors.white,
    fontWeight: '700',
    textAlign: 'center',
    height: 52,
    marginBottom: 8
  },
  helperText: {
    fontSize: 12,
    color: colors.primaryLight,
    textAlign: 'center',
    marginBottom: 14
  },
  otpActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 6
  },
  resendBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  resendText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700'
  },
  changePhoneBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  changePhoneText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600'
  },
  noticeSection: {
    marginTop: 24,
    paddingHorizontal: 12
  },
  noticeText: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16
  }
});
