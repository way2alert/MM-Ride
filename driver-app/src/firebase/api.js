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
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from './config';

/**
 * Fetch complete driver document
 */
export async function getDriverProfile(driverId) {
  const snap = await getDoc(doc(db, 'drivers', driverId));
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  }
  return null;
}

/**
 * Register new driver profile
 */
export async function registerDriverProfile(driverId, data) {
  const driverRef = doc(db, 'drivers', driverId);
  const driverData = {
    ...data,
    verificationStatus: 'PENDING',
    approvalStatus: 'PENDING',
    accountStatus: 'DOCUMENT_UPLOAD_PENDING',
    registeredAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(driverRef, driverData, { merge: true });
  return driverData;
}

/**
 * Convert local file URI (file://...) to native React Native Blob via XMLHttpRequest
 * This prevents "Creating blobs from ArrayBuffer and ArrayBufferView are not supported" crash
 */
export function uriToNativeBlob(uri) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      resolve(xhr.response);
    };
    xhr.onerror = function () {
      reject(new TypeError('Failed to convert file URI to native blob'));
    };
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

/**
 * Upload document to Firebase Storage and create driverDocuments record
 */
export async function uploadDriverDocument({ driverId, type, docNumber, uri, blob, base64, fileName }) {
  const storagePath = `documents/${driverId}/${type}_${Date.now()}_${fileName || 'doc.jpg'}`;
  const fileRef = ref(storage, storagePath);
  
  const metadata = {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=31536000'
  };

  let uploadBlob = blob;
  let closeAfterUpload = false;

  // React Native / Expo: Read local file URI directly to native Blob
  if (!uploadBlob && uri) {
    uploadBlob = await uriToNativeBlob(uri);
    closeAfterUpload = true;
  }

  if (uploadBlob) {
    await uploadBytes(fileRef, uploadBlob, metadata);
    if (closeAfterUpload && typeof uploadBlob.close === 'function') {
      try { uploadBlob.close(); } catch (e) {}
    }
  } else if (base64) {
    // Web only fallback
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    await uploadString(fileRef, cleanBase64, 'base64', metadata);
  } else {
    throw new Error('No image uri or blob provided for upload');
  }

  const downloadUrl = await getDownloadURL(fileRef);

  const docRecord = {
    driverId,
    type,
    documentNumber: docNumber || null,
    fileUrl: downloadUrl,
    storagePath,
    status: 'PENDING',
    uploadedAt: new Date().toISOString(),
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'driverDocuments'), docRecord);
  return { id: docRef.id, ...docRecord };
}

/**
 * Mark all documents submitted and move driver to verification queue
 */
export async function completeDocumentSubmission(driverId) {
  const driverRef = doc(db, 'drivers', driverId);
  await updateDoc(driverRef, {
    accountStatus: 'DOCUMENT_VERIFICATION_PENDING',
    updatedAt: serverTimestamp()
  });
}

/**
 * Submit Address record
 */
export async function submitDriverAddress(driverId, addressData) {
  const addrRef = doc(db, 'addresses', `addr_${driverId}`);
  await setDoc(addrRef, {
    driverId,
    ...addressData,
    isVerified: false,
    verificationStatus: 'PENDING',
    updatedAt: serverTimestamp()
  }, { merge: true });
}

/**
 * Upload bike handover inspection photo (Front, Rear, Left, Right, Meter)
 */
export async function uploadHandoverPhoto({ driverId, bikeId, angle, uri, blob, base64 }) {
  const fileName = `handover_${bikeId || 'bike'}_${angle || 'angle'}_${Date.now()}.jpg`;
  const storagePath = `handover_photos/${fileName}`;
  const fileRef = ref(storage, storagePath);

  const metadata = {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=31536000'
  };

  let uploadBlob = blob;
  let closeAfterUpload = false;

  if (!uploadBlob && uri) {
    uploadBlob = await uriToNativeBlob(uri);
    closeAfterUpload = true;
  }

  if (uploadBlob) {
    await uploadBytes(fileRef, uploadBlob, metadata);
    if (closeAfterUpload && typeof uploadBlob.close === 'function') {
      try { uploadBlob.close(); } catch (e) {}
    }
  } else if (base64) {
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    await uploadString(fileRef, cleanBase64, 'base64', metadata);
  } else {
    throw new Error('No image uri or blob provided for handover photo upload');
  }

  const downloadUrl = await getDownloadURL(fileRef);
  return downloadUrl;
}

/**
 * Upload Live In-Shift Verification Selfie
 */
