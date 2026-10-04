import { Platform } from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

let isInitialized = false;

/**
 * Log app error to Firestore and console
 */
export async function logCrashReport(error, isFatal = false, context = '') {
  try {
    const errorMsg = error?.message || String(error);
    const stack = error?.stack || '';

    // Retrieve active driver session info if available
    let driverId = 'unknown';
    let driverPhone = 'unknown';
    try {
      const stored = await AsyncStorage.getItem('@mmride_driver_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        driverId = parsed?.id || parsed?.driverId || 'unknown';
        driverPhone = parsed?.phone || parsed?.phoneNumber || 'unknown';
      }
    } catch {
      // Ignore storage read errors during crash
    }

    const crashData = {
      errorMessage: errorMsg,
      errorStack: stack,
      isFatal,
      context,
      driverId,
      driverPhone,
      platform: Platform.OS,
      version: Platform.Version,
      createdAt: serverTimestamp(),
      timestampIso: new Date().toISOString()
    };

    console.warn('[CrashService] Logging crash report:', errorMsg);

    // Save to Firestore 'driver_app_crashes' collection
    await addDoc(collection(db, 'driver_app_crashes'), crashData);
  } catch (logErr) {
    console.warn('[CrashService] Failed to persist crash log:', logErr?.message || logErr);
  }
}

/**
 * Initialize global JavaScript error handlers for unhandled crashes
 */
export function initCrashReporting() {
  if (isInitialized) return;
  isInitialized = true;

  // React Native global uncaught exception handler
  if (global.ErrorUtils && typeof global.ErrorUtils.setGlobalHandler === 'function') {
    const defaultHandler = global.ErrorUtils.getGlobalHandler();
    global.ErrorUtils.setGlobalHandler(async (error, isFatal) => {
      await logCrashReport(error, isFatal, 'UncaughtGlobalError');
      if (defaultHandler) {
        defaultHandler(error, isFatal);
      }
    });
  }

  console.log('[CrashService] Real-time Crashlytics & Error Reporting initialized.');
}
