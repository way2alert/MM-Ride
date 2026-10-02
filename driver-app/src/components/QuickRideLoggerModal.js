import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Vibration
} from 'react-native';
import { colors } from '../utils/colors';
import { logShiftRideEntry } from '../firebase/api';

const PRESET_FARES = [30, 40, 50, 60, 80, 100, 120, 150, 200, 250];

export default function QuickRideLoggerModal({
  visible,
  onClose,
  driverId,
  dutyId,
  currentLocation,
  onRideLogged,
  initialPlatform = 'OLA'
}) {
  const [platform, setPlatform] = useState(initialPlatform); // 'OLA' | 'UBER' | 'RAPIDO'
  const [paymentMethod, setPaymentMethod] = useState('CASH'); // 'CASH' | 'UPI' | 'SPLIT'
  const [fare, setFare] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');
  const [saving, setSaving] = useState(false);

  const parsedFare = parseFloat(fare) || 0;
  const parsedSplitCash = parseFloat(splitCash) || 0;
  const parsedSplitUpi = parseFloat(splitUpi) || 0;
  const parsedSplitTotal = parsedSplitCash + parsedSplitUpi;

  const effectiveFare = paymentMethod === 'SPLIT' ? parsedSplitTotal : parsedFare;
  const estDriverShare = Math.round(effectiveFare * 0.5);

  const handlePresetSelect = (amt) => {
    setFare(String(amt));
    try {
      Vibration.vibrate(30);
    } catch (_) {}
  };

  const handleSave = async () => {
    if (paymentMethod === 'SPLIT') {
      if (parsedSplitTotal <= 0) {
        Alert.alert('Amount Required', 'Please enter Cash and UPI amounts (பணம் உள்ளிடவும்).');
        return;
      }
    } else {
      if (parsedFare <= 0) {
        Alert.alert('Fare Required', 'Please select a fare button or type the amount (கட்டணம் உள்ளிடவும்).');
        return;
      }
    }

    if (!driverId) {
      Alert.alert('Session Missing', 'Driver session missing. Please restart your shift.');
      return;
    }

    setSaving(true);
    try {
      const finalFare = paymentMethod === 'SPLIT' ? parsedSplitTotal : parsedFare;
      const finalCash = paymentMethod === 'SPLIT' ? parsedSplitCash : (paymentMethod === 'CASH' ? parsedFare : 0);
      const finalUpi = paymentMethod === 'SPLIT' ? parsedSplitUpi : (paymentMethod === 'UPI' ? parsedFare : 0);

      await logShiftRideEntry({
        driverId,
        dutyId: dutyId || null,
        platform,
        paymentMethod,
        fare: finalFare,
        cashAmount: finalCash,
        upiAmount: finalUpi,
        location: currentLocation || null
      });

      try {
        Vibration.vibrate([0, 50, 50, 50]);
      } catch (_) {}

      const loggedItem = {
        platform,
        paymentMethod,
        fare: finalFare,
        cashAmount: finalCash,
        upiAmount: finalUpi,
        timestamp: new Date().toISOString()
      };

      if (onRideLogged) {
        onRideLogged(loggedItem);
      }

      setFare('');
      setSplitCash('');
      setSplitUpi('');

      const paymentSummary = paymentMethod === 'SPLIT'
        ? `Split (💵 ₹${finalCash} + 📲 ₹${finalUpi})`
        : (paymentMethod === 'CASH' ? '💵 Cash' : '📲 UPI');

      Alert.alert(
        'Ride Saved! ✅',
        `${platform} • ${paymentSummary} • ₹${finalFare}\nYour 50% Share: ₹${estDriverShare}\n\nAdded to today's shift earnings!`,
        [
          {
            text: 'Stay in App',
            style: 'cancel',
            onPress: onClose
          },
          {
            text: `Open ${platform === 'UBER' ? 'Uber' : platform === 'RAPIDO' ? 'Rapido' : 'Ola'} App 🚀`,
            onPress: () => {
              onClose();
              launchDriverApp(platform);
            }
          }
        ]
      );
    } catch (err) {
      console.error('Failed to log shift ride:', err);
      Alert.alert('Save Error', err.message || 'Unable to save ride. Please check network.');
    } finally {
      setSaving(false);
    }
  };

  const launchDriverApp = async (targetPlatform) => {
    let pkg = 'com.olacabs.oladriver';
    let scheme = 'oladriver://';

    if (targetPlatform === 'UBER') {
      pkg = 'com.ubercab.driver';
      scheme = 'uberdriver://';
    } else if (targetPlatform === 'RAPIDO') {
      pkg = 'com.rapido.rider';
      scheme = 'rapido://';
    }

    try {
      const intentUrl = `intent:#Intent;package=${pkg};end`;
      try {
        await Linking.openURL(intentUrl);
        return;
      } catch (_) {}

      try {
        await Linking.openURL(scheme);
        return;
      } catch (_) {}

      await Linking.openURL(`market://details?id=${pkg}`).catch(() => {});
    } catch (e) {
      console.warn('Could not launch driver app:', e);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.sheetContainer}>
          {/* Header Bar */}
          <View style={styles.sheetHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.boltIcon}>
                <Text style={{ fontSize: 18 }}>⚡</Text>
              </View>
              <View>
                <Text style={styles.sheetTitle}>Quick Ride Entry (விரைவு பதிவு)</Text>
                <Text style={styles.sheetSub}>3-tap fast save • Record fare in 2 seconds</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Step 1: Select Platform */}
            <Text style={styles.sectionLabel}>1. SELECT PLATFORM (பிளாட்ஃபார்ம்)</Text>
            <View style={styles.platformRow}>
              <TouchableOpacity
                style={[styles.platformCard, platform === 'OLA' && styles.platformCardOlaActive]}
                onPress={() => setPlatform('OLA')}
                activeOpacity={0.8}
              >
                <Text style={styles.platformEmoji}>🚕</Text>
                <Text style={[styles.platformTitle, platform === 'OLA' && styles.platformTextOlaActive]}>OLA</Text>
                <Text style={styles.platformSub}>Ola Partner</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.platformCard, platform === 'UBER' && styles.platformCardUberActive]}
                onPress={() => setPlatform('UBER')}
                activeOpacity={0.8}
              >
                <Text style={styles.platformEmoji}>🚗</Text>
                <Text style={[styles.platformTitle, platform === 'UBER' && styles.platformTextUberActive]}>UBER</Text>
                <Text style={styles.platformSub}>Uber Driver</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.platformCard, platform === 'RAPIDO' && styles.platformCardRapidoActive]}
                onPress={() => setPlatform('RAPIDO')}
                activeOpacity={0.8}
              >
                <Text style={styles.platformEmoji}>🛵</Text>
                <Text style={[styles.platformTitle, platform === 'RAPIDO' && styles.platformTextRapidoActive]}>RAPIDO</Text>
                <Text style={styles.platformSub}>Captain</Text>
              </TouchableOpacity>
            </View>

            {/* Step 2: Payment Method */}
            <Text style={styles.sectionLabel}>2. PAYMENT METHOD (பணம் முறை)</Text>
            <View style={styles.paymentRow}>
              <TouchableOpacity
                style={[styles.paymentCard, paymentMethod === 'CASH' && styles.paymentCardCashActive]}
                onPress={() => setPaymentMethod('CASH')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 22, marginBottom: 2 }}>💵</Text>
                <Text style={[styles.paymentTitle, paymentMethod === 'CASH' && styles.paymentTextCashActive]}>
                  CASH (ரொக்கம்)
                </Text>
                <Text style={styles.paymentSub}>Passenger paid Cash</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.paymentCard, paymentMethod === 'UPI' && styles.paymentCardUpiActive]}
                onPress={() => setPaymentMethod('UPI')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 22, marginBottom: 2 }}>📲</Text>
                <Text style={[styles.paymentTitle, paymentMethod === 'UPI' && styles.paymentTextUpiActive]}>
                  ONLINE / UPI
                </Text>
                <Text style={styles.paymentSub}>App / QR Payment</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.paymentCard, paymentMethod === 'SPLIT' && styles.paymentCardSplitActive]}
                onPress={() => setPaymentMethod('SPLIT')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 22, marginBottom: 2 }}>⚡</Text>
                <Text style={[styles.paymentTitle, paymentMethod === 'SPLIT' && styles.paymentTextSplitActive]}>
                  SPLIT
                </Text>
                <Text style={styles.paymentSub}>Cash + UPI</Text>
              </TouchableOpacity>
            </View>

            {/* Step 3: Fare Amount / Split Inputs */}
            {paymentMethod === 'SPLIT' ? (
              <View style={styles.splitSection}>
                <Text style={styles.sectionLabel}>3. SPLIT AMOUNT (Cash & UPI)</Text>

                {/* Cash Input */}
                <View style={styles.splitInputBox}>
                  <Text style={styles.splitInputTitleCash}>💵 Cash Collected (ரொக்கம்)</Text>
                  <View style={[styles.inputContainer, styles.inputContainerCash]}>
                    <Text style={[styles.currencySymbol, { color: '#10B981' }]}>₹</Text>
                    <TextInput
                      style={styles.fareInput}
                      placeholder="e.g. 50"
                      placeholderTextColor="#64748B"
                      keyboardType="numeric"
                      value={splitCash}
                      onChangeText={setSplitCash}
                    />
                  </View>
                </View>

                {/* UPI Input */}
                <View style={styles.splitInputBox}>
                  <Text style={styles.splitInputTitleUpi}>📲 UPI / Online Received</Text>
                  <View style={[styles.inputContainer, styles.inputContainerUpi]}>
                    <Text style={[styles.currencySymbol, { color: '#60A5FA' }]}>₹</Text>
                    <TextInput
                      style={styles.fareInput}
                      placeholder="e.g. 100"
                      placeholderTextColor="#64748B"
                      keyboardType="numeric"
                      value={splitUpi}
                      onChangeText={setSplitUpi}
                    />
                  </View>
                </View>

                {/* Total Breakdown Banner */}
                <View style={styles.splitTotalBanner}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.splitTotalLabel}>TOTAL FARE (மொத்த கட்டணம்):</Text>
                    <Text style={styles.splitTotalValue}>₹{parsedSplitTotal}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={{ color: '#34D399', fontSize: 12, fontWeight: '700' }}>
                      💵 Cash: ₹{parsedSplitCash}
                    </Text>
                    <Text style={{ color: '#60A5FA', fontSize: 12, fontWeight: '700' }}>
                      📲 UPI: ₹{parsedSplitUpi}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.sectionLabel}>3. TAP FARE AMOUNT (கட்டணம் தேர்வு செய்க)</Text>
                
                {/* 1-Tap Quick Fare Buttons (Optimized for Bike Taxi Fares) */}
                <View style={styles.chipsWrap}>
                  {PRESET_FARES.map((amt) => {
                    const isSelected = parsedFare === amt;
                    return (
                      <TouchableOpacity
                        key={amt}
                        style={[styles.fareChip, isSelected && styles.fareChipActive]}
                        onPress={() => handlePresetSelect(amt)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.fareChipText, isSelected && styles.fareChipTextActive]}>
                          ₹{amt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom Amount Input Box */}
                <View style={styles.customInputRow}>
                  <Text style={styles.customInputLabel}>Or enter exact amount (வேறு கட்டணம்):</Text>
                  <View style={styles.inputContainer}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <TextInput
                      style={styles.fareInput}
                      placeholder="Type fare (e.g. 145)"
                      placeholderTextColor="#64748B"
                      keyboardType="numeric"
                      value={fare}
                      onChangeText={setFare}
                    />
                  </View>
                </View>

                {/* Real-time Confirmation Badge */}
                {parsedFare > 0 && (
                  <View style={styles.summaryPill}>
                    <Text style={styles.summaryPillText}>
                      Ready to Log: <Text style={{ color: '#F8FAFC', fontWeight: '900' }}>{platform}</Text> •{' '}
                      <Text style={{ color: paymentMethod === 'CASH' ? '#34D399' : '#60A5FA', fontWeight: '900' }}>
                        {paymentMethod === 'CASH' ? 'Cash' : 'Online UPI'}
                      </Text>{' '}
                      • <Text style={{ color: '#FCD34D', fontWeight: '900' }}>₹{parsedFare}</Text>
                      {' '}(Your 50%: <Text style={{ color: '#34D399', fontWeight: '900' }}>₹{estDriverShare}</Text>)
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Prominent Save Button */}
            <TouchableOpacity
              style={[styles.saveBtn, effectiveFare <= 0 && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || effectiveFare <= 0}
              activeOpacity={0.88}
            >
              {saving ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <Text style={styles.saveBtnText}>
                  💾 SAVE RIDE (₹{effectiveFare > 0 ? effectiveFare : '0'}) • சேமிக்கவும் ➔
                </Text>
              )}
            </TouchableOpacity>

            {/* Quick Switch to Partner App Bar */}
            <View style={styles.appSwitchSection}>
              <Text style={styles.appSwitchLabel}>Return to Driving App:</Text>
              <View style={styles.appSwitchRow}>
                <TouchableOpacity
                  style={styles.switchAppBtn}
                  onPress={() => launchDriverApp('OLA')}
                  activeOpacity={0.75}
                >
                  <Text style={styles.switchAppText}>🚕 Ola Driver</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchAppBtn}
                  onPress={() => launchDriverApp('UBER')}
                  activeOpacity={0.75}
                >
                  <Text style={styles.switchAppText}>🚗 Uber Driver</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchAppBtn}
                  onPress={() => launchDriverApp('RAPIDO')}
                  activeOpacity={0.75}
                >
                  <Text style={styles.switchAppText}>🛵 Rapido</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'flex-end'
  },
  sheetContainer: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    padding: 18,
    maxHeight: '94%'
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  boltIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800'
  },
  sheetSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: 'bold'
  },
  sectionLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4
  },
  platformRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14
  },
  platformCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  platformCardOlaActive: {
    borderColor: '#EAB308',
    backgroundColor: 'rgba(234, 179, 8, 0.12)'
  },
  platformCardUberActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)'
  },
  platformCardRapidoActive: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.12)'
  },
  platformEmoji: {
    fontSize: 22,
    marginBottom: 2
  },
  platformTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '800'
  },
  platformTextOlaActive: {
    color: '#FACC15'
  },
  platformTextUberActive: {
    color: '#38BDF8'
  },
  platformTextRapidoActive: {
    color: '#FBBF24'
  },
  platformSub: {
    color: '#64748B',
    fontSize: 9,
    marginTop: 1
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14
  },
  paymentCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  paymentCardCashActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)'
  },
  paymentCardUpiActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)'
  },
  paymentCardSplitActive: {
    borderColor: '#A855F7',
    backgroundColor: 'rgba(168, 85, 247, 0.12)'
  },
  paymentTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center'
  },
  paymentTextCashActive: {
    color: '#34D399'
  },
  paymentTextUpiActive: {
    color: '#38BDF8'
  },
  paymentTextSplitActive: {
    color: '#C084FC'
  },
  paymentSub: {
    color: '#64748B',
    fontSize: 8,
    marginTop: 1,
    textAlign: 'center'
  },
  splitSection: {
    marginBottom: 14
  },
  splitInputBox: {
    marginBottom: 10
  },
  splitInputTitleCash: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4
  },
  splitInputTitleUpi: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4
  },
  splitTotalBanner: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 4
  },
  splitTotalLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '800'
  },
  splitTotalValue: {
    color: '#FCD34D',
    fontSize: 18,
    fontWeight: '900'
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14
  },
  fareChip: {
    width: '18%',
    minWidth: 58,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  fareChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4
  },
  fareChipText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800'
  },
  fareChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '900'
  },
  customInputRow: {
    marginBottom: 14
  },
  customInputLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 6
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  inputContainerCash: {
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  inputContainerUpi: {
    borderColor: 'rgba(56, 189, 248, 0.3)'
  },
  currencySymbol: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '800',
    marginRight: 6
  },
  fareInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 10
  },
  summaryPill: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)'
  },
  summaryPillText: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '600'
  },
  saveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6
  },
  saveBtnDisabled: {
    backgroundColor: '#334155',
    shadowOpacity: 0,
    elevation: 0
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  appSwitchSection: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 12
  },
  appSwitchLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5
  },
  appSwitchRow: {
    flexDirection: 'row',
    gap: 8
  },
  switchAppBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  switchAppText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700'
  }
});
