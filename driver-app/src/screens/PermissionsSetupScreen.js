import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  AppState,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import { colors } from '../utils/colors';
import {
  checkAllPermissions,
  requestLocationPermissions,
  requestCameraPermission,
  requestOverlayPermission,
  requestBatteryOptimization
} from '../services/permissionService';

export default function PermissionsSetupScreen({ navigation, nextScreen = 'DocumentUpload' }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({
    allGranted: false,
    locationForeground: false,
    locationBackground: false,
    locationAllTheTime: false,
    camera: false,
    overlay: false,
    battery: false,
    missingCount: 4
  });

  const refreshPermissions = useCallback(async () => {
    try {
      const res = await checkAllPermissions();
      setStatus(res);
    } catch (err) {
      console.warn('Refresh permissions error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPermissions();

    // Re-check whenever driver returns from Android system settings
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refreshPermissions();
      }
    });

    return () => {
      sub && sub.remove();
    };
  }, [refreshPermissions]);

  const handleGrantLocation = async () => {
    await requestLocationPermissions();
    setTimeout(refreshPermissions, 800);
  };

  const handleGrantCamera = async () => {
    await requestCameraPermission();
    setTimeout(refreshPermissions, 800);
  };

  const handleGrantOverlay = async () => {
    await requestOverlayPermission();
    setTimeout(refreshPermissions, 800);
  };

  const handleGrantBattery = async () => {
    await requestBatteryOptimization();
    setTimeout(refreshPermissions, 800);
  };

  const handleProceed = () => {
    if (!status.allGranted) {
      Alert.alert(
        'Permissions Incomplete',
        'All 4 permissions are mandatory for MM Ride safety tracking, ride logger overlay, and shift compliance. Please enable the remaining items to proceed.'
      );
      return;
    }

    if (navigation?.navigate) {
      navigation.navigate(nextScreen);
    } else if (navigation?.replace) {
      navigation.replace(nextScreen);
    }
  };

  const grantedCount = 4 - (status.missingCount || 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Top Header Badge */}
      <View style={styles.header}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>MANDATORY ONBOARDING GATE</Text>
        </View>
        <Text style={styles.heading}>Fleet Safety & Work Permissions</Text>
        <Text style={styles.subheading}>
          All 4 permissions below must be enabled before you can proceed with registration, document verification, or duty shifts.
        </Text>
      </View>

      {/* Progress & Overview Card */}
      <View style={[styles.statusCard, status.allGranted ? styles.statusCardSuccess : styles.statusCardWarning]}>
        <View style={styles.statusRow}>
          <Text style={styles.statusIcon}>{status.allGranted ? '🟢' : '⚠️'}</Text>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.statusTitle}>
              {status.allGranted
                ? 'All Fleet Permissions Granted'
                : `${grantedCount} of 4 Permissions Enabled`}
            </Text>
            <Text style={styles.statusDesc}>
              {status.allGranted
                ? 'Your device is fully configured and ready for work.'
                : 'Please enable all items to unlock account registration and duty access.'}
            </Text>
          </View>
          {loading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
      </View>

      {/* Permissions List */}
      <View style={styles.list}>
        {/* 1. Location (Allow all the time) */}
        <View style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <View style={styles.itemIconCircle}>
              <Text style={{ fontSize: 20 }}>📍</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemTitle}>1. Location: Allow all the time</Text>
                <View style={[styles.badge, status.locationAllTheTime ? styles.badgeSuccess : styles.badgePending]}>
                  <Text style={[styles.badgeText, status.locationAllTheTime ? styles.badgeTextSuccess : styles.badgeTextPending]}>
                    {status.locationAllTheTime ? 'GRANTED' : 'REQUIRED'}
                  </Text>
                </View>
              </View>
              <Text style={styles.itemText}>
                Continuous GPS tracking for rider telemetry, trip fares, speed safety & company depot geofencing during shifts.
              </Text>
            </View>
          </View>
          {!status.locationAllTheTime && (
            <TouchableOpacity style={styles.grantBtn} onPress={handleGrantLocation} activeOpacity={0.8}>
              <Text style={styles.grantBtnText}>Grant Location Permission (Allow all the time) ➔</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 2. Display Over Other Apps (Overlay) */}
        <View style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <View style={styles.itemIconCircle}>
              <Text style={{ fontSize: 20 }}>📱</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemTitle}>2. Display Over Other Apps</Text>
                <View style={[styles.badge, status.overlay ? styles.badgeSuccess : styles.badgePending]}>
                  <Text style={[styles.badgeText, status.overlay ? styles.badgeTextSuccess : styles.badgeTextPending]}>
                    {status.overlay ? 'GRANTED' : 'REQUIRED'}
                  </Text>
                </View>
              </View>
              <Text style={styles.itemText}>
                Allows the floating 1-tap ride logger HUD to overlay on top of Ola, Uber & Rapido driver apps without switching screens.
              </Text>
            </View>
          </View>
          {!status.overlay && (
            <TouchableOpacity style={styles.grantBtn} onPress={handleGrantOverlay} activeOpacity={0.8}>
              <Text style={styles.grantBtnText}>Enable Display Over Other Apps ➔</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 3. Unrestricted Battery / Background Work */}
        <View style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <View style={styles.itemIconCircle}>
              <Text style={{ fontSize: 20 }}>⚡</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemTitle}>3. Unrestricted Background Battery</Text>
                <View style={[styles.badge, status.battery ? styles.badgeSuccess : styles.badgePending]}>
                  <Text style={[styles.badgeText, status.battery ? styles.badgeTextSuccess : styles.badgeTextPending]}>
                    {status.battery ? 'GRANTED' : 'REQUIRED'}
                  </Text>
                </View>
              </View>
              <Text style={styles.itemText}>
                Prevents Android battery saver from killing or pausing GPS tracking when your phone screen locks or during long trips.
              </Text>
            </View>
          </View>
          {!status.battery && (
            <TouchableOpacity style={styles.grantBtn} onPress={handleGrantBattery} activeOpacity={0.8}>
              <Text style={styles.grantBtnText}>Set Battery to Unrestricted ➔</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 4. Camera Access */}
        <View style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <View style={styles.itemIconCircle}>
              <Text style={{ fontSize: 20 }}>📷</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemTitle}>4. Live Camera Access</Text>
                <View style={[styles.badge, status.camera ? styles.badgeSuccess : styles.badgePending]}>
                  <Text style={[styles.badgeText, status.camera ? styles.badgeTextSuccess : styles.badgeTextPending]}>
                    {status.camera ? 'GRANTED' : 'REQUIRED'}
                  </Text>
                </View>
              </View>
              <Text style={styles.itemText}>
                Required for live Driving Licence upload, selfie identity check, two-wheeler QR code scanning & meter reading photos.
              </Text>
            </View>
          </View>
          {!status.camera && (
            <TouchableOpacity style={styles.grantBtn} onPress={handleGrantCamera} activeOpacity={0.8}>
              <Text style={styles.grantBtnText}>Grant Camera Permission ➔</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Headwind MDM / Company Managed Note */}
      <View style={styles.mdmNoticeCard}>
        <Text style={styles.mdmNoticeTitle}>🏢 Company Managed Devices (Headwind MDM)</Text>
        <Text style={styles.mdmNoticeText}>
          If this phone is provided by MM Ride via Headwind MDM, all permissions are pre-authorized by fleet policy. Once all items display GRANTED, tap the button below to continue.
        </Text>
      </View>

      {/* Mandatory Proceed / Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.proceedBtn, !status.allGranted && styles.proceedBtnDisabled]}
          onPress={handleProceed}
          disabled={!status.allGranted}
          activeOpacity={0.85}
        >
          <Text style={[styles.proceedBtnText, !status.allGranted && styles.proceedBtnTextDisabled]}>
            {status.allGranted
              ? 'All Permissions Granted • Continue ➔'
              : `Enable All Permissions to Continue (${grantedCount}/4)`}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    backgroundColor: colors.background,
    paddingBottom: 40
  },
  header: {
    marginBottom: 16
  },
  stepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10
  },
  stepBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6
  },
  subheading: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19
  },
  statusCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1
  },
  statusCardSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.35)'
  },
  statusCardWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)'
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  statusIcon: {
    fontSize: 24
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text
  },
  statusDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  list: {
    gap: 12,
    marginBottom: 18
  },
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  itemIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: 8
  },
  itemText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1
  },
  badgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)'
  },
  badgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)'
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800'
  },
  badgeTextSuccess: {
    color: colors.success
  },
  badgeTextPending: {
    color: colors.primary
  },
  grantBtn: {
    marginTop: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center'
  },
  grantBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700'
  },
  mdmNoticeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 20
  },
  mdmNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4
  },
  mdmNoticeText: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16
  },
  footer: {
    marginTop: 6
  },
  proceedBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  proceedBtnDisabled: {
    backgroundColor: '#1E293B',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    shadowOpacity: 0,
    elevation: 0
  },
  proceedBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  proceedBtnTextDisabled: {
    color: colors.textMuted
  }
});
