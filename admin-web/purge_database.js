/**
 * MM Ride Authenticated Firestore Purge Utility
 * Run via Admin Web Settings page or CLI
 */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Cleaned up after successful execution.
