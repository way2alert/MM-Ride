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
