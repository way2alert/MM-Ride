const admin = require("firebase-admin");
const { isWithinHubGeofence } = require("./geofence");
const { logAuditEvent } = require("./audit");

const MAX_DAILY_DUTY_HOURS = 12;

/**
 * Validates and starts a new duty session.
 */
async function startDutySession({
  driverId,
  bikeId,
  hubId,
  pickupGps,
  pickupOdometer,
  pickupFuelCharge,
  bikeCondition = "GOOD",
  deviceId
}) {
  const db = admin.firestore();

  // 1. Check driver status
  const driverDoc = await db.collection("drivers").doc(driverId).get();
  if (!driverDoc.exists) {
    throw new Error("Driver profile not found.");
  }
  const driverData = driverDoc.data();
  if (driverData.accountStatus !== "ACTIVE_DRIVER") {
    throw new Error(`Cannot start duty. Current status: ${driverData.accountStatus}. Driver must be an ACTIVE_DRIVER.`);
  }

  // 2. Check no other active duty session exists for driver
  const activeDutyQuery = await db.collection("dutySessions")
    .where("driverId", "==", driverId)
    .where("status", "==", "ACTIVE")
    .limit(1)
    .get();

  if (!activeDutyQuery.empty) {
    throw new Error("An active duty session is already ongoing. End the previous session first.");
  }

  // 3. Check cumulative daily duty hours today (must not exceed 12 hours/day)
  const todayStr = new Date().toISOString().split("T")[0];
  const todayPastSessions = await db.collection("dutySessions")
    .where("driverId", "==", driverId)
    .where("status", "==", "COMPLETED")
    .get();

  let todayAccumulatedMinutes = 0;
  todayPastSessions.forEach(snap => {
    const sData = snap.data();
    if (sData.startTime && sData.startTime.startsWith(todayStr)) {
      todayAccumulatedMinutes += (sData.totalMinutes || 0);
    }
  });

  if (todayAccumulatedMinutes >= (MAX_DAILY_DUTY_HOURS * 60)) {
    throw new Error(`Daily maximum duty limit of ${MAX_DAILY_DUTY_HOURS} hours has been reached for today (${Math.round(todayAccumulatedMinutes/60)} hrs completed). You cannot start another shift today.`);
  }

  const remainingDailyAllowedMinutes = (MAX_DAILY_DUTY_HOURS * 60) - todayAccumulatedMinutes;

  // 4. Check hub and geofence
  let hubData = null;
  if (hubId) {
    const hubDoc = await db.collection("hubs").doc(hubId).get();
    if (hubDoc.exists) {
      hubData = hubDoc.data();
    }
  }

  // If hub exists, check proximity
  if (hubData && pickupGps) {
    const geofenceResult = isWithinHubGeofence(pickupGps, hubData, hubData.radiusMeters || 300);
    if (!geofenceResult.within) {
      throw new Error(`Pickup rejected: You are ${geofenceResult.distance}m away from authorized hub (${hubData.name}). Max allowed distance is ${geofenceResult.allowedRadius}m.`);
    }
  }

  // 4. Check bike status
  const bikeDoc = await db.collection("bikes").doc(bikeId).get();
  if (!bikeDoc.exists) {
    throw new Error("Assigned bike not found in registry.");
  }
  const bikeData = bikeDoc.data();
  if (bikeData.assignedDriverId && bikeData.assignedDriverId !== driverId) {
    throw new Error("This bike is currently assigned to another driver.");
  }

  // 5. Create duty session document
  const dutyRef = db.collection("dutySessions").doc();
  const startTime = new Date().toISOString();

  const dutyData = {
    dutyId: dutyRef.id,
    driverId,
    bikeId,
    hubId: hubId || null,
    hubName: hubData ? hubData.name : "Authorized Depot",
    status: "ACTIVE", // ACTIVE, ON_BREAK, COMPLETED
    startTime,
    pickupGps: {
      latitude: pickupGps.latitude,
      longitude: pickupGps.longitude,
      accuracy: pickupGps.accuracy || null
    },
    pickupOdometer: Number(pickupOdometer),
    pickupFuelCharge: Number(pickupFuelCharge),
    bikeCondition,
    deviceId,
    totalBreaksDurationMinutes: 0,
    maxDutyHours: MAX_DAILY_DUTY_HOURS,
    endTime: null,
    returnGps: null,
    returnOdometer: null,
    totalDistanceKm: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await dutyRef.set(dutyData);

  // Update bike and driver records
  await db.collection("bikes").doc(bikeId).update({
    status: "ACTIVE",
    currentOdometer: Number(pickupOdometer),
    currentFuelCharge: Number(pickupFuelCharge),
    lastDutyId: dutyRef.id
  });

  await db.collection("drivers").doc(driverId).update({
    currentDutyId: dutyRef.id,
    isCurrentlyOnDuty: true,
    lastDutyStartedAt: startTime
  });

  // Log immutable audit
  await logAuditEvent({
    driverId,
    deviceId,
    action: "DUTY_STARTED",
    gps: pickupGps,
    relevantRecordId: dutyRef.id,
    actor: driverId,
    source: "DRIVER_APP",
    notes: `Shift started with bike ${bikeData.registrationNumber || bikeId} at odometer ${pickupOdometer}.`
  });

  return dutyData;
}

/**
 * Ends an active duty session with return geofencing and odometer inspection.
 */
async function endDutySession({
  dutyId,
  driverId,
  returnGps,
  returnOdometer,
  returnFuelCharge,
  bikeCondition = "GOOD",
  damageReported = false,
  damageNotes = "",
  keysReturned = true,
  deviceId,
  emergencyOverride = false,
  emergencyOverrideReason = ""
}) {
  const db = admin.firestore();

  const dutyDoc = await db.collection("dutySessions").doc(dutyId).get();
  if (!dutyDoc.exists) {
    throw new Error("Duty session not found.");
  }

  const duty = dutyDoc.data();
  if (duty.driverId !== driverId) {
    throw new Error("Unauthorized: Duty session belongs to another driver.");
  }
  if (duty.status === "COMPLETED") {
    throw new Error("Duty session is already completed.");
  }

  // Check odometer validity (cannot be rolled back)
  if (Number(returnOdometer) < Number(duty.pickupOdometer)) {
    throw new Error(`Invalid return odometer (${returnOdometer} km). It cannot be less than pickup odometer (${duty.pickupOdometer} km).`);
  }

  // Geofence check against hub
  if (!emergencyOverride && duty.hubId && returnGps) {
    const hubDoc = await db.collection("hubs").doc(duty.hubId).get();
    if (hubDoc.exists) {
      const hubData = hubDoc.data();
      const geofenceResult = isWithinHubGeofence(returnGps, hubData, hubData.radiusMeters || 300);
      if (!geofenceResult.within) {
        throw new Error(`Return rejected: You are ${geofenceResult.distance}m away from authorized return depot (${hubData.name}). End duty must happen at the hub or use emergency return override.`);
      }
    }
  }

  const endTime = new Date().toISOString();
  const startEpoch = new Date(duty.startTime).getTime();
  const endEpoch = new Date(endTime).getTime();
  const totalMinutes = Math.round((endEpoch - startEpoch) / (1000 * 60));
  const totalHours = (totalMinutes / 60).toFixed(2);
  const distanceCovered = Number(returnOdometer) - Number(duty.pickupOdometer);

  // Calculate cumulative breaks taken during this shift
  const breaksQuery = await db.collection("breaks")
    .where("dutyId", "==", dutyId)
    .get();

  let totalBreakMinutes = 0;
  breaksQuery.forEach(bSnap => {
    const bData = bSnap.data();
    totalBreakMinutes += (bData.durationMinutes || 0);
  });

  const netWorkingMinutes = Math.max(0, totalMinutes - totalBreakMinutes);
  const netWorkingHours = (netWorkingMinutes / 60).toFixed(2);

  const updatePayload = {
    status: "COMPLETED",
    endTime,
    totalMinutes,
    totalHours: Number(totalHours),
    totalBreakMinutes,
    netWorkingMinutes,
    netWorkingHours: Number(netWorkingHours),
    returnGps: returnGps ? {
      latitude: returnGps.latitude,
      longitude: returnGps.longitude,
      accuracy: returnGps.accuracy || null
    } : null,
    returnOdometer: Number(returnOdometer),
    returnFuelCharge: Number(returnFuelCharge),
    totalDistanceKm: distanceCovered,
    returnBikeCondition: bikeCondition,
    damageReported,
    damageNotes,
    keysReturned,
    emergencyOverride,
    emergencyOverrideReason,
    completedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection("dutySessions").doc(dutyId).update(updatePayload);

  // Update bike status: Strict state transition ACTIVE -> RETURNED or MAINTENANCE
  const newBikeStatus = damageReported ? "MAINTENANCE" : "RETURNED";
  await db.collection("bikes").doc(duty.bikeId).update({
    status: newBikeStatus,
    currentOdometer: Number(returnOdometer),
    currentFuelCharge: Number(returnFuelCharge),
    lastDutyId: null
  });

  // Update driver status
  await db.collection("drivers").doc(driverId).update({
    currentDutyId: null,
    isCurrentlyOnDuty: false,
    lastDutyEndedAt: endTime
  });

  // Create damage report if reported
  if (damageReported) {
    await db.collection("damageReports").add({
      dutyId,
      driverId,
      bikeId: duty.bikeId,
      condition: bikeCondition,
      description: damageNotes,
      status: "PENDING_INSPECTION",
      timestamp: endTime,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Log immutable audit
  await logAuditEvent({
    driverId,
    deviceId,
    action: emergencyOverride ? "DUTY_ENDED_EMERGENCY_OVERRIDE" : "DUTY_COMPLETED",
    gps: returnGps,
    relevantRecordId: dutyId,
    actor: driverId,
    source: "DRIVER_APP",
    notes: `Shift completed. Distance: ${distanceCovered}km, Duration: ${totalHours}h. Damage reported: ${damageReported}.`
  });

  return { ...duty, ...updatePayload };
}

module.exports = {
  startDutySession,
  endDutySession
};
