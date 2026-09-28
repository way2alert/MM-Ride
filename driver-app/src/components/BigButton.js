import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../utils/colors';

export default function BigButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon: Icon = null,
  style = {}
}) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isSuccess = variant === 'success';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[
        styles.button,
        isPrimary && styles.primaryBtn,
        isDanger && styles.dangerBtn,
        isSuccess && styles.successBtn,
        variant === 'secondary' && styles.secondaryBtn,
        disabled && styles.disabledBtn,
        style
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#000' : '#FFF'} />
      ) : (
        <>
          {Icon && <Icon size={20} color={isPrimary ? '#000' : '#FFF'} style={{ marginRight: 8 }} />}
          <Text
            style={[
              styles.text,
              isPrimary && styles.primaryText,
              variant === 'secondary' && styles.secondaryText,
              (isDanger || isSuccess) && styles.whiteText
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4
  },
  primaryBtn: {
    backgroundColor: colors.primary
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: colors.border
  },
  dangerBtn: {
    backgroundColor: colors.danger
  },
  successBtn: {
    backgroundColor: colors.success
  },
  disabledBtn: {
    opacity: 0.5
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  primaryText: {
    color: '#000'
  },
  secondaryText: {
    color: colors.text
  },
  whiteText: {
    color: '#FFF'
  }
});
