import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../utils/colors';

export default function Header({
  title,
  subtitle,
  onSosPress,
  onProfilePress,
  showSos = true,
  showBack = false,
  onBackPress
}) {
  return (
    <View style={styles.header}>
      {showBack && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBackPress}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      )}

      <View style={styles.titleContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      <View style={styles.actions}>
        {showSos && (
          <TouchableOpacity
            style={styles.sosButton}
            onPress={onSosPress}
            activeOpacity={0.8}
          >
            <Text style={styles.sosText}>🚨 SOS</Text>
          </TouchableOpacity>
        )}

        {onProfilePress && (
          <TouchableOpacity
            style={styles.profileButton}
            onPress={onProfilePress}
            activeOpacity={0.8}
          >
            <Text style={styles.profileText}>👤</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 12
  },
  backButtonText: {
    color: colors.primaryLight,
    fontWeight: '700',
    fontSize: 12
  },
  titleContainer: {
    flex: 1
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white
  },
  subtitle: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  sosButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)'
  },
  sosText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  profileText: {
    fontSize: 16
  }
});
