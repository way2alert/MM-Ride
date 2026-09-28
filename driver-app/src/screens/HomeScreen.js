import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl 
} from 'react-native';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useDriver } from '../context/DriverContext';
import { colors } from '../utils/colors';
import Header from '../components/Header';
import BigButton from '../components/BigButton';

export default function HomeScreen({ navigation }) {
  const { 
    driverProfile, 
    assignedBike, 
    activeDutySession, 
    currentLocation, 
    currentSpeed,
    systemSettings,
    todayDutyMinutes 
  } = useDriver();

  const [todayEarnings, setTodayEarnings] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const isOnDuty = !!activeDutySession && activeDutySession.status === 'ACTIVE';
  const isOnBreak = !!activeDutySession && activeDutySession.status === 'ON_BREAK';

  const fetchSummary = async () => {
    if (!driverProfile?.id) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const earnSnap = await getDocs(
        query(
          collection(db, 'earnings'),
          where('driverId', '==', driverProfile.id),
          where('date', '==', todayStr)
        )
      );
      let sum = 0;
      earnSnap.forEach(d => {
        sum += (d.data().payableToday || 0);
      });
      setTodayEarnings(sum);
    } catch (err) {
      console.warn('Summary fetch error:', err);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [driverProfile?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSummary();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <Header
        title="MM RIDE"
        subtitle={`Namaste, ${driverProfile?.fullName?.split(' ')[0] || 'Partner'}`}
        onSosPress={() => navigation?.navigate && navigation.navigate('EmergencySOS')}
        onProfilePress={() => navigation?.navigate && navigation.navigate('Profile')}
      />

      <ScrollView 
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Status Pill Header */}
        <View style={styles.statusPillRow}>
          <View style={[styles.statusDot, isOnDuty ? styles.statusDotGreen : styles.statusDotGray]} />
          <Text style={styles.statusPillText}>
            {isOnDuty ? '🟢 ON DUTY (Live GPS Active)' : isOnBreak ? '⏸️ ON BREAK' : '⚪ OFFLINE (Ready to Work)'}
          </Text>
        </View>

        {/* PRIMARY HERO: START WORK / ACTIVE DUTY CTA */}
        {isOnDuty ? (
          <View style={styles.activeShiftHeroCard}>
            <View style={styles.heroHeaderRow}>
              <View style={styles.heroPulseCircle}>
                <Text style={{ fontSize: 24 }}>🏍️</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.heroActiveTitle}>ACTIVE WORK SHIFT</Text>
                <Text style={styles.heroActiveSub}>GPS & safety monitoring live</Text>
              </View>
            </View>

            <View style={styles.activeButtonsRow}>
              <TouchableOpacity
                style={styles.heroActiveConsoleBtn}
                onPress={() => navigation?.navigate && navigation.navigate('ActiveDuty')}
                activeOpacity={0.85}
              >
                <Text style={styles.heroActiveConsoleBtnText}>Open Duty Console ⚡</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.heroEndBtn}
                onPress={() => navigation?.navigate && navigation.navigate('EndDuty')}
                activeOpacity={0.85}
              >
                <Text style={styles.heroEndBtnText}>End Shift 🛑</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : isOnBreak ? (
          <TouchableOpacity
            style={styles.startWorkHeroCard}
            onPress={() => navigation?.navigate && navigation.navigate('Break')}
            activeOpacity={0.85}
          >
            <View style={styles.startWorkInner}>
              <Text style={{ fontSize: 32, marginRight: 14 }}>⏸️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.startWorkTitle}>ON BREAK</Text>
                <Text style={styles.startWorkSub}>Tap to resume active shift</Text>
              </View>
              <Text style={styles.startWorkArrow}>➔</Text>
            </View>
          </TouchableOpacity>
        ) : (todayDutyMinutes >= ((systemSettings?.maxDutyHoursPerDay || 12) * 60)) ? (
          <View style={styles.limitReachedCard}>
            <Text style={styles.limitReachedTitle}>
              🛑 DAILY DUTY QUOTA REACHED
            </Text>
            <Text style={styles.limitReachedSub}>
              You have completed maximum {systemSettings?.maxDutyHoursPerDay || 12} hours today. You can start again tomorrow.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.startWorkHeroCard}
            onPress={() => navigation?.navigate && navigation.navigate('StartDuty')}
            activeOpacity={0.85}
          >
            <View style={styles.startWorkInner}>
              <View style={styles.rocketIconBadge}>
                <Text style={{ fontSize: 26 }}>🚀</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.startWorkTitle}>START WORK</Text>
                <Text style={styles.startWorkSub}>Tap to verify bike & start shift</Text>
              </View>
              <View style={styles.startArrowBadge}>
                <Text style={styles.startArrowText}>➔</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* 2 Clean Info Cards: Assigned Vehicle & Today's Earnings */}
        <View style={styles.infoCardsRow}>
          {/* Assigned Bike Card */}
          <View style={styles.cleanCard}>
            <View style={styles.cleanCardHeader}>
              <Text style={{ fontSize: 18 }}>🏍️</Text>
              <Text style={styles.cleanCardTag}>ASSIGNED BIKE</Text>
            </View>
            <Text style={styles.bikeNumberText}>
              {assignedBike?.registrationNumber || driverProfile?.assignedBikeRegistration || 'TN 01 AB 1234'}
            </Text>
            <Text style={styles.bikeModelText}>
              {assignedBike ? `${assignedBike.make || 'Hero'} ${assignedBike.model || 'Splendor'}` : 'Hero Splendor Plus'}
            </Text>
            <Text style={styles.bikeFuelBadge}>
              ⛽ Fuel Paid by MM Ride
            </Text>
          </View>

          {/* Today's Shift & Earnings Card */}
          <View style={styles.cleanCard}>
            <View style={styles.cleanCardHeader}>
              <Text style={{ fontSize: 18 }}>💰</Text>
              <Text style={styles.cleanCardTag}>TODAY'S EARNINGS</Text>
            </View>
            <Text style={styles.earningsAmountText}>
              ₹{todayEarnings.toFixed(2)}
            </Text>
            <Text style={styles.earningsSubText}>
              50% Worker Share
            </Text>
            <Text style={styles.shiftTimeBadge}>
              ⏱️ Shift: {Math.floor((todayDutyMinutes || 0) / 60)}h {(todayDutyMinutes || 0) % 60}m
            </Text>
          </View>
        </View>

        {/* Quick Services Menu Grid */}
        <Text style={styles.sectionHeaderTitle}>QUICK SERVICES</Text>
        <View style={styles.menuGrid}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation?.navigate && navigation.navigate('Earnings')}
            activeOpacity={0.8}
          >
            <Text style={styles.menuIcon}>💰</Text>
            <Text style={styles.menuTitle}>My Earnings</Text>
            <Text style={styles.menuDesc}>Weekly settlements</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation?.navigate && navigation.navigate('SubmitDailyEarnings')}
            activeOpacity={0.8}
          >
            <Text style={styles.menuIcon}>📸</Text>
            <Text style={styles.menuTitle}>Submit Income</Text>
            <Text style={styles.menuDesc}>Daily cash / app proof</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation?.navigate && navigation.navigate('Leave')}
            activeOpacity={0.8}
          >
            <Text style={styles.menuIcon}>📅</Text>
            <Text style={styles.menuTitle}>Leave / Off</Text>
            <Text style={styles.menuDesc}>Request weekly off</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation?.navigate && navigation.navigate('IncidentReport')}
            activeOpacity={0.8}
          >
            <Text style={styles.menuIcon}>⚠️</Text>
            <Text style={styles.menuTitle}>Report Damage</Text>
            <Text style={styles.menuDesc}>Bike issue / accident</Text>
          </TouchableOpacity>
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
    padding: 16,
    paddingBottom: 40
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 16
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8
  },
  statusDotGreen: {
    backgroundColor: '#10B981'
  },
  statusDotGray: {
    backgroundColor: '#94A3B8'
  },
  statusPillText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700'
  },
  startWorkHeroCard: {
    backgroundColor: '#F59E0B',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6
  },
  startWorkInner: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  rocketIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  startWorkTitle: {
    color: '#000000',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  startWorkSub: {
    color: '#78350F',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2
  },
  startArrowBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center'
  },
  startArrowText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900'
  },
  activeShiftHeroCard: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  heroPulseCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroActiveTitle: {
    color: '#10B981',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  heroActiveSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2
  },
  activeButtonsRow: {
    flexDirection: 'row',
    gap: 10
  },
  heroActiveConsoleBtn: {
    flex: 1.5,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroActiveConsoleBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800'
  },
  heroEndBtn: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569'
  },
  heroEndBtnText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '700'
  },
  limitReachedCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 16,
    marginBottom: 16,
    alignItems: 'center'
  },
  limitReachedTitle: {
    color: '#F87171',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4
  },
  limitReachedSub: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center'
  },
  infoCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  cleanCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  cleanCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8
  },
  cleanCardTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5
  },
  bikeNumberText: {
    color: colors.primaryLight,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  bikeModelText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2
  },
  bikeFuelBadge: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6
  },
  earningsAmountText: {
    color: '#34D399',
    fontSize: 18,
    fontWeight: '900'
  },
  earningsSubText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2
  },
  shiftTimeBadge: {
    color: colors.primaryLight,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 2
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  menuItem: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  menuIcon: {
    fontSize: 22,
    marginBottom: 8
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white
  },
  menuDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  }
});
