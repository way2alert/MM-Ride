const admin = require("firebase-admin");
const { getDistanceInMeters } = require("./geofence");
const { logAuditEvent } = require("./audit");

const DEFAULT_SPEED_THRESHOLD_KMH = 60;
const IDLE_TIME_MINUTES = 30;

/**
 * Validates incoming GPS telemetry for tampering, overspeeding, and jumps.
 */
async function processGpsTelemetry(gpsEvent) {
  const db = admin.firestore();
  const {
    driverId,
    dutyId,
    latitude,
    longitude,
    speed = 0, // km/h
    isMock = false,
    timestamp,
    deviceId
  } = gpsEvent;

  // Retrieve configurable speed limit from system settings (default to 60 if not configured)
  let speedThreshold = DEFAULT_SPEED_THRESHOLD_KMH;
  try {
    const settingsDoc = await db.collection("settings").doc("system").get();
    if (settingsDoc.exists && settingsDoc.data().speedAlertThresholdKmh) {
      speedThreshold = Number(settingsDoc.data().speedAlertThresholdKmh);
    }
  } catch (err) {
    // fallback to default
  }

  // 1. Mock location detection
  if (isMock) {
    await db.collection("securityAlerts").add({
      type: "MOCK_LOCATION_DETECTED",
      driverId,
      dutyId,
      latitude,
      longitude,
      deviceId,
      severity: "CRITICAL",
      message: "Mock location or fake GPS app detected on driver device.",
      timestamp: new Date().toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await logAuditEvent({
      driverId,
      deviceId,
      action: "SECURITY_ALERT_MOCK_GPS",
      gps: { latitude, longitude },
      relevantRecordId: dutyId,
      notes: "Device flagged for using mock/simulated GPS provider."
    });
  }

  // 2. Overspeeding detection based on dynamic configurable limit
  if (speed > speedThreshold) {
    const speedRef = db.collection("speedEvents").doc();
    await speedRef.set({
      id: speedRef.id,
      driverId,
      dutyId,
      speedKmh: speed,
      thresholdKmh: speedThreshold,
      latitude,
      longitude,
      deviceId,
      timestamp: timestamp || new Date().toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Notify driver in notifications collection
    await db.collection("notifications").add({
      userId: driverId,
      type: "OVERSPEED_WARNING",
      title: "Speed Warning",
      message: `You exceeded the configured speed limit (${speed} km/h > ${speedThreshold} km/h). Please ride safely.`,
      timestamp: new Date().toISOString(),
      read: false
    });
  }

  // 3. Jump detection against last known location
  const lastEventQuery = await db.collection("gpsEvents")
    .where("dutyId", "==", dutyId)
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();

  if (!lastEventQuery.empty) {
    const prev = lastEventQuery.docs[0].data();
    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(timestamp || Date.now()).getTime();
    const elapsedSeconds = Math.max(1, (currTime - prevTime) / 1000);

    const distMeters = getDistanceInMeters(
      prev.latitude,
      prev.longitude,
      latitude,
      longitude
    );

    // Calculated speed from displacement
    const calculatedSpeedKmh = (distMeters / elapsedSeconds) * 3.6;

    if (calculatedSpeedKmh > 120 && elapsedSeconds < 60) {
      // Impossible jump flagged
      await db.collection("securityAlerts").add({
        type: "IMPOSSIBLE_GPS_JUMP",
        driverId,
        dutyId,
        distanceMeters: distMeters,
        elapsedSeconds,
        calculatedKmh: Math.round(calculatedSpeedKmh),
        latitude,
        longitude,
        deviceId,
        severity: "HIGH",
        message: `Unrealistic GPS leap of ${distMeters}m in ${Math.round(elapsedSeconds)}s (~${Math.round(calculatedSpeedKmh)} km/h).`,
        timestamp: new Date().toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 4. Idle detection (if stationary for > 30 minutes during active duty)
    if (distMeters < 30 && elapsedSeconds >= (IDLE_TIME_MINUTES * 60)) {
      const idleRef = db.collection("idleAlerts").doc();
      await idleRef.set({
        id: idleRef.id,
        driverId,
        dutyId,
        latitude,
        longitude,
        idleDurationMinutes: Math.round(elapsedSeconds / 60),
        status: "PENDING_DRIVER_REASON",
        driverReason: null,
        timestamp: new Date().toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Prompt driver for reason
      await db.collection("notifications").add({
        userId: driverId,
        type: "IDLE_ALERT",
        title: "Stationary Alert",
        message: `You have been stationary for over 30 minutes. Please specify your status/reason in the app.`,
        relevantRecordId: idleRef.id,
        timestamp: new Date().toISOString(),
        read: false
      });
    }
  }

  // Update driver's live location heartbeat on driver document for the admin map!
  await db.collection("drivers").doc(driverId).update({
    lastKnownLocation: {
      latitude,
      longitude,
      speed,
      timestamp: timestamp || new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  });

  return { processed: true };
}

module.exports = {
  processGpsTelemetry
};
