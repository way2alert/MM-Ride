import { Platform } from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

let isInitialized = false;
let isLogging = false;

// In-memory deduplication & rate limiting to prevent runaway document loops
const recentErrors = new Map(); // errorKey -> timestampMs
const ERROR_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes debounce per distinct error
let sessionReportCount = 0;
const MAX_SESSION_REPORTS = 15; // Max 15 crash reports per app session
const windowTimestamps = []; // sliding window for rate-limiting
const MAX_REPORTS_PER_MINUTE = 3;

/**
 * Log app error to Firestore and console with strict rate limiting & deduplication
 */
export async function logCrashReport(error, isFatal = false, context = '') {
  if (isLogging) return; // Prevent re-entrancy / recursive logging loops

  try {
    const errorMsg = error?.message || String(error || 'Unknown Error');
    const stack = error?.stack || '';

    // Ignore benign / non-critical noisy warnings if not fatal
    if (!isFatal) {
      if (
        errorMsg.includes('missing or insufficient permissions') ||
        errorMsg.includes('permission-denied') ||
        errorMsg.includes('Network request failed') ||
        errorMsg.includes('Setting a timer for a long period') ||
        errorMsg.includes('Possible Unhandled Promise Rejection')
      ) {
        console.warn(`[CrashService] Ignored non-fatal repetitive error: ${errorMsg}`);
        return;
      }
    }

    // 1. Session cap check
    if (sessionReportCount >= MAX_SESSION_REPORTS) {
      console.warn('[CrashService] Max session crash reports limit reached, suppressing.');
      return;
    }

    // 2. Sliding window check (max 3 per 60 seconds)
    const now = Date.now();
    while (windowTimestamps.length > 0 && now - windowTimestamps[0] > 60000) {
      windowTimestamps.shift();
    }
    if (windowTimestamps.length >= MAX_REPORTS_PER_MINUTE) {
      console.warn('[CrashService] Rate limit exceeded (>3 per minute), skipping.');
      return;
    }

    // 3. Deduplication check (same error within 5 minutes)
    const dedupeKey = `${context}:${errorMsg.slice(0, 100)}`;
    const lastSeen = recentErrors.get(dedupeKey);
    if (lastSeen && (now - lastSeen) < ERROR_COOLDOWN_MS) {
      console.warn(`[CrashService] Duplicate crash suppressed within cooldown (${Math.round((now - lastSeen)/1000)}s ago):`, errorMsg);
      return;
    }
    recentErrors.set(dedupeKey, now);
    windowTimestamps.push(now);
    sessionReportCount++;

    isLogging = true;

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
      errorMessage: errorMsg.slice(0, 500),
      errorStack: stack.slice(0, 2000),
      isFatal: Boolean(isFatal),
      context: context || 'General',
      driverId,
      driverPhone,
      platform: Platform.OS,
      version: Platform.Version,
      createdAt: serverTimestamp(),
      timestampIso: new Date().toISOString()
    };

    console.warn('[CrashService] Logging crash report to Firestore:', errorMsg);

    // Save to Firestore 'driver_app_crashes' collection
    await addDoc(collection(db, 'driver_app_crashes'), crashData);
  } catch (logErr) {
    console.warn('[CrashService] Failed to persist crash log:', logErr?.message || logErr);
  } finally {
    isLogging = false;
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
      // Only log if it's actually fatal or a true crash
      await logCrashReport(error, Boolean(isFatal), 'UncaughtGlobalError');
      if (defaultHandler) {
        defaultHandler(error, isFatal);
      }
    });
  }

  console.log('[CrashService] Real-time Crashlytics & Error Reporting initialized (with Rate Limiting & Deduplication).');
}