export async function uploadVerificationSelfie({ driverId, dutyId, uri, blob, base64 }) {
  const fileName = `selfie_${driverId}_${Date.now()}.jpg`;
  const storagePath = `verification_selfies/${fileName}`;
  const fileRef = ref(storage, storagePath);

  const metadata = {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=31536000'
  };

  let uploadBlob = blob;
  let closeAfterUpload = false;

  if (!uploadBlob && uri) {
    uploadBlob = await uriToNativeBlob(uri);
    closeAfterUpload = true;
  }

  if (uploadBlob) {
    await uploadBytes(fileRef, uploadBlob, metadata);
    if (closeAfterUpload && typeof uploadBlob.close === 'function') {
      try { uploadBlob.close(); } catch (e) {}
    }
  } else if (base64) {
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    await uploadString(fileRef, cleanBase64, 'base64', metadata);
  } else {
    throw new Error('No selfie image provided');
  }

  const downloadUrl = await getDownloadURL(fileRef);
  return downloadUrl;
}

/**
 * Complete Identity Challenge and clear pending verification
 */
export async function confirmIdentityChallenge({ driverId, dutyId, photoUrl, gps }) {
  const effectiveDriverId = driverId || auth?.currentUser?.uid;
  if (!effectiveDriverId) throw new Error('Driver ID or authentication session required');

  // 1. Clear pending challenge on driver profile
  await updateDoc(doc(db, 'drivers', effectiveDriverId), {
    pendingVerification: null,
    lastFaceVerifiedAt: new Date().toISOString()
  });

  // 2. Append to verified challenges collection
  await addDoc(collection(db, 'identityChallenges'), {
    driverId: effectiveDriverId,
    dutyId: dutyId || null,
    photoUrl,
    status: 'VERIFIED',
    verifiedAt: new Date().toISOString(),
    gps: gps || null,
    createdAt: serverTimestamp()
  });
}

/**
 * Submit Bike Handover checklist
 */
export async function submitHandoverInspection(handoverPayload) {
  const handoverRef = await addDoc(collection(db, 'bikeHandovers'), {
    ...handoverPayload,
    driverConfirmed: true,
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp()
  });

  // Update driver status to ACTIVE_DRIVER
  await updateDoc(doc(db, 'drivers', handoverPayload.driverId), {
    accountStatus: 'ACTIVE_DRIVER',
    handoverId: handoverRef.id,
    handoverCompletedAt: new Date().toISOString()
  });

  // Update bike status to ACTIVE
  await updateDoc(doc(db, 'bikes', handoverPayload.bikeId), {
    status: 'ACTIVE',
    currentOdometer: Number(handoverPayload.odometer),
    currentFuelCharge: Number(handoverPayload.fuelCharge),
    lastHandoverId: handoverRef.id
  });

  return handoverRef.id;
}

/**
 * Start Duty Session
 */
export async function requestStartDuty({
  driverId,
  bikeId,
  hubId,
  pickupGps,
  pickupOdometer,
  pickupFuelCharge,
  pickupFuelLitres,
  pickupFuelKg,
  fuelType = 'PETROL',
  bikeCondition = 'GOOD',
  deviceId
}) {
  const isCng = fuelType === 'CNG' || fuelType === 'CNG_PETROL';
  const fuelKgNum = Number(pickupFuelKg || (isCng ? pickupFuelCharge : 0)) || 0;
  const fuelLtrNum = Number(pickupFuelLitres || (!isCng ? pickupFuelCharge : 0)) || 0;

  const dutyRef = await addDoc(collection(db, 'dutySessions'), {
    driverId,
    bikeId,
    hubId: hubId || null,
    status: 'ACTIVE',
    startTime: new Date().toISOString(),
    pickupGps,
    pickupOdometer: Number(pickupOdometer),
    pickupFuelCharge: Number(pickupFuelCharge),
    pickupFuelLitres: fuelLtrNum,
    pickupFuelKg: fuelKgNum,
    fuelType,
    bikeCondition,
    deviceId,
    totalBreaksDurationMinutes: 0,
    liveDistanceKm: 0,
    gpsDistanceKm: 0,
    endTime: null,
    returnGps: null,
    returnOdometer: null,
    totalDistanceKm: null,
    createdAt: serverTimestamp()
  });

  const nowIso = new Date().toISOString();
  const initialLoc = pickupGps && pickupGps.latitude && pickupGps.longitude ? {
    latitude: pickupGps.latitude,
    longitude: pickupGps.longitude,
    speed: 0,
    timestamp: nowIso,
    updatedAt: nowIso
  } : {
    latitude: 28.6115,
    longitude: 77.0817,
    speed: 0,
    timestamp: nowIso,
    updatedAt: nowIso
  };

  await updateDoc(doc(db, 'drivers', driverId), {
    currentDutyId: dutyRef.id,
    isCurrentlyOnDuty: true,
    lastDutyStartedAt: nowIso,
    lastKnownLocation: initialLoc,
    shiftDistanceKm: 0,
    liveDistanceKm: 0
  });

  try {
    await addDoc(collection(db, 'gpsEvents'), {
      driverId,
      dutyId: dutyRef.id,
      latitude: initialLoc.latitude,
      longitude: initialLoc.longitude,
      speed: 0,
      timestamp: nowIso,
      eventType: 'SHIFT_START'
    });
  } catch (e) {
    // silent
  }

  if (bikeId) {
    try {
      await updateDoc(doc(db, 'bikes', bikeId), {
        status: 'ACTIVE',
        currentOdometer: Number(pickupOdometer),
        currentFuelCharge: Number(pickupFuelCharge),
        currentFuelLitres: fuelLtrNum,
        currentFuelKg: fuelKgNum,
        lastDutyId: dutyRef.id
      });
    } catch (bikeErr) {
      console.warn('Bike status update on duty start warning:', bikeErr);
    }
  }

  return dutyRef.id;
}

