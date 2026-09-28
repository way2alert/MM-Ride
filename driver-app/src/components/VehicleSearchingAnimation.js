import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '../utils/colors';

export default function VehicleSearchingAnimation({ onScanAgain, isScanning = false }) {
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const wave3 = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Concentric pulsing wave loops
    const createWaveAnimation = (anim, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2400,
            useNativeDriver: true
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true
          })
        ])
      );
    };

    const radarLoop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true
      })
    );

    const anim1 = createWaveAnimation(wave1, 0);
    const anim2 = createWaveAnimation(wave2, 800);
    const anim3 = createWaveAnimation(wave3, 1600);

    anim1.start();
    anim2.start();
    anim3.start();
    radarLoop.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
      radarLoop.stop();
    };
  }, []);

  const renderWave = (anim) => {
    const scale = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.6, 2.4]
    });
    const opacity = anim.interpolate({
      inputRange: [0, 0.4, 1],
      outputRange: [0.8, 0.4, 0]
    });

    return (
      <Animated.View
        style={[
          styles.radarWave,
          {
            transform: [{ scale }],
            opacity
          }
        ]}
      />
    );
  };

  const radarSpin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <View style={styles.card}>
      {/* Radar Graphic Area */}
      <View style={styles.radarWrapper}>
        {renderWave(wave1)}
        {renderWave(wave2)}
        {renderWave(wave3)}

        {/* Rotating Scanning Beam */}
        <Animated.View style={[styles.rotatingBeam, { transform: [{ rotate: radarSpin }] }]}>
          <View style={styles.beamCone} />
        </Animated.View>

        {/* Center Bike Icon Badge */}
        <View style={styles.centerBadge}>
          <Text style={styles.centerEmoji}>🏍️</Text>
          <View style={styles.livePulseDot} />
        </View>
      </View>

      {/* Headline & Explanation */}
      <Text style={styles.title}>Finding Suitable Vehicle For You...</Text>
      <Text style={styles.subtitle}>(Aapke liye gaadi dhoond rahe hain)</Text>

      <View style={styles.infoBanner}>
        <Text style={styles.bannerHeading}>⏳ Auto-Allocation in Progress</Text>
        <Text style={styles.bannerText}>
          All MM Ride two-wheelers in your area are currently on active shifts.
          {'\n\n'}
          • Our system is <Text style={{ fontWeight: 'bold', color: colors.primary }}>scanning nearby hubs</Text> in real-time.
          {'\n'}
          • As soon as an eligible bike returns or is checked in, it will be <Text style={{ fontWeight: 'bold', color: '#34D399' }}>auto-assigned to you instantly</Text>.
          {'\n'}
          • We will notify you here as soon as a vehicle is ready!
        </Text>
      </View>

      {/* Action to re-scan */}
      <TouchableOpacity
        style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
        onPress={onScanAgain}
        disabled={isScanning}
        activeOpacity={0.8}
      >
        {isScanning ? (
          <View style={styles.btnRow}>
            <ActivityIndicator size="small" color="#000" />
            <Text style={styles.scanButtonText}>Scanning Hubs Now...</Text>
          </View>
        ) : (
          <View style={styles.btnRow}>
            <Text style={styles.scanBtnIcon}>🔄</Text>
            <Text style={styles.scanButtonText}>Check Available Vehicles Now</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    padding: 24,
    alignItems: 'center',
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8
  },
  radarWrapper: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 18
  },
  radarWave: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: colors.primary
  },
  rotatingBeam: {
    position: 'absolute',
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center'
  },
  beamCone: {
    width: 2,
    height: 60,
    backgroundColor: colors.primaryLight,
    position: 'absolute',
    top: 0,
    opacity: 0.7
  },
  centerBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 6
  },
  centerEmoji: {
    fontSize: 32
  },
  livePulseDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#1E293B'
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
    marginTop: 8
  },
  subtitle: {
    fontSize: 13,
    color: colors.primaryLight,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16
  },
  infoBanner: {
    width: '100%',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18
  },
  bannerHeading: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6
  },
  bannerText: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 18
  },
  scanButton: {
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  scanButtonDisabled: {
    opacity: 0.7
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  scanBtnIcon: {
    fontSize: 16
  },
  scanButtonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14
  }
});
