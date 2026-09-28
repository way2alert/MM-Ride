const admin = require("firebase-admin");
const { logAuditEvent } = require("./audit");

/**
 * Assigns an available bike to an approved driver.
 */
async function assignBikeToDriver({ bikeId, driverId, hubId, adminId }) {
  const db = admin.firestore();

  // 1. Verify driver eligibility
  const driverDoc = await db.collection("drivers").doc(driverId).get();
  if (!driverDoc.exists) {
    throw new Error("Driver profile not found.");
  }
  const driverData = driverDoc.data();
  if (driverData.approvalStatus !== "APPROVED") {
    throw new Error(`Cannot assign bike. Driver approvalStatus is '${driverData.approvalStatus}'. Must be APPROVED.`);
  }
  if (driverData.assignedBikeId) {
    throw new Error(`Driver already has bike ${driverData.assignedBikeId} assigned.`);
  }

  // 2. Verify bike eligibility - STRICT NO DOUBLE ASSIGNMENT
  const bikeDoc = await db.collection("bikes").doc(bikeId).get();
  if (!bikeDoc.exists) {
    throw new Error("Bike not found in registry.");
  }
  const bikeData = bikeDoc.data();
  if (bikeData.status !== "AVAILABLE" || bikeData.assignedDriverId) {
    throw new Error(`Bike ${bikeData.registrationNumber} cannot be assigned. Current Status: '${bikeData.status}', Assigned Driver: '${bikeData.assignedDriverId || "None"}'. Bike must be AVAILABLE and unassigned.`);
  }

  // 3. Create assignment record
  const assignRef = db.collection("bikeAssignments").doc();
  const assignData = {
    id: assignRef.id,
    bikeId,
    bikeRegistration: bikeData.registrationNumber,
    driverId,
    driverName: driverData.fullName,
    driverPhone: driverData.mobileNumber,
    hubId: hubId || bikeData.hubId || null,
    assignedBy: adminId,
    assignedAt: new Date().toISOString(),
    status: "HANDOVER_PENDING",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await assignRef.set(assignData);

  // Update bike status
  await db.collection("bikes").doc(bikeId).update({
    status: "ASSIGNED",
    assignedDriverId: driverId,
    assignedDriverName: driverData.fullName,
    currentAssignmentId: assignRef.id
  });

  // Update driver status
  await db.collection("drivers").doc(driverId).update({
    accountStatus: "BIKE_ASSIGNED",
    assignedBikeId: bikeId,
    assignedBikeRegistration: bikeData.registrationNumber,
    currentAssignmentId: assignRef.id
  });

  await logAuditEvent({
    driverId,
    action: "BIKE_ASSIGNED",
    relevantRecordId: assignRef.id,
    newValue: JSON.stringify({ bikeId, registration: bikeData.registrationNumber }),
    actor: adminId,
    source: "ADMIN_WEB",
    notes: `Bike ${bikeData.registrationNumber} assigned to driver ${driverData.fullName}`
  });

  return assignData;
}

/**
 * Executes a controlled bike handover inspection.
 */
async function processBikeHandover({
  driverId,
  bikeId,
  assignmentId,
  odometer,
  fuelCharge,
  conditionNotes = "GOOD",
  existingDamage = "NONE",
  keysReceived = true,
  accessoriesConfirmed = true,
  photoUrls = [],
  gps = null,
  deviceId = null,
  verifiedByAdminId = null
}) {
  const db = admin.firestore();

  const handoverRef = db.collection("bikeHandovers").doc();
  const handoverData = {
    id: handoverRef.id,
    assignmentId,
    bikeId,
    driverId,
    odometer: Number(odometer),
    fuelCharge: Number(fuelCharge),
    conditionNotes,
    existingDamage,
    keysReceived,
    accessoriesConfirmed,
    photoUrls,
    gps: gps ? {
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy: gps.accuracy || null
    } : null,
    deviceId,
    verifiedByAdminId,
    driverConfirmed: true,
    timestamp: new Date().toISOString(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await handoverRef.set(handoverData);

  // Update assignment status
  if (assignmentId) {
    await db.collection("bikeAssignments").doc(assignmentId).update({
      status: "COMPLETED",
      handoverId: handoverRef.id,
      handoverAt: handoverData.timestamp
    });
  }

  // Update bike
  await db.collection("bikes").doc(bikeId).update({
    status: "ACTIVE",
    currentOdometer: Number(odometer),
    currentFuelCharge: Number(fuelCharge),
    lastHandoverId: handoverRef.id
  });

  // Update driver status to ACTIVE_DRIVER!
  await db.collection("drivers").doc(driverId).update({
    accountStatus: "ACTIVE_DRIVER",
    handoverCompletedAt: handoverData.timestamp,
    handoverId: handoverRef.id
  });

  await logAuditEvent({
    driverId,
    deviceId,
    action: "BIKE_HANDOVER_COMPLETED",
    gps,
    relevantRecordId: handoverRef.id,
    actor: driverId,
    source: "DRIVER_APP",
    notes: `Handover confirmed. Driver is now ACTIVE_DRIVER. Odometer: ${odometer}, Fuel: ${fuelCharge}%.`
  });

  return handoverData;
}

/**
 * Marks a returned or repaired bike as AVAILABLE for the next shift after depot inspection.
 */
async function markBikeAvailable({ bikeId, adminId }) {
  const db = admin.firestore();
  const bikeDoc = await db.collection("bikes").doc(bikeId).get();
  if (!bikeDoc.exists) throw new Error("Bike not found in registry.");
  const bike = bikeDoc.data();

  if (bike.status !== "RETURNED" && bike.status !== "MAINTENANCE") {
    throw new Error(`Cannot mark bike available from status '${bike.status}'. Bike must be in RETURNED or MAINTENANCE status.`);
  }

  // Clear driver assignment if previously assigned
  if (bike.assignedDriverId) {
    try {
      await db.collection("drivers").doc(bike.assignedDriverId).update({
        assignedBikeId: null,
        assignedBikeRegistration: null,
        currentAssignmentId: null,
        accountStatus: "APPROVED_BIKE_NOT_ASSIGNED"
      });
    } catch (e) {
      console.warn("Driver unassign on mark available:", e.message);
    }
  }

  await db.collection("bikes").doc(bikeId).update({
    status: "AVAILABLE",
    assignedDriverId: null,
    assignedDriverName: null,
    currentAssignmentId: null
  });

  await logAuditEvent({
    action: "BIKE_MARKED_AVAILABLE",
    relevantRecordId: bikeId,
    actor: adminId || "ADMIN",
    source: "ADMIN_WEB",
    notes: `Bike ${bike.registrationNumber} inspected at depot and confirmed AVAILABLE for new shift.`
  });

  return { success: true, bikeId, status: "AVAILABLE" };
}

module.exports = {
  assignBikeToDriver,
  processBikeHandover,
  markBikeAvailable
};
