/**
 * SafetyCameraHost
 * 
 * Mounts an active headless CameraView during duty hours to facilitate
 * real-time on-demand safety snapshots (front & rear) and automated
 * crash scene photo evidence capture.
 */

import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { registerSafetyCamera, unregisterSafetyCamera, setSafetyCameraReady } from '../services/safetyCamService';

export default function SafetyCameraHost({
  driverProfile,
  activeDutySession
}) {
  const cameraRef = useRef(null);
  const [facing, setFacing] = useState('front');
  const [permission, requestPermission] = useCameraPermissions();
  const [isReady, setIsReady] = useState(false);

  // Automatically request camera permission if not granted
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission().catch(() => {});
    }
  }, [permission]);

  // Register with safety camera service
  useEffect(() => {
    if (cameraRef.current) {
      registerSafetyCamera(
        cameraRef,
        (newFacing) => setFacing(newFacing),
        () => isReady
      );
    }

    return () => {
      unregisterSafetyCamera();
    };
  }, [isReady]);

  if (!permission?.granted) {
    return null;
  }

  // Camera is mounted headless / off-screen so driver UI is uninterrupted
  return (
    <View style={styles.offscreenContainer} pointerEvents="none">
      <CameraView
        ref={cameraRef}
        style={styles.cameraView}
        facing={facing}
        animateShutter={false}
        enableTorch={false}
        onCameraReady={() => {
          setIsReady(true);
          setSafetyCameraReady(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  offscreenContainer: {
    position: 'absolute',
    left: -200,
    top: -200,
    width: 2,
    height: 2,
    opacity: 0.01,
    overflow: 'hidden',
    zIndex: -999
  },
  cameraView: {
    width: 2,
    height: 2
  }
});
