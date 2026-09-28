const admin = require("firebase-admin");

/**
 * Creates an immutable audit log entry in Firestore.
 * Required fields per security principles:
 * - driverId
 * - timestamp (client provided or current)
 * - serverTimestamp
 * - deviceId
 * - action
 * - gps (where applicable)
 * - relevantRecordId
 * - previousValue
 * - newValue
 * - actor (userId or system)
 * - source (DRIVER_APP, ADMIN_WEB, CLOUD_FUNCTION)
 */
async function logAuditEvent({
  driverId = null,
  deviceId = null,
  action,
  gps = null,
  relevantRecordId = null,
  previousValue = null,
  newValue = null,
  actor = "SYSTEM",
  source = "CLOUD_FUNCTION",
  notes = null
}) {
  const db = admin.firestore();
  const auditRef = db.collection("auditLogs").doc();

  const auditEntry = {
    id: auditRef.id,
    driverId,
    deviceId,
    action,
    gps: gps ? {
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy: gps.accuracy || null
    } : null,
    relevantRecordId,
    previousValue,
    newValue,
    actor,
    source,
    notes,
    timestamp: new Date().toISOString(),
    serverTimestamp: admin.firestore.FieldValue.serverTimestamp()
  };

  await auditRef.set(auditEntry);
  return auditRef.id;
}

module.exports = {
  logAuditEvent
};
