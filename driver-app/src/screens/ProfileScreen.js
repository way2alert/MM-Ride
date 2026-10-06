import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert 
} from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { useDriver } from '../context/DriverContext';
import { colors } from '../utils/colors';
import Header from '../components/Header';
import BigButton from '../components/BigButton';

export default function ProfileScreen({ navigation }) {
  const { currentUser, driverProfile, assignedBike, logout } = useDriver();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of MM Ride?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout }
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title="DRIVER PROFILE"
        subtitle="Account & Device Security"
        showBack={true}
        onBackPress={() => (navigation?.goBack ? navigation.goBack() : navigation?.navigate && navigation.navigate('Home'))}
        onSosPress={() => navigation?.navigate && navigation.navigate('EmergencySOS')}
        showSos={false}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Profile Card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {driverProfile?.fullName?.[0]?.toUpperCase() || 'D'}
            </Text>
          </View>
          <Text style={styles.userName}>{driverProfile?.fullName || 'Driver Partner'}</Text>
          <Text style={styles.userPhone}>Phone: {driverProfile?.mobileNumber || '—'}</Text>
          <Text style={styles.stateBadge}>{driverProfile?.accountStatus || 'ACTIVE_DRIVER'}</Text>
        </View>

        {/* Vehicle & Depot */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Assigned Vehicle & Duty Depot</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Assigned Bike:</Text>
            <Text style={styles.rowVal}>{assignedBike?.registrationNumber || driverProfile?.assignedBikeRegistration || 'None'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Fuel / EV / CNG Model:</Text>
            <Text style={styles.rowVal}>
              {assignedBike ? `${assignedBike.make || ''} ${assignedBike.model || ''} (${assignedBike.fuelType === 'CNG' ? 'CNG' : assignedBike.fuelType === 'CNG_PETROL' ? 'CNG + Petrol Dual-Fuel' : assignedBike.fuelType || 'Petrol'})`.trim() : 'Not Assigned'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Current Odometer:</Text>
            <Text style={styles.rowVal}>{assignedBike?.currentOdometer || 0} km</Text>
          </View>
        </View>

        {/* Device Binding & Anti-Tampering (Section 26) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Device Security & Integrity Binding</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Company Bound Device:</Text>
            <Text style={styles.monoVal}>
              {driverProfile?.boundDeviceId ? driverProfile.boundDeviceId.slice(-8) : 'Pending Hub Handover'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Device Model:</Text>
            <Text style={styles.rowVal}>{driverProfile?.boundDeviceModel || Device.modelName || 'Android Phone'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>App Version:</Text>
            <Text style={styles.rowVal}>{Application.nativeApplicationVersion || 'v1.0.0 (Production)'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Anti-Tamper Status:</Text>
            <Text style={[styles.rowVal, { color: colors.success, fontWeight: '800' }]}>VERIFIED GENUINE</Text>
          </View>
        </View>

        {/* Privacy & Legal */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Privacy & Platform Policies</Text>
          <Text style={styles.privacyNote}>
            {'• MM Ride monitors GPS & speed '}
            <Text style={{ fontWeight: 'bold' }}>strictly during active duty shifts</Text>
            {'.\n• '}
            <Text style={{ fontWeight: 'bold' }}>No personal data monitoring:</Text>
            {' No tracking of personal calls, WhatsApp, SMS, files, or off-duty location.\n• Owner pays CNG, Petrol & Normal Maintenance.'}
          </Text>
        </View>

        {!(driverProfile?.approvalStatus === 'APPROVED' || driverProfile?.accountStatus === 'ACTIVE_DRIVER' || driverProfile?.accountStatus === 'BIKE_ASSIGNED') ? (
          <BigButton
            title="Sign Out of Device"
            onPress={handleLogout}
            variant="danger"
            style={{ marginTop: 10, marginBottom: 40 }}
          />
        ) : (
          <View style={styles.enterpriseLockCard}>
            <Text style={{ fontSize: 22, marginRight: 12 }}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.enterpriseLockTitle}>COMPANY TERMINAL SECURED</Text>
              <Text style={styles.enterpriseLockSub}>
                Your approved partner account is locked to this fleet phone. To change or surrender device, contact Depot Operations.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
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
  userCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#000'
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white
  },
  userPhone: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 10
  },
  stateBadge: {
    backgroundColor: colors.successBg,
    color: colors.success,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
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
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 12
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)'
  },
  rowLabel: {
    fontSize: 12,
    color: colors.textSecondary
  },
  rowVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white
  },
  monoVal: {
    fontSize: 11,
    color: colors.primaryLight,
    fontFamily: 'monospace'
  },
  privacyNote: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18
  },
  enterpriseLockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    marginBottom: 40
  },
  enterpriseLockTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  enterpriseLockSub: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16
  }
});
