import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyARytPykSuG_KHxlhJWkVue-C2YOipg_Y0",
  authDomain: "mm-ride-6899f.firebaseapp.com",
  projectId: "mm-ride-6899f",
  storageBucket: "mm-ride-6899f.firebasestorage.app",
  messagingSenderId: "1028952364672",
  appId: "1:1028952364672:web:af6b6e2fdeb53d71803865",
  measurementId: "G-D9TYTRL7YF"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let auth;
try {
  if (typeof getReactNativePersistence === 'function') {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } else {
    auth = initializeAuth(app);
  }
} catch (e) {
  auth = getAuth(app);
}

export { auth, firebaseConfig };
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