/**
 * End Duty Session
 */
export async function requestEndDuty({
  dutyId,
  driverId,
  bikeId,
  pickupOdometer,
  returnGps,
  returnOdometer,
  returnFuelCharge,
  returnFuelLitres,
  returnFuelKg,
  fuelType = 'PETROL',
  bikeCondition = 'GOOD',
  damageReported = false,
  damageNotes = '',
  emergencyOverride = false,
  emergencyOverrideReason = '',
  deviceId
}) {
  const endTime = new Date().toISOString();
  const totalDistance = Math.max(0, Number(returnOdometer) - Number(pickupOdometer));
  const isCng = fuelType === 'CNG' || fuelType === 'CNG_PETROL';
  const fuelKgNum = Number(returnFuelKg || (isCng ? returnFuelCharge : 0)) || 0;
  const fuelLtrNum = Number(returnFuelLitres || (!isCng ? returnFuelCharge : 0)) || 0;

  // Compute duration consistently with backend
  let totalMinutes = 0;
  let totalHours = 0;
  try {
    const dutyDocSnap = await getDoc(doc(db, 'dutySessions', dutyId));
    if (dutyDocSnap.exists() && dutyDocSnap.data().startTime) {
      const startEpoch = new Date(dutyDocSnap.data().startTime).getTime();
      const endEpoch = new Date(endTime).getTime();
      totalMinutes = Math.round((endEpoch - startEpoch) / (1000 * 60));
      totalHours = Number((totalMinutes / 60).toFixed(2));
    }
  } catch (e) {
    console.warn('Duty start lookup error:', e);
  }

  const effectiveDriverId = driverId || auth?.currentUser?.uid || null;

  // Calculate cumulative breaks taken during this shift
  let totalBreakMinutes = 0;
  try {
    const qParts = [where('dutyId', '==', dutyId)];
    if (effectiveDriverId) qParts.unshift(where('driverId', '==', effectiveDriverId));
    const breaksSnap = await getDocs(query(collection(db, 'breaks'), ...qParts));
    breaksSnap.forEach(b => {
      totalBreakMinutes += (b.data().durationMinutes || 0);
    });
  } catch (e) {
    // Non-fatal fallback for breaks count
  }

  const netWorkingMinutes = Math.max(0, totalMinutes - totalBreakMinutes);
  const netWorkingHours = Number((netWorkingMinutes / 60).toFixed(2));

  const cleanGps = (returnGps && returnGps.latitude && returnGps.longitude) ? {
    latitude: Number(returnGps.latitude),
    longitude: Number(returnGps.longitude)
  } : null;

  await updateDoc(doc(db, 'dutySessions', dutyId), {
    status: 'COMPLETED',
    endTime,
    totalMinutes: Number(totalMinutes) || 0,
    totalHours: Number(totalHours) || 0,
    totalBreakMinutes: Number(totalBreakMinutes) || 0,
    netWorkingMinutes: Number(netWorkingMinutes) || 0,
    netWorkingHours: Number(netWorkingHours) || 0,
    returnGps: cleanGps,
    returnOdometer: Number(returnOdometer) || Number(pickupOdometer) || 0,
    returnFuelCharge: Number(returnFuelCharge) || 0,
    returnFuelLitres: fuelLtrNum,
    returnFuelKg: fuelKgNum,
    fuelType,
    totalDistanceKm: Number(totalDistance) || 0,
    returnBikeCondition: bikeCondition || 'GOOD',
    damageReported: Boolean(damageReported),
    damageNotes: damageNotes || '',
    emergencyOverride: Boolean(emergencyOverride),
    emergencyOverrideReason: emergencyOverrideReason || '',
    completedAt: serverTimestamp()
  });

  if (effectiveDriverId) {
    try {
      await updateDoc(doc(db, 'drivers', effectiveDriverId), {
        currentDutyId: null,
        isCurrentlyOnDuty: false,
        lastDutyEndedAt: endTime
      });
    } catch (driverErr) {
      console.warn('Driver state update warning:', driverErr);
    }
  }

  // Strict controlled state transition: ACTIVE -> RETURNED or MAINTENANCE
  if (bikeId) {
    try {
      await updateDoc(doc(db, 'bikes', bikeId), {
        status: damageReported ? 'MAINTENANCE' : 'RETURNED',
        currentOdometer: Number(returnOdometer) || Number(pickupOdometer) || 0,
        currentFuelCharge: Number(returnFuelCharge) || 0,
        currentFuelLitres: fuelLtrNum,
        currentFuelKg: fuelKgNum,
        lastDutyId: null
      });
    } catch (bikeErr) {
      console.warn('Bike status transition error (non-fatal):', bikeErr);
    }
  }

  if (damageReported) {
    try {
      await addDoc(collection(db, 'damageReports'), {
        dutyId: dutyId || null,
        driverId: effectiveDriverId || null,
        bikeId: bikeId || null,
        condition: bikeCondition || 'FAIR',
        description: damageNotes || 'Damage reported on return',
        status: 'PENDING_INSPECTION',
        timestamp: endTime,
        createdAt: serverTimestamp()
      });
    } catch (dmgErr) {
      console.warn('Damage report logging warning:', dmgErr);
    }
  }
}

