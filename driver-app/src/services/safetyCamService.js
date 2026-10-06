/**
 * MM Ride Real-Time Fleet Safety Camera Service
 * 
 * Facilitates on-demand safety inspection snapshots (front/rear camera) and
 * automated accident/crash evidence photo capture during active duty shifts.
 * 
 * Safety & Privacy Design:
 * - Operates strictly during active driver shifts while vehicle is in service.
 * - Captures high-efficiency JPEG frames with telemetry metadata (GPS, speed, active gig app).
 * - Zero microphone/audio recording (enforced at manifest level).
 */

import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';

let registeredCameraRef = null;
let registeredSetFacing = null;
let isCameraReadyFlag = false;
let inspectionListenerUnsub = null;
let isCapturing = false;

/**
 * Register active camera component ref and controls
 */
export function registerSafetyCamera(refInstance, setFacingFn, readyCheckFn) {
  registeredCameraRef = refInstance;
  registeredSetFacing = setFacingFn;
  isCameraReadyFlag = typeof readyCheckFn === 'function' ? readyCheckFn() : true;
}

export function setSafetyCameraReady(ready) {
  isCameraReadyFlag = Boolean(ready);
}

export function unregisterSafetyCamera() {
  registeredCameraRef = null;
  registeredSetFacing = null;
  isCameraReadyFlag = false;
}

/**
 * Capture camera frame and upload to Firebase Storage
 */
export async function captureAndUploadFrame({
  driverId,
  dutyId,
  inspectionId,
  triggerType = 'ADMIN_ON_DEMAND',
  cameraFacing = 'front',
  telemetry = {}
}) {
  if (isCapturing) {
    console.warn('[SafetyCam] Capture already in progress, skipping duplicate.');
    return null;
  }

  if (!registeredCameraRef?.current) {
    console.warn('[SafetyCam] Camera ref not available for capture');
    return null;
  }

  isCapturing = true;

  try {
    // 1. Switch facing if needed
    if (registeredSetFacing) {
      registeredSetFacing(cameraFacing === 'back' ? 'back' : 'front');
      // Small pause to allow camera sensor orientation to switch
      await new Promise(r => setTimeout(r, 450));
    }

    console.log(`[SafetyCam] Taking ${cameraFacing} snapshot for inspection ${inspectionId}...`);

    const photo = await registeredCameraRef.current.takePictureAsync({
      quality: 0.5,
      base64: true,
      skipProcessing: true
    });

    if (!photo || (!photo.base64 && !photo.uri)) {
      throw new Error('Camera failed to return image data');
    }

    // 2. Upload to Firebase Storage
    const fileName = `safety_${driverId || 'fleet'}_${inspectionId || Date.now()}_${cameraFacing}.jpg`;
    const storagePath = `safety_snapshots/${fileName}`;
    const fileRef = ref(storage, storagePath);

    let cleanBase64 = photo.base64;
    if (cleanBase64 && cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }

    if (cleanBase64) {
      await uploadString(fileRef, cleanBase64, 'base64', {
        contentType: 'image/jpeg',
        customMetadata: {
          driverId: driverId || 'unknown',
          dutyId: dutyId || 'unknown',
          triggerType,
          cameraFacing,
          speed: String(telemetry?.speed || 0),
          latitude: String(telemetry?.latitude || ''),
          longitude: String(telemetry?.longitude || ''),
          capturedAt: new Date().toISOString()
        }
      });
    } else {
      throw new Error('No base64 image data captured from camera');
    }

    const downloadUrl = await getDownloadURL(fileRef);
    const capturedTimestamp = new Date().toISOString();

    // 3. Update Firestore inspection record
    if (inspectionId) {
      const inspDocRef = doc(db, 'safetyInspections', inspectionId);
      await setDoc(inspDocRef, {
        id: inspectionId,
        driverId,
        dutyId: dutyId || null,
        photoUrl: downloadUrl,
        triggerType,
        cameraFacing,
        status: 'CAPTURED',
        capturedAt: capturedTimestamp,
        telemetry: {
          speed: telemetry?.speed || 0,
          latitude: telemetry?.latitude || null,
          longitude: telemetry?.longitude || null,
          activeGigApp: telemetry?.activeGigApp || 'IDLE',
          batteryLevel: telemetry?.batteryLevel || null
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // 4. Update driver profile with latest verified safety snapshot
    if (driverId) {
      await updateDoc(doc(db, 'drivers', driverId), {
        pendingSafetyInspection: null,
        lastSafetySnapshot: {
          inspectionId: inspectionId || `AUTO_${Date.now()}`,
          photoUrl: downloadUrl,
          capturedAt: capturedTimestamp,
          triggerType,
          cameraFacing,
          speed: telemetry?.speed || 0
        }
      });
    }

    console.log(`[SafetyCam] Safety snapshot successfully uploaded: ${downloadUrl}`);
    return downloadUrl;
  } catch (err) {
    console.warn('[SafetyCam] Failed to capture/upload safety snapshot:', err.message);

    if (inspectionId) {
      try {
        await updateDoc(doc(db, 'safetyInspections', inspectionId), {
          status: 'FAILED',
          errorMessage: err.message,
          failedAt: new Date().toISOString()
        });
      } catch (e) {}
    }

    if (driverId) {
      try {
        await updateDoc(doc(db, 'drivers', driverId), {
          pendingSafetyInspection: null
        });
      } catch (e) {}
    }

    return null;
  } finally {
    isCapturing = false;
  }
}

/**
 * Start real-time listener on driver document for admin safety inspection triggers
 */
export function startSafetyInspectionListener({ driverId, dutyId, getTelemetry }) {
  if (!driverId) return;
  if (inspectionListenerUnsub) inspectionListenerUnsub();

  const driverDocRef = doc(db, 'drivers', driverId);

  inspectionListenerUnsub = onSnapshot(driverDocRef, async (docSnap) => {
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    const req = data.pendingSafetyInspection;

    if (req && req.status === 'PENDING' && req.inspectionId) {
      console.log('[SafetyCam] Incoming on-demand safety inspection request:', req.inspectionId);

      const curTelemetry = typeof getTelemetry === 'function' ? getTelemetry() : {};

      await captureAndUploadFrame({
        driverId,
        dutyId: dutyId || req.dutyId || null,
        inspectionId: req.inspectionId,
        triggerType: req.triggerType || 'ADMIN_ON_DEMAND',
        cameraFacing: req.cameraFacing || 'front',
        telemetry: {
          ...curTelemetry,
          ...(req.telemetry || {})
        }
      });
    }
  }, (err) => {
    console.warn('[SafetyCam] Listener error:', err.message);
  });

  return () => {
    if (inspectionListenerUnsub) {
      inspectionListenerUnsub();
      inspectionListenerUnsub = null;
    }
  };
}
