import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity, Alert } from 'react-native';
import { useDriver } from '../context/DriverContext';
import { colors } from '../utils/colors';
import StatusBadge from '../components/StatusBadge';
import BigButton from '../components/BigButton';
import ConfettiOverlay from '../components/ConfettiOverlay';
import VehicleSearchingAnimation from '../components/VehicleSearchingAnimation';
import InAppNavigationModal from '../components/InAppNavigationModal';
import { autoAssignAvailableBike, getHubDetails } from '../firebase/api';

export default function VerificationStatusScreen({ navigation }) {
  const { driverProfile, assignedBike, currentLocation, currentSpeed, logout } = useDriver();

  const isApproved = driverProfile?.approvalStatus === 'APPROVED';
  const hasAssignedBike = !!(driverProfile?.assignedBikeId || assignedBike?.id);
  const isHandoverPending = driverProfile?.accountStatus === 'BIKE_ASSIGNED' || driverProfile?.accountStatus === 'BIKE_HANDOVER_PENDING';
  const isActiveDriver = driverProfile?.accountStatus === 'ACTIVE_DRIVER';
  const isSuspended = driverProfile?.accountStatus === 'SUSPENDED';
  const isRejected = driverProfile?.approvalStatus === 'REJECTED';

  const [showConfetti, setShowConfetti] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showNavModal, setShowNavModal] = useState(false);
  const [autoAssignedBike, setAutoAssignedBike] = useState(null);
  const [hubInfo, setHubInfo] = useState(null);
  const [autoAssignTriggered, setAutoAssignTriggered] = useState(false);

  const activeBike = assignedBike || autoAssignedBike;
  const hasBike = hasAssignedBike || !!autoAssignedBike;

  // Trigger celebration confetti upon approval
  useEffect(() => {
    if (isApproved && !isSuspended && !isRejected) {
      setShowConfetti(true);
    }
  }, [isApproved]);

  // Attempt auto-assign when approved but no bike assigned yet
  const handleAutoAssign = async () => {
    if (!driverProfile?.id || hasBike || isScanning) return;
    setIsScanning(true);
    try {
      const res = await autoAssignAvailableBike(driverProfile.id, driverProfile.fullName);
      if (res.success && res.bike) {
        setAutoAssignedBike(res.bike);
        if (res.hub) setHubInfo(res.hub);
        setShowConfetti(true);
      }
    } catch (err) {
      console.warn('Auto-assign attempt warning:', err.message);
    } finally {
      setIsScanning(false);
      setAutoAssignTriggered(true);
    }
  };

  useEffect(() => {
    if (isApproved && !hasBike && !autoAssignTriggered && !isSuspended) {
      handleAutoAssign();
    }
  }, [isApproved, hasBike, autoAssignTriggered]);

  // Fetch hub details if not yet loaded
  useEffect(() => {
    const hubId = activeBike?.hubId || driverProfile?.assignedHubId;
    if (hubId && !hubInfo) {
      getHubDetails(hubId).then(data => {
        if (data) setHubInfo(data);
      });
    }
  }, [activeBike, driverProfile, hubInfo]);

  const handleOpenMaps = () => {
    const lat = activeBike?.pickupLatitude || driverProfile?.pickupLatitude || hubInfo?.latitude || 28.611529;
    const lng = activeBike?.pickupLongitude || driverProfile?.pickupLongitude || hubInfo?.longitude || 77.081742;
    const navUrl = `google.navigation:q=${lat},${lng}&mode=d`;
    Linking.canOpenURL(navUrl)
      .then((supported) => {
        if (supported) return Linking.openURL(navUrl);
        return Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
      })
      .catch(() => {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
      });
  };

  const sendWhatsAppAlert = (targetPhone = '7200723901') => {
    const cleanNumber = targetPhone.replace(/\D/g, '');
    const fullNumber = cleanNumber.startsWith('91') ? cleanNumber : `91${cleanNumber}`;
    const text = encodeURIComponent(
      `Namaste MM Ride Admin,\nI have registered as a Driver and uploaded my KYC documents on the MM Ride App.\n\n👤 Name: ${driverProfile?.fullName || 'Partner'}\n📱 Mobile: ${driverProfile?.mobileNumber || ''}\n🪪 DL: ${driverProfile?.dlNumber || ''}\n🆔 Aadhaar: ${driverProfile?.aadhaarNumber || ''}\n\nPlease review and approve my account so I can start duty!`
    );
    const waUrl = `https://wa.me/${fullNumber}?text=${text}`;
    Linking.openURL(waUrl).catch(() => {
      Alert.alert('Notice', 'Unable to open WhatsApp on this device.');
    });
  };

  const handleSelectAdminForWhatsApp = () => {
    Alert.alert(
      '💬 Choose Admin WhatsApp Contact',
      'Select which fleet admin to message for fast verification approval:',
      [
        {
          text: 'Admin 1 (Primary): 7200723901',
          onPress: () => sendWhatsAppAlert('7200723901')
        },
        {
          text: 'Admin 2: 9976294844',
          onPress: () => sendWhatsAppAlert('9976294844')
        },
        {
          text: 'Admin 3: 9841307455',
          onPress: () => sendWhatsAppAlert('9841307455')
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Confetti Explosion Animation for Approved Drivers */}
      <ConfettiOverlay active={showConfetti} onAnimationComplete={() => setShowConfetti(false)} />

      {/* In-App Live Navigation Modal with GPS HUD & Map */}
      <InAppNavigationModal
        visible={showNavModal}
        onClose={() => setShowNavModal(false)}
        hub={hubInfo}
        bike={activeBike}
        currentLocation={currentLocation}
        currentSpeed={currentSpeed}
        onArrivedAtDepot={() => {
          setShowNavModal(false);
          if (navigation?.navigate) {
            navigation.navigate('BikeHandover');
          }
        }}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Top Navigation Row: Back to Login / Switch Account */}
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
            <Text style={styles.backToLoginText}>← Back to Login / Switch Account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Account Status (Khata Ki Sthiti)</Text>
          <Text style={styles.subtitle}>Verification & Vehicle Allocation Stages</Text>
        </View>

        {/* Case 1: Application Approved & Vehicle Assigned -> Go to Location to Start Journey! */}
        {isApproved && hasBike && !isSuspended && (
          <View style={[styles.mainCard, styles.journeyCard]}>
            {/* Celebration Badge */}
            <View style={styles.celebrationPill}>
              <Text style={styles.celebrationPillText}>🎉 APPLICATION APPROVED & VEHICLE ASSIGNED!</Text>
            </View>

            <Text style={styles.journeyHeading}>
              Go to this location, collect your two-wheeler & start your journey!
            </Text>
            <Text style={styles.journeySubheading}>
              (Iss location par jakar gaadi lein aur journey shuru karein!)
            </Text>

            {/* 1. Hub / Depot / Host Location Card */}
            <View style={styles.locationCard}>
              <View style={styles.locationHeaderRow}>
                <View style={styles.locationIconBadge}>
                  <Text style={{ fontSize: 20 }}>{activeBike?.providerType === 'HOST' ? '🏡' : '📍'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.locationCardTitle}>
                    {activeBike?.providerType === 'HOST' ? 'HOST PICKUP LOCATION' : 'VEHICLE COLLECTION DEPOT'}
                  </Text>
                  <Text style={styles.hubNameText}>
                    {activeBike?.providerName || driverProfile?.providerName || hubInfo?.name || 'Sitapuri Operations Hub'}
                  </Text>
                </View>
              </View>

              <Text style={styles.hubAddressText}>
                {activeBike?.pickupAddress || driverProfile?.pickupAddress || hubInfo?.address || 'Gali Number 3, Sitapuri, New Delhi'}
              </Text>

              {(activeBike?.providerPhone || driverProfile?.providerPhone || hubInfo?.managerContact) && (
                <TouchableOpacity
                  style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => {
                    const phone = activeBike?.providerPhone || driverProfile?.providerPhone || hubInfo?.managerContact;
                    if (phone) Linking.openURL(`tel:${phone}`);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.hubContactText}>
                    📞 Contact: <Text style={{ color: '#10B981', fontWeight: 'bold' }}>{activeBike?.providerPhone || driverProfile?.providerPhone || hubInfo?.managerContact}</Text> (Tap to Call)
                  </Text>
                </TouchableOpacity>
              )}

              {/* Primary: In-App Live Navigation HUD */}
              <TouchableOpacity
                style={styles.mapsButton}
                onPress={() => setShowNavModal(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.mapsButtonText}>Start In-App Live Navigation 🗺️</Text>
              </TouchableOpacity>

              {/* Secondary: Voice Directions via Google Maps Native */}
              <TouchableOpacity
                style={styles.voiceNavSecondaryButton}
                onPress={handleOpenMaps}
                activeOpacity={0.85}
              >
                <Text style={styles.voiceNavSecondaryText}>Voice Guidance in Google Maps 🧭</Text>
              </TouchableOpacity>
            </View>

            {/* 2. Assigned Bike Details Card */}
            <View style={styles.bikeDetailCard}>
              <View style={styles.bikeDetailHeader}>
                <Text style={styles.bikeEmojiIcon}>🏍️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bikeTagLabel}>YOUR ASSIGNED TWO-WHEELER</Text>
                  <Text style={styles.bikeRegText}>
                    {activeBike?.registrationNumber || driverProfile?.assignedBikeRegistration || 'TN 01 AB 1234'}
                  </Text>
                </View>
              </View>

              <View style={styles.bikeSpecsRow}>
                <View style={styles.specBox}>
                  <Text style={styles.specLabel}>MODEL</Text>
                  <Text style={styles.specVal}>
                    {activeBike ? `${activeBike.make || 'Hero'} ${activeBike.model || 'Splendor'}` : 'Fleet Two-Wheeler'}
                  </Text>
                </View>

                <View style={styles.specBox}>
                  <Text style={styles.specLabel}>ODOMETER</Text>
                  <Text style={styles.specVal}>{activeBike?.currentOdometer || 0} km</Text>
                </View>

                <View style={styles.specBox}>
                  <Text style={styles.specLabel}>FUEL / BATTERY</Text>
                  <Text style={[styles.specVal, { color: '#34D399' }]}>{activeBike?.currentFuelCharge || 100}%</Text>
                </View>
              </View>
            </View>

            {/* Instruction Banner */}
            <View style={styles.instructionBanner}>
              <Text style={styles.instructionBannerText}>
                ⚡ <Text style={{ fontWeight: 'bold' }}>Next Step:</Text> Visit the hub, meet the manager, complete your physical bike handover inspection, and tap below to start your shift!
              </Text>
            </View>

            <BigButton
              title="Collect Vehicle & Start Journey 🏁"
              onPress={() => navigation?.navigate && navigation.navigate('BikeHandover')}
              variant="primary"
              style={{ width: '100%', marginTop: 6 }}
            />
          </View>
        )}

        {/* Case 2: Application Approved but Vehicle Search in Progress / No Bike Available */}
        {isApproved && !hasBike && !isSuspended && !isRejected && (
          <View style={{ width: '100%' }}>
            {/* Approved Header */}
            <View style={[styles.mainCard, styles.approvedCard, { marginBottom: 10 }]}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconEmoji}>🟢</Text>
              </View>
              <Text style={styles.statusTitle}>Application Approved! 🎉</Text>
              <Text style={styles.statusTitleHinglish}>(Application Manzoor Ho Gaya)</Text>
              <Text style={styles.statusDescription}>
                Your KYC and document checks have passed successfully.
              </Text>
            </View>

            {/* Searching Radar Animation */}
            <VehicleSearchingAnimation
              onScanAgain={handleAutoAssign}
              isScanning={isScanning}
            />
          </View>
        )}

        {/* Case 3: Verification in Progress */}
        {!isApproved && !isSuspended && !isRejected && (
          <View style={[styles.mainCard, styles.pendingCard]}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconEmoji}>⏳</Text>
            </View>
            <Text style={styles.statusTitle}>Verification Pending</Text>
            <Text style={styles.statusTitleHinglish}>(Documents Ki Janch Chalu Hai)</Text>

            <Text style={styles.statusDescription}>
              Your documents have been submitted and are being reviewed by the MM Ride verification team. You will be notified once approved.
            </Text>

            <View style={{ marginTop: 14 }}>
              <StatusBadge status="PENDING" label="UNDER REVIEW" />
            </View>

            <TouchableOpacity
              style={styles.whatsappAlertBtn}
              onPress={() => sendWhatsAppAlert('7200723901')}
              activeOpacity={0.85}
            >
              <Text style={styles.whatsappAlertBtnText}>💬 WhatsApp Admin (7200723901) for 5-Min Fast Approval</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backupAdminBtn}
              onPress={handleSelectAdminForWhatsApp}
              activeOpacity={0.8}
            >
              <Text style={styles.backupAdminBtnText}>📱 Other Admin WhatsApp Numbers (9976294844 / 9841307455)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Case 4: Suspended */}
        {isSuspended && (
          <View style={[styles.mainCard, { borderColor: colors.danger, backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🚫</Text>
            <Text style={[styles.statusTitle, { color: colors.danger }]}>Account Suspended</Text>
            <Text style={styles.statusDescription}>
              Your account is temporarily suspended. Reason: {driverProfile?.suspensionReason || 'Please contact MM Ride operations hub'}.
            </Text>
          </View>
        )}

        {/* Step Tracker (English + Hinglish) */}
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>Onboarding Stages / Prakriya</Text>

          <View style={styles.timelineItem}>
            <Text style={styles.stepNum}>1</Text>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Profile & OTP</Text>
              <Text style={styles.stepDesc}>Mobile registration verified</Text>
            </View>
            <Text style={styles.stepCheck}>✅</Text>
          </View>

          <View style={styles.timelineItem}>
            <Text style={styles.stepNum}>2</Text>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Document Verification (Aadhaar / DL)</Text>
              <Text style={styles.stepDesc}>Licence & ID checking</Text>
            </View>
            <Text style={styles.stepCheck}>
              {driverProfile?.verificationStatus === 'DOCUMENTS_VERIFIED' || isApproved ? '✅' : '⏳'}
            </Text>
          </View>

          <View style={styles.timelineItem}>
            <Text style={styles.stepNum}>3</Text>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Address Verification (Pata Janch)</Text>
              <Text style={styles.stepDesc}>Field officer residence check</Text>
            </View>
            <Text style={styles.stepCheck}>
              {driverProfile?.addressVerified || isApproved ? '✅' : '⏳'}
            </Text>
          </View>

          <View style={styles.timelineItem}>
            <Text style={styles.stepNum}>4</Text>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Admin Approval (Manzoori)</Text>
              <Text style={styles.stepDesc}>Verification complete</Text>
            </View>
            <Text style={styles.stepCheck}>
              {isApproved ? '✅' : '⏳'}
            </Text>
          </View>

          <View style={styles.timelineItem}>
            <Text style={styles.stepNum}>5</Text>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Bike Assignment & Handover</Text>
              <Text style={styles.stepDesc}>Vehicle inspection & keys</Text>
            </View>
            <Text style={styles.stepCheck}>
              {isActiveDriver ? '✅' : hasBike ? '🔔' : '⚪'}
            </Text>
          </View>
        </View>

        {isActiveDriver && (
          <BigButton
            title="Open Shift Console (Duty Shuru Karein) 🏍️"
            onPress={() => navigation?.navigate && navigation.navigate('Home')}
            variant="success"
            style={{ marginBottom: 12 }}
          />
        )}

        <BigButton
          title="Sign Out / Log Out"
          onPress={logout}
          variant="secondary"
          style={{ marginBottom: 40 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 16
  },
  topNavRow: {
    marginBottom: 16
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
  header: {
    marginBottom: 20
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2
  },
  mainCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1
  },
  pendingCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  approvedCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  journeyCard: {
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8
  },
  celebrationPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12
  },
  celebrationPillText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  journeyHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 2
  },
  journeySubheading: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16
  },
  locationCard: {
    width: '100%',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14
  },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8
  },
  locationIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  locationCardTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1
  },
  hubNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 2
  },
  hubAddressText: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 18,
    marginBottom: 6
  },
  hubContactText: {
    fontSize: 12,
    color: colors.primaryLight,
    marginBottom: 12
  },
  mapsButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3
  },
  mapsButtonText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3
  },
  voiceNavSecondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  voiceNavSecondaryText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '700'
  },
  bikeDetailCard: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 14
  },
  bikeDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  bikeEmojiIcon: {
    fontSize: 28
  },
  bikeTagLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1
  },
  bikeRegText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.primaryLight,
    letterSpacing: 1.5,
    marginTop: 2
  },
  bikeSpecsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    padding: 10
  },
  specBox: {
    alignItems: 'center',
    flex: 1
  },
  specLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '700',
    marginBottom: 2
  },
  specVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF'
  },
  instructionBanner: {
    width: '100%',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14
  },
  instructionBannerText: {
    fontSize: 12,
    color: '#E2E8F0',
    lineHeight: 18,
    textAlign: 'center'
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  iconEmoji: {
    fontSize: 32
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center'
  },
  statusTitleHinglish: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 8
  },
  statusDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4
  },
  timelineCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 16
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)'
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceElevated,
    color: colors.primary,
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 26
  },
  stepInfo: {
    flex: 1
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white
  },
  stepDesc: {
    fontSize: 11,
    color: colors.textMuted
  },
  stepCheck: {
    fontSize: 16
  },
  whatsappAlertBtn: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4
  },
  whatsappAlertBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 13
  },
  backupAdminBtn: {
    marginTop: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  backupAdminBtnText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '700'
  }
});