/**
 * Record GPS Telemetry Event
 */
export async function logGpsBreadcrumb({
  driverId,
  dutyId,
  latitude,
  longitude,
  speed = 0,
  isMock = false,
  deviceId
}) {
  const timestamp = new Date().toISOString();

  // 1. Immutable breadcrumb log
  await addDoc(collection(db, 'gpsEvents'), {
    driverId,
    dutyId,
    latitude,
    longitude,
    speed: Math.round(speed),
    isMock: !!isMock,
    deviceId: deviceId || null,
    timestamp,
    serverTimestamp: serverTimestamp()
  });

  // 2. Update driver's live location heartbeat for admin map
  await updateDoc(doc(db, 'drivers', driverId), {
    lastKnownLocation: {
      latitude,
      longitude,
      speed: Math.round(speed),
      timestamp,
      updatedAt: new Date().toISOString()
    }
  });
}

/**
 * Start and End Breaks
 */
export async function startDutyBreak({ driverId, dutyId, type = 'PLANNED', location }) {
  const breakRef = await addDoc(collection(db, 'breaks'), {
    driverId,
    dutyId,
    type,
    startTime: new Date().toISOString(),
    startLocation: location || null,
    endTime: null,
    durationMinutes: 0,
    status: 'ACTIVE',
    createdAt: serverTimestamp()
  });

  await updateDoc(doc(db, 'dutySessions', dutyId), {
    status: 'ON_BREAK',
    currentBreakId: breakRef.id
  });

  return breakRef.id;
}

export async function endDutyBreak({ breakId, dutyId, startTime }) {
  const endTime = new Date().toISOString();
  let durationMinutes = 1;
  try {
    let startEpoch = startTime ? new Date(startTime).getTime() : null;
    if (!startEpoch || isNaN(startEpoch)) {
      const breakDocSnap = await getDoc(doc(db, 'breaks', breakId));
      if (breakDocSnap.exists() && breakDocSnap.data().startTime) {
        startEpoch = new Date(breakDocSnap.data().startTime).getTime();
      }
    }
    if (startEpoch && !isNaN(startEpoch)) {
      durationMinutes = Math.max(1, Math.round((new Date(endTime).getTime() - startEpoch) / (1000 * 60)));
    }
  } catch (e) {
    console.warn('Break duration computation fallback:', e);
  }

  await updateDoc(doc(db, 'breaks', breakId), {
    status: 'COMPLETED',
    endTime,
    durationMinutes,
    completedAt: serverTimestamp()
  });

  await updateDoc(doc(db, 'dutySessions', dutyId), {
    status: 'ACTIVE',
    currentBreakId: null
  });
}

