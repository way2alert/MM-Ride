import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COLORS = [
  '#F59E0B', // MM Ride Amber
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#EF4444', // Red
  '#FCD34D'  // Gold
];

const NUM_CONFETTI = 45;

export default function ConfettiOverlay({ active = true, onAnimationComplete }) {
  const animations = useRef(
    Array.from({ length: NUM_CONFETTI }, () => ({
      y: new Animated.Value(-30),
      x: new Animated.Value(Math.random() * SCREEN_WIDTH),
      rotation: new Animated.Value(0),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(Math.random() * 0.6 + 0.6),
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: Math.random() * 8 + 6,
      isCircle: Math.random() > 0.5,
      delay: Math.random() * 800,
      duration: Math.random() * 2500 + 2500,
      drift: (Math.random() - 0.5) * 120
    }))
  ).current;

  useEffect(() => {
    if (!active) return;

    const animList = animations.map((item) => {
      return Animated.sequence([
        Animated.delay(item.delay),
        Animated.parallel([
          Animated.timing(item.y, {
            toValue: SCREEN_HEIGHT + 40,
            duration: item.duration,
            useNativeDriver: true
          }),
          Animated.timing(item.x, {
            toValue: Animated.add(item.x, new Animated.Value(item.drift)),
            duration: item.duration,
            useNativeDriver: true
          }),
          Animated.timing(item.rotation, {
            toValue: Math.random() * 720 - 360,
            duration: item.duration,
            useNativeDriver: true
          }),
          Animated.sequence([
            Animated.delay(item.duration * 0.7),
            Animated.timing(item.opacity, {
              toValue: 0,
              duration: item.duration * 0.3,
              useNativeDriver: true
            })
          ])
        ])
      ]);
    });

    Animated.parallel(animList).start(() => {
      if (onAnimationComplete) onAnimationComplete();
    });
  }, [active]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={styles.container}>
      {animations.map((item, index) => {
        const spin = item.rotation.interpolate({
          inputRange: [-360, 360],
          outputRange: ['-360deg', '360deg']
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.confetti,
              {
                backgroundColor: item.color,
                width: item.size,
                height: item.isCircle ? item.size : item.size * 1.5,
                borderRadius: item.isCircle ? item.size / 2 : 2,
                transform: [
                  { translateX: item.x },
                  { translateY: item.y },
                  { rotate: spin },
                  { scale: item.scale }
                ],
                opacity: item.opacity
              }
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999
  },
  confetti: {
    position: 'absolute',
    top: 0,
    left: 0
  }
});
