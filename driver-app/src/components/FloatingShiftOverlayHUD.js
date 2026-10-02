import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform
} from 'react-native';
import { launchPartnerApp, openOverlaySettings } from '../services/overlayService';

export default function FloatingShiftOverlayHUD({
  visible = true,
  bikeRegistration = 'TN 01 AB 1234',
  totalRides = 0,
  totalGross = 0,
  driverShare = 0,
  elapsedMinutes = 0,
  onOpenQuickLogger
}) {
  if (!visible) return null;

  return (
    <View style={styles.permanentStickyDock} pointerEvents="box-none">
      {/* 1. Live Telemetry & Earnings Summary Bar */}
      <View style={styles.dockSummaryBar}>
        <View style={styles.dockStatusLeft}>
          <View style={styles.pulsingLiveDot} />
          <Text style={styles.statusOnDutyText}>ON DUTY</Text>
          <Text style={styles.statusDivider}>•</Text>
          <Text style={styles.statusBikeText}>🏍️ {bikeRegistration}</Text>
          <Text style={styles.statusDivider}>•</Text>
          <Text style={styles.statusTimeText}>{elapsedMinutes}m</Text>
        </View>

        <View style={styles.dockStatusRight}>
          <Text style={styles.statsEarningsText}>
            📊 {totalRides} rides • ₹{totalGross}
          </Text>
          <Text style={styles.driverShareText}>
            (50%: ₹{driverShare})
          </Text>
          {Platform.OS === 'android' && (
            <TouchableOpacity
              style={styles.dockOverlaySettingsBtn}
              onPress={openOverlaySettings}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 13 }}>⚙️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 2. Permanent 3-Platform Sticky Action Grid (Ola, Uber, Rapido) */}
      <View style={styles.platformCardsGrid}>
        {/* 🚕 OLA CARD */}
        <View style={[styles.platformCard, styles.cardOla]}>
          <View style={styles.cardHeader}>
            <Text style={styles.platformEmoji}>🚕</Text>
            <Text style={[styles.platformName, { color: '#FACC15' }]}>OLA</Text>
          </View>
          <TouchableOpacity
            style={[styles.quickLogBtn, styles.quickLogOla]}
            onPress={() => onOpenQuickLogger && onOpenQuickLogger('OLA')}
            activeOpacity={0.82}
          >
            <Text style={styles.quickLogIcon}>⚡</Text>
            <Text style={styles.quickLogBtnText}>+ LOG RIDE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.launchAppRow}
            onPress={() => launchPartnerApp('OLA')}
            activeOpacity={0.75}
          >
            <Text style={styles.launchAppText}>Open App ➔</Text>
          </TouchableOpacity>
        </View>

        {/* 🚗 UBER CARD */}
        <View style={[styles.platformCard, styles.cardUber]}>
          <View style={styles.cardHeader}>
            <Text style={styles.platformEmoji}>🚗</Text>
            <Text style={[styles.platformName, { color: '#38BDF8' }]}>UBER</Text>
          </View>
          <TouchableOpacity
            style={[styles.quickLogBtn, styles.quickLogUber]}
            onPress={() => onOpenQuickLogger && onOpenQuickLogger('UBER')}
            activeOpacity={0.82}
          >
            <Text style={styles.quickLogIcon}>⚡</Text>
            <Text style={styles.quickLogBtnText}>+ LOG RIDE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.launchAppRow}
            onPress={() => launchPartnerApp('UBER')}
            activeOpacity={0.75}
          >
            <Text style={styles.launchAppText}>Open App ➔</Text>
          </TouchableOpacity>
        </View>

        {/* 🛵 RAPIDO CARD */}
        <View style={[styles.platformCard, styles.cardRapido]}>
          <View style={styles.cardHeader}>
            <Text style={styles.platformEmoji}>🛵</Text>
            <Text style={[styles.platformName, { color: '#FBBF24' }]}>RAPIDO</Text>
          </View>
          <TouchableOpacity
            style={[styles.quickLogBtn, styles.quickLogRapido]}
            onPress={() => onOpenQuickLogger && onOpenQuickLogger('RAPIDO')}
            activeOpacity={0.82}
          >
            <Text style={styles.quickLogIcon}>⚡</Text>
            <Text style={styles.quickLogBtnText}>+ LOG RIDE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.launchAppRow}
            onPress={() => launchPartnerApp('RAPIDO')}
            activeOpacity={0.75}
          >
            <Text style={styles.launchAppText}>Open App ➔</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  permanentStickyDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0F172A',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(56, 189, 248, 0.35)',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 26 : 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 24,
    zIndex: 999
  },
  dockSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)'
  },
  dockStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  pulsingLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6
  },
  statusOnDutyText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  statusDivider: {
    color: '#64748B',
    marginHorizontal: 5,
    fontSize: 11
  },
  statusBikeText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700'
  },
  statusTimeText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600'
  },
  dockStatusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statsEarningsText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800'
  },
  driverShareText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800'
  },
  dockOverlaySettingsBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 4
  },
  platformCardsGrid: {
    flexDirection: 'row',
    gap: 8
  },
  platformCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1.5
  },
  cardOla: {
    borderColor: 'rgba(234, 179, 8, 0.4)',
    backgroundColor: 'rgba(234, 179, 8, 0.06)'
  },
  cardUber: {
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(56, 189, 248, 0.06)'
  },
  cardRapido: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.06)'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4
  },
  platformEmoji: {
    fontSize: 16
  },
  platformName: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  quickLogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    borderRadius: 8,
    paddingVertical: 8,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3
  },
  quickLogOla: {
    backgroundColor: '#CA8A04'
  },
  quickLogUber: {
    backgroundColor: '#0284C7'
  },
  quickLogRapido: {
    backgroundColor: '#D97706'
  },
  quickLogIcon: {
    color: '#FFFFFF',
    fontSize: 13,
    marginRight: 4,
    fontWeight: 'bold'
  },
  quickLogBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4
  },
  launchAppRow: {
    paddingVertical: 2,
    paddingHorizontal: 4
  },
  launchAppText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700'
  }
});
