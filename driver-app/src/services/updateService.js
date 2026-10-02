import * as Updates from 'expo-updates';
import { AppState } from 'react-native';

let appStateSubscription = null;
let isCheckingUpdate = false;

/**
 * Silently check for Over-The-Air (OTA) updates in the background.
 * If a new update is found, it will be downloaded quietly.
 * The next time the driver launches the app, the latest version will load automatically.
 */
export async function checkAndDownloadUpdate(silent = true) {
  if (__DEV__ || !Updates.isEnabled) {
    if (!silent) console.log('[OTA Updates] Updates disabled in development mode.');
    return { status: 'disabled' };
  }

  if (isCheckingUpdate) return { status: 'in-progress' };
  isCheckingUpdate = true;

  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      console.log('[OTA Updates] New silent update detected. Downloading in background...');
      const fetchResult = await Updates.fetchUpdateAsync();
      console.log('[OTA Updates] Update downloaded successfully. Will apply automatically on next restart.');
      return { status: 'downloaded', isNew: true };
    } else {
      if (!silent) console.log('[OTA Updates] App is already on the latest version.');
      return { status: 'up-to-date', isNew: false };
    }
  } catch (error) {
    console.warn('[OTA Updates] Check failed:', error?.message || error);
    return { status: 'error', error };
  } finally {
    isCheckingUpdate = false;
  }
}

/**
 * Initializes automatic background OTA update listeners.
 * Runs on startup and whenever the app returns to the foreground.
 */
export function initBackgroundUpdates() {
  if (__DEV__ || !Updates.isEnabled) {
    return () => {};
  }

  // Initial check on app startup (delayed slightly to prioritize initial UI render)
  const timer = setTimeout(() => {
    checkAndDownloadUpdate(true);
  }, 5000);

  // Periodic check when app comes to foreground
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkAndDownloadUpdate(true);
      }
    });
  }

  return () => {
    clearTimeout(timer);
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
  };
}
