import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Alert 
} from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDriver } from '../context/DriverContext';
import { submitDriverLeave } from '../firebase/api';
import { colors } from '../utils/colors';
import Header from '../components/Header';
import BigButton from '../components/BigButton';

export default function LeaveScreen({ navigation }) {
  const { currentUser } = useDriver();

  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [durationDays, setDurationDays] = useState('1');
  const [reason, setReason] = useState('Weekly Off');
  const [isEmergency, setIsEmergency] = useState(false);
  const [pastLeaves, setPastLeaves] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadPastLeaves() {
      if (!currentUser?.uid) return;
      try {
        const snap = await getDocs(
          query(
            collection(db, 'leaveRequests'),
            where('driverId', '==', currentUser.uid)
          )
        );
        setPastLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.warn('Error loading leaves:', err);
      }
    }
    loadPastLeaves();
  }, [currentUser?.uid]);

  const handleSubmit = async () => {
    if (!startDate || !reason) {
      Alert.alert('Fields Required', 'Please provide start date and reason.');
      return;
    }

    setLoading(true);
    try {
      await submitDriverLeave({
        driverId: currentUser.uid,
        startDate,
        durationDays: Number(durationDays),
        reason: isEmergency ? `[EMERGENCY LEAVE] ${reason}` : reason
      });

      Alert.alert('Leave Submitted ✅', 'Your leave request has been submitted to Operations for review.');
      setReason('');
      // Refresh list
      const snap = await getDocs(
        query(
          collection(db, 'leaveRequests'),
          where('driverId', '==', currentUser.uid)
        )
      );
      setPastLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title="LEAVE & WEEKLY OFF"
        subtitle="Schedule Authorized Time Off"
        onSosPress={() => navigation?.navigate && navigation.navigate('EmergencySOS')}
        onProfilePress={() => navigation?.navigate && navigation.navigate('Profile')}
      />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Submit Leave Request</Text>

          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, !isEmergency && styles.toggleActive]}
              onPress={() => setIsEmergency(false)}
            >
              <Text style={[styles.toggleText, !isEmergency && styles.toggleTextActive]}>
                Standard Weekly Off
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toggleBtn, isEmergency && styles.toggleActiveDanger]}
              onPress={() => setIsEmergency(true)}
            >
              <Text style={[styles.toggleText, isEmergency && styles.toggleTextActiveDanger]}>
                🚨 Emergency Leave
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Start Date (YYYY-MM-DD) *</Text>
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
          />

          <Text style={styles.label}>Duration (Days) *</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={durationDays}
            onChangeText={setDurationDays}
          />

          <Text style={styles.label}>Reason for Leave *</Text>
          <TextInput
            style={[styles.input, { height: 70 }]}
            multiline
            placeholder="e.g. Weekly off, family event, medical..."
            placeholderTextColor={colors.textMuted}
            value={reason}
            onChangeText={setReason}
          />

          <BigButton
            title={isEmergency ? 'Submit Emergency Leave Request' : 'Submit Leave Request'}
            onPress={handleSubmit}
            loading={loading}
            variant={isEmergency ? 'danger' : 'primary'}
            style={{ marginTop: 14 }}
          />
        </View>

        {/* Past Leaves List */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My Leave Requests ({pastLeaves.length})</Text>

          {pastLeaves.map(l => (
            <View key={l.id} style={styles.leaveRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.leaveDate}>📅 {l.startDate} ({l.durationDays || 1} day)</Text>
                <Text style={styles.leaveReason}>{l.reason}</Text>
              </View>
              <Text style={[
                styles.statusPill,
                l.status === 'APPROVED' ? styles.statusApproved :
                l.status === 'REJECTED' ? styles.statusRejected : styles.statusPending
              ]}>
                {l.status || 'PENDING'}
              </Text>
            </View>
          ))}

          {pastLeaves.length === 0 && (
            <Text style={{ color: colors.textMuted, textAlign: 'center', padding: 12 }}>
              No leave requests submitted yet.
            </Text>
          )}
        </View>
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
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  toggleActive: {
    backgroundColor: colors.primary
  },
  toggleActiveDanger: {
    backgroundColor: colors.danger
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary
  },
  toggleTextActive: {
    color: '#000'
  },
  toggleTextActiveDanger: {
    color: '#FFF'
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
  leaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)'
  },
  leaveDate: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white
  },
  leaveReason: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  statusPill: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  statusApproved: {
    backgroundColor: colors.successBg,
    color: colors.success
  },
  statusRejected: {
    backgroundColor: colors.dangerBg,
    color: colors.danger
  },
  statusPending: {
    backgroundColor: colors.warningBg,
    color: colors.warning
  }
});
