/**
 * Database Cleanup Script for MM Ride
 * Deletes all documents in Firestore collections EXCEPT 'adminUsers' and 'settings' (and optionally 'hubs')
 * 
 * Run with: node clean_firestore.js
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "mm-ride-6899f"
  });
}

const db = admin.firestore();

// Collections to completely delete
const COLLECTIONS_TO_DELETE = [
  "driver_app_crashes",
  "drivers",
  "driverDocuments",
  "driverDevices",
  "bikes",
  "bikeAssignments",
  "bikeHandovers",
  "bikeReturns",
  "dutySessions",
  "gpsEvents",
  "speedEvents",
  "idleAlerts",
  "shiftRideEntries",
  "platformRideEvents",
  "fuelExpenses",
  "incidents",
  "challans",
  "bikeMaintenanceLogs",
  "adminAudits",
  "leaveRequests",
  "settlementTransactions",
  "dailyDriverSummaries",
  "settlementReports",
  "mdmTelemetry"
];

// Collections strictly PRESERVED:
// - adminUsers
// - settings
// - hubs (depot coordinates preserved)

async function deleteCollection(collectionPath, batchSize = 300) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  let totalDeleted = 0;

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject);
  });

  async function deleteQueryBatch(q, resolve, reject) {
    try {
      const snapshot = await q.get();

      const batchSizeNum = snapshot.size;
      if (batchSizeNum === 0) {
        resolve(totalDeleted);
        return;
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      totalDeleted += batchSizeNum;
      process.stdout.write(`  ... deleted ${totalDeleted} in '${collectionPath}'\r`);

      // Recurse on next tick
      process.nextTick(() => {
        deleteQueryBatch(q, resolve, reject);
      });
    } catch (err) {
      reject(err);
    }
  }
}

async function cleanDatabase() {
  console.log("==================================================");
  console.log("⚠️  MM RIDE FIRESTORE PURGE UTILITY");
  console.log("⚠️  PRESERVED: 'adminUsers', 'settings', 'hubs'");
  console.log("==================================================");

  for (const coll of COLLECTIONS_TO_DELETE) {
    process.stdout.write(`Cleaning collection: ${coll} ... `);
    try {
      const count = await deleteCollection(coll);
      console.log(`\n  ✅ ${coll}: ${count} document(s) deleted.`);
    } catch (err) {
      console.log(`\n  ❌ Error cleaning ${coll}:`, err.message);
    }
  }

  console.log("\n==================================================");
  console.log("🎉 Cleanup completed! 'adminUsers' and 'settings' were preserved untouched.");
  console.log("==================================================");
}

cleanDatabase().catch(console.error);
