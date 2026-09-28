import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../utils/colors';

export default function StatusBadge({ status, label }) {
  let bg = colors.border;
  let textColor = colors.text;

  if (status === 'ACTIVE_DRIVER' || status === 'APPROVED' || status === 'ACTIVE') {
    bg = colors.successBg;
    textColor = colors.success;
  } else if (status === 'SUSPENDED' || status === 'REJECTED' || status === 'DANGER') {
    bg = colors.dangerBg;
    textColor = colors.danger;
  } else if (status.includes('PENDING') || status === 'ON_BREAK') {
    bg = colors.warningBg;
    textColor = colors.warning;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>
        {label || status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  }
});
