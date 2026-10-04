import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  ScrollView, 
  Switch, 
  Alert,
  TouchableOpacity
} from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDriver } from '../context/DriverContext';
import { requestEndDuty } from '../firebase/api';
import { checkHubProximity } from '../utils/geofence';
import { colors } from '../utils/colors';
import BigButton from '../components/BigButton';
import { stopFloatingBubble } from '../services/floatingBubbleService';

export default function EndDutyScreen({ navigation }) {
  const { currentUser, driverProfile, assignedBike, activeDutySession, currentLocation } = useDriver();

  const startOdo = Number(activeDutySession?.pickupOdometer || assignedBike?.currentOdometer || 0);
  const [returnOdometer, setReturnOdometer] = useState(startOdo > 0 ? String(startOdo) : '');
  const [fuelCharge, setFuelCharge] = useState('');
  const [condition, setCondition] = useState('GOOD');
  const [hasDamage, setHasDamage] = useState(false);
  const [damageNotes, setDamageNotes] = useState('');
  const [keysReturned, setKeysReturned] = useState(false);
  const [helmetsReturned, setHelmetsReturned] = useState(false);
  const [noPartsSwapped, setNoPartsSwapped] = useState(false);
  const [earningsAuditAcknowledged, setEarningsAuditAcknowledged] = useState(false);

  const [hub, setHub] = useState(null);
  const [proximity, setProximity] = useState({ within: true, distance: 0 });
  const [emergencyOverride, setEmergencyOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Live distance calculation
  const returnOdoNum = Number(returnOdometer) || startOdo;
  const distanceCoveredKm = Math.max(0, returnOdoNum - startOdo);

  useEffect(() => {
    async function loadHub() {
      if (activeDutySession?.hubId) {
        try {
          const snap = await getDoc(doc(db, 'hubs', activeDutySession.hubId));
          if (snap.exists()) {
            setHub({ id: snap.id, ...snap.data() });
          }
        } catch (e) {
          console.warn('Error loading return hub:', e);
        }
      }
    }
    loadHub();
  }, [activeDutySession?.hubId]);

  useEffect(() => {
    if (hub && currentLocation) {
      const res = checkHubProximity(currentLocation, hub);
      setProximity(res);
    }
  }, [hub, currentLocation]);

  const executeEndDuty = async (isOverride, reasonStr) => {
    const dutyId = activeDutySession?.id || driverProfile?.currentDutyId;
    const driverId = currentUser?.uid || driverProfile?.id;
    const bikeId = activeDutySession?.bikeId || driverProfile?.assignedBikeId || assignedBike?.id;

    if (!dutyId) {
      Alert.alert('No Active Shift', 'No active duty session found to end. You may already be off duty.');
      return;
    }

    setLoading(true);
    try {
      await requestEndDuty({
        dutyId,
        driverId,
        bikeId,
        pickupOdometer: startOdo,
        returnGps: (currentLocation && currentLocation.latitude) ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        } : null,
        returnOdometer: returnOdoNum,
        returnFuelCharge: Number(fuelCharge) || 0,
        returnFuelLitres: Number(fuelCharge) || 0,
        bikeCondition: condition || 'GOOD',
        damageReported: Boolean(hasDamage),
        damageNotes: damageNotes || '',
        keysReturned: true,
        helmetsReturned: true,
        noPartsSwapped: true,
        earningsAuditAcknowledged: true,
        emergencyOverride: Boolean(isOverride !== undefined ? isOverride : emergencyOverride),
        emergencyOverrideReason: reasonStr || overrideReason || 'Standard depot return',
        deviceId: driverProfile?.boundDeviceId || 'android_device_company'
      });

      // Stop and remove native floating bubble overlay
      stopFloatingBubble();

      Alert.alert(
        'Duty Completed! ✅',
        `Shift closed successfully.\nStart: ${startOdo} km\nReturn: ${returnOdoNum} km\nTotal Distance: ${distanceCoveredKm} km`,
        [{ text: 'View Home / Submit Earnings', onPress: () => navigation?.replace && navigation.replace('Home') }]
      );
    } catch (err) {
      Alert.alert('End Duty Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEndDuty = async () => {
    if (returnOdoNum < startOdo) {
      Alert.alert(
        'Invalid Return Odometer (Galat Meter Reading)',
        `Return odometer (${returnOdoNum} km) cannot be less than shift start reading (${startOdo} km).`
      );
      return;
    }

    if (!keysReturned || !helmetsReturned || !noPartsSwapped) {
      Alert.alert(
        'Custody Return Checklist',
        'Please confirm: Have you returned the bike keys, company helmet, and verified no parts were swapped?',
        [
          { text: 'Review Switches', style: 'cancel' },
          {
            text: 'Confirm All & Complete 🏁',
            onPress: () => {
              setKeysReturned(true);
              setHelmetsReturned(true);
              setNoPartsSwapped(true);
              if (!proximity.within && !emergencyOverride) {
                promptProximityOverride();
              } else {
                executeEndDuty(emergencyOverride, overrideReason);
              }
            }
          }
        ]
      );
      return;
    }

    if (!proximity.within && !emergencyOverride) {
      promptProximityOverride();
      return;
    }

    if (emergencyOverride && (!overrideReason || overrideReason.trim().length < 5)) {
      Alert.alert('Reason Required', 'Please enter a valid reason for non-depot return.');
      return;
    }

    await executeEndDuty(emergencyOverride, overrideReason);
  };

  const promptProximityOverride = () => {
    Alert.alert(
      'Depot Return Verification 📍',
      `GPS indicates you are outside the geofenced depot zone (${proximity.distance || 'outside'}m).\n\nIf you are handing over the vehicle at the depot or completing an authorized return, tap below to confirm.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Depot Handover 🏁',
          onPress: () => {
            setEmergencyOverride(true);
            const r = 'Supervisor confirmed depot handover';
            setOverrideReason(r);
            executeEndDuty(true, r);
          }
        }
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topBackRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (navigation?.goBack ? navigation.goBack() : navigation?.navigate && navigation.navigate('ActiveDuty'))}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>← Back to Shift</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.heading}>End Duty / Return Bike</Text>
      <Text style={styles.subheading}>
        Bike return inspection at MM Ride Shop / Depot (Shift Khatam Karein)
      </Text>

      {/* Geofence Status */}
      <View style={[styles.geofenceCard, proximity.within ? styles.geoValid : styles.geoAlert]}>
        <Text style={styles.geoTitle}>
          {proximity.within ? '📍 Authorized Shop / Depot Verified' : '⚠️ Away From Return Shop'}
        </Text>
        <Text style={styles.geoDesc}>
          Return Location: <Text style={{ fontWeight: 'bold' }}>{hub?.name || 'Central MM Ride Shop / Depot'}</Text>
        </Text>
        <Text style={styles.geoDesc}>
          GPS Proximity: <Text style={{ fontWeight: 'bold' }}>{proximity.distance !== null ? `${proximity.distance} meters` : 'Acquiring GPS...'}</Text> (Max Allowed: {hub?.radiusMeters || 400}m)
        </Text>
      </View>

      {/* Live Distance Mileage Card */}
      <View style={styles.mileageCard}>
        <Text style={styles.mileageLabel}>SHIFT DISTANCE COVERED (Kul Doori)</Text>
        <Text style={styles.mileageValue}>{distanceCoveredKm} km</Text>
        <Text style={styles.mileageSub}>
          Start: <Text style={{ fontWeight: 'bold' }}>{startOdo} km</Text> → Return: <Text style={{ fontWeight: 'bold' }}>{returnOdoNum} km</Text>
        </Text>
      </View>

      {/* Non-Depot Emergency Override */}
      {!proximity.within && (
        <View style={styles.overrideCard}>
          <View style={styles.switchRow}>
            <Switch
              value={emergencyOverride}
              onValueChange={setEmergencyOverride}
              trackColor={{ true: colors.danger, false: colors.border }}
            />
            <Text style={styles.overrideText}>
              Emergency Non-Shop Return Override (Subject to Audit)
            </Text>
          </View>
          {emergencyOverride && (
            <TextInput
              style={[styles.input, { height: 60, marginTop: 10 }]}
              multiline
              placeholder="State emergency reason (breakdown, accident, medical emergency)..."
              placeholderTextColor={colors.textMuted}
              value={overrideReason}
              onChangeText={setOverrideReason}
            />
          )}
        </View>
      )}

      {/* Return Readings */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Return Readings (Meter & Fuel)</Text>

        <Text style={styles.label}>Return Odometer (km) * (Start was {startOdo} km)</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={returnOdometer}
          onChangeText={setReturnOdometer}
        />

        <Text style={styles.label}>How many litres petrol (Remaining in tank) *</Text>
        <View style={styles.fuelPresetsRow}>
          {['1', '2', '3', '5'].map(val => (
            <TouchableOpacity
              key={val}
              style={[styles.fuelPresetPill, fuelCharge === val && styles.fuelPresetPillActive]}
              onPress={() => setFuelCharge(val)}
            >
              <Text style={[styles.fuelPresetText, fuelCharge === val && styles.fuelPresetTextActive]}>{val} L</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          keyboardType="decimal-pad"
          value={fuelCharge}
          onChangeText={setFuelCharge}
          placeholder="Enter litres (e.g. 2.5)"
          placeholderTextColor="#64748B"
        />

        <Text style={styles.label}>Bike Condition Notes (Gaadi Ki Halat)</Text>
        <TextInput
          style={styles.input}
          value={condition}
          onChangeText={setCondition}
        />
      </View>

      {/* Damage / Incident Report Check */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>2. Damage / Challan / Incident Report</Text>

        <View style={styles.switchRow}>
          <Switch
            value={hasDamage}
            onValueChange={setHasDamage}
            trackColor={{ true: colors.warning, false: colors.border }}
          />
          <Text style={styles.switchLabel}>Report damage, accident, or traffic challan during shift</Text>
        </View>

        {hasDamage && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Description of Incident or Damage</Text>
            <TextInput
              style={[styles.input, { height: 70 }]}
              multiline
              placeholder="Describe incident or damage details..."
              placeholderTextColor={colors.textMuted}
              value={damageNotes}
              onChangeText={setDamageNotes}
            />
          </View>
        )}
      </View>

      {/* Custody Return & Anti-Fraud Checklist */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>3. Depot Return & Custody Checklist</Text>

        <View style={styles.switchRow}>
          <Switch
            value={keysReturned}
            onValueChange={setKeysReturned}
            trackColor={{ true: colors.success, false: colors.border }}
          />
          <Text style={styles.switchLabel}>🔑 Original bike ignition keys handed over at depot.</Text>
        </View>

        <View style={[styles.switchRow, { marginTop: 12 }]}>
          <Switch
            value={helmetsReturned}
            onValueChange={setHelmetsReturned}
            trackColor={{ true: colors.success, false: colors.border }}
          />
          <Text style={styles.switchLabel}>🪖 Company helmets and accessories returned in clean condition.</Text>
        </View>

        <View style={[styles.switchRow, { marginTop: 12 }]}>
          <Switch
            value={noPartsSwapped}
            onValueChange={setNoPartsSwapped}
            trackColor={{ true: colors.success, false: colors.border }}
          />
          <Text style={styles.switchLabel}>🛡️ I confirm no tyres, battery, or parts were swapped or modified during this shift.</Text>
        </View>

        <View style={[styles.switchRow, { marginTop: 12 }]}>
          <Switch
            value={earningsAuditAcknowledged}
            onValueChange={setEarningsAuditAcknowledged}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
          <Text style={styles.switchLabel}>📱 I will present my phone for physical verification of all Ola/Uber/Rapido and cash ride earnings.</Text>
        </View>
      </View>

      <BigButton
        title="Complete Return & End Duty (Shift Khatam Karein) 🏁"
        onPress={handleEndDuty}
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
    marginBottom: 16
  },
  geofenceCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16
  },
  geoValid: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  geoAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  geoTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 4
  },
  geoDesc: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 18
  },
  mileageCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderActive,
    alignItems: 'center',
    marginBottom: 16
  },
  mileageLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4
  },
  mileageValue: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.primaryLight
  },
  mileageSub: {
    fontSize: 13,
    color: colors.text,
    marginTop: 4
  },
  overrideCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: 16
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
    marginBottom: 12
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  switchLabel: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18
  },
  overrideText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    fontWeight: '700'
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
  fuelPresetsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 4
  },
  fuelPresetPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)'
  },
  fuelPresetPillActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderColor: '#F59E0B'
  },
  fuelPresetText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700'
  },
  fuelPresetTextActive: {
    color: '#FCD34D'
  }
});