/**
 * Submit Daily Earnings from Ola / Uber / Rapido summary
 */
export async function submitDailyRideEarnings({ 
  driverId, 
  date, 
  grossIncome, 
  platformCharges = 0, 
  completedRidesCount = 0,
  cancelledRidesCount = 0,
  cashRidesCollected = 0,
  olaDetails = null,
  uberDetails = null,
  rapidoDetails = null,
  blob, 
  uri, 
  fileName,
  upiPaymentRef = null,
  upiPaymentStatus = 'UNPAID',
  upiAmountPaid = 0,
  companyDueAmount = 0,
  driverDueAmount = 0
}) {
  let screenshotUrl = null;
  let uploadBlob = blob;
  let closeAfterUpload = false;
  if (!uploadBlob && uri) {
    uploadBlob = await uriToNativeBlob(uri);
    closeAfterUpload = true;
  }
  if (uploadBlob) {
    const storagePath = `earnings_proofs/${driverId}/${Date.now()}_${fileName || 'proof.jpg'}`;
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, uploadBlob);
    screenshotUrl = await getDownloadURL(fileRef);
    if (closeAfterUpload && typeof uploadBlob.close === 'function') {
      try { uploadBlob.close(); } catch (e) {}
    }
  }

  const subData = {
    driverId,
    date: date || new Date().toISOString().split('T')[0],
    grossIncome: Number(grossIncome) || 0,
    platformCharges: Number(platformCharges || 0),
    completedRidesCount: Number(completedRidesCount || 0),
    cancelledRidesCount: Number(cancelledRidesCount || 0),
    cashRidesCollected: Number(cashRidesCollected || 0),
    screenshotUrl,
    status: 'PENDING',
    upiPaymentRef: upiPaymentRef || null,
    upiPaymentStatus: upiPaymentStatus || 'UNPAID',
    upiAmountPaid: Number(upiAmountPaid) || 0,
    companyDueAmount: Number(companyDueAmount) || 0,
    driverDueAmount: Number(driverDueAmount) || 0,
    submittedAt: new Date().toISOString(),
    createdAt: serverTimestamp()
  };

  if (olaDetails) subData.olaDetails = olaDetails;
  if (uberDetails) subData.uberDetails = uberDetails;
  if (rapidoDetails) subData.rapidoDetails = rapidoDetails;

  const subRef = await addDoc(collection(db, 'dailyEarningsSubmissions'), subData);

  return subRef.id;
}

/**
 * Log individual completed ride entry from floating overlay widget during active shift
 */
export async function logShiftRideEntry({
  driverId,
  dutyId,
  platform = 'OLA',
  paymentMethod = 'CASH', // 'CASH' | 'UPI' | 'SPLIT'
  fare,
  cashAmount,
  upiAmount,
  location
}) {
  const fareNum = Number(fare) || 0;
  let finalCash = 0;
  let finalUpi = 0;

  if (paymentMethod === 'SPLIT') {
    finalCash = Math.max(0, Number(cashAmount) || 0);
    finalUpi = Math.max(0, Number(upiAmount) || 0);
  } else if (paymentMethod === 'CASH') {
    finalCash = fareNum;
    finalUpi = 0;
  } else {
    finalCash = 0;
    finalUpi = fareNum;
  }

  const effectiveTotal = (finalCash + finalUpi) > 0 ? (finalCash + finalUpi) : fareNum;

  const entryRef = await addDoc(collection(db, 'shiftRideEntries'), {
    driverId,
    dutyId: dutyId || null,
    platform: platform.toUpperCase(),
    paymentMethod,
    fare: effectiveTotal,
    cashAmount: finalCash,
    upiAmount: finalUpi,
    location: location || null,
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp()
  });

  // Optionally increment running duty session telemetry counters
  if (dutyId) {
    try {
      const dutyRef = doc(db, 'dutySessions', dutyId);
      const updates = {
        totalRidesLogged: increment(1),
        grossEarningsLogged: increment(effectiveTotal),
        lastRideLoggedAt: new Date().toISOString()
      };
      if (finalCash > 0) {
        updates.cashEarningsLogged = increment(finalCash);
      }
      if (finalUpi > 0) {
        updates.upiEarningsLogged = increment(finalUpi);
      }
      await updateDoc(dutyRef, updates);
    } catch (e) {
      console.warn('Duty counter increment non-fatal warning:', e);
    }
  }

  return entryRef.id;
}

/**
 * Get all ride entries for a shift or driver to auto-fill daily hisaab
 */
