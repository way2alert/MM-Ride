import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../utils/colors';

export default function StatCard({ title, value, subtitle, highlight = false, valueColor = colors.white }) {
  return (
    <View style={[styles.card, highlight && styles.highlightCard]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12
  },
  highlightCard: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceElevated
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4
  }
});
