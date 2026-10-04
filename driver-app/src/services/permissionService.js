import { Platform, Linking, NativeModules } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openOverlaySettings } from './overlayService';

const OVERLAY_STORAGE_KEY = '@permission_overlay_granted';
const BATTERY_STORAGE_KEY = '@permission_battery_granted';

/**
 * Checks the status of all mandatory permissions required for MM Ride operations.
 */
export async function checkAllPermissions() {
  if (Platform.OS !== 'android') {
    return {
      allGranted: true,
      locationForeground: true,
      locationBackground: true,
      locationAllTheTime: true,
      camera: true,
      overlay: true,
      battery: true,
      missingCount: 0
    };
  }

  let locationForeground = false;
  let locationBackground = false;
  let camera = false;
  let overlay = false;
  let battery = false;

  // 1. Foreground Location
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    locationForeground = fg.status === 'granted' || fg.granted === true;
  } catch (e) {
    console.warn('Check foreground location error:', e);
  }

  // 2. Background Location ("Allow all the time")
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    locationBackground = bg.status === 'granted' || bg.granted === true;
  } catch (e) {
    console.warn('Check background location error:', e);
  }

  // 3. Camera
  try {
    const cam = await ImagePicker.getCameraPermissionsAsync();
    camera = cam.status === 'granted' || cam.granted === true;
  } catch (e) {
    console.warn('Check camera error:', e);
  }

  // 4. Overlay ("Display over other apps")
  try {
    if (NativeModules.MMRidePermissionModule?.canDrawOverlays) {
      overlay = await NativeModules.MMRidePermissionModule.canDrawOverlays();
    } else {
      const stored = await AsyncStorage.getItem(OVERLAY_STORAGE_KEY);
      overlay = stored === 'true';
    }
  } catch (e) {
    console.warn('Check overlay error:', e);
  }

  // 5. Battery Optimization Exemption
  try {
    if (NativeModules.MMRidePermissionModule?.isIgnoringBatteryOptimizations) {
      battery = await NativeModules.MMRidePermissionModule.isIgnoringBatteryOptimizations();
    } else {
      const stored = await AsyncStorage.getItem(BATTERY_STORAGE_KEY);
      battery = stored === 'true';
    }
  } catch (e) {
    console.warn('Check battery error:', e);
  }

  const locationAllTheTime = locationForeground && locationBackground;

  // Calculate missing
  const checks = [locationAllTheTime, camera, overlay, battery];
  const missingCount = checks.filter(c => !c).length;
  const allGranted = missingCount === 0;

  return {
    allGranted,
    locationForeground,
    locationBackground,
    locationAllTheTime,
    camera,
    overlay,
    battery,
    missingCount
  };
}

/**
 * Requests Foreground and Background ("Allow all the time") location
 */
export async function requestLocationPermissions() {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      Linking.openSettings();
      return false;
    }

    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        Linking.openSettings();
        return false;
      }
      return true;
    } catch (e) {
      Linking.openSettings();
      return false;
    }
  } catch (e) {
    console.warn('Request location permissions error:', e);
    Linking.openSettings();
    return false;
  }
}

/**
 * Requests Camera permission
 */
export async function requestCameraPermission() {
  try {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status !== 'granted') {
      Linking.openSettings();
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Request camera error:', e);
    Linking.openSettings();
    return false;
  }
}

/**
 * Directs driver to Display Over Other Apps settings
 */
export async function requestOverlayPermission() {
  try {
    await AsyncStorage.setItem(OVERLAY_STORAGE_KEY, 'true');
    await openOverlaySettings();
  } catch (e) {
    console.warn('Request overlay error:', e);
    Linking.openSettings();
  }
}

/**
 * Directs driver to Battery Optimization settings (unrestricted background)
 */
export async function requestBatteryOptimization() {
  try {
    await AsyncStorage.setItem(BATTERY_STORAGE_KEY, 'true');
    const pkg = 'com.mmride.driver';
    try {
      await Linking.sendIntent('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', [
        { key: 'data', value: `package:${pkg}` }
      ]);
      return;
    } catch (_) {}

    try {
      await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
      return;
    } catch (_) {}

    await Linking.openSettings();
  } catch (e) {
    console.warn('Request battery error:', e);
    Linking.openSettings();
  }
}