export async function getShiftRideEntries({ driverId, dutyId }) {
  if (!driverId) return [];
  try {
    const qParts = [where('driverId', '==', driverId)];
    if (dutyId) {
      qParts.push(where('dutyId', '==', dutyId));
    }
    const snap = await getDocs(query(collection(db, 'shiftRideEntries'), ...qParts));
    const entries = [];
    snap.forEach(d => {
      entries.push({ id: d.id, ...d.data() });
    });
    return entries;
  } catch (err) {
    console.warn('Error fetching shift ride entries:', err);
    return [];
  }
}

/**
 * Submit Leave Request
 */
export async function submitDriverLeave({ driverId, startDate, endDate, durationDays = 1, reason }) {
  const effectiveDriverId = driverId || auth?.currentUser?.uid;
  const leaveRef = await addDoc(collection(db, 'leaveRequests'), {
    driverId: effectiveDriverId,
    startDate,
    endDate: endDate || startDate,
    durationDays: Number(durationDays),
    reason,
    status: 'PENDING',
    createdAt: serverTimestamp()
  });
  return leaveRef.id;
}

/**
 * Report Emergency SOS / Incident
 */
export async function submitEmergencyIncident({ driverId, bikeId, type, description, gps, photoBlob, photoUri }) {
  const effectiveDriverId = driverId || auth?.currentUser?.uid;
  let photoUrl = null;
  let uploadBlob = photoBlob;
  let closeAfterUpload = false;
  if (!uploadBlob && photoUri) {
    uploadBlob = await uriToNativeBlob(photoUri);
    closeAfterUpload = true;
  }
  if (uploadBlob) {
    const storagePath = `incident_photos/${effectiveDriverId || 'unknown'}/${Date.now()}_incident.jpg`;
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, uploadBlob);
    photoUrl = await getDownloadURL(fileRef);
    if (closeAfterUpload && typeof uploadBlob.close === 'function') {
      try { uploadBlob.close(); } catch (e) {}
    }
  }

  const incRef = await addDoc(collection(db, 'incidents'), {
    driverId: effectiveDriverId,
    bikeId: bikeId || null,
    type: type || 'EMERGENCY_SOS',
    description: description || 'Driver triggered emergency button.',
    gps: gps || null,
    photoUrl,
    status: 'OPEN',
    timestamp: new Date().toISOString(),
    createdAt: serverTimestamp()
  });

  return incRef.id;
}

/**
 * Auto-assign an available vehicle to approved driver
 */
