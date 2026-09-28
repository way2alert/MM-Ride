import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyARytPykSuG_KHxlhJWkVue-C2YOipg_Y0",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mm-ride-6899f.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mm-ride-6899f",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mm-ride-6899f.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1028952364672",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1028952364672:web:af6b6e2fdeb53d71803865",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-D9TYTRL7YF"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
