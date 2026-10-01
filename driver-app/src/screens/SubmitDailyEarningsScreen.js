import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  Image,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useDriver } from '../context/DriverContext';
import { submitDailyRideEarnings, getShiftRideEntries } from '../firebase/api';
import { colors } from '../utils/colors';
import BigButton from '../components/BigButton';

export default function SubmitDailyEarningsScreen({ navigation }) {
  const { currentUser, driverProfile } = useDriver();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [autoLoadedCount, setAutoLoadedCount] = useState(0);
  const [loadingAutoFill, setLoadingAutoFill] = useState(false);

  // Ola inputs
  const [olaRides, setOlaRides] = useState('');
  const [olaCash, setOlaCash] = useState('');
  const [olaUpi, setOlaUpi] = useState('');

  // Uber inputs
  const [uberRides, setUberRides] = useState('');
  const [uberCash, setUberCash] = useState('');
  const [uberUpi, setUberUpi] = useState('');

  // Optional Rapido inputs
  const [showRapido, setShowRapido] = useState(false);
  const [rapidoRides, setRapidoRides] = useState('');
  const [rapidoCash, setRapidoCash] = useState('');
  const [rapidoUpi, setRapidoUpi] = useState('');

  // Proof screenshot
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);

  // Calculations
  const oRides = parseInt(olaRides, 10) || 0;
  const oCash = parseFloat(olaCash) || 0;
  const oUpi = parseFloat(olaUpi) || 0;
  const oTotal = oCash + oUpi;

  const uRides = parseInt(uberRides, 10) || 0;
  const uCash = parseFloat(uberCash) || 0;
  const uUpi = parseFloat(uberUpi) || 0;
  const uTotal = uCash + uUpi;

  const rRides = parseInt(rapidoRides, 10) || 0;
  const rCash = parseFloat(rapidoCash) || 0;
  const rUpi = parseFloat(rapidoUpi) || 0;
  const rTotal = rCash + rUpi;

  const totalRides = oRides + uRides + (showRapido ? rRides : 0);
  const totalCash = oCash + uCash + (showRapido ? rCash : 0);
  const totalUpi = oUpi + uUpi + (showRapido ? rUpi : 0);
  const totalGross = oTotal + uTotal + (showRapido ? rTotal : 0);

  // 50/50 worker split
  const worker50 = Math.round(totalGross * 0.5);
  // Net cash settlement: Cash in hand minus worker's 50% share
  const cashDelta = totalCash - worker50;

  useEffect(() => {
    async function loadAutoEntries() {
      const dId = currentUser?.uid || driverProfile?.id;
      if (!dId) return;
      setLoadingAutoFill(true);
      try {
        const entries = await getShiftRideEntries({ driverId: dId });
        if (entries && entries.length > 0) {
          const todayPrefix = date || new Date().toISOString().split('T')[0];
          const todayEntries = entries.filter(e => {
            if (!e.timestamp) return true;
            return e.timestamp.startsWith(todayPrefix);
          });

          const relevant = todayEntries.length > 0 ? todayEntries : entries;

          let oR = 0, oC = 0, oU = 0;
          let uR = 0, uC = 0, uU = 0;
          let rR = 0, rC = 0, rU = 0;

          relevant.forEach(item => {
            const p = (item.platform || 'OLA').toUpperCase();
            const fare = Number(item.fare) || 0;
            const isCash = item.paymentMethod === 'CASH';

            if (p === 'OLA') {
              oR += 1;
              if (isCash) oC += fare;
              else oU += fare;
            } else if (p === 'UBER') {
              uR += 1;
              if (isCash) uC += fare;
              else uU += fare;
            } else if (p === 'RAPIDO') {
              rR += 1;
              if (isCash) rC += fare;
              else rU += fare;
            }
          });

          if (oR > 0) {
            setOlaRides(String(oR));
            setOlaCash(String(oC));
            setOlaUpi(String(oU));
          }
          if (uR > 0) {
            setUberRides(String(uR));
            setUberCash(String(uC));
            setUberUpi(String(uU));
          }
          if (rR > 0) {
            setShowRapido(true);
            setRapidoRides(String(rR));
            setRapidoCash(String(rC));
            setRapidoUpi(String(rU));
          }

          if (relevant.length > 0) {
            setAutoLoadedCount(relevant.length);
          }
        }
      } catch (err) {
        console.warn('Auto fill fetch error:', err);
      } finally {
        setLoadingAutoFill(false);
      }
    }

    loadAutoEntries();
  }, [currentUser?.uid, driverProfile?.id, date]);

  const handlePickProof = async () => {
    try {
      Alert.alert(
        'Upload Earnings Proof',
        'Choose how to attach your Ola / Uber summary screenshot:',
        [
          {
            text: 'Choose from Gallery 📱',
            onPress: async () => {
              const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.8
              });
              if (!res.canceled && res.assets && res.assets.length > 0) {
                setImageUri(res.assets[0].uri);
              }
            }
          },
          {
            text: 'Take Live Photo 📸',
            onPress: async () => {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) {
                Alert.alert('Permission Denied', 'Camera permission required.');
                return;
              }
              const res = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.8
              });
              if (!res.canceled && res.assets && res.assets.length > 0) {
                setImageUri(res.assets[0].uri);
              }
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSubmit = async () => {
    if (totalGross <= 0) {
      Alert.alert('Income Required', 'Please enter Ola ya Uber ka earnings amount.');
      return;
    }

    setLoading(true);
    try {
      await submitDailyRideEarnings({
        driverId: currentUser?.uid || driverProfile?.id,
        date,
        grossIncome: totalGross,
        platformCharges: 0,
        completedRidesCount: totalRides,
        cancelledRidesCount: 0,
        cashRidesCollected: totalCash,
        olaDetails: {
          rides: oRides,
          cash: oCash,
          upi: oUpi,
          total: oTotal
        },
        uberDetails: {
          rides: uRides,
          cash: uCash,
          upi: uUpi,
          total: uTotal
        },
        rapidoDetails: showRapido ? {
          rides: rRides,
          cash: rCash,
          upi: rUpi,
          total: rTotal
        } : null,
        uri: imageUri,
        fileName: 'platform_summary.jpg'
      });

      Alert.alert(
        'Hisaab Submitted! ✅',
        `Aaj ka hisaab submit ho gaya hai.\n\n• Total Rides: ${totalRides}\n• Gross Kamai: ₹${totalGross}\n• Aapka 50% Share: ₹${worker50}\n• Cash in Hand: ₹${totalCash}`,
        [{ text: 'OK', onPress: () => (navigation?.goBack ? navigation.goBack() : navigation?.navigate && navigation.navigate('Home')) }]
      );
    } catch (err) {
      Alert.alert('Submission Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topBackRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (navigation?.goBack ? navigation.goBack() : navigation?.navigate && navigation.navigate('Home'))}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.heading}>Submit Daily Income</Text>
      <Text style={styles.subheading}>
        Aaj ka Ola aur Uber income enter karein (Simple Hisaab)
      </Text>

      {/* Simple Guidance Card in Hinglish */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerTitle}>💡 Simple Hisaab Rule</Text>
        <Text style={styles.infoBannerText}>
          • Ola aur Uber ke rides, cash aur online amounts daalein.{'\n'}
          • 50% Share aur depot jama rashi auto-calculate hogi.{'\n'}
          • Petrol ka kharcha MM Ride ka hai (Aapka share safe hai).
        </Text>
      </View>

      {/* Auto-Loaded from Shift Logger Banner */}
      {autoLoadedCount > 0 && (
        <View style={styles.autoLoadedBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Text style={{ fontSize: 20 }}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.autoLoadedTitle}>
                  Auto-Filled {autoLoadedCount} Rides from Today's Shift!
                </Text>
                <Text style={styles.autoLoadedSub}>
                  Floating Logger se Ola / Uber data pre-fill ho gaya hai.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                setOlaRides('');
                setOlaCash('');
                setOlaUpi('');
                setUberRides('');
                setUberCash('');
                setUberUpi('');
                setRapidoRides('');
                setRapidoCash('');
                setRapidoUpi('');
                setAutoLoadedCount(0);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.clearBtnText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loadingAutoFill && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <ActivityIndicator size="small" color="#F59E0B" />
          <Text style={{ color: '#94A3B8', fontSize: 12 }}>Checking today's shift logs...</Text>
        </View>
      )}

      {/* Date */}
      <View style={styles.dateCard}>
        <Text style={styles.dateLabel}>📅 Date (Taareekh)</Text>
        <TextInput
          style={styles.dateInput}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#64748B"
        />
      </View>

      {/* 1. OLA DRIVER SECTION */}
      <View style={[styles.card, { borderColor: 'rgba(245, 158, 11, 0.4)' }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={{ fontSize: 22 }}>🚕</Text>
          <Text style={[styles.cardTitle, { color: '#FCD34D' }]}>OLA DRIVER</Text>
          {oTotal > 0 && (
            <View style={styles.subtotalBadge}>
              <Text style={styles.subtotalBadgeText}>₹{oTotal}</Text>
            </View>
          )}
        </View>

        <Text style={styles.inputLabel}>Total Rides (Kitne Rides?)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 8"
          placeholderTextColor="#64748B"
          keyboardType="number-pad"
          value={olaRides}
          onChangeText={setOlaRides}
        />

        <View style={styles.twoColRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>💵 Cash Mila (₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 450"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={olaCash}
              onChangeText={setOlaCash}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>📲 UPI / Online (₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 650"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={olaUpi}
              onChangeText={setOlaUpi}
            />
          </View>
        </View>
      </View>

      {/* 2. UBER DRIVER SECTION */}
      <View style={[styles.card, { borderColor: 'rgba(56, 189, 248, 0.4)' }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={{ fontSize: 22 }}>🚗</Text>
          <Text style={[styles.cardTitle, { color: '#38BDF8' }]}>UBER DRIVER</Text>
          {uTotal > 0 && (
            <View style={[styles.subtotalBadge, { backgroundColor: 'rgba(56, 189, 248, 0.2)' }]}>
              <Text style={[styles.subtotalBadgeText, { color: '#7DD3FC' }]}>₹{uTotal}</Text>
            </View>
          )}
        </View>

        <Text style={styles.inputLabel}>Total Rides (Kitne Rides?)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 6"
          placeholderTextColor="#64748B"
          keyboardType="number-pad"
          value={uberRides}
          onChangeText={setUberRides}
        />

        <View style={styles.twoColRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>💵 Cash Mila (₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 300"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={uberCash}
              onChangeText={setUberCash}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>📲 UPI / Online (₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 800"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={uberUpi}
              onChangeText={setUberUpi}
            />
          </View>
        </View>
      </View>

      {/* 3. OPTIONAL RAPIDO SECTION */}
      {!showRapido ? (
        <TouchableOpacity
          style={styles.addRapidoBtn}
          onPress={() => setShowRapido(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.addRapidoText}>+ Rapido Rides Add Karein (Optional)</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.card, { borderColor: 'rgba(234, 179, 8, 0.4)' }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={{ fontSize: 22 }}>🛵</Text>
            <Text style={[styles.cardTitle, { color: '#FACC15' }]}>RAPIDO CAPTAIN</Text>
            <TouchableOpacity onPress={() => setShowRapido(false)}>
              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>Remove ✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>Total Rides (Kitne Rides?)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 4"
            placeholderTextColor="#64748B"
            keyboardType="number-pad"
            value={rapidoRides}
            onChangeText={setRapidoRides}
          />

          <View style={styles.twoColRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>💵 Cash Mila (₹)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 150"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={rapidoCash}
                onChangeText={setRapidoCash}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>📲 UPI / Online (₹)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 250"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={rapidoUpi}
                onChangeText={setRapidoUpi}
              />
            </View>
          </View>
        </View>
      )}

      {/* 4. AUTO-CALCULATED TOTAL HISAAB SUMMARY */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryHeaderTitle}>📊 TOTAL HISAAB (Summary)</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>Total Completed Rides:</Text>
          <Text style={styles.summaryRowVal}>{totalRides} Rides</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>Total Gross Kamai:</Text>
          <Text style={[styles.summaryRowVal, { color: '#38BDF8', fontWeight: '800' }]}>₹{totalGross}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>💵 Total Cash (Aapke paas):</Text>
          <Text style={[styles.summaryRowVal, { color: '#FCD34D' }]}>₹{totalCash}</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>📲 Total Online / UPI:</Text>
          <Text style={[styles.summaryRowVal, { color: '#34D399' }]}>₹{totalUpi}</Text>
        </View>

        <View style={styles.divider} />

        {/* 50% Worker Share Box */}
        <View style={styles.splitHighlightBox}>
          <Text style={styles.splitBoxLabel}>Aapka 50% Share (Worker Earning):</Text>
          <Text style={styles.splitBoxAmount}>₹{worker50}</Text>
          <Text style={styles.splitBoxSub}>
            (Total Kamai ₹{totalGross} ka aadha 50%)
          </Text>
        </View>

        {/* Actionable Settlement Guidance */}
        {totalGross > 0 && (
          <View style={[
            styles.settlementAlertBox, 
            cashDelta > 0 ? styles.settlementGiveBox : styles.settlementTakeBox
          ]}>
            {cashDelta > 0 ? (
              <>
                <Text style={styles.settlementAlertTitle}>
                  🔴 Depot me Jama Karna Hai: ₹{cashDelta}
                </Text>
                <Text style={styles.settlementAlertDesc}>
                  Aapke paas cash (₹{totalCash}) zyada hai. Apna 50% share (₹{worker50}) kaat kar bacha hua ₹{cashDelta} depot me dena hai.
                </Text>
              </>
            ) : cashDelta < 0 ? (
              <>
                <Text style={[styles.settlementAlertTitle, { color: '#34D399' }]}>
                  🟢 Depot se Milna Hai: ₹{Math.abs(cashDelta)}
                </Text>
                <Text style={[styles.settlementAlertDesc, { color: '#D1FAE5' }]}>
                  Customer ne UPI zyada kiya. Depot aapko bacha hua ₹{Math.abs(cashDelta)} UPI ya Cash me dega.
                </Text>
              </>
            ) : (
              <Text style={styles.settlementAlertTitle}>
                ⚪ Hisaab Barabar (0 Cash Exchange)
              </Text>
            )}
          </View>
        )}
      </View>

      {/* 5. SCREENSHOT PROOF (OPTIONAL) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📸 Screenshot Proof (Optional)</Text>
        <Text style={styles.subNote}>
          Agar Ola ya Uber daily summary ka photo hai toh attach karein:
        </Text>

        {imageUri ? (
          <View style={{ alignItems: 'center' }}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity onPress={handlePickProof} style={{ padding: 8 }}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Change Photo 🔄</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.uploadPlaceholder} onPress={handlePickProof}>
            <Text style={{ fontSize: 30, marginBottom: 4 }}>📱</Text>
            <Text style={{ color: colors.primaryLight, fontWeight: '700', fontSize: 13 }}>
              Upload Summary Screenshot (Optional)
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <BigButton
        title="Submit Today's Hisaab ✅"
        onPress={handleSubmit}
        loading={loading}
        variant="primary"
        style={{ marginTop: 6, marginBottom: 40 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 16
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
  infoBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16
  },
  infoBannerTitle: {
    color: '#F59E0B',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 4
  },
  infoBannerText: {
    color: '#FDE68A',
    fontSize: 12,
    lineHeight: 18
  },
  dateCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dateLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700'
  },
  dateInput: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 120,
    textAlign: 'center'
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 14
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    flex: 1
  },
  subtotalBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)'
  },
  subtotalBadgeText: {
    color: '#FCD34D',
    fontWeight: '800',
    fontSize: 13
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 5,
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
  twoColRow: {
    flexDirection: 'row',
    gap: 12
  },
  addRapidoBtn: {
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.25)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14
  },
  addRapidoText: {
    color: '#FACC15',
    fontWeight: '700',
    fontSize: 13
  },
  summaryCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    marginBottom: 14
  },
  summaryHeaderTitle: {
    color: '#93C5FD',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4
  },
  summaryRowLabel: {
    color: '#94A3B8',
    fontSize: 13
  },
  summaryRowVal: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700'
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 10
  },
  splitHighlightBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    marginBottom: 10
  },
  splitBoxLabel: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '700'
  },
  splitBoxAmount: {
    color: '#34D399',
    fontSize: 32,
    fontWeight: '900',
    marginVertical: 2
  },
  splitBoxSub: {
    color: '#6EE7B7',
    fontSize: 11
  },
  settlementAlertBox: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1
  },
  settlementGiveBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444'
  },
  settlementTakeBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981'
  },
  settlementAlertTitle: {
    color: '#F87171',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 3
  },
  settlementAlertDesc: {
    color: '#FECACA',
    fontSize: 11,
    lineHeight: 16
  },
  subNote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 10
  },
  uploadPlaceholder: {
    height: 90,
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
    height: 180,
    borderRadius: 10,
    resizeMode: 'contain',
    backgroundColor: '#000',
    marginBottom: 8
  },
  topBackRow: {
    marginBottom: 12,
    alignSelf: 'flex-start'
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  backBtnText: {
    color: colors.primaryLight,
    fontSize: 13,
    fontWeight: '700'
  },
  autoLoadedBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16
  },
  autoLoadedTitle: {
    color: '#34D399',
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 2
  },
  autoLoadedSub: {
    color: '#A7F3D0',
    fontSize: 11
  },
  clearBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444'
  },
  clearBtnText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '800'
  }
});
