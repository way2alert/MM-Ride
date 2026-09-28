import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  Linking 
} from 'react-native';
import { useDriver } from '../context/DriverContext';
import { submitEmergencyIncident } from '../firebase/api';
import { colors } from '../utils/colors';
import BigButton from '../components/BigButton';

export default function EmergencySOSScreen({ navigation }) {
  const { currentUser, driverProfile, assignedBike, currentLocation } = useDriver();

  const [sosSent, setSosSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleTriggerSOS = async () => {
    setLoading(true);
    try {
      await submitEmergencyIncident({
        driverId: currentUser.uid,
        bikeId: driverProfile.assignedBikeId || assignedBike?.id,
        type: 'EMERGENCY_SOS_PANIC',
        description: 'Driver triggered immediate Emergency SOS panic button.',
        gps: currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        } : null
      });

      setSosSent(true);
      Alert.alert(
        'EMERGENCY ALERT SENT! 🚨',
        'Operations control room and dispatch have been alerted with your real-time GPS coordinates. Emergency contacts are being notified.'
      );
    } catch (err) {
      Alert.alert('Alert Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const callHelpline = (num) => {
    Linking.openURL(`tel:${num}`).catch(e => Alert.alert('Dialer error', e.message));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.emergencyHeader}>
        <Text style={styles.emergencyTitle}>EMERGENCY RESPONSE</Text>
        <Text style={styles.emergencySub}>
          Immediate distress assistance and location dispatch
        </Text>
      </View>

      {/* Big Panic Button */}
      <View style={styles.panicContainer}>
        <TouchableOpacity
          style={[styles.panicCircle, sosSent && styles.panicSent]}
          onPress={handleTriggerSOS}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.panicEmoji}>{sosSent ? '✅' : '🚨'}</Text>
          <Text style={styles.panicText}>
            {sosSent ? 'DISPATCHED' : 'TAP FOR SOS'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.panicPrompt}>
          {sosSent
            ? '🚨 Alert active: Location sent to control room'
            : 'Press button to transmit emergency GPS alert to MM Ride Operations'}
        </Text>
      </View>

      {/* Emergency Hotlines */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Emergency Helpline Directory</Text>

        <TouchableOpacity style={styles.helplineRow} onPress={() => callHelpline('112')}>
          <Text style={styles.helplineIcon}>🚓</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.helplineName}>National Emergency Services</Text>
            <Text style={styles.helplineNum}>Dial 112 (Police & Medical)</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.helplineRow} onPress={() => callHelpline('18004190123')}>
          <Text style={styles.helplineIcon}>🏢</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.helplineName}>MM Ride 24/7 Operations Hub</Text>
            <Text style={styles.helplineNum}>Toll Free: 1800-419-0123</Text>
          </View>
        </TouchableOpacity>

        {driverProfile?.emergencyContactPhone && (
          <TouchableOpacity style={styles.helplineRow} onPress={() => callHelpline(driverProfile.emergencyContactPhone)}>
            <Text style={styles.helplineIcon}>❤️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.helplineName}>Family Emergency Contact ({driverProfile.emergencyContactName})</Text>
              <Text style={styles.helplineNum}>Dial {driverProfile.emergencyContactPhone}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <BigButton
        title="Report Specific Incident / Accident Details"
        onPress={() => navigation?.navigate && navigation.navigate('IncidentReport')}
        variant="secondary"
        style={{ marginTop: 8, marginBottom: 30 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 20,
    flexGrow: 1
  },
  emergencyHeader: {
    alignItems: 'center',
    marginBottom: 24
  },
  emergencyTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.danger,
    letterSpacing: 1
  },
  emergencySub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4
  },
  panicContainer: {
    alignItems: 'center',
    marginBottom: 30
  },
  panicCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 10,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.4)'
  },
  panicSent: {
    backgroundColor: colors.success,
    borderColor: 'rgba(255, 255, 255, 0.6)'
  },
  panicEmoji: {
    fontSize: 50,
    marginBottom: 6
  },
  panicText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.8
  },
  panicPrompt: {
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20
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
  helplineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12
  },
  helplineIcon: {
    fontSize: 26
  },
  helplineName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white
  },
  helplineNum: {
    fontSize: 12,
    color: colors.primaryLight,
    marginTop: 2
  }
});
