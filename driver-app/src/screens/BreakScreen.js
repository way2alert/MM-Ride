import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert 
} from 'react-native';
import { useDriver } from '../context/DriverContext';
import { startDutyBreak, endDutyBreak } from '../firebase/api';
import { colors } from '../utils/colors';
import BigButton from '../components/BigButton';

export default function BreakScreen({ navigation }) {
  const { currentUser, activeDutySession, currentLocation } = useDriver();

  const [selectedType, setSelectedType] = useState('PLANNED'); // PLANNED, SHORT, EMERGENCY
  const [breakId, setBreakId] = useState(activeDutySession?.currentBreakId || null);
  const [isOnBreak, setIsOnBreak] = useState(activeDutySession?.status === 'ON_BREAK');
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isOnBreak) {
      interval = setInterval(() => {
        setBreakMinutes(prev => prev + 1);
      }, 60000);
    }
    return () => clearInterval(interval);
  }, [isOnBreak]);

  const handleStartBreak = async () => {
    setLoading(true);
    try {
      const id = await startDutyBreak({
        driverId: currentUser.uid,
        dutyId: activeDutySession.id,
        type: selectedType,
        location: currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        } : null
      });

      setBreakId(id);
      setIsOnBreak(true);
      Alert.alert('Break Started', `You are now on a ${selectedType} break. Shift timer is paused.`);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResumeDuty = async () => {
    setLoading(true);
    try {
      await endDutyBreak({
        breakId: breakId || activeDutySession.currentBreakId,
        dutyId: activeDutySession.id,
        startTime: null
      });

      setIsOnBreak(false);
      Alert.alert('Duty Resumed! 🏍️', 'Break completed. Your shift is active again.', [
        { text: 'Back to Shift Console', onPress: () => navigation?.replace && navigation.replace('ActiveDuty') }
      ]);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Break Management</Text>
      <Text style={styles.subheading}>
        Manage rest periods during your authorized 12-hour work day
      </Text>

      {isOnBreak ? (
        <View style={styles.activeBreakCard}>
          <Text style={styles.breakEmoji}>⏸️</Text>
          <Text style={styles.breakTitle}>You Are Currently on Break</Text>
          <Text style={styles.breakDuration}>Duration: {breakMinutes} Minutes</Text>
          <Text style={styles.breakPolicy}>
            Policy reminder: Maximum planned break is 60 minutes. Resume when ready.
          </Text>

          <BigButton
            title="Resume Work Shift Now"
            onPress={handleResumeDuty}
            loading={loading}
            variant="success"
            style={{ marginTop: 24, width: '100%' }}
          />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Select Break Type</Text>

            <TouchableOpacity
              style={[styles.typeOption, selectedType === 'PLANNED' && styles.typeSelected]}
              onPress={() => setSelectedType('PLANNED')}
            >
              <Text style={styles.optionEmoji}>🍱</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Planned Break (Meal / Rest)</Text>
                <Text style={styles.optionSub}>Standard daily break (Up to 1 hour)</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeOption, selectedType === 'SHORT' && styles.typeSelected]}
              onPress={() => setSelectedType('SHORT')}
            >
              <Text style={styles.optionEmoji}>☕</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Short Break (Tea / Refreshment)</Text>
                <Text style={styles.optionSub}>Quick rest period (10–15 minutes)</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeOption, selectedType === 'EMERGENCY' && styles.typeSelected]}
              onPress={() => setSelectedType('EMERGENCY')}
            >
              <Text style={styles.optionEmoji}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Emergency Break</Text>
                <Text style={styles.optionSub}>Unexpected personal / medical necessity</Text>
              </View>
            </TouchableOpacity>
          </View>

          <BigButton
            title="Start Break"
            onPress={handleStartBreak}
            loading={loading}
            variant="primary"
            style={{ marginTop: 10 }}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 20,
    flexGrow: 1
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
    marginBottom: 20
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
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    gap: 12
  },
  typeSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(245, 158, 11, 0.1)'
  },
  optionEmoji: {
    fontSize: 24
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white
  },
  optionSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2
  },
  activeBreakCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.warning,
    marginTop: 20
  },
  breakEmoji: {
    fontSize: 48,
    marginBottom: 12
  },
  breakTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 6
  },
  breakDuration: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.primaryLight,
    marginBottom: 8
  },
  breakPolicy: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10
  }
});
