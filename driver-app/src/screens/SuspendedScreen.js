import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Alert
} from 'react-native';
import { colors } from '../utils/colors';
import { useDriver } from '../context/DriverContext';
import BigButton from '../components/BigButton';
import { bringAppToFront, showOverlayAlert } from '../services/floatingBubbleService';

export default function SuspendedScreen() {
  const { driverProfile, assignedBike, logout } = useDriver();
  const [checking, setChecking] = useState(false);

  const driverName = driverProfile?.fullName || 'Driver Partner';
  const driverPhone = driverProfile?.mobileNumber || '—';
  const driverId = driverProfile?.id || '—';
  const reason = driverProfile?.suspensionReason || 'Operational review pending by MM Ride Fleet Operations';
  const bikeReg = driverProfile?.assignedBikeRegistration || assignedBike?.registrationNumber || 'None';

  useEffect(() => {
    bringAppToFront();
    showOverlayAlert({
      title: 'ACCOUNT SUSPENDED ⛔',
      message: reason,
      alertType: 'SUSPENDED',
      autoOpenApp: true
    });
  }, [reason]);

  const primaryAdminPhone = '9841307455';
  const backupAdminPhone = '7200723901';

  const handleCallSupport = (phone = primaryAdminPhone) => {
    Linking.openURL(`tel:+91${phone}`).catch(() => {
      Alert.alert('Unable to Call', `Please dial +91 ${phone} from your phone dialer.`);
    });
  };

  const handleWhatsAppSupport = () => {
    const text = encodeURIComponent(
      `MM Ride Account Suspension Inquiry\n\nDriver Name: ${driverName}\nPhone: ${driverPhone}\nDriver ID: ${driverId}\nAssigned Bike: ${bikeReg}\n\nHello Operations Team, my driver account is showing suspended. Reason: "${reason}". Please review and assist me.`
    );
    const url = `whatsapp://send?phone=91${primaryAdminPhone}&text=${text}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://wa.me/91${primaryAdminPhone}?text=${text}`).catch(() => {
        Alert.alert('WhatsApp Error', 'Could not open WhatsApp. Please call support directly.');
      });
    });
  };

  const handleCheckStatus = () => {
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      Alert.alert(
        'Account Status',
        'Your profile sync is active in real-time. If the Admin reactivates your account from the portal, this screen will automatically unlock.'
      );
    }, 1200);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Warning Icon Badge */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>🚫</Text>
          </View>
        </View>

        {/* Title & Tamil / English Notice */}
        <Text style={styles.title}>ACCOUNT SUSPENDED</Text>
        <Text style={styles.tamilSubtitle}>கணக்கு தற்காலிகமாக நிறுத்தி வைக்கப்பட்டுள்ளது</Text>
        <Text style={styles.hinglishSubtitle}>(Aapka khata asthayi roop se suspend hai)</Text>

        {/* Reason Card */}
        <View style={styles.reasonCard}>
          <View style={styles.reasonHeader}>
            <Text style={styles.reasonBadge}>SUSPENSION NOTICE</Text>
            <View style={styles.statusDotRow}>
              <View style={styles.redDot} />
              <Text style={styles.statusText}>LOCKED</Text>
            </View>
          </View>

          <Text style={styles.reasonLabel}>Official Reason / காரணம்:</Text>
          <Text style={styles.reasonText}>{reason}</Text>

          <View style={styles.divider} />

          {/* Driver Details Summary */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Driver Name:</Text>
            <Text style={styles.infoValue}>{driverName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Registered Mobile:</Text>
            <Text style={styles.infoValue}>{driverPhone}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Driver ID:</Text>
            <Text style={styles.infoValueCode}>{driverId.slice(-8)}</Text>
          </View>
          {bikeReg !== 'None' && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Assigned Two-Wheeler:</Text>
              <Text style={styles.infoValue}>{bikeReg}</Text>
            </View>
          )}
        </View>

        {/* Guidance Box */}
        <View style={styles.guidanceBox}>
          <Text style={styles.guidanceTitle}>ℹ️ How to Reactivate / மீண்டும் தொடங்குவது எப்படி:</Text>
          <Text style={styles.guidanceItem}>
            1. நீங்கள் ஏதேனும் விதிமுறைகளை மீறியிருந்தால் அல்லது review நிலுவையில் இருந்தால் உடனே Depot Hub-ஐ தொடர்பு கொள்ளவும்.
          </Text>
          <Text style={styles.guidanceItem}>
            2. Admin-க்கு WhatsApp மூலமாகவோ அல்லது அழைப்பு மூலமாகவோ விபரம் தெரிவிக்கவும்.
          </Text>
          <Text style={styles.guidanceItem}>
            3. Admin Reactivate செய்தவுடன் இந்த திரை தானாகவே Dashboard-க்கு மாறும்.
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.whatsAppButton}
            onPress={handleWhatsAppSupport}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonEmoji}>💬</Text>
            <Text style={styles.whatsAppButtonText}>WhatsApp Fleet Admin (Fast Review)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.callButton}
            onPress={() => handleCallSupport(primaryAdminPhone)}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonEmoji}>📞</Text>
            <Text style={styles.callButtonText}>Call Operations Hub ({primaryAdminPhone})</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backupCallButton}
            onPress={() => handleCallSupport(backupAdminPhone)}
            activeOpacity={0.8}
          >
            <Text style={styles.backupCallText}>Backup Support: +91 {backupAdminPhone}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleCheckStatus}
            disabled={checking}
            activeOpacity={0.85}
          >
            {checking ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.refreshButtonText}>🔄 Check If Reactivated (சரிபார்க்கவும்)</Text>
            )}
          </TouchableOpacity>

          <BigButton
            title="Sign Out / Log Out"
            onPress={logout}
            variant="secondary"
            style={{ marginTop: 8 }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090E'
  },
  scrollContent: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 40,
    alignItems: 'center'
  },
  iconContainer: {
    marginBottom: 16
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8
  },
  iconEmoji: {
    fontSize: 44
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 4
  },
  tamilSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F87171',
    textAlign: 'center',
    marginBottom: 2
  },
  hinglishSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20
  },
  reasonCard: {
    width: '100%',
    backgroundColor: '#111726',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    padding: 16,
    marginBottom: 16
  },
  reasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  reasonBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: '#F87171',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    letterSpacing: 0.5
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444'
  },
  statusText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '800'
  },
  reasonLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  reasonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
    lineHeight: 22
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 14
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B'
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0'
  },
  infoValueCode: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  guidanceBox: {
    width: '100%',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 14,
    marginBottom: 20
  },
  guidanceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 8
  },
  guidanceItem: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 6
  },
  actionsContainer: {
    width: '100%',
    gap: 10
  },
  whatsAppButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  buttonEmoji: {
    fontSize: 18
  },
  whatsAppButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700'
  },
  callButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  callButtonText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '700'
  },
  backupCallButton: {
    paddingVertical: 8,
    alignItems: 'center'
  },
  backupCallText: {
    color: '#64748B',
    fontSize: 12,
    textDecorationLine: 'underline'
  },
  refreshButton: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4
  },
  refreshButtonText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '700'
  }
});