export async function autoAssignAvailableBike(driverId, driverName) {
  try {
    // 0. STRICT SECURITY CHECK: Driver MUST be verified & approved by Fleet Admin
    const driverSnap = await getDoc(doc(db, 'drivers', driverId));
    if (!driverSnap.exists()) {
      return { success: false, reason: 'DRIVER_NOT_FOUND' };
    }
    const dData = driverSnap.data();

    // Must be approved
    if (dData.approvalStatus !== 'APPROVED') {
      console.warn(`[AutoAssign Blocked] Driver ${driverId} approvalStatus is ${dData.approvalStatus}, not APPROVED.`);
      return { success: false, reason: 'DRIVER_NOT_APPROVED' };
    }

    // Must have submitted documents
    const docsQuery = query(collection(db, 'driverDocuments'), where('driverId', '==', driverId));
    const docsSnap = await getDocs(docsQuery);
    if (docsSnap.empty) {
      console.warn(`[AutoAssign Blocked] Driver ${driverId} has 0 uploaded documents.`);
      return { success: false, reason: 'NO_DOCUMENTS_SUBMITTED' };
    }

    const hasUnverifiedDocs = docsSnap.docs.some(docItem => docItem.data().status !== 'VERIFIED');
    if (hasUnverifiedDocs) {
      console.warn(`[AutoAssign Blocked] Driver ${driverId} has unverified KYC documents.`);
      return { success: false, reason: 'DOCUMENTS_PENDING_VERIFICATION' };
    }

    const bikesRef = collection(db, 'bikes');
    const q = query(bikesRef, where('status', '==', 'AVAILABLE'), limit(1));
    const snap = await getDocs(q);

    if (snap.empty) {
      return { success: false, reason: 'NO_BIKES_AVAILABLE' };
    }

    const bikeDoc = snap.docs[0];
    const bikeData = { id: bikeDoc.id, ...bikeDoc.data() };

    let hubData = null;
    if (bikeData.hubId) {
      try {
        const hubSnap = await getDoc(doc(db, 'hubs', bikeData.hubId));
        if (hubSnap.exists()) {
          hubData = { id: hubSnap.id, ...hubSnap.data() };
        }
      } catch (e) {
        console.warn('Could not fetch hub details:', e);
      }
    }

    const effectivePickupAddress = bikeData.pickupAddress || hubData?.address || 'Sitapuri Hub Depot, New Delhi';
    const effectiveLat = bikeData.pickupLatitude || hubData?.latitude || 28.611529;
    const effectiveLng = bikeData.pickupLongitude || hubData?.longitude || 77.081742;
    const effectiveProviderName = bikeData.providerName || hubData?.name || 'Sitapuri Fleet Hub';
    const effectiveProviderPhone = bikeData.providerPhone || hubData?.managerContact || '+91 9876543210';

    // 1. Assign bike to driver
    await updateDoc(doc(db, 'bikes', bikeDoc.id), {
      status: 'ASSIGNED',
      assignedDriverId: driverId,
      assignedDriverName: driverName || 'Driver',
      assignedAt: new Date().toISOString()
    });

    // 2. Update driver profile with pickup location and host details
    await updateDoc(doc(db, 'drivers', driverId), {
      assignedBikeId: bikeDoc.id,
      assignedBikeRegistration: bikeData.registrationNumber,
      accountStatus: 'BIKE_ASSIGNED',
      assignedHubId: bikeData.hubId || null,
      pickupAddress: effectivePickupAddress,
      pickupLatitude: effectiveLat,
      pickupLongitude: effectiveLng,
      providerName: effectiveProviderName,
      providerPhone: effectiveProviderPhone,
      assignedAt: new Date().toISOString()
    });

    // 3. Record assignment event
    try {
      await addDoc(collection(db, 'bikeAssignments'), {
        bikeId: bikeDoc.id,
        driverId,
        driverName: driverName || 'Driver',
        hubId: bikeData.hubId || null,
        pickupAddress: effectivePickupAddress,
        assignedAt: new Date().toISOString(),
        type: 'AUTO_ALLOCATED'
      });
    } catch (e) {
      console.warn('Could not write bike assignment audit:', e);
    }

    return {
      success: true,
      bike: {
        ...bikeData,
        pickupAddress: effectivePickupAddress,
        pickupLatitude: effectiveLat,
        pickupLongitude: effectiveLng,
        providerName: effectiveProviderName,
        providerPhone: effectiveProviderPhone
      },
      hub: hubData || {
        id: bikeData.hubId || 'hub_sitapuri',
        name: effectiveProviderName,
        address: effectivePickupAddress,
        latitude: effectiveLat,
        longitude: effectiveLng,
        managerContact: effectiveProviderPhone
      }
    };
  } catch (err) {
    console.error('autoAssignAvailableBike error:', err);
    throw err;
  }
}

/**
 * Fetch hub details by hubId with guaranteed fallback to real Firestore hubs
 */
export async function getHubDetails(hubId) {
  try {
    if (hubId) {
      const snap = await getDoc(doc(db, 'hubs', hubId));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() };
      }
    }
    // Fetch first available real hub in collection
    const hubsRef = collection(db, 'hubs');
    const q = query(hubsRef, limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const firstDoc = snap.docs[0];
      return { id: firstDoc.id, ...firstDoc.data() };
    }
  } catch (e) {
    console.warn('getHubDetails error:', e);
  }
  return {
    id: 'hub_sitapuri',
    name: 'Sitapuri Operations Hub',
    address: 'Gali Number 3, Sitapuri, New Delhi 110059',
    latitude: 28.611529,
    longitude: 77.081742,
    managerContact: '+91 9876543210',
    radiusMeters: 400
  };
}

/**
 * Submit Tamper-Proof Fuel Fill Entry with live dispenser & odometer photos
 */
