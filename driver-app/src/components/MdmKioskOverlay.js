import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  ScrollView,
  Vibration
} from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../utils/colors';
import { verifyAdminExitPin, clearRemoteAlarm } from '../services/deviceMdmService';

export default function MdmKioskOverlay({
  restrictionState,
  mdmPolicy,
  onExitKioskSuccess,
  showAppLauncher,
  setShowAppLauncher
}) {
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState('');

  const [alarmDismissed, setAlarmDismissed] = useState(false);

  const isRestricted = restrictionState?.isRestricted;
  const rawAlarm = !!restrictionState?.alarm;
  const alarmTimestamp = restrictionState?.deviceData?.remoteCommands?.alarmTriggeredAt || null;

  useEffect(() => {
    if (rawAlarm) {
      setAlarmDismissed(false);
    }
  }, [rawAlarm, alarmTimestamp]);

  const isAlarm = rawAlarm && !alarmDismissed;
  const status = restrictionState?.status || 'ACTIVE';
  const customMessage = restrictionState?.remoteMessage;
  const reason = restrictionState?.suspensionReason;

  useEffect(() => {
    if (isAlarm) {
      // Pulse emergency vibration
      Vibration.vibrate([0, 600, 200, 600, 200, 1000], true);
    } else {
      Vibration.cancel();
    }
    return () => {
      Vibration.cancel();
    };
  }, [isAlarm]);

  const handleStopAlarm = async () => {
    setAlarmDismissed(true);
    Vibration.cancel();
    const deviceId = restrictionState?.deviceData?.deviceId || restrictionState?.deviceData?.id;
    if (deviceId) {
      try {
        await clearRemoteAlarm(deviceId);
      } catch (e) {
        console.warn('Error clearing remote alarm:', e);
      }
    }
  };

  const handleVerifyPin = () => {
    const configuredPin = restrictionState?.kioskExitPin || mdmPolicy?.adminExitPin || '998877';
    if (verifyAdminExitPin(adminPin, configuredPin)) {
      setShowPinModal(false);
      setAdminPin('');
      setPinError('');
      Alert.alert(
        'Depot Technician Mode Activated 🛠️',
        'Kiosk Mode temporarily bypassed for authorized hardware maintenance and diagnostic settings.',
        [
          {
            text: 'Access Settings',
            onPress: () => {
              if (onExitKioskSuccess) onExitKioskSuccess();
            }
          }
        ]
      );
    } else {
      setPinError('Incorrect Master Admin PIN. Access Denied.');
    }
  };

  const allowedApps = mdmPolicy?.allowedApplications || [
    { packageName: 'com.olacabs.oladriver', appName: 'Ola Driver', scheme: 'oladriver://' },
    { packageName: 'com.ubercab.driver', appName: 'Uber Driver', scheme: 'uberdriver://' },
    { packageName: 'com.rapido.rider', appName: 'Rapido Captain', scheme: 'rapido://' },
    { packageName: 'com.whatsapp', appName: 'WhatsApp', scheme: 'whatsapp://' },
    { packageName: 'com.google.android.apps.maps', appName: 'Google Maps', scheme: 'geo:0,0' }
  ];

  const handleLaunchApp = async (app) => {
    try {
      // 1. Try launching directly via Android intent with package specification
      const intentUrl = `intent:#Intent;package=${app.packageName};end`;
      try {
        await Linking.openURL(intentUrl);
        return;
      } catch (_) {}

      // 2. Try launching via app custom scheme (e.g. oladriver://, uberdriver://, rapido://)
      if (app.scheme) {
        try {
          await Linking.openURL(app.scheme);
          return;
        } catch (_) {}
      }

      // 3. Special fallbacks for Maps / WhatsApp
      if (app.packageName === 'com.google.android.apps.maps') {
        await Linking.openURL('https://maps.google.com');
      } else if (app.packageName === 'com.whatsapp') {
        await Linking.openURL('https://wa.me');
      } else {
        await Linking.openURL(`market://details?id=${app.packageName}`).catch(() => {
          Alert.alert('App Launch', `Could not open ${app.appName}. Please ensure it is installed on this phone.`);
        });
      }
    } catch (e) {
      Alert.alert('App Launch', `Could not open ${app.appName}: ${e.message}`);
    }
  };

  return (
    <>
      {/* 0. EMERGENCY REMOTE SIREN ALARM BEACON */}
      <Modal
        visible={isAlarm}
        transparent={false}
        animationType="fade"
      >
        <View style={styles.alarmContainer}>
          {/* Audio Synthesizer & MP3 Streamer via WebView */}
          <View style={{ width: 1, height: 1, opacity: 0.01, position: 'absolute' }}>
            <WebView
              originWhitelist={['*']}
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback={true}
              source={{
                html: `
                  <!DOCTYPE html>
                  <html>
                  <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
                  <body style="background:transparent; margin:0; padding:0;">
                    <audio id="sirenAud" autoplay loop playsinline src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"></audio>
                    <script>
                      try {
                        var aud = document.getElementById('sirenAud');
                        if (aud) {
                          aud.volume = 1.0;
                          aud.play().catch(function(){});
                        }
                        var AudioCtx = window.AudioContext || window.webkitAudioContext;
                        if (AudioCtx) {
                          var ctx = new AudioCtx();
                          var osc = ctx.createOscillator();
                          var gain = ctx.createGain();
                          osc.type = 'sawtooth';
                          gain.gain.setValueAtTime(1.0, ctx.currentTime);
                          osc.connect(gain);
                          gain.connect(ctx.destination);
                          osc.start();

                          var freq = 750;
                          var rising = true;
                          setInterval(function() {
                            if (rising) {
                              freq += 40;
                              if (freq >= 1350) rising = false;
                            } else {
                              freq -= 40;
                              if (freq <= 720) rising = true;
                            }
                            try {
                              osc.frequency.setValueAtTime(freq, ctx.currentTime);
                            } catch (e) {}
                          }, 25);
                        }
                      } catch (err) {}
                    </script>
                  </body>
                  </html>
                `
              }}
            />
          </View>

          <Text style={{ fontSize: 72, marginBottom: 12 }}>🚨</Text>
          <Text style={styles.alarmTitle}>REMOTE SIREN ALARM</Text>
          <Text style={styles.alarmSubtitle}>EMERGENCY FLEET BEACON ACTIVE</Text>
          <View style={styles.alarmCard}>
            <Text style={styles.alarmMessage}>
              Depot Admin has activated the emergency siren on this MM Ride fleet terminal.
            </Text>
            <Text style={styles.alarmHint}>
              Phone is emitting emergency locator pulses and transmitting live GPS coordinates.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.stopAlarmBtn}
            onPress={handleStopAlarm}
            activeOpacity={0.8}
          >
            <Text style={styles.stopAlarmBtnText}>🔕 STOP SIREN ALARM (PHONE FOUND)</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* 1. NON-DISMISSIBLE REMOTE ENTERPRISE LOCKOUT (If marked SUSPENDED or LOST) */}
      <Modal
        visible={!isAlarm && !!isRestricted}
        transparent={false}
        animationType="fade"
      >
        <View style={styles.restrictedContainer}>
          <View style={styles.lockoutBadge}>
            <Text style={styles.lockoutBadgeText}>
              {status === 'LOST' ? '🚨 REPORTED LOST / STOLEN' : '🔒 FLEET TERMINAL SUSPENDED'}
            </Text>
          </View>

          <Text style={styles.lockoutTitle}>
            {status === 'LOST'
              ? 'MM Ride Fleet Anti-Theft Lock'
              : 'Device Access Temporarily Suspended'}
          </Text>

          <View style={styles.messageBox}>
            <Text style={styles.messageText}>
              {customMessage ||
                (status === 'LOST'
                  ? 'This terminal is the property of MM Ride Logistics Pvt. Ltd. It has been reported lost or misplaced and is tracked via GPS telemetry. If found, please call the fleet depot immediately.'
                  : 'This company-issued phone has been locked by MM Ride Fleet Operations according to company policy. Please report to your assigned depot hub.')}
            </Text>

            {reason && (
              <View style={styles.reasonTag}>
                <Text style={styles.reasonLabel}>Operational Notice: </Text>
                <Text style={styles.reasonValue}>{reason}</Text>
              </View>
            )}
          </View>

          <View style={styles.contactActions}>
            <TouchableOpacity
              style={styles.callDepotBtn}
              onPress={() => Linking.openURL('tel:+919876543210')}
            >
              <Text style={styles.callDepotBtnText}>📞 Call Central Depot (+91 9876543210)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.technicianBtn}
              onPress={() => setShowPinModal(true)}
            >
              <Text style={styles.technicianBtnText}>🛠️ Depot Supervisor PIN Exit</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerNote}>
            Managed via Android Enterprise Device Owner (AMAPI Policy Enforced)
          </Text>
        </View>
      </Modal>

      {/* 2. ADMIN / TECHNICIAN PIN MODAL (Admin-controlled Exit from Kiosk Mode) */}
      <Modal
        visible={showPinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPinModal(false)}
      >
        <View style={styles.pinOverlay}>
          <View style={styles.pinCard}>
            <Text style={styles.pinTitle}>Depot Technician PIN</Text>
            <Text style={styles.pinSubtitle}>
              Enter company 6-digit Master PIN to exit Kiosk Mode for device maintenance:
            </Text>

            <TextInput
              style={styles.pinInput}
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
              placeholder="Enter 6-digit PIN"
              placeholderTextColor="#64748B"
              value={adminPin}
              onChangeText={(t) => {
                setAdminPin(t);
                setPinError('');
              }}
            />

            {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}

            <View style={styles.pinBtnRow}>
              <TouchableOpacity
                style={styles.pinCancelBtn}
                onPress={() => {
                  setShowPinModal(false);
                  setAdminPin('');
                  setPinError('');
                }}
              >
                <Text style={styles.pinCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.pinSubmitBtn}
                onPress={handleVerifyPin}
              >
                <Text style={styles.pinSubmitText}>Unlock Kiosk</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. APPROVED APPLICATIONS DRAWER / LAUNCHER (Allows driver to switch to Ola/Uber/Rapido/Maps) */}
      <Modal
        visible={!!showAppLauncher}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAppLauncher(false)}
      >
        <View style={styles.launcherOverlay}>
          <View style={styles.launcherCard}>
            <View style={styles.launcherHeader}>
              <View>
                <Text style={styles.launcherTitle}>Approved Fleet Applications</Text>
                <Text style={styles.launcherSubtitle}>
                  Authorized partner apps per company MDM kiosk policy
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeLauncherBtn}
                onPress={() => setShowAppLauncher(false)}
              >
                <Text style={styles.closeLauncherText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }}>
              <View style={styles.appGrid}>
                {allowedApps.map((app, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.appItem}
                    onPress={() => {
                      setShowAppLauncher(false);
                      handleLaunchApp(app);
                    }}
                  >
                    <View style={styles.appIconBadge}>
                      <Text style={{ fontSize: 24 }}>
                        {app.appName?.toLowerCase().includes('uber')
                          ? '🚗'
                          : app.appName?.toLowerCase().includes('ola')
                          ? '🚕'
                          : app.appName?.toLowerCase().includes('rapido')
                          ? '🛵'
                          : app.appName?.toLowerCase().includes('map')
                          ? '🗺️'
                          : '📱'}
                      </Text>
                    </View>
                    <Text style={styles.appName}>{app.appName}</Text>
                    <Text style={styles.appCategory}>{app.category || 'Approved Partner'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.kioskFooterRow}>
              <Text style={styles.kioskNotice}>
                🛡️ App installation and unapproved software are restricted by MDM.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAppLauncher(false);
                  setShowPinModal(true);
                }}
              >
                <Text style={styles.technicianLink}>Technician PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  restrictedContainer: {
    flex: 1,
    backgroundColor: '#050811',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  lockoutBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    marginBottom: 20
  },
  lockoutBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5
  },
  lockoutTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16
  },
  messageBox: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 12,
    padding: 18,
    width: '100%',
    maxWidth: 440,
    marginBottom: 24
  },
  messageText: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center'
  },
  reasonTag: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(239, 68, 68, 0.3)',
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  reasonLabel: {
    color: '#F87171',
    fontWeight: '700',
    fontSize: 12
  },
  reasonValue: {
    color: '#CBD5E1',
    fontSize: 12
  },
  contactActions: {
    width: '100%',
    maxWidth: 440,
    gap: 12
  },
  callDepotBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  callDepotBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14
  },
  technicianBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155'
  },
  technicianBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 13
  },
  footerNote: {
    color: '#64748B',
    fontSize: 11,
    position: 'absolute',
    bottom: 24,
    textAlign: 'center'
  },
  pinOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  pinCard: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 380
  },
  pinTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4
  },
  pinSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16
  },
  pinInput: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
    paddingVertical: 10,
    marginBottom: 10
  },
  pinErrorText: {
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 10,
    textAlign: 'center'
  },
  pinBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6
  },
  pinCancelBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center'
  },
  pinCancelText: {
    color: '#94A3B8',
    fontWeight: '600'
  },
  pinSubmitBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center'
  },
  pinSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700'
  },
  launcherOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end'
  },
  launcherCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: '#334155',
    padding: 20,
    paddingBottom: 32
  },
  launcherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16
  },
  launcherTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  launcherSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  closeLauncherBtn: {
    padding: 6
  },
  closeLauncherText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold'
  },
  appGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16
  },
  appItem: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    width: '48%',
    alignItems: 'center'
  },
  appIconBadge: {
    backgroundColor: '#0F172A',
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  appName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center'
  },
  appCategory: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center'
  },
  kioskFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 12
  },
  kioskNotice: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
    marginRight: 10
  },
  technicianLink: {
    fontSize: 11,
    color: '#38BDF8',
    fontWeight: '600'
  },
  alarmContainer: {
    flex: 1,
    backgroundColor: '#7F1D1D',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  alarmTitle: {
    color: '#FEE2E2',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center'
  },
  alarmSubtitle: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 4,
    marginBottom: 20
  },
  alarmCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    marginBottom: 28,
    width: '100%'
  },
  alarmMessage: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8
  },
  alarmHint: {
    color: '#FECACA',
    fontSize: 12,
    textAlign: 'center'
  },
  stopAlarmBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6
  },
  stopAlarmBtnText: {
    color: '#7F1D1D',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.5
  }
});
