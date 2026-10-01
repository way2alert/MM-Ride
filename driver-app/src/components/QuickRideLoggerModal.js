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
  ScrollView
} from 'react-native';
import { colors } from '../utils/colors';
import { logShiftRideEntry } from '../firebase/api';

const PRESET_FARES = [40, 60, 80, 100, 150, 200, 250, 300];

export default function QuickRideLoggerModal({
  visible,
  onClose,
  driverId,
  dutyId,
  currentLocation,
  onRideLogged
}) {
  const [platform, setPlatform] = useState('OLA'); // 'OLA' | 'UBER' | 'RAPIDO'
  const [paymentMethod, setPaymentMethod] = useState('CASH'); // 'CASH' | 'UPI'
  const [fare, setFare] = useState('');
  const [saving, setSaving] = useState(false);

  const parsedFare = parseFloat(fare) || 0;

  const handlePresetSelect = (amt) => {
    setFare(String(amt));
  };

  const handleSave = async () => {
    if (parsedFare <= 0) {
      Alert.alert('Fare Required', 'Kripya ride ka fare (₹) enter karein ya preset button dabayein.');
      return;
    }

    if (!driverId) {
      Alert.alert('Error', 'Driver session missing. Please restart shift.');
      return;
    }

    setSaving(true);
    try {
      await logShiftRideEntry({
        driverId,
        dutyId: dutyId || null,
        platform,
        paymentMethod,
        fare: parsedFare,
        location: currentLocation || null
      });

      const loggedItem = {
        platform,
        paymentMethod,
        fare: parsedFare,
        timestamp: new Date().toISOString()
      };

      if (onRideLogged) {
        onRideLogged(loggedItem);
      }

      setFare('');
      Alert.alert(
        'Ride Saved! ✅',
        `${platform} • ${paymentMethod === 'CASH' ? '💵 Cash' : '📲 UPI'} • ₹${parsedFare}\n\nToday's hisaab me add ho gaya hai!`,
        [
          {
            text: 'Stay in App',
            style: 'cancel',
            onPress: onClose
          },
          {
            text: `Open ${platform === 'UBER' ? 'Uber' : 'Ola'} App 🚀`,
            onPress: () => {
              onClose();
              launchDriverApp(platform);
            }
          }
        ]
      );
    } catch (err) {
      console.error('Failed to log shift ride:', err);
      Alert.alert('Save Error', err.message || 'Ride save nahi ho saki.');
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.boltIcon}>
                <Text style={{ fontSize: 16 }}>⚡</Text>
              </View>
              <View>
                <Text style={styles.sheetTitle}>Quick Ride Log</Text>
                <Text style={styles.sheetSub}>Ride khatam? 2 second me hisaab save karein</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Step 1: Select Platform */}
            <Text style={styles.sectionLabel}>1. PLATFORM CHUNIYE (Kaunsi ride thi?)</Text>
            <View style={styles.platformRow}>
              <TouchableOpacity
                style={[styles.platformCard, platform === 'OLA' && styles.platformCardOlaActive]}
                onPress={() => setPlatform('OLA')}
                activeOpacity={0.8}
              >
                <Text style={styles.platformEmoji}>🚕</Text>
                <Text style={[styles.platformTitle, platform === 'OLA' && styles.platformTextOlaActive]}>OLA</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.platformCard, platform === 'UBER' && styles.platformCardUberActive]}
                onPress={() => setPlatform('UBER')}
                activeOpacity={0.8}
              >
                <Text style={styles.platformEmoji}>🚗</Text>
                <Text style={[styles.platformTitle, platform === 'UBER' && styles.platformTextUberActive]}>UBER</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.platformCard, platform === 'RAPIDO' && styles.platformCardRapidoActive]}
                onPress={() => setPlatform('RAPIDO')}
                activeOpacity={0.8}
              >
                <Text style={styles.platformEmoji}>🛵</Text>
                <Text style={[styles.platformTitle, platform === 'RAPIDO' && styles.platformTextRapidoActive]}>RAPIDO</Text>
              </TouchableOpacity>
            </View>

            {/* Step 2: Payment Method */}
            <Text style={styles.sectionLabel}>2. PAYMENT METHOD (Paisa kaise mila?)</Text>
            <View style={styles.paymentRow}>
              <TouchableOpacity
                style={[styles.paymentCard, paymentMethod === 'CASH' && styles.paymentCardCashActive]}
                onPress={() => setPaymentMethod('CASH')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 20 }}>💵</Text>
                <View style={{ marginLeft: 8 }}>
                  <Text style={[styles.paymentTitle, paymentMethod === 'CASH' && styles.paymentTextCashActive]}>
                    CASH MILA
                  </Text>
                  <Text style={styles.paymentSub}>Passenger ne hath me diya</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.paymentCard, paymentMethod === 'UPI' && styles.paymentCardUpiActive]}
                onPress={() => setPaymentMethod('UPI')}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 20 }}>📲</Text>
                <View style={{ marginLeft: 8 }}>
                  <Text style={[styles.paymentTitle, paymentMethod === 'UPI' && styles.paymentTextUpiActive]}>
                    UPI / ONLINE
                  </Text>
                  <Text style={styles.paymentSub}>App / QR me jama hua</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Step 3: Fare Amount */}
            <Text style={styles.sectionLabel}>3. FARE AMOUNT (Total Kiraya ₹)</Text>
            
            {/* Quick Fare Chips */}
            <View style={styles.chipsWrap}>
              {PRESET_FARES.map((amt) => {
                const isSelected = parsedFare === amt;
                return (
                  <TouchableOpacity
                    key={amt}
                    style={[styles.fareChip, isSelected && styles.fareChipActive]}
                    onPress={() => handlePresetSelect(amt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.fareChipText, isSelected && styles.fareChipTextActive]}>
                      ₹{amt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Amount Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.fareInput}
                placeholder="Ya yahan amount daalein (e.g. 145)"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={fare}
                onChangeText={setFare}
              />
            </View>

            {/* Real-time Confirmation Badge */}
            {parsedFare > 0 && (
              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillText}>
                  Logging: <Text style={{ color: '#F8FAFC', fontWeight: '900' }}>{platform}</Text> •{' '}
                  <Text style={{ color: paymentMethod === 'CASH' ? '#34D399' : '#60A5FA', fontWeight: '900' }}>
                    {paymentMethod === 'CASH' ? 'Cash' : 'UPI Online'}
                  </Text>{' '}
                  • <Text style={{ color: '#FCD34D', fontWeight: '900' }}>₹{parsedFare}</Text>
                </Text>
              </View>
            )}

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveBtn, parsedFare <= 0 && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || parsedFare <= 0}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <Text style={styles.saveBtnText}>
                  ⚡ SAVE RIDE (₹{parsedFare > 0 ? parsedFare : '0'})
                </Text>
              )}
            </TouchableOpacity>

            {/* Quick Switch to Partner App */}
            <View style={styles.appSwitchSection}>
              <Text style={styles.appSwitchLabel}>Switch back to driver app:</Text>
              <View style={styles.appSwitchRow}>
                <TouchableOpacity
                  style={styles.switchAppBtn}
                  onPress={() => launchDriverApp('OLA')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.switchAppText}>🚕 Ola Driver</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchAppBtn}
                  onPress={() => launchDriverApp('UBER')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.switchAppText}>🚗 Uber Driver</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchAppBtn}
                  onPress={() => launchDriverApp('RAPIDO')}
                  activeOpacity={0.7}
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
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'flex-end'
  },
  sheetContainer: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
    maxHeight: '92%'
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  boltIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3
  },
  sheetSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 1
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700'
  },
  sectionLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 10
  },
  platformRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  platformCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#334155'
  },
  platformCardOlaActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B'
  },
  platformCardUberActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: '#FFFFFF'
  },
  platformCardRapidoActive: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderColor: '#EAB308'
  },
  platformEmoji: {
    fontSize: 22,
    marginBottom: 4
  },
  platformTitle: {
    color: '#94A3B8',
    fontWeight: '800',
    fontSize: 13
  },
  platformTextOlaActive: {
    color: '#FCD34D'
  },
  platformTextUberActive: {
    color: '#FFFFFF'
  },
  platformTextRapidoActive: {
    color: '#FDE047'
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  paymentCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#334155'
  },
  paymentCardCashActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981'
  },
  paymentCardUpiActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#3B82F6'
  },
  paymentTitle: {
    color: '#94A3B8',
    fontWeight: '800',
    fontSize: 13
  },
  paymentTextCashActive: {
    color: '#34D399'
  },
  paymentTextUpiActive: {
    color: '#60A5FA'
  },
  paymentSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  fareChip: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20
  },
  fareChipActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B'
  },
  fareChipText: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 14
  },
  fareChipTextActive: {
    color: '#0F172A',
    fontWeight: '900'
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 14
  },
  currencySymbol: {
    color: '#F59E0B',
    fontSize: 22,
    fontWeight: '900',
    marginRight: 8
  },
  fareInput: {
    flex: 1,
    height: 48,
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700'
  },
  summaryPill: {
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    alignItems: 'center'
  },
  summaryPillText: {
    color: '#94A3B8',
    fontSize: 13
  },
  saveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  saveBtnDisabled: {
    backgroundColor: '#334155',
    shadowOpacity: 0,
    elevation: 0
  },
  saveBtnText: {
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.5
  },
  appSwitchSection: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 12
  },
  appSwitchLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8
  },
  appSwitchRow: {
    flexDirection: 'row',
    gap: 8
  },
  switchAppBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  switchAppText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700'
  }
});
