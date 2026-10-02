import AsyncStorage from '@react-native-async-storage/async-storage';
import { logShiftRideEntry } from '../firebase/api';

const OFFLINE_RIDE_QUEUE_KEY = 'MM_OFFLINE_RIDE_QUEUE';

/**
 * Saves a ride entry locally when network is unavailable
 */
export async function queueOfflineRide(rideData) {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_RIDE_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    
    const queuedItem = {
      ...rideData,
      localQueueId: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      queuedAt: new Date().toISOString()
    };

    queue.push(queuedItem);
    await AsyncStorage.setItem(OFFLINE_RIDE_QUEUE_KEY, JSON.stringify(queue));
    console.log('[OfflineQueue] Queued ride locally. Total in queue:', queue.length);
    return queuedItem;
  } catch (err) {
    console.error('[OfflineQueue] Error queueing ride locally:', err);
    throw err;
  }
}

/**
 * Returns all currently queued offline rides
 */
export async function getOfflineRideQueue() {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_RIDE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[OfflineQueue] Error reading queue:', e);
    return [];
  }
}

/**
 * Attempts to upload all locally queued rides to Firestore
 */
export async function syncOfflineRides(driverId) {
  try {
    const queue = await getOfflineRideQueue();
    if (!queue || queue.length === 0) return { syncedCount: 0, remainingCount: 0 };

    console.log(`[OfflineQueue] Attempting to sync ${queue.length} offline rides...`);
    const remaining = [];
    let synced = 0;

    for (const item of queue) {
      try {
        await logShiftRideEntry({
          driverId: item.driverId || driverId,
          dutyId: item.dutyId || null,
          platform: item.platform,
          paymentMethod: item.paymentMethod,
          fare: item.fare,
          cashAmount: item.cashAmount,
          upiAmount: item.upiAmount,
          location: item.location || null
        });
        synced++;
      } catch (err) {
        console.warn(`[OfflineQueue] Failed to sync ride ${item.localQueueId}, keeping in queue:`, err.message);
        remaining.push(item);
      }
    }

    await AsyncStorage.setItem(OFFLINE_RIDE_QUEUE_KEY, JSON.stringify(remaining));
    console.log(`[OfflineQueue] Synced ${synced} rides. Remaining offline: ${remaining.length}`);
    return { syncedCount: synced, remainingCount: remaining.length };
  } catch (err) {
    console.error('[OfflineQueue] Sync execution failed:', err);
    return { syncedCount: 0, remainingCount: 0 };
  }
}
