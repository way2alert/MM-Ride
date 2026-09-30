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

  // 4. Enterprise MDM Dedicated Device Policy (settings/mdmPolicy)
  await db.collection("settings").doc("mdmPolicy").set({
    policyName: "MM Ride Dedicated Terminal Kiosk Policy v1.0",
    kioskModeEnabled: true,
    autoLaunchApp: "com.mmride.driver",
    preventUninstall: true,
    preventFactoryReset: true,
    preventSettingsChange: true,
    preventPermissionRevoke: true,
    allowPhoneCalls: "ADMIN_AND_EMERGENCY_ONLY", // ADMIN_AND_EMERGENCY_ONLY, UNRESTRICTED, BLOCKED
    allowSms: "BLOCKED",
    adminExitPin: "998877",
    emergencyContacts: ["+91 9876543210", "112"],
    allowedApplications: [
      { packageName: "com.mmride.driver", appName: "MM Ride Driver", category: "Core Fleet App", mandatory: true },
      { packageName: "com.olacabs.driver", appName: "Ola Driver Partner", category: "Ride Hailing", mandatory: false },
      { packageName: "com.ubercab.driver", appName: "Uber Driver", category: "Ride Hailing", mandatory: false },
      { packageName: "com.rapido.driver", appName: "Rapido Captain", category: "Bike Taxi", mandatory: false },
      { packageName: "com.google.android.apps.maps", appName: "Google Maps Navigation", category: "Navigation", mandatory: true },
      { packageName: "com.google.android.dialer", appName: "Company / Emergency Phone", category: "Communication", mandatory: false }
    ],
    qrProvisioningConfig: {
      dpcPackage: "com.google.android.apps.work.clouddpc",
      enrollmentToken: "MM_RIDE_ENT_PROV_TOKEN_LIVE",
      serverUrl: "https://androidmanagement.googleapis.com",
      depotWifiSsid: "MM_RIDE_DEPOT_WIFI",
      depotWifiSecurity: "WPA",
      systemAppsEnabled: false
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  console.log("✅ MDM Enterprise Kiosk Policy seeded.");

  // 5. Initial Company-Managed Dedicated Devices (devices)
  const devices = [
    {
      id: "MM-DEV-001",
      deviceId: "MM-DEV-001",
      hardwareAndroidId: "8f4a1239c084e1b7",
      serialNumber: "R58N90ABC1K",
      imei: "867451049281723",
      model: "Samsung Galaxy A15 5G",
      manufacturer: "Samsung",
      osVersion: "Android 14 (OneUI 6.0)",
      appVersion: "v1.0.0-mdm",
      assignedDriverId: "driver_active_demo",
      assignedDriverName: "Karthik Rajan",
      assignedDriverPhone: "+91 9876543210",
      assignedBikeId: "bike-dl-01-ab-1234",
      status: "ACTIVE", // ACTIVE | SUSPENDED | LOST | REPLACEMENT_REQUIRED
      enrollmentStatus: "ENROLLED", // ENROLLED | PENDING_ENROLLMENT | UNENROLLED
      policyStatus: "COMPLIANT", // COMPLIANT | PENDING_SYNC | RESTRICTED
      isOnline: true,
      lastSync: new Date().toISOString(),
      batteryLevel: 84,
      isCharging: false,
      batteryHealth: "GOOD",
      networkType: "CELLULAR",
      networkCarrier: "Jio 5G",
      signalStrength: -68,
      dutyStatus: "ON_DUTY",
      currentDutyId: "duty_sample_active_01",
      lastGps: {
        latitude: 28.6328,
        longitude: 77.2197,
        speed: 24,
        accuracy: 6.2,
        timestamp: new Date().toISOString()
      },
      health: {
        memoryUsageMb: 1420,
        totalMemoryMb: 6144,
        storageFreeGb: 48.2,
        isRooted: false,
        securityPatch: "2026-08-01"
      },
      hubId: "hub-central-delhi",
      kioskExitPin: "998877",
      enrolledAt: "2026-08-10T10:00:00Z",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      id: "MM-DEV-002",
      deviceId: "MM-DEV-002",
      hardwareAndroidId: "7e3b9941a542f3d2",
      serialNumber: "XM98207194A",
      imei: "869102048591820",
      model: "Xiaomi Redmi 12 5G",
      manufacturer: "Xiaomi",
      osVersion: "Android 14 (HyperOS)",
      appVersion: "v1.0.0-mdm",
      assignedDriverId: "driver_sample_2",
      assignedDriverName: "Arun Kumar",
      assignedDriverPhone: "+91 9876543211",
      assignedBikeId: "bike-dl-01-cd-5678",
      status: "ACTIVE",
      enrollmentStatus: "ENROLLED",
      policyStatus: "COMPLIANT",
      isOnline: true,
      lastSync: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      batteryLevel: 62,
      isCharging: true,
      batteryHealth: "GOOD",
      networkType: "WIFI",
      networkCarrier: "Depot Wi-Fi",
      signalStrength: -55,
      dutyStatus: "ON_BREAK",
      currentDutyId: "duty_sample_active_02",
      lastGps: {
        latitude: 28.5355,
        longitude: 77.2710,
        speed: 0,
        accuracy: 4.5,
        timestamp: new Date().toISOString()
      },
      health: {
        memoryUsageMb: 1280,
        totalMemoryMb: 4096,
        storageFreeGb: 32.5,
        isRooted: false,
        securityPatch: "2026-07-05"
      },
      hubId: "hub-south-delhi",
      kioskExitPin: "998877",
      enrolledAt: "2026-08-14T11:30:00Z",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      id: "MM-DEV-003",
      deviceId: "MM-DEV-003",
      hardwareAndroidId: "5c2d8182e903a411",
      serialNumber: "MOTOG3498821",
      imei: "863391058291048",
      model: "Motorola Moto G34 5G",
      manufacturer: "Motorola",
      osVersion: "Android 14",
      appVersion: "v1.0.0-mdm",
      assignedDriverId: null,
      assignedDriverName: null,
      assignedDriverPhone: null,
      assignedBikeId: null,
      status: "ACTIVE",
      enrollmentStatus: "ENROLLED",
      policyStatus: "COMPLIANT",
      isOnline: true,
      lastSync: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      batteryLevel: 98,
      isCharging: false,
      batteryHealth: "GOOD",
      networkType: "WIFI",
      networkCarrier: "Depot Standby",
      signalStrength: -50,
      dutyStatus: "OFF_DUTY",
      currentDutyId: null,
      lastGps: {
        latitude: 28.6280,
        longitude: 77.3649,
        speed: 0,
        accuracy: 3.1,
        timestamp: new Date().toISOString()
      },
      health: {
        memoryUsageMb: 980,
        totalMemoryMb: 4096,
        storageFreeGb: 54.0,
        isRooted: false,
        securityPatch: "2026-08-15"
      },
      hubId: "hub-noida",
      kioskExitPin: "998877",
      enrolledAt: "2026-08-20T09:15:00Z",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      id: "MM-DEV-004",
      deviceId: "MM-DEV-004",
      hardwareAndroidId: "3a1e7492c109b882",
      serialNumber: "SM-M146B-9912",
      imei: "861928374650192",
      model: "Samsung Galaxy M14 5G",
      manufacturer: "Samsung",
      osVersion: "Android 13",
      appVersion: "v1.0.0-mdm",
      assignedDriverId: "driver_suspended_01",
      assignedDriverName: "Suresh Mani",
      assignedDriverPhone: "+91 9876543213",
      assignedBikeId: null,
      status: "SUSPENDED", // MARKED SUSPENDED
      enrollmentStatus: "ENROLLED",
      policyStatus: "RESTRICTED",
      isOnline: false,
      lastSync: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
      batteryLevel: 45,
      isCharging: false,
      batteryHealth: "GOOD",
      networkType: "CELLULAR",
      networkCarrier: "Airtel 4G",
      signalStrength: -92,
      dutyStatus: "OFF_DUTY",
      currentDutyId: null,
      suspensionReason: "Driver suspended for unauthorized cash ride dispute. MDM kiosk lockdown enforced.",
      remoteCommands: {
        lockScreen: true,
        message: "THIS MM RIDE FLEET PHONE IS TEMPORARILY SUSPENDED. CONTACT CONNAUGHT PLACE DEPOT: +91 9876543210"
      },
      lastGps: {
        latitude: 28.6328,
        longitude: 77.2197,
        speed: 0,
        accuracy: 12.0,
        timestamp: new Date().toISOString()
      },
      health: {
        memoryUsageMb: 1100,
        totalMemoryMb: 4096,
        storageFreeGb: 28.0,
        isRooted: false,
        securityPatch: "2026-06-01"
      },
      hubId: "hub-central-delhi",
      kioskExitPin: "998877",
      enrolledAt: "2026-07-01T08:00:00Z",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      id: "MM-DEV-005",
      deviceId: "MM-DEV-005",
      hardwareAndroidId: "9d8c7b6a504f3e21",
      serialNumber: "POCO-M6P-7721",
      imei: "865432109876543",
      model: "Poco M6 Pro 5G",
      manufacturer: "Poco",
      osVersion: "Android 14",
      appVersion: "v1.0.0-mdm",
      assignedDriverId: "driver_lost_report",
      assignedDriverName: "Vikas Sharma",
      assignedDriverPhone: "+91 9876543214",
      assignedBikeId: null,
      status: "LOST", // MARKED LOST
      enrollmentStatus: "ENROLLED",
      policyStatus: "RESTRICTED",
      isOnline: false,
      lastSync: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
      batteryLevel: 14,
      isCharging: false,
      batteryHealth: "GOOD",
      networkType: "NONE",
      networkCarrier: "Offline",
      signalStrength: 0,
      dutyStatus: "OFF_DUTY",
      currentDutyId: null,
      lostReason: "Reported lost at Okhla Depot during night shift. Remote MDM anti-theft lockdown initiated.",
      remoteCommands: {
        lockScreen: true,
        alarm: true,
        message: "PROPERTY OF MM RIDE FLEET. THIS DEVICE IS REPORTED LOST/STOLEN. POLICE & GPS TRACKED. RETURN TO CENTRAL DEPOT: +91 9876543210"
      },
      lastGps: {
        latitude: 28.5355,
        longitude: 77.2710,
        speed: 0,
        accuracy: 15.0,
        timestamp: new Date().toISOString()
      },
      health: {
        memoryUsageMb: 1350,
        totalMemoryMb: 6144,
        storageFreeGb: 44.0,
        isRooted: false,
        securityPatch: "2026-08-01"
      },
      hubId: "hub-south-delhi",
      kioskExitPin: "998877",
      enrolledAt: "2026-08-01T14:20:00Z",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      id: "MM-DEV-006",
      deviceId: "MM-DEV-006",
      hardwareAndroidId: "4b5c6d7e8f9a0b1c",
      serialNumber: "RMX-3782-9901",
      imei: "867890123456789",
      model: "Realme Narzo 60x 5G",
      manufacturer: "Realme",
      osVersion: "Android 13",
      appVersion: "v1.0.0-mdm",
      assignedDriverId: "driver_replace_req",
      assignedDriverName: "Deepak Verma",
      assignedDriverPhone: "+91 9876543215",
      assignedBikeId: null,
      status: "REPLACEMENT_REQUIRED", // REPLACEMENT REQUIRED
      enrollmentStatus: "ENROLLED",
      policyStatus: "COMPLIANT",
      isOnline: true,
      lastSync: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      batteryLevel: 22,
      isCharging: false,
      batteryHealth: "WEAK",
      networkType: "CELLULAR",
      networkCarrier: "Jio 5G",
      signalStrength: -75,
      dutyStatus: "OFF_DUTY",
      currentDutyId: null,
      replacementReason: "Severe battery swelling & degradation reported during depot hardware check. New device issued.",
      health: {
        memoryUsageMb: 1400,
        totalMemoryMb: 4096,
        storageFreeGb: 14.2,
        isRooted: false,
        securityPatch: "2026-05-01"
      },
      hubId: "hub-noida",
      kioskExitPin: "998877",
      enrolledAt: "2026-06-15T12:00:00Z",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }
  ];

  for (const device of devices) {
    await db.collection("devices").doc(device.id).set({
      ...device,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  console.log(`✅ ${devices.length} Managed Enterprise Fleet Devices seeded.`);

  // 6. Default Admin User setup placeholder
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
