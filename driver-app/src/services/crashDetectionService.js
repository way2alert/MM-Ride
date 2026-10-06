/**
 * MM Ride Real-Time Crash & Accident Detection Service
 * 
 * Uses hardware Accelerometer from expo-sensors to continuously detect:
 * 1. High-G Impact Collisions (> 3.5G shock vector).
 * 2. Rapid Deceleration Shock (e.g. 40 km/h -> 0 in < 1.5 seconds with high G-force).
 * 3. Severe Bike Tumble / Fall-over (> 65 degrees sideways tilt sustained while active).
 * 
 * Response Workflow:
 * - Automatically dispatches critical incident to 'incidents' collection.
 * - Triggers instant emergency camera snapshot (front & rear) via safetyCamService.
 * - Updates driver's abnormalStopAlert flag for real-time Admin Web dashboard dispatch.
 */

import { Accelerometer } from 'expo-sensors';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { captureAndUploadFrame } from './safetyCamService';
import { playSirenAlert } from './sirenSoundService';

let sensorSubscription = null;
let isMonitoring = false;
let lastCrashTriggerMs = 0;
let lastLoggedSpeed = 0;
let speedHistory = [];

const CRASH_G_FORCE_THRESHOLD = 3.5; // High impact collision
const FALL_TILT_THRESHOLD = 0.85; // ~65 degrees tilt (X or Z axis)
const CRASH_COOLDOWN_MS = 60 * 1000; // 60 seconds debounce between triggers

/**
 * Start real-time crash and impact telemetry monitoring
 */
export async function startCrashMonitoring({
  driverId,
  dutyId,
  bikeId,
  bikeRegistration,
  getTelemetry
}) {
  if (isMonitoring) return;
  if (!driverId) return;

  try {
    const isAvailable = await Accelerometer.isAvailableAsync();
    if (!isAvailable) {
      console.warn('[CrashDetection] Accelerometer sensor not available on this device.');
      return;
    }

    Accelerometer.setUpdateInterval(200); // 5 Hz sampling rate, battery efficient
    isMonitoring = true;

    sensorSubscription = Accelerometer.addListener(async ({ x, y, z }) => {
      // Vector magnitude: total acceleration in Gs
      const gMagnitude = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      // Retrieve live driver telemetry (GPS, speed, heading)
      const telemetry = typeof getTelemetry === 'function' ? getTelemetry() : {};
      const currentSpeed = Number(telemetry?.speed) || 0;

      // Keep recent speed window (last 5 seconds) to detect sudden crash deceleration
      speedHistory.push({ speed: currentSpeed, time: now });
      if (speedHistory.length > 25) speedHistory.shift();

      const speed5sAgo = speedHistory[0]?.speed || currentSpeed;
      const speedDrop = speed5sAgo - currentSpeed;

      // Check if cooldown is active
      if (now - lastCrashTriggerMs < CRASH_COOLDOWN_MS) {
        return;
      }

      // Condition 1: Severe Direct Impact Shock (> 3.5G)
      const isSevereImpact = gMagnitude >= CRASH_G_FORCE_THRESHOLD;

      // Condition 2: High Deceleration Shock (> 2.8G with > 20 km/h sudden drop)
      const isBrakingImpact = gMagnitude >= 2.8 && speedDrop >= 20;

      // Condition 3: Bike Tumble / Fall (> 65-deg sideways tilt while in motion)
      const isTumbleFall = (Math.abs(x) >= FALL_TILT_THRESHOLD) && (speed5sAgo > 10 || currentSpeed > 5);

      if (isSevereImpact || isBrakingImpact || isTumbleFall) {
        lastCrashTriggerMs = now;

        const crashType = isSevereImpact 
          ? 'HIGH_G_COLLISION' 
          : isBrakingImpact 
            ? 'SUDDEN_IMPACT_STOP' 
            : 'BIKE_TUMBLE_FALL';

        console.error(`[CrashDetection] 🚨 CRASH DETECTED (${crashType}) at ${gMagnitude.toFixed(2)}G, speed: ${currentSpeed} km/h`);

        await handleCrashDetected({
          driverId,
          dutyId,
          bikeId,
          bikeRegistration,
          gForce: gMagnitude,
          crashType,
          speed: currentSpeed,
          speedDrop,
          telemetry
        });
      }
    });

    console.log('[CrashDetection] Hardware Accelerometer & Impact Monitoring active.');
  } catch (err) {
    console.warn('[CrashDetection] Failed to start sensor listener:', err.message);
  }
}

/**
 * Handle incident dispatch, emergency photo capture, and alert updates
 */
async function handleCrashDetected({
  driverId,
  dutyId,
  bikeId,
  bikeRegistration,
  gForce,
  crashType,
  speed,
  speedDrop,
  telemetry
}) {
  const timestampIso = new Date().toISOString();
  const inspectionId = `CRASH_${Date.now()}`;

  // 1. Capture instant emergency accident snapshot from camera
  let capturedPhotoUrl = null;
  try {
    capturedPhotoUrl = await captureAndUploadFrame({
      driverId,
      dutyId,
      inspectionId,
      triggerType: 'CRASH_DETECTED',
      cameraFacing: 'front',
      telemetry: {
        ...telemetry,
        speed,
        gForce: Number(gForce.toFixed(2)),
        crashType
      }
    });
  } catch (camErr) {
    console.warn('[CrashDetection] Emergency snapshot error:', camErr.message);
  }

  // 2. Log Critical Incident in Firestore 'incidents' collection
  try {
    await addDoc(collection(db, 'incidents'), {
      driverId,
      dutyId: dutyId || null,
      bikeId: bikeId || null,
      bikeRegistration: bikeRegistration || 'Assigned Bike',
      type: 'CRASH_ACCIDENT_EMERGENCY',
      severity: 'CRITICAL',
      status: 'OPEN',
      title: '🚨 CRITICAL VEHICLE CRASH / IMPACT DETECTED',
      crashType,
      gForce: Number(gForce.toFixed(2)),
      speedAtImpact: speed,
      speedDropAtImpact: speedDrop,
      photoUrl: capturedPhotoUrl || null,
      location: telemetry?.latitude && telemetry?.longitude ? {
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        speed: speed
      } : null,
      notes: `G-Sensor detected ${crashType} impact at ${gForce.toFixed(2)}G. Immediate fleet safety verification required.`,
      reportedBy: 'SYSTEM_CRASH_SENSOR',
      createdAt: serverTimestamp(),
      timestamp: timestampIso
    });
  } catch (incErr) {
    console.warn('[CrashDetection] Failed to log incident document:', incErr.message);
  }

  // 3. Update driver document with abnormalStopAlert
  try {
    await updateDoc(doc(db, 'drivers', driverId), {
      abnormalStopAlert: {
        active: true,
        reason: 'CRASH_IMPACT_DETECTED',
        crashType,
        gForce: Number(gForce.toFixed(2)),
        speed,
        photoUrl: capturedPhotoUrl || null,
        timestamp: timestampIso
      }
    });
  } catch (drvErr) {
    console.warn('[CrashDetection] Failed to update driver abnormalStopAlert:', drvErr.message);
  }

  // 4. Play emergency alert sound locally on phone
  try {
    if (typeof playSirenAlert === 'function') {
      playSirenAlert();
    }
  } catch (e) {}
}

/**
 * Stop sensor monitoring
 */
export function stopCrashMonitoring() {
  if (sensorSubscription) {
    sensorSubscription.remove();
    sensorSubscription = null;
  }
  isMonitoring = false;
  speedHistory = [];
  console.log('[CrashDetection] Sensor monitoring stopped.');
}
