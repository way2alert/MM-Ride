import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView
} from 'react-native';
import { colors } from '../utils/colors';

export default function PrivacyNoticeModal({ visible, onClose }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.headerBadge}>🛡️ OFFICIAL DRIVER PRIVACY CHARTER</Text>
            <Text style={styles.title}>Your Privacy Rights as an MM Ride Partner</Text>
            <Text style={styles.subtitle}>
              Compliance with Section 4: Operational-Only Fleet Telemetry
            </Text>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.prohibitedSection}>
              <Text style={styles.sectionHeading}>🚫 WHAT MM RIDE DOES NEVER MONITOR</Text>
              <Text style={styles.sectionDesc}>
                Under company policy and applicable privacy law, the following personal activities are strictly prohibited from being monitored, logged, or recorded:
              </Text>

              <View style={styles.itemRow}>
                <Text style={styles.crossIcon}>❌</Text>
                <View style={styles.itemTextContainer}>
                  <Text style={styles.itemTitle}>NO Personal WhatsApp Monitoring</Text>
                  <Text style={styles.itemDesc}>Private chats, messages, and calls are strictly private to you.</Text>
                </View>
              </View>

              <View style={styles.itemRow}>
                <Text style={styles.crossIcon}>❌</Text>
                <View style={styles.itemTextContainer}>
                  <Text style={styles.itemTitle}>NO Personal Call Recording</Text>
                  <Text style={styles.itemDesc}>MM Ride never intercepts, monitors, or records phone calls.</Text>
                </View>
              </View>

              <View style={styles.itemRow}>
                <Text style={styles.crossIcon}>❌</Text>
                <View style={styles.itemTextContainer}>
                  <Text style={styles.itemTitle}>NO Personal Message / SMS Monitoring</Text>
                  <Text style={styles.itemDesc}>Bank SMS, OTPs, and personal text messages are never accessed.</Text>
                </View>
              </View>

              <View style={styles.itemRow}>
                <Text style={styles.crossIcon}>❌</Text>
                <View style={styles.itemTextContainer}>
                  <Text style={styles.itemTitle}>NO Personal App Activity Tracking</Text>
                  <Text style={styles.itemDesc}>Usage of non-work personal apps is never tracked.</Text>
                </View>
              </View>

              <View style={styles.itemRow}>
                <Text style={styles.crossIcon}>❌</Text>
                <View style={styles.itemTextContainer}>
                  <Text style={styles.itemTitle}>NO Microphone or Audio Recording</Text>
                  <Text style={styles.itemDesc}>Audio recording permissions are completely disabled on this app.</Text>
                </View>
              </View>
            </View>

            <View style={styles.allowedSection}>
              <Text style={styles.sectionHeadingGreen}>✅ WHAT TELEMETRY IS COLLECTED</Text>
              <Text style={styles.sectionDesc}>
                Collected strictly for documented operational purposes during active duty shifts:
              </Text>

              <View style={styles.bulletRow}>
                <Text style={styles.checkIcon}>✓</Text>
                <Text style={styles.bulletText}>
                  <Text style={{ fontWeight: '700', color: '#F8FAFC' }}>GPS Location & Speed (Active Shift Only): </Text>
                  To verify depot pickup/return geofences, prevent bike theft, and enable emergency SOS. Zero tracking while off-duty.
                </Text>
              </View>

              <View style={styles.bulletRow}>
                <Text style={styles.checkIcon}>✓</Text>
                <Text style={styles.bulletText}>
                  <Text style={{ fontWeight: '700', color: '#F8FAFC' }}>Battery & Device Health: </Text>
                  To alert depot managers if your device battery is low or swollen, preventing mid-shift downtime.
                </Text>
              </View>

              <View style={styles.bulletRow}>
                <Text style={styles.checkIcon}>✓</Text>
                <Text style={styles.bulletText}>
                  <Text style={{ fontWeight: '700', color: '#F8FAFC' }}>Odometer & Handover Proofs: </Text>
                  Photos of bike meters and fuel pump receipts to calculate fair 50/50 earnings splits and owner fuel coverage.
                </Text>
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.understandBtn} onPress={onClose}>
            <Text style={styles.understandBtnText}>I Understand & Acknowledge</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    backgroundColor: '#0F172A',
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 12
  },
  headerBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8'
  },
  body: {
    flex: 1,
    marginBottom: 16
  },
  prohibitedSection: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16
  },
  allowedSection: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F87171',
    marginBottom: 4
  },
  sectionHeadingGreen: {
    fontSize: 12,
    fontWeight: '800',
    color: '#34D399',
    marginBottom: 4
  },
  sectionDesc: {
    fontSize: 11,
    color: '#CBD5E1',
    marginBottom: 10,
    lineHeight: 16
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  crossIcon: {
    fontSize: 14,
    marginRight: 8,
    marginTop: 1
  },
  itemTextContainer: {
    flex: 1
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FCA5A5'
  },
  itemDesc: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  checkIcon: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: 'bold',
    marginRight: 8,
    marginTop: 1
  },
  bulletText: {
    flex: 1,
    fontSize: 11,
    color: '#CBD5E1',
    lineHeight: 16
  },
  understandBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  understandBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700'
  }
});
