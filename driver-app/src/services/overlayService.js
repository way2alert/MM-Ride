import { Platform, Linking, Alert } from 'react-native';
import * as Application from 'expo-application';

export const PARTNER_APPS = [
  {
    id: 'OLA',
    name: 'Ola Driver',
    packageName: 'com.olacabs.oladriver',
    scheme: 'oladriver://',
    icon: '🚕',
    color: '#EAB308',
    sub: 'Ola Partner'
  },
  {
    id: 'UBER',
    name: 'Uber Driver',
    packageName: 'com.ubercab.driver',
    scheme: 'uberdriver://',
    icon: '🚗',
    color: '#06B6D4',
    sub: 'Uber Driver'
  },
  {
    id: 'RAPIDO',
    name: 'Rapido Captain',
    packageName: 'com.rapido.rider',
    scheme: 'rapido://',
    icon: '🛵',
    color: '#F59E0B',
    sub: 'Rapido Captain'
  },
  {
    id: 'MAPS',
    name: 'Google Maps',
    packageName: 'com.google.android.apps.maps',
    scheme: 'geo:0,0?q=',
    icon: '🗺️',
    color: '#10B981',
    sub: 'GPS Navigation'
  }
];

/**
 * Directs Android device to "Display Over Other Apps" (SYSTEM_ALERT_WINDOW) settings
 */
export async function openOverlaySettings() {
  if (Platform.OS !== 'android') return;

  const pkg = Application.applicationId || 'com.mmride.driver';

  try {
    // 1. Android ACTION_MANAGE_OVERLAY_PERMISSION intent with package URI
    const intentUrl = `intent:#Intent;action=android.settings.action.MANAGE_OVERLAY_PERMISSION;package=${pkg};end`;
    const canOpen = await Linking.canOpenURL(intentUrl);
    if (canOpen) {
      await Linking.openURL(intentUrl);
      return;
    }
  } catch (e) {
    console.warn('Overlay intent failed, attempting package direct intent:', e);
  }

  try {
    // 2. Direct package uri fallback
    const directPackageUri = `package:${pkg}`;
    const canOpenDirect = await Linking.canOpenURL(directPackageUri);
    if (canOpenDirect) {
      await Linking.openURL(directPackageUri);
      return;
    }
  } catch (e) {
    console.warn('Direct package intent failed, falling back to openSettings:', e);
  }

  // 3. Universal App Settings fallback
  try {
    await Linking.openSettings();
  } catch (e) {
    console.warn('Could not open device settings:', e);
  }
}

/**
 * Launches partner driver application (Ola, Uber, Rapido, Google Maps)
 */
export async function launchPartnerApp(platformId) {
  const app = PARTNER_APPS.find(a => a.id === platformId);
  if (!app) return;

  try {
    // 1. Try Android explicit package intent
    const intentUrl = `intent:#Intent;package=${app.packageName};end`;
    try {
      await Linking.openURL(intentUrl);
      return;
    } catch (_) {}

    // 2. Try URL scheme
    if (app.scheme) {
      try {
        await Linking.openURL(app.scheme);
        return;
      } catch (_) {}
    }

    // 3. App-specific fallback
    if (app.id === 'MAPS') {
      await Linking.openURL('https://maps.google.com').catch(() => {});
      return;
    }

    // 4. Play Store fallback
    await Linking.openURL(`market://details?id=${app.packageName}`).catch(() => {
      Alert.alert(
        'App Launch',
        `Could not open ${app.name}. Please ensure ${app.name} is installed on this device.`
      );
    });
  } catch (err) {
    Alert.alert('Launch Error', `Unable to open ${app.name}: ${err.message}`);
  }
}
