const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!(admin.apps ? admin.apps.length : admin.getApps().length)) {
  admin.initializeApp();
}

const { logAuditEvent } = require("./src/audit");
const { calculateEarningsSplit, createSettlementRecord, recordAdjustment } = require("./src/settlements");
const { startDutySession, endDutySession } = require("./src/duty");
const { assignBikeToDriver, processBikeHandover } = require("./src/bikes");
const { processGpsTelemetry } = require("./src/alerts");
const { sendUserNotification } = require("./src/notifications");

// =======================================================
// CALLABLE FUNCTIONS (Client invokes with authenticated user)
// =======================================================

/**
 * Start Duty Session with geofence and eligibility check
 */
exports.startDuty = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in to start duty.");
  }
  try {
    const result = await startDutySession({
      driverId: context.auth.uid,
      bikeId: data.bikeId,
      hubId: data.hubId,
      pickupGps: data.pickupGps,
      pickupOdometer: data.pickupOdometer,
      pickupFuelCharge: data.pickupFuelCharge,
      bikeCondition: data.bikeCondition || "GOOD",
      deviceId: data.deviceId
    });
    return { success: true, duty: result };
  } catch (error) {
    console.error("startDuty error:", error);
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});

/**
 * End Duty Session with return geofence and odometer check
 */
exports.endDuty = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in to end duty.");
  }
  try {
    const result = await endDutySession({
      dutyId: data.dutyId,
      driverId: context.auth.uid,
      returnGps: data.returnGps,
      returnOdometer: data.returnOdometer,
      returnFuelCharge: data.returnFuelCharge,
      bikeCondition: data.bikeCondition,
      damageReported: !!data.damageReported,
      damageNotes: data.damageNotes || "",
      keysReturned: data.keysReturned !== false,
      deviceId: data.deviceId,
      emergencyOverride: !!data.emergencyOverride,
      emergencyOverrideReason: data.emergencyOverrideReason || ""
    });
    return { success: true, duty: result };
  } catch (error) {
    console.error("endDuty error:", error);
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});

/**
 * Assign bike to driver (Admin / Operations only)
 */
exports.assignBike = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Admin authentication required.");
  }
  try {
    const result = await assignBikeToDriver({
      bikeId: data.bikeId,
      driverId: data.driverId,
      hubId: data.hubId,
      adminId: context.auth.uid
    });
    return { success: true, assignment: result };
  } catch (error) {
    console.error("assignBike error:", error);
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});

/**
 * Complete Bike Handover inspection
 */
exports.completeHandover = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }
  try {
    const result = await processBikeHandover({
      driverId: context.auth.uid,
      bikeId: data.bikeId,
      assignmentId: data.assignmentId,
      odometer: data.odometer,
      fuelCharge: data.fuelCharge,
      conditionNotes: data.conditionNotes,
      existingDamage: data.existingDamage,
      keysReceived: data.keysReceived,
      accessoriesConfirmed: data.accessoriesConfirmed,
      photoUrls: data.photoUrls || [],
      gps: data.gps,
      deviceId: data.deviceId
    });
    return { success: true, handover: result };
  } catch (error) {
    console.error("completeHandover error:", error);
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});

/**
 * Create official daily settlement (Admin / Finance)
 */
exports.createSettlement = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }
  try {
    const result = await createSettlementRecord({
      driverId: data.driverId,
      dutySessionId: data.dutySessionId,
      date: data.date,
      grossIncome: data.grossIncome,
      platformCharges: data.platformCharges,
      cashRidesCollected: data.cashRidesCollected,
      fuelExpenseAmount: data.fuelExpenseAmount,
      fuelPaymentSource: data.fuelPaymentSource,
      verificationMethod: data.verificationMethod || "PHYSICAL_PHONE_INSPECTION",
      adminId: context.auth.uid,
      notes: data.notes,
      submissionId: data.submissionId
    });
    return { success: true, settlement: result };
  } catch (error) {
    console.error("createSettlement error:", error);
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});

/**
 * Apply settlement adjustment (Admin / Finance)
 */
exports.applyAdjustment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }
  try {
    const result = await recordAdjustment({
      settlementId: data.settlementId,
      driverId: data.driverId,
      amount: data.amount,
      type: data.type,
      reason: data.reason,
      adminId: context.auth.uid
    });
    return { success: true, adjustment: result };
  } catch (error) {
    console.error("applyAdjustment error:", error);
    throw new functions.https.HttpsError("invalid-argument", error.message);
  }
});

// =======================================================
// FIRESTORE TRIGGERS
// =======================================================

/**
 * Triggered on new GPS breadcrumb event: validates speed, jump, and idle telemetry
 */
exports.onGpsEventRecorded = functions.firestore
  .document("gpsEvents/{eventId}")
  .onCreate(async (snap, context) => {
    const event = snap.data();
    try {
      await processGpsTelemetry(event);
    } catch (err) {
      console.error("Error processing GPS telemetry event:", err);
    }
  });

/**
 * Triggered on Driver document change: audits verification/approval changes and notifies driver
 */
exports.onDriverUpdated = functions.firestore
  .document("drivers/{driverId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const driverId = context.params.driverId;

    // Check approval status transition
    if (before.approvalStatus !== after.approvalStatus) {
      await logAuditEvent({
        driverId,
        action: `DRIVER_APPROVAL_${after.approvalStatus}`,
        previousValue: before.approvalStatus,
        newValue: after.approvalStatus,
        actor: after.approvedBy || "ADMIN",
        source: "ADMIN_WEB",
        notes: `Driver approval status changed from ${before.approvalStatus} to ${after.approvalStatus}`
      });

      if (after.approvalStatus === "APPROVED") {
        await sendUserNotification({
          userId: driverId,
          title: "Account Approved! 🎉",
          body: "Your MM Ride account has been approved. A bike will be assigned shortly.",
          data: { type: "STATUS_UPDATE", status: "APPROVED" }
        });
      }
    }

    // Check account status transition
    if (before.accountStatus !== after.accountStatus) {
      await logAuditEvent({
        driverId,
        action: `ACCOUNT_STATUS_${after.accountStatus}`,
        previousValue: before.accountStatus,
        newValue: after.accountStatus,
        actor: "SYSTEM",
        source: "CLOUD_FUNCTION"
      });
    }
  });

/**
 * Triggered on new Incident reported: sends high-priority notification to Operations
 */
exports.onIncidentCreated = functions.firestore
  .document("incidents/{incidentId}")
  .onCreate(async (snap, context) => {
    const incident = snap.data();
    const incidentId = context.params.incidentId;

    await logAuditEvent({
      driverId: incident.driverId,
      action: "INCIDENT_REPORTED",
      gps: incident.gps,
      relevantRecordId: incidentId,
      actor: incident.driverId,
      source: "DRIVER_APP",
      notes: `Type: ${incident.type}. Severity: ${incident.severity || 'NORMAL'}`
    });
  });
