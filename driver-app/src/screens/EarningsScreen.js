import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity 
} from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDriver } from '../context/DriverContext';
import { colors } from '../utils/colors';
import Header from '../components/Header';
import BigButton from '../components/BigButton';

export default function EarningsScreen({ navigation }) {
  const { currentUser } = useDriver();

  const [period, setPeriod] = useState('TODAY'); // TODAY, WEEK, MONTH
  const [earningsList, setEarningsList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEarnings() {
      if (!currentUser?.uid) return;
      setLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, 'earnings'),
            where('driverId', '==', currentUser.uid)
          )
        );
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setEarningsList(list);
      } catch (err) {
        console.warn('Error loading earnings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadEarnings();
  }, [currentUser?.uid]);

  const todayStr = new Date().toISOString().split('T')[0];
  const filtered = earningsList.filter(item => {
    if (period === 'TODAY') return item.date === todayStr;
    return true;
  });

  // Calculate actual totals from real ledger records (0 if no rides recorded yet)
  const hasData = filtered.length > 0;
  const totalGross = filtered.reduce((acc, r) => acc + (r.grossIncome || 0), 0);
  const totalFees = filtered.reduce((acc, r) => acc + (r.platformCharges || 0), 0);
  const totalNet = Math.max(0, totalGross - totalFees);
  const totalWorker50 = Math.round(totalNet * 0.5);
  const totalOwner50 = Math.round(totalNet * 0.5);
  const totalHold = Math.round(totalWorker50 * 0.10);
  const totalPaidToday = Math.max(0, totalWorker50 - totalHold);

  return (
    <View style={styles.screen}>
      <Header
        title="EARNINGS (Kamai Ledger)"
        subtitle="50% Worker Share Ledger"
        showBack={true}
        onBackPress={() => (navigation?.goBack ? navigation.goBack() : navigation?.navigate && navigation.navigate('Home'))}
        onSosPress={() => navigation?.navigate && navigation.navigate('EmergencySOS')}
        onProfilePress={() => navigation?.navigate && navigation.navigate('Profile')}
      />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Period Selector */}
        <View style={styles.periodTabs}>
          {['TODAY', 'WEEK', 'MONTH'].map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {p === 'TODAY' ? 'TODAY' : p === 'WEEK' ? 'WEEK' : 'MONTH'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Verification Status Badge */}
        <View style={{
          backgroundColor: hasData ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
          borderWidth: 1,
          borderColor: hasData ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)',
          borderRadius: 8,
          padding: 10,
          marginBottom: 14,
          alignItems: 'center'
        }}>
          <Text style={{ color: hasData ? '#34D399' : '#FCD34D', fontSize: 12, fontWeight: '700' }}>
            {hasData ? '✅ Official Settlement: Physically Verified by Depot Owner' : '⏳ Verification Pending: Return bike to depot for mobile check'}
          </Text>
        </View>

        {/* Primary Payout Card */}
        <View style={styles.highlightCard}>
          <Text style={styles.highlightLabel}>PAID TODAY (Aaj Ka Bhugtan)</Text>
          <Text style={styles.highlightAmount}>₹{totalPaidToday.toFixed(2)}</Text>
          <Text style={styles.highlightSub}>
            Worker 50% Share: <Text style={{ fontWeight: 'bold' }}>₹{totalWorker50.toFixed(2)}</Text> (Less 10% Reserve: ₹{totalHold.toFixed(2)})
          </Text>
        </View>

        {/* The Exact Breakdown Table Required by the Business Model */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daily Calculation Details</Text>

          <View style={styles.tableHeader}>
            <Text style={styles.thLeft}>Details</Text>
            <Text style={styles.thRight}>Amount</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={styles.tdLeft}>Gross ride earnings (Ola/Uber/Rapido)</Text>
            <Text style={styles.tdRight}>₹{totalGross.toFixed(2)}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tdLeft, { color: colors.danger }]}>Applicable platform charges</Text>
            <Text style={[styles.tdRight, { color: colors.danger }]}>-₹{totalFees.toFixed(2)}</Text>
          </View>

          <View style={[styles.tableRow, styles.subtotalRow]}>
            <Text style={[styles.tdLeft, styles.boldWhite]}>Net ride income</Text>
            <Text style={[styles.tdRight, styles.boldWhite]}>₹{totalNet.toFixed(2)}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tdLeft, { color: colors.primary, fontWeight: '700' }]}>Worker 50% (Aapka Hissa)</Text>
            <Text style={[styles.tdRight, { color: colors.primary, fontWeight: '800' }]}>₹{totalWorker50.toFixed(2)}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={styles.tdLeft}>Owner Share (50%)</Text>
            <Text style={styles.tdRight}>₹{totalOwner50.toFixed(2)}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tdLeft, { color: colors.primaryLight }]}>10% Temporary Hold (Reserve)</Text>
            <Text style={[styles.tdRight, { color: colors.primaryLight }]}>₹{totalHold.toFixed(2)}</Text>
          </View>

          <View style={[styles.tableRow, styles.finalPayoutRow]}>
            <Text style={[styles.tdLeft, styles.boldFinal]}>Paid Today (Aapki Net Kamai)</Text>
            <Text style={[styles.tdRight, styles.boldFinalGreen]}>₹{totalPaidToday.toFixed(2)}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tdLeft, { color: colors.textSecondary }]}>Pending Reserve Hold</Text>
            <Text style={[styles.tdRight, { color: colors.primaryLight, fontWeight: '700' }]}>₹{totalHold.toFixed(2)}</Text>
          </View>
        </View>

        {/* Fuel & Reserve Policy Notice */}
        <View style={styles.policyNotice}>
          <Text style={styles.policyTitle}>⛽ 50/50 Shared Fuel (CNG / Petrol) & Maintenance Model:</Text>
          <Text style={styles.policyText}>
            • Fuel (Petrol & CNG) is shared 50% by MM Ride Fleet Owner and 50% by Driver.{'\n'}
            • Normal bike servicing, oil change & mechanical maintenance paid 100% by Owner.{'\n'}
            • The 10% reserve safety hold is recorded separately and settled on weekly cycle.
          </Text>
        </View>

        <BigButton
          title="Submit Today\'s Ola / Uber Summary Photo 📸"
          onPress={() => navigation?.navigate && navigation.navigate('SubmitDailyEarnings')}
          variant="primary"
          style={{ marginTop: 10, marginBottom: 40 }}
        />
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
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  periodBtnActive: {
    backgroundColor: colors.primary
  },
  periodText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary
  },
  periodTextActive: {
    color: '#000'
  },
  highlightCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderActive,
    marginBottom: 16
  },
  highlightLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 6
  },
  highlightAmount: {
    fontSize: 38,
    fontWeight: '900',
    color: colors.success
  },
  highlightSub: {
    fontSize: 12,
    color: colors.text,
    marginTop: 6
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
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 6
  },
  thLeft: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase'
  },
  thRight: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase'
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)'
  },
  subtotalRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: 6,
    borderRadius: 6,
    marginVertical: 4
  },
  finalPayoutRow: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  tdLeft: {
    fontSize: 13,
    color: colors.text
  },
  tdRight: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white
  },
  boldWhite: {
    fontWeight: '800',
    color: colors.white
  },
  boldFinal: {
    fontWeight: '800',
    color: colors.white,
    fontSize: 14
  },
  boldFinalGreen: {
    fontWeight: '900',
    color: colors.success,
    fontSize: 18
  },
  policyNotice: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    marginBottom: 16
  },
  policyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryLight,
    marginBottom: 4
  },
  policyText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 18
  }
});
