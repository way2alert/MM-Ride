/**
 * Database Seed Script for MM Ride
 * Run with: node seed/seed-data.js
 */
const admin = require("firebase-admin");

// Initialize with application default or project
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "mm-ride-6899f"
  });
}

const db = admin.firestore();

async function seedDatabase() {
  console.log("🚀 Starting MM Ride Firestore initial configuration seed...");

  // 1. System Settings
  await db.collection("settings").doc("system").set({
    companyName: "MM Ride",
    maxDutyHoursPerDay: 12,
    speedAlertThresholdKmh: 60,
    idleAlertThresholdMinutes: 30,
    plannedBreakLimitMinutes: 60,
    workerSharePercent: 50,
    ownerSharePercent: 50,
    reserveHoldPercent: 10,
    weeklyOffDays: 1,
    antiCheatStrictness: "HIGH",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log("✅ System settings initialized.");

  // 2. Authorized Hubs (Pick up and return depots)
  const hubs = [
    {
      id: "hub-central-delhi",
      name: "Central Hub - Connaught Place Depot",
      address: "Outer Circle, CP, New Delhi, Delhi 110001",
      latitude: 28.6328,
      longitude: 77.2197,
      radiusMeters: 400,
      active: true,
      managerContact: "+91 9876543210"
    },
    {
      id: "hub-south-delhi",
      name: "South Hub - Okhla Industrial Area",
      address: "Phase 3, Okhla, New Delhi, Delhi 110020",
      latitude: 28.5355,
      longitude: 77.2710,
      radiusMeters: 350,
      active: true,
      managerContact: "+91 9876543211"
    },
    {
      id: "hub-noida",
      name: "NCR Hub - Sector 62 Noida",
      address: "Electronic City Metro Station, Sector 62, Noida, UP 201309",
      latitude: 28.6280,
      longitude: 77.3649,
      radiusMeters: 500,
      active: true,
      managerContact: "+91 9876543212"
    }
  ];

  for (const hub of hubs) {
    await db.collection("hubs").doc(hub.id).set({
      ...hub,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  console.log(`✅ ${hubs.length} Authorized Hubs seeded.`);

  // 3. Initial Fleet Bikes
  const bikes = [
    {
      id: "bike-dl-01-ab-1234",
      registrationNumber: "DL 01 AB 1234",
      make: "Hero",
      model: "Splendor Plus",
      year: 2024,
      fuelType: "PETROL",
      hubId: "hub-central-delhi",
      status: "AVAILABLE",
      currentOdometer: 14250,
      currentFuelCharge: 85,
      insuranceNumber: "ICICI-LOMBARD-882391",
      insuranceExpiry: "2027-05-15",
      pucValidUntil: "2026-11-20",
      assignedDriverId: null,
      assignedDriverName: null,
      photos: []
    },
    {
      id: "bike-dl-01-cd-5678",
      registrationNumber: "DL 01 CD 5678",
      make: "Honda",
      model: "Shine 125",
      year: 2024,
      fuelType: "PETROL",
      hubId: "hub-central-delhi",
      status: "AVAILABLE",
      currentOdometer: 8900,
      currentFuelCharge: 90,
      insuranceNumber: "HDFC-ERGO-339210",
      insuranceExpiry: "2027-08-10",
      pucValidUntil: "2026-12-01",
      assignedDriverId: null,
      assignedDriverName: null,
      photos: []
    },
    {
      id: "bike-dl-03-ev-9901",
      registrationNumber: "DL 03 EV 9901",
      make: "Ola",
      model: "S1 Pro (Commercial)",
      year: 2024,
      fuelType: "EV",
      hubId: "hub-south-delhi",
      status: "AVAILABLE",
      currentOdometer: 5200,
      currentFuelCharge: 100,
      insuranceNumber: "BAJAJ-ALLIANZ-771201",
      insuranceExpiry: "2027-03-12",
      pucValidUntil: "2028-03-12",
      assignedDriverId: null,
      assignedDriverName: null,
      photos: []
    }
  ];

  for (const bike of bikes) {
    await db.collection("bikes").doc(bike.id).set({
      ...bike,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  console.log(`✅ ${bikes.length} Fleet Bikes seeded.`);

  // 4. Default Admin User setup placeholder
  await db.collection("adminUsers").doc("admin_master").set({
    email: "admin@mmride.com",
    name: "Master Operations Admin",
    role: "SUPER_ADMIN",
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  console.log("✅ Master Admin profile mapped.");

  console.log("✨ Seed completed successfully!");
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed error:", err);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
