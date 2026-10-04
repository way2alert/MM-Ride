import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from './config';

/**
 * Append-only immutable audit log writer for Admin operations
 */
export async function logAdminAudit({
  action,
  driverId = null,
  relevantRecordId = null,
  previousValue = null,
  newValue = null,
  notes = null
}) {
  try {
    const user = auth.currentUser;
    const actorEmail = user?.email || 'admin@mmride.com';
    const actorId = user?.uid || 'admin_local';

    await addDoc(collection(db, 'auditLogs'), {
      driverId: driverId ?? null,
      action: action || 'UNKNOWN',
      relevantRecordId: relevantRecordId ?? null,
      previousValue: previousValue ?? null,
      newValue: newValue ?? null,
      actor: actorEmail,
      actorId,
      source: 'ADMIN_WEB',
      notes: notes ?? '',
      timestamp: new Date().toISOString(),
      serverTimestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Audit logging failed:', error);
  }
}

/**
 * Real-time listener for collections
 */
export function subscribeToCollection(collectionName, callback, queryConstraints = [], onError = null) {
  const colRef = collection(db, collectionName);
  const q = query(colRef, ...queryConstraints);
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(items);
  }, (error) => {
    console.warn(`Snapshot listener warning for ${collectionName}:`, error.message);
    if (onError) onError(error);
  });
}
