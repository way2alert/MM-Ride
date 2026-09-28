import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  Image 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useDriver } from '../context/DriverContext';
import { submitDailyRideEarnings } from '../firebase/api';
import { colors } from '../utils/colors';
import BigButton from '../components/BigButton';

export default function SubmitDailyEarningsScreen({ navigation }) {
  const { currentUser } = useDriver();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [grossIncome, setGrossIncome] = useState('');
  const [platformCharges, setPlatformCharges] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePickProof = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        setImageUri(res.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSubmit = async () => {
    if (!grossIncome || Number(grossIncome) <= 0) {
      Alert.alert('Gross Income Required', 'Please enter your total gross earnings for the day.');
      return;
    }

    setLoading(true);
    try {
      let blob = null;
      if (imageUri) {
        const resp = await fetch(imageUri);
        blob = await resp.blob();
      }

      await submitDailyRideEarnings({
        driverId: currentUser.uid,
        date,
        grossIncome: Number(grossIncome),
        platformCharges: Number(platformCharges || 0),
        blob,
        fileName: 'platform_summary.jpg'
      });

      Alert.alert(
        'Submission Received! ✅',
        'Your daily ride statement has been submitted to Operations. The 50/50 split and daily settlement will be calculated upon review.',
        [{ text: 'OK', onPress: () => navigation?.goBack && navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Submission Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const gross = Number(grossIncome) || 0;
  const fees = Number(platformCharges) || 0;
  const net = Math.max(0, gross - fees);
  const worker50 = Math.round((net * 0.5) * 100) / 100;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Submit Daily Ride Income</Text>
      <Text style={styles.subheading}>
        Enter estimated earnings with platform screenshots (Supporting evidence for depot verification)
      </Text>

      {/* Operational Policy Guidance Banner */}
      <View style={{
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.45)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16
      }}>
        <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 13, marginBottom: 6 }}>
          🛡️ REPORTED vs VERIFIED EARNINGS RULE
        </Text>
        <Text style={{ color: '#FDE68A', fontSize: 12, lineHeight: 18, marginBottom: 6 }}>
          1. <Text style={{ fontWeight: 'bold' }}>Reported vs Verified:</Text> இங்கு நீங்கள் பதிவிடும் தொகை "Reported Earnings" (Estimate). ஷிப்ட் முடிந்தவுடன் Depot-ல் Owner உங்கள் மொபைல் செயலிகளை (Ola/Uber/Rapido) நேரில் பரிசோதித்து "Verified Earnings"-ஐ உறுதி செய்வார்.
        </Text>
        <Text style={{ color: '#FDE68A', fontSize: 12, lineHeight: 18, marginBottom: 6 }}>
          2. <Text style={{ fontWeight: 'bold' }}>Cash Rides Compulsory:</Text> பயணியிடம் நேரடியாக வாங்கிய Cash Ride தொகையை மொத்த வருமானத்தில் (Gross Income) கண்டிப்பாக சேர்க்க வேண்டும்.
        </Text>
        <Text style={{ color: '#FDE68A', fontSize: 12, lineHeight: 18 }}>
          3. <Text style={{ fontWeight: 'bold' }}>Petrol Separate Owner Expense:</Text> பெட்ரோல் செலவு ஓனருடையது — ரைடு வருமானத்தில் இருந்து கழிக்கக்கூடாது. பெட்ரோல் ரசீதை ஓனரிடம் தனியாக சமர்ப்பிக்க வேண்டும்.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Shift Financial Summary</Text>

        <Text style={styles.label}>Shift Date (YYYY-MM-DD) *</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
        />

        <Text style={styles.label}>Gross Platform Income (₹) * (Incl. Cash Rides)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 2500"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={grossIncome}
          onChangeText={setGrossIncome}
        />

        <Text style={styles.label}>Platform Commission / Fees Deducted (₹)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 500"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={platformCharges}
          onChangeText={setPlatformCharges}
        />

        {/* Calculated Preview */}
        {gross > 0 && (
          <View style={styles.calcPreview}>
            <Text style={styles.previewTitle}>Estimated 50% Worker Share:</Text>
            <Text style={styles.previewAmount}>₹{worker50.toFixed(2)}</Text>
            <Text style={styles.previewSub}>
              (Net Ride Income: ₹{net.toFixed(2)} ÷ 2 • Petrol NOT deducted from worker share)
            </Text>
          </View>
        )}
      </View>

      {/* Screenshot Proof */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attach App Screenshot Proof</Text>
        <Text style={styles.subNote}>
          Upload screenshot of the Ola, Uber or Rapido daily trip summary screen.
        </Text>

        {imageUri ? (
          <View style={{ alignItems: 'center' }}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity onPress={handlePickProof} style={{ padding: 8 }}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Change Screenshot</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.uploadPlaceholder} onPress={handlePickProof}>
            <Text style={{ fontSize: 32, marginBottom: 6 }}>📱</Text>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
              Select Ola / Uber Daily Summary Photo
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <BigButton
        title="Submit Ride Statement for Settlement"
        onPress={handleSubmit}
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
    padding: 20
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
    marginBottom: 20
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 14
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 8
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.white,
    fontSize: 15
  },
  calcPreview: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  previewTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600'
  },
  previewAmount: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.success,
    marginVertical: 4
  },
  previewSub: {
    fontSize: 11,
    color: colors.textMuted
  },
  subNote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12
  },
  uploadPlaceholder: {
    height: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderActive,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    resizeMode: 'contain',
    backgroundColor: '#000',
    marginBottom: 8
  }
});