export async function submitFuelFillEntry({
  driverId,
  bikeId,
  dutyId,
  amount,
  litres,
  kg,
  quantity,
  fuelType = 'PETROL',
  unit,
  odometer,
  dispenserPhotoUri,
  meterPhotoUri,
  receiptPhotoUri,
  gps
}) {
  const effectiveDriverId = driverId || auth?.currentUser?.uid;
  let dispenserPhotoUrl = null;
  let meterPhotoUrl = null;
  let receiptPhotoUrl = null;

  if (dispenserPhotoUri) {
    try {
      const fileRef = ref(storage, `fuel_proofs/${effectiveDriverId || 'unknown'}/${Date.now()}_dispenser.jpg`);
      const blob = await uriToNativeBlob(dispenserPhotoUri);
      await uploadBytes(fileRef, blob);
      dispenserPhotoUrl = await getDownloadURL(fileRef);
    } catch (e) {
      console.warn('Dispenser upload error:', e);
    }
  }

  if (meterPhotoUri) {
    try {
      const fileRef = ref(storage, `fuel_proofs/${effectiveDriverId || 'unknown'}/${Date.now()}_meter.jpg`);
      const blob = await uriToNativeBlob(meterPhotoUri);
      await uploadBytes(fileRef, blob);
      meterPhotoUrl = await getDownloadURL(fileRef);
    } catch (e) {
      console.warn('Meter upload error:', e);
    }
  }

  if (receiptPhotoUri) {
    try {
      const fileRef = ref(storage, `fuel_proofs/${effectiveDriverId || 'unknown'}/${Date.now()}_receipt.jpg`);
      const blob = await uriToNativeBlob(receiptPhotoUri);
      await uploadBytes(fileRef, blob);
      receiptPhotoUrl = await getDownloadURL(fileRef);
    } catch (e) {
      console.warn('Receipt upload error:', e);
    }
  }

  const finalFuelType = fuelType || (kg ? 'CNG' : 'PETROL');
  const isCng = finalFuelType === 'CNG' || finalFuelType === 'CNG_PETROL';
  const finalUnit = unit || (isCng ? 'KG' : 'LITRES');
  const qtyVal = Number(quantity || (isCng ? (kg || litres) : (litres || kg))) || 0;

  const fuelDoc = await addDoc(collection(db, 'fuelExpenses'), {
    driverId: effectiveDriverId,
    bikeId: bikeId || null,
    dutyId: dutyId || null,
    amount: Number(amount),
    fuelType: finalFuelType,
    unit: finalUnit,
    quantity: qtyVal,
    litres: !isCng ? qtyVal : (litres ? Number(litres) : null),
    kg: isCng ? qtyVal : (kg ? Number(kg) : null),
    odometerAtFill: Number(odometer),
    dispenserPhotoUrl,
    meterPhotoUrl,
    receiptPhotoUrl,
    pumpGps: gps || null,
    paymentSource: 'REIMBURSED_TO_DRIVER',
    status: 'PENDING_APPROVAL',
    date: new Date().toISOString().split('T')[0],
    createdAt: serverTimestamp()
  });

  return fuelDoc.id;
}

/**
 * Bind hardware device to driver partner and record in devices & driverDevices
 */
export async function bindDriverDevice(driverId, deviceInfo) {
  try {
    const devId = deviceInfo.deviceId || 'device_default';
    const effectiveDriverId = driverId || auth.currentUser?.uid || null;
    
    // 1. Record in driverDevices collection (permitted for driver partner with driverId match)
    const devRef = doc(db, 'driverDevices', devId);
    await setDoc(devRef, {
      id: devId,
      deviceId: devId,
      driverId: effectiveDriverId,
      assignedDriverId: effectiveDriverId,
      ...deviceInfo,
      lastSeen: new Date().toISOString(),
      lastSync: new Date().toISOString(),
      updatedAt: serverTimestamp()
    }, { merge: true }).catch(err => console.warn('driverDevices sync warning:', err.message));

    // 2. Mirror record in devices collection if allowed (fails gracefully if restricted)
    try {
      const deviceRef = doc(db, 'devices', devId);
      const exSnap = await getDoc(deviceRef).catch(() => null);
      const curData = (exSnap && exSnap.exists()) ? exSnap.data() : null;
      const isRestricted = curData?.status === 'SUSPENDED' || curData?.status === 'LOST';

      const mirrorPayload = {
        id: devId,
        deviceId: devId,
        driverId: effectiveDriverId,
        assignedDriverId: effectiveDriverId,
        enrollmentStatus: 'ENROLLED',
        policyStatus: isRestricted ? 'RESTRICTED' : (curData?.policyStatus || 'COMPLIANT'),
        isOnline: true,
        lastSync: new Date().toISOString(),
        kioskExitPin: '998877',
        ...deviceInfo,
        updatedAt: serverTimestamp()
      };

      if (!isRestricted) {
        mirrorPayload.status = curData?.status || 'ACTIVE';
      }

      await setDoc(deviceRef, mirrorPayload, { merge: true });
    } catch (e) {
      // Allowed to ignore devices collection write restriction on cloud rules
    }

    // 3. Update driver record if available
    if (effectiveDriverId) {
      await updateDoc(doc(db, 'drivers', effectiveDriverId), {
        boundDeviceId: devId,
        boundDeviceModel: deviceInfo.model || deviceInfo.deviceName || 'Android Device',
        lastDeviceSync: new Date().toISOString()
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('bindDriverDevice error:', err.message);
  }
}
