import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { FloatingBubbleModule } = NativeModules;
let eventEmitter = null;

if (Platform.OS === 'android' && FloatingBubbleModule) {
  eventEmitter = new NativeEventEmitter(FloatingBubbleModule);
}

/**
 * Starts the native floating bubble overlay on top of Ola, Uber, and Rapido.
 */
export async function startFloatingBubble({ totalRides = 0, totalEarnings = 0 } = {}) {
  if (Platform.OS !== 'android' || !FloatingBubbleModule?.startBubble) return false;
  try {
    const res = await FloatingBubbleModule.startBubble({
      totalRides: Number(totalRides) || 0,
      totalEarnings: Number(totalEarnings) || 0.0
    });
    return res;
  } catch (err) {
    console.warn('[FloatingBubble] Failed to start floating bubble:', err?.message || err);
    return false;
  }
}

/**
 * Stops and removes the native floating bubble overlay.
 */
export async function stopFloatingBubble() {
  if (Platform.OS !== 'android' || !FloatingBubbleModule?.stopBubble) return false;
  try {
    const res = await FloatingBubbleModule.stopBubble();
    return res;
  } catch (err) {
    console.warn('[FloatingBubble] Failed to stop floating bubble:', err?.message || err);
    return false;
  }
}

/**
 * Updates the floating bubble with live shift telemetry (ride count and total earnings).
 */
export async function updateBubbleStats({ totalRides = 0, totalEarnings = 0 } = {}) {
  if (Platform.OS !== 'android' || !FloatingBubbleModule?.updateBubbleStats) return false;
  try {
    await FloatingBubbleModule.updateBubbleStats(
      Number(totalRides) || 0,
      Number(totalEarnings) || 0.0
    );
    return true;
  } catch (err) {
    console.warn('[FloatingBubble] Failed to update bubble stats:', err?.message || err);
    return false;
  }
}

/**
 * Subscribes to rides submitted from the floating overlay while over Ola / Uber / Rapido.
 * Callback receives: { platform: 'OLA'|'UBER'|'RAPIDO', fare: number, paymentMethod: 'CASH'|'UPI', timestamp }
 */
export function subscribeToOverlayRides(callback) {
  if (!eventEmitter) return () => {};

  try {
    const subscription = eventEmitter.addListener('onOverlayRideLogged', (event) => {
      console.log('[FloatingBubble] Overlay ride received from native bubble:', event);
      if (typeof callback === 'function') {
        callback(event);
      }
    });

    return () => {
      subscription && subscription.remove();
    };
  } catch (err) {
    console.warn('[FloatingBubble] Error subscribing to overlay events:', err);
    return () => {};
  }
}

/**
 * Brings the MM Ride main activity immediately to the foreground over any active app
 * (e.g. Ola, Uber, Rapido, Google Maps). Allowed via SYSTEM_ALERT_WINDOW / Headwind MDM.
 */
export async function bringAppToFront() {
  if (Platform.OS !== 'android' || !FloatingBubbleModule?.bringAppToFront) return false;
  try {
    const res = await FloatingBubbleModule.bringAppToFront();
    return res;
  } catch (err) {
    console.warn('[FloatingBubble] bringAppToFront error:', err?.message || err);
    return false;
  }
}

/**
 * Displays a high-visibility, urgent alert overlay banner directly over Ola / Uber / Rapido
 * and optionally auto-launches MM Ride full-screen.
 */
export async function showOverlayAlert({
  title = 'URGENT ALERT',
  message = 'Please check MM Ride',
  alertType = 'GENERAL',
  autoOpenApp = true
} = {}) {
  if (Platform.OS !== 'android' || !FloatingBubbleModule?.showOverlayAlert) return false;
  try {
    const res = await FloatingBubbleModule.showOverlayAlert(
      String(title),
      String(message),
      String(alertType),
      Boolean(autoOpenApp)
    );
    return res;
  } catch (err) {
    console.warn('[FloatingBubble] showOverlayAlert error:', err?.message || err);
    return false;
  }
}

/**
 * Dismisses the urgent alert banner from the floating overlay
 */
export async function dismissOverlayAlert() {
  if (Platform.OS !== 'android' || !FloatingBubbleModule?.dismissOverlayAlert) return false;
  try {
    const res = await FloatingBubbleModule.dismissOverlayAlert();
    return res;
  } catch (err) {
    console.warn('[FloatingBubble] dismissOverlayAlert error:', err?.message || err);
    return false;
  }
}

/**
 * Checks if Android Usage Stats permission is granted for automatic app detection.
 */
export async function hasUsageStatsPermission() {
  if (Platform.OS !== 'android' || !FloatingBubbleModule?.hasUsageStatsPermission) return false;
  try {
    return await FloatingBubbleModule.hasUsageStatsPermission();
  } catch {
    return false;
  }
}

/**
 * Opens Android settings so user/admin can grant Usage Access if not already granted via MDM.
 */
export async function requestUsageStatsPermission() {
  if (Platform.OS !== 'android' || !FloatingBubbleModule?.requestUsageStatsPermission) return false;
  try {
    return await FloatingBubbleModule.requestUsageStatsPermission();
  } catch {
    return false;
  }
}
