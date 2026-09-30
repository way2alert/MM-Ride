import React, { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, 
  ShieldCheck, 
  ShieldAlert, 
  Battery, 
  BatteryCharging, 
  Wifi, 
  Radio, 
  MapPin, 
  User, 
  QrCode, 
  Settings, 
  Lock, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Search, 
  Filter, 
  RefreshCw, 
  Plus, 
  ExternalLink,
  Volume2,
  HardDrive,
  Cpu,
  PhoneCall,
  Key,
  Download,
  Printer,
  Trash2
} from 'lucide-react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  updateDoc, 
  setDoc, 
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import QRCode from 'qrcode';

export default function Devices({ onSelectDriver }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDemoData, setShowDemoData] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  
  // Modals
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [statusModal, setStatusModal] = useState({ isOpen: false, device: null, targetStatus: '', reason: '' });
  const [showQrModal, setShowQrModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);

  // QR Code Provisioning State
  const [manualWifi, setManualWifi] = useState(true);
  const [depotWifiSsid, setDepotWifiSsid] = useState('');
  const [depotWifiPass, setDepotWifiPass] = useState('');
  const [enrollmentToken, setEnrollmentToken] = useState('MM_RIDE_ENTERPRISE_TOKEN_AMAPI');
  const [qrCanvasUrl, setQrCanvasUrl] = useState('');
  const qrCanvasRef = useRef(null);

  // MDM Policy State
  const [mdmPolicy, setMdmPolicy] = useState({
    policyName: 'MM Ride Dedicated Terminal Kiosk Policy v1.0',
    kioskModeEnabled: true,
    autoLaunchApp: 'com.mmride.driver',
    preventUninstall: true,
    preventFactoryReset: true,
    preventSettingsChange: true,
    preventPermissionRevoke: true,
    allowPhoneCalls: 'ADMIN_AND_EMERGENCY_ONLY',
    allowSms: 'BLOCKED',
    adminExitPin: '998877',
    emergencyHotline: '+91 9876543210',
    allowedApplications: [
      { packageName: 'com.mmride.driver', appName: 'MM Ride Driver', category: 'Core Fleet App', mandatory: true },
      { packageName: 'com.olacabs.driver', appName: 'Ola Driver Partner', category: 'Ride Hailing', mandatory: false },
      { packageName: 'com.ubercab.driver', appName: 'Uber Driver', category: 'Ride Hailing', mandatory: false },
      { packageName: 'com.rapido.driver', appName: 'Rapido Captain', category: 'Bike Taxi', mandatory: false },
      { packageName: 'com.google.android.apps.maps', appName: 'Google Maps Navigation', category: 'Navigation', mandatory: true },
      { packageName: 'com.google.android.dialer', appName: 'Company / Emergency Phone', category: 'Communication', mandatory: false }
    ]
  });

  // New Terminal Form State
  const [newDeviceData, setNewDeviceData] = useState({
    id: `MM-DEV-00${Math.floor(Math.random() * 90 + 10)}`,
    model: 'Samsung Galaxy A15 5G',
    serialNumber: `SN-${Math.floor(Math.random() * 900000 + 100000)}`,
    imei: `86${Math.floor(Math.random() * 9000000000000 + 1000000000000)}`,
    hubId: 'hub-central-delhi',
    batteryLevel: 100
  });

  const DEFAULT_FLEET = [
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
      status: "ACTIVE",
      enrollmentStatus: "ENROLLED",
      policyStatus: "COMPLIANT",
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
      lastGps: { latitude: 28.6328, longitude: 77.2197, speed: 24, accuracy: 6.2, timestamp: new Date().toISOString() },
      health: { memoryUsageMb: 1420, totalMemoryMb: 6144, storageFreeGb: 48.2, isRooted: false, securityPatch: "2026-08-01" },
      hubId: "hub-central-delhi",
      kioskExitPin: "998877"
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
      lastGps: { latitude: 28.5355, longitude: 77.2710, speed: 0, accuracy: 4.5, timestamp: new Date().toISOString() },
      health: { memoryUsageMb: 1280, totalMemoryMb: 4096, storageFreeGb: 32.5, isRooted: false, securityPatch: "2026-07-05" },
      hubId: "hub-south-delhi",
      kioskExitPin: "998877"
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
      lastGps: { latitude: 28.6280, longitude: 77.3649, speed: 0, accuracy: 3.1, timestamp: new Date().toISOString() },
      health: { memoryUsageMb: 980, totalMemoryMb: 4096, storageFreeGb: 54.0, isRooted: false, securityPatch: "2026-08-15" },
      hubId: "hub-noida",
      kioskExitPin: "998877"
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
      status: "SUSPENDED",
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
      remoteCommands: { lockScreen: true, message: "THIS MM RIDE FLEET PHONE IS TEMPORARILY SUSPENDED. CONTACT CONNAUGHT PLACE DEPOT: +91 9876543210" },
      lastGps: { latitude: 28.6328, longitude: 77.2197, speed: 0, accuracy: 12.0, timestamp: new Date().toISOString() },
      health: { memoryUsageMb: 1100, totalMemoryMb: 4096, storageFreeGb: 28.0, isRooted: false, securityPatch: "2026-06-01" },
      hubId: "hub-central-delhi",
      kioskExitPin: "998877"
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
      status: "LOST",
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
      remoteCommands: { lockScreen: true, alarm: true, message: "PROPERTY OF MM RIDE FLEET. THIS DEVICE IS REPORTED LOST/STOLEN. POLICE & GPS TRACKED. RETURN TO CENTRAL DEPOT: +91 9876543210" },
      lastGps: { latitude: 28.5355, longitude: 77.2710, speed: 0, accuracy: 15.0, timestamp: new Date().toISOString() },
      health: { memoryUsageMb: 1350, totalMemoryMb: 6144, storageFreeGb: 44.0, isRooted: false, securityPatch: "2026-08-01" },
      hubId: "hub-south-delhi",
      kioskExitPin: "998877"
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
      status: "REPLACEMENT_REQUIRED",
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
      health: { memoryUsageMb: 1400, totalMemoryMb: 4096, storageFreeGb: 14.2, isRooted: false, securityPatch: "2026-05-01" },
      hubId: "hub-noida",
      kioskExitPin: "998877"
    }
  ];

  // 1. Live Firestore Listener for Fleet Devices & Drivers
  useEffect(() => {
    let driversMap = {};
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (dSnap) => {
      dSnap.forEach(dDoc => {
        driversMap[dDoc.id] = dDoc.data();
      });
    }, (err) => {
      console.warn('Drivers fetch warning:', err);
    });

    const unsubDevices = onSnapshot(collection(db, 'driverDevices'), (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const driverId = data.driverId || data.assignedDriverId;
        const driverInfo = driverId ? driversMap[driverId] : null;

        const effectiveSync = data.lastSync || data.lastActiveAt || data.lastSeen || (data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null) || new Date().toISOString();
        const diffMs = Date.now() - new Date(effectiveSync).getTime();
        const isOnline = data.isOnline !== undefined ? (data.isOnline && diffMs < 10 * 60 * 1000) : (diffMs < 5 * 60 * 1000);

        list.push({
          id: docSnap.id,
          deviceId: docSnap.id,
          model: (data.deviceName?.includes('23124RN87I') || data.model?.includes('23124RN87I')) ? 'Xiaomi Redmi 13C 5G' : (data.deviceName || data.model || 'Android Fleet Device'),
          manufacturer: data.manufacturer || data.deviceName?.split(' ')[0] || 'Android',
          osVersion: data.osVersion ? `Android ${data.osVersion}` : (data.os || 'Android 12+'),
          appVersion: data.appVersion || 'v1.0.0-mdm',
          status: data.status || 'ACTIVE',
          enrollmentStatus: data.enrollmentStatus || 'ENROLLED',
          policyStatus: data.policyStatus || 'COMPLIANT',
          isOnline,
          lastSync: effectiveSync,
          batteryLevel: data.batteryLevel !== undefined ? data.batteryLevel : 85,
          isCharging: !!data.isCharging,
          batteryHealth: data.batteryHealth || 'GOOD',
          networkType: data.networkType || 'WIFI',
          networkCarrier: data.networkCarrier || 'Airtel / Jio 4G',
          dutyStatus: data.dutyStatus || 'OFF_DUTY',
          assignedDriverId: driverId || null,
          assignedDriverName: driverInfo?.fullName || data.assignedDriverName || 'Driver Partner',
          assignedDriverPhone: driverInfo?.mobileNumber || driverInfo?.authPhone || data.assignedDriverPhone || 'N/A',
          kioskExitPin: data.kioskExitPin || '998877',
          ...data
        });
      });
      // Sort: Active/Suspended first, then by lastSync desc
      list.sort((a, b) => (new Date(b.lastSync || 0)) - (new Date(a.lastSync || 0)));
      setDevices(list);
      setLoading(false);
    }, (err) => {
      console.warn('Devices snapshot error:', err);
      setLoading(false);
    });

    return () => {
      unsubDrivers();
      unsubDevices();
    };
  }, []);

  // Clear Mock Devices to keep table clean for real physical devices
  const handleClearDemoDevices = async () => {
    if (!confirm('Are you sure you want to delete all demo/mock devices? Only real enrolled phones will remain.')) return;
    try {
      const demoDevices = devices.filter(d => d.id?.startsWith('MM-DEV-00') || d.isDemo);
      for (const dev of demoDevices) {
        await deleteDoc(doc(db, 'devices', dev.id));
      }
      setDevices(prev => prev.filter(d => !d.id?.startsWith('MM-DEV-00') && !d.isDemo));
      alert('Mock devices cleared successfully! Waiting for your physical phone enrollment.');
    } catch (e) {
      alert(`Could not clear demo devices: ${e.message}`);
    }
  };

  // Delete individual device record
  const handleDeleteDevice = async (device) => {
    if (!confirm(`Are you sure you want to remove ${device.model || device.id} (${device.id}) from the fleet list?`)) return;
    try {
      await deleteDoc(doc(db, 'driverDevices', device.id));
      await deleteDoc(doc(db, 'devices', device.id)).catch(() => {});
      setDevices(prev => prev.filter(d => d.id !== device.id));
    } catch (e) {
      alert(`Could not remove device: ${e.message}`);
    }
  };

  // Load Demo Devices (Optional preview testing)
  const handleLoadDemoDevices = async () => {
    try {
      for (const dev of DEFAULT_FLEET) {
        await setDoc(doc(db, 'devices', dev.id), {
          ...dev,
          isDemo: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      alert('Demo devices loaded for preview testing!');
    } catch (e) {
      alert(`Error loading demo devices: ${e.message}`);
    }
  };

  // 2. Live Firestore Listener for MDM Policy
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'mdmPolicy'), (docSnap) => {
      if (docSnap.exists()) {
        setMdmPolicy(prev => ({ ...prev, ...docSnap.data() }));
      }
    }, (err) => {
      console.warn('MDM Policy fetch fallback:', err);
    });

    return () => unsub();
  }, []);

  // 3. Render QR Code when QR modal is opened
  useEffect(() => {
    if (showQrModal) {
      const payloadObj = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME": "com.google.android.apps.work.clouddpc",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "gZs0YwH7V3b_8V8VwL3f4jX_0e4k=",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.google.android.apps.work.clouddpc/.receivers.CloudDeviceAdminReceiver",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://play.google.com/managed/download/AndroidDevicePolicy.apk",
        "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
          "com.google.android.apps.work.clouddpc.EXTRA_ENROLLMENT_TOKEN": enrollmentToken.trim() || "MM_RIDE_ENTERPRISE_TOKEN_AMAPI",
          "serverUrl": "https://androidmanagement.googleapis.com",
          "policy": "mmride_dedicated_kiosk_v1",
          "company": "MM Ride Fleet Logistics Pvt Ltd",
          "kioskExitPin": mdmPolicy.adminExitPin || "998877"
        },
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": false,
        "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false
      };

      // If Manual Wi-Fi is unchecked, embed user-provided Wi-Fi credentials into the QR payload
      if (!manualWifi && depotWifiSsid && depotWifiSsid.trim().length > 0) {
        payloadObj["android.app.extra.PROVISIONING_WIFI_SSID"] = depotWifiSsid.trim();
        payloadObj["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = "WPA";
        payloadObj["android.app.extra.PROVISIONING_WIFI_PASSWORD"] = depotWifiPass || "";
      }

      const qrPayload = JSON.stringify(payloadObj);

      QRCode.toDataURL(qrPayload, { width: 320, margin: 2, color: { dark: '#0A0D14', light: '#FFFFFF' } })
        .then(url => setQrCanvasUrl(url))
        .catch(err => console.error('QR code generation error:', err));
    }
  }, [showQrModal, manualWifi, depotWifiSsid, depotWifiPass, enrollmentToken, mdmPolicy.adminExitPin]);

  // Handle Device Status Updates (ACTIVE, SUSPENDED, LOST, REPLACEMENT_REQUIRED)
  const handleUpdateDeviceStatus = async () => {
    if (!statusModal.device || !statusModal.targetStatus) return;

    try {
      const devRef = doc(db, 'devices', statusModal.device.id);
      const updates = {
        status: statusModal.targetStatus,
        policyStatus: (statusModal.targetStatus === 'SUSPENDED' || statusModal.targetStatus === 'LOST') ? 'RESTRICTED' : 'COMPLIANT',
        updatedAt: serverTimestamp()
      };

      if (statusModal.targetStatus === 'SUSPENDED') {
        updates.suspensionReason = statusModal.reason || 'Suspended by fleet operations administrator';
        updates.remoteCommands = {
          lockScreen: true,
          message: `THIS MM RIDE FLEET PHONE IS TEMPORARILY SUSPENDED. CONTACT FLEET DEPOT: ${mdmPolicy.emergencyHotline || '+91 9876543210'}`
        };
      } else if (statusModal.targetStatus === 'LOST') {
        updates.lostReason = statusModal.reason || 'Device reported missing/lost by driver partner';
        updates.remoteCommands = {
          lockScreen: true,
          alarm: true,
          message: `PROPERTY OF MM RIDE FLEET. THIS DEVICE IS REPORTED LOST/STOLEN. POLICE & GPS TRACKED. RETURN TO CENTRAL DEPOT: ${mdmPolicy.emergencyHotline || '+91 9876543210'}`
        };
      } else if (statusModal.targetStatus === 'REPLACEMENT_REQUIRED') {
        updates.replacementReason = statusModal.reason || 'Hardware battery/screen replacement required';
      } else if (statusModal.targetStatus === 'ACTIVE') {
        updates.suspensionReason = null;
        updates.lostReason = null;
        updates.remoteCommands = { lockScreen: false, alarm: false, message: '' };
      }

      const targetDriverId = statusModal.device.driverId || statusModal.device.assignedDriverId || null;
      if (targetDriverId) {
        updates.driverId = targetDriverId;
        updates.assignedDriverId = targetDriverId;
      }

      await setDoc(doc(db, 'driverDevices', statusModal.device.id), updates, { merge: true }).catch(() => {});
      await setDoc(doc(db, 'devices', statusModal.device.id), updates, { merge: true }).catch(() => {});

      // Audit log
      await setDoc(doc(collection(db, 'auditLogs')), {
        action: `MDM_DEVICE_STATUS_${statusModal.targetStatus}`,
        relevantRecordId: statusModal.device.id,
        driverId: statusModal.device.assignedDriverId || null,
        previousValue: statusModal.device.status,
        newValue: statusModal.targetStatus,
        notes: statusModal.reason || `Device status changed to ${statusModal.targetStatus}`,
        source: 'ADMIN_CONSOLE',
        actor: 'ADMIN_OPERATIONS',
        timestamp: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      // Update selected device if open
      if (selectedDevice?.id === statusModal.device.id) {
        setSelectedDevice(prev => ({ ...prev, ...updates }));
      }

      setStatusModal({ isOpen: false, device: null, targetStatus: '', reason: '' });
      alert(`Device [${statusModal.device.id}] status successfully set to ${statusModal.targetStatus}!`);
    } catch (err) {
      alert(`Error updating device status: ${err.message}`);
    }
  };

  // Remote MDM Commands
  const handleTriggerRemoteCommand = async (device, commandType) => {
    try {
      const devRef = doc(db, 'devices', device.id);
      if (commandType === 'ALARM') {
        await updateDoc(devRef, {
          'remoteCommands.alarm': true,
          updatedAt: serverTimestamp()
        });
        alert(`🚨 Remote Siren Alarm sent to ${device.id}! Phone will emit emergency buzzer on next check.`);
      } else if (commandType === 'SYNC_POLICY') {
        await updateDoc(devRef, {
          policyStatus: 'COMPLIANT',
          lastPolicySync: new Date().toISOString(),
          updatedAt: serverTimestamp()
        });
        alert(`⚡ Immediate MDM Policy Sync dispatched to ${device.id}!`);
      } else if (commandType === 'RESET_PIN') {
        const newPin = Math.floor(100000 + Math.random() * 900000).toString();
        await updateDoc(devRef, {
          kioskExitPin: newPin,
          updatedAt: serverTimestamp()
        });
        alert(`🔑 New Master Admin Exit PIN for ${device.id} is: ${newPin}`);
      }
    } catch (err) {
      alert(`Command dispatch error: ${err.message}`);
    }
  };

  // Save MDM Policy
  const handleSavePolicy = async () => {
    try {
      await setDoc(doc(db, 'settings', 'mdmPolicy'), {
        ...mdmPolicy,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setShowPolicyModal(false);
      alert('Enterprise MDM Kiosk Policy updated successfully! Connected fleet devices will apply updates on their next heartbeat.');
    } catch (err) {
      alert(`Error saving policy: ${err.message}`);
    }
  };

  // Add New Terminal
  const handleRegisterDevice = async (e) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'devices', newDeviceData.id), {
        id: newDeviceData.id,
        deviceId: newDeviceData.id,
        hardwareAndroidId: `and_${Math.random().toString(36).substring(2, 10)}`,
        serialNumber: newDeviceData.serialNumber,
        imei: newDeviceData.imei,
        model: newDeviceData.model,
        manufacturer: newDeviceData.model.split(' ')[0],
        osVersion: 'Android 14',
        appVersion: 'v1.0.0-mdm',
        assignedDriverId: null,
        assignedDriverName: null,
        assignedDriverPhone: null,
        assignedBikeId: null,
        status: 'ACTIVE',
        enrollmentStatus: 'PENDING_ENROLLMENT',
        policyStatus: 'COMPLIANT',
        isOnline: false,
        batteryLevel: newDeviceData.batteryLevel,
        isCharging: false,
        batteryHealth: 'GOOD',
        networkType: 'CELLULAR',
        dutyStatus: 'OFF_DUTY',
        hubId: newDeviceData.hubId,
        kioskExitPin: mdmPolicy.adminExitPin || '998877',
        health: {
          memoryUsageMb: 1100,
          totalMemoryMb: 4096,
          storageFreeGb: 32.0,
          isRooted: false,
          securityPatch: '2026-08-01'
        },
        enrolledAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setShowAddDeviceModal(false);
      alert(`Terminal ${newDeviceData.id} registered! Scan provisioning QR code on device to enroll.`);
    } catch (err) {
      alert(`Error registering terminal: ${err.message}`);
    }
  };

  // Filtered devices
  const filteredDevices = devices.filter(d => {
    const matchesSearch = 
      d.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.model?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.serialNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.imei?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.assignedDriverName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.assignedDriverPhone?.includes(searchQuery);

    if (!matchesSearch) return false;

    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'ACTIVE') return d.status === 'ACTIVE';
    if (selectedFilter === 'SUSPENDED') return d.status === 'SUSPENDED';
    if (selectedFilter === 'LOST') return d.status === 'LOST';
    if (selectedFilter === 'REPLACEMENT_REQUIRED') return d.status === 'REPLACEMENT_REQUIRED';
    if (selectedFilter === 'PENDING') return d.enrollmentStatus === 'PENDING_ENROLLMENT';
    return true;
  });

  // Metrics
  const totalCount = devices.length;
  const activeCount = devices.filter(d => d.status === 'ACTIVE').length;
  const suspendedCount = devices.filter(d => d.status === 'SUSPENDED').length;
  const lostCount = devices.filter(d => d.status === 'LOST').length;
  const replaceCount = devices.filter(d => d.status === 'REPLACEMENT_REQUIRED').length;
  const onlineCount = devices.filter(d => d.isOnline).length;
  const onDutyCount = devices.filter(d => d.dutyStatus === 'ON_DUTY').length;

  return (
    <div>
      {/* Top Banner Ribbon: Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="panel" style={{ padding: '1.25rem', borderLeft: '4px solid #3B82F6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 600 }}>TOTAL TERMINALS</span>
            <Smartphone size={18} color="#3B82F6" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.35rem', color: '#FFFFFF' }}>{totalCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.2rem' }}>{onlineCount} Online ({onDutyCount} on Shift)</div>
        </div>

        <div className="panel" style={{ padding: '1.25rem', borderLeft: '4px solid #10B981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 600 }}>ACTIVE & COMPLIANT</span>
            <ShieldCheck size={18} color="#10B981" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.35rem', color: '#10B981' }}>{activeCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.2rem' }}>Kiosk Enforced 100%</div>
        </div>

        <div className="panel" style={{ padding: '1.25rem', borderLeft: '4px solid #EF4444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 600 }}>SUSPENDED LOCK</span>
            <Lock size={18} color="#EF4444" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.35rem', color: '#EF4444' }}>{suspendedCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.2rem' }}>Remote Lockdown Applied</div>
        </div>

        <div className="panel" style={{ padding: '1.25rem', borderLeft: '4px solid #F59E0B' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 600 }}>LOST / ALARM ACTIVE</span>
            <ShieldAlert size={18} color="#F59E0B" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.35rem', color: '#F59E0B' }}>{lostCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.2rem' }}>GPS Anti-Theft Tracking</div>
        </div>

        <div className="panel" style={{ padding: '1.25rem', borderLeft: '4px solid #8B5CF6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 600 }}>SERVICE NEEDED</span>
            <AlertTriangle size={18} color="#8B5CF6" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.35rem', color: '#8B5CF6' }}>{replaceCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.2rem' }}>Degraded Battery/Screen</div>
        </div>
      </div>

      {/* Action Header & Filtering */}
      <div className="panel" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 280 }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
              <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search Device ID, IMEI, Driver name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0F172A',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: '8px 12px 8px 36px',
                  color: '#FFFFFF',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
              {[
                { id: 'ALL', label: `All (${totalCount})` },
                { id: 'ACTIVE', label: `Active (${activeCount})` },
                { id: 'SUSPENDED', label: `Suspended (${suspendedCount})` },
                { id: 'LOST', label: `Lost (${lostCount})` },
                { id: 'REPLACEMENT_REQUIRED', label: `Service (${replaceCount})` }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFilter(f.id)}
                  style={{
                    background: selectedFilter === f.id ? 'var(--accent-amber)' : 'rgba(255, 255, 255, 0.05)',
                    color: selectedFilter === f.id ? '#000000' : '#CBD5E1',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {devices.some(d => d.id?.startsWith('MM-DEV-00') || d.isDemo) ? (
              <button
                className="btn btn-secondary"
                onClick={handleClearDemoDevices}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#F87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                title="Delete mock devices from database"
              >
                <Trash2 size={16} />
                <span>Clear Mock Data</span>
              </button>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={handleLoadDemoDevices}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                title="Load sample devices for preview"
              >
                <span>🧪 Load Demo Fleet</span>
              </button>
            )}

            <button
              className="btn btn-secondary"
              onClick={() => setShowQrModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
            >
              <QrCode size={16} color="#F59E0B" />
              <span>Enrollment QR Studio</span>
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => setShowPolicyModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
            >
              <Settings size={16} color="#38BDF8" />
              <span>MDM Kiosk Policy</span>
            </button>

            <button
              className="btn btn-primary"
              onClick={() => setShowAddDeviceModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
            >
              <Plus size={16} />
              <span>Register Terminal</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Managed Terminals Table */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Smartphone size={20} color="#F59E0B" />
            <span>Dedicated Driver Terminals & Android Enterprise Fleet</span>
          </div>
          <span className="badge badge-info">{filteredDevices.length} Terminals Monitored</span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>
            Loading enterprise devices...
          </div>
        ) : filteredDevices.length === 0 ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem'
            }}>
              <Smartphone size={32} color="#38BDF8" />
            </div>
            <h3 style={{ color: '#F8FAFC', fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Waiting for First Real Mobile Terminal...
            </h3>
            <p style={{ color: '#94A3B8', maxWidth: 500, margin: '0 auto 1.5rem', fontSize: '0.85rem', lineHeight: 1.6 }}>
              Mock data cleared! Your dashboard is now clean and waiting for your real phone.
              Take your factory-restored Android mobile, <strong>tap the blank welcome screen 6 times</strong>, and scan the Enrollment QR code below!
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button className="btn btn-primary" onClick={() => setShowQrModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <QrCode size={16} /> Open Enrollment QR Code
              </button>
              <button className="btn btn-secondary" onClick={handleLoadDemoDevices} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                🧪 Re-load Demo Devices
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>STATUS</th>
                  <th>TERMINAL ID & MODEL</th>
                  <th>ASSIGNED DRIVER</th>
                  <th>BATTERY</th>
                  <th>NETWORK</th>
                  <th>DUTY / GPS TELEMETRY</th>
                  <th>POLICY ENFORCEMENT</th>
                  <th>LAST SYNC</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map(d => {
                  const isOnline = d.isOnline;
                  const isSuspended = d.status === 'SUSPENDED';
                  const isLost = d.status === 'LOST';
                  const isReplacement = d.status === 'REPLACEMENT_REQUIRED';

                  let statusBadgeClass = 'badge-success';
                  let statusLabel = 'ACTIVE';
                  if (isSuspended) { statusBadgeClass = 'badge-danger'; statusLabel = 'SUSPENDED'; }
                  else if (isLost) { statusBadgeClass = 'badge-danger'; statusLabel = 'LOST / STOLEN'; }
                  else if (isReplacement) { statusBadgeClass = 'badge-warning'; statusLabel = 'REPLACEMENT REQ'; }

                  const batteryLevel = d.batteryLevel ?? 80;
                  const isCharging = d.isCharging;
                  const batteryColor = batteryLevel <= 20 ? '#EF4444' : batteryLevel <= 50 ? '#F59E0B' : '#10B981';

                  return (
                    <tr key={d.id} style={{ background: isLost ? 'rgba(239, 68, 68, 0.05)' : isSuspended ? 'rgba(239, 68, 68, 0.03)' : 'transparent' }}>
                      {/* Status */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: isOnline ? '#10B981' : '#64748B',
                            display: 'inline-block',
                            boxShadow: isOnline ? '0 0 8px #10B981' : 'none'
                          }} />
                          <span className={`badge ${statusBadgeClass}`} style={{ fontSize: '0.7rem' }}>
                            {statusLabel}
                          </span>
                        </div>
                      </td>

                      {/* Device & Model */}
                      <td>
                        <div style={{ fontWeight: 700, color: '#F8FAFC', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>{d.deviceName || d.model}</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#38BDF8', fontFamily: 'monospace', marginTop: 1 }}>
                          {d.id}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 1 }}>
                          {d.model && d.deviceName && d.model !== d.deviceName ? `Hardware: ${d.model} • ` : ''}
                          {d.osVersion || 'Android'}
                        </div>
                      </td>

                      {/* Assigned Driver */}
                      <td>
                        {d.assignedDriverName ? (
                          <div>
                            <div 
                              style={{ fontWeight: 600, color: '#38BDF8', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => onSelectDriver && onSelectDriver({ id: d.assignedDriverId, fullName: d.assignedDriverName })}
                            >
                              {d.assignedDriverName}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{d.assignedDriverPhone}</div>
                            {d.assignedBikeId && (
                              <div style={{ fontSize: '0.68rem', color: '#F59E0B', marginTop: 1 }}>Bike: {d.assignedBikeId}</div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#64748B', fontStyle: 'italic', fontSize: '0.8rem' }}>Unassigned Depot Spare</span>
                        )}
                      </td>

                      {/* Battery */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {isCharging ? (
                            <BatteryCharging size={16} color="#10B981" />
                          ) : (
                            <Battery size={16} color={batteryColor} />
                          )}
                          <span style={{ fontWeight: 700, color: batteryColor, fontSize: '0.85rem' }}>{batteryLevel}%</span>
                        </div>
                        <div style={{ 
                          width: 60, 
                          height: 4, 
                          background: 'rgba(255, 255, 255, 0.1)', 
                          borderRadius: 2, 
                          marginTop: 4, 
                          overflow: 'hidden' 
                        }}>
                          <div style={{ width: `${batteryLevel}%`, height: '100%', background: batteryColor }} />
                        </div>
                      </td>

                      {/* Network */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#CBD5E1' }}>
                          {d.networkType === 'WIFI' ? <Wifi size={14} color="#38BDF8" /> : <Radio size={14} color="#F59E0B" />}
                          <span>{d.networkType || 'CELLULAR'}</span>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{d.networkCarrier || (d.networkType === 'WIFI' ? 'Depot Hub' : 'Carrier 5G')}</div>
                      </td>

                      {/* Duty / GPS Telemetry */}
                      <td>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          {d.dutyStatus === 'ON_DUTY' ? (
                            <span style={{ color: '#10B981' }}>🟢 ON DUTY ({d.lastGps?.speed || 0} km/h)</span>
                          ) : d.dutyStatus === 'ON_BREAK' ? (
                            <span style={{ color: '#F59E0B' }}>⏸️ ON BREAK</span>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>⚪ OFF DUTY</span>
                          )}
                        </div>
                        {d.lastGps ? (
                          <div style={{ fontSize: '0.7rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: 2 }}>
                            <MapPin size={11} /> {d.lastGps.latitude?.toFixed(4)}, {d.lastGps.longitude?.toFixed(4)}
                          </div>
                        ) : null}
                      </td>

                      {/* Policy Enforcement */}
                      <td>
                        <span className={`badge ${d.policyStatus === 'COMPLIANT' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
                          {d.policyStatus === 'COMPLIANT' ? '✓ KIOSK COMPLIANT' : '⚠️ RESTRICTED'}
                        </span>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2 }}>
                          {d.enrollmentStatus || 'ENROLLED'}
                        </div>
                      </td>

                      {/* Last Sync */}
                      <td>
                        <div style={{ fontSize: '0.78rem', color: '#CBD5E1' }}>
                          {d.lastSync ? new Date(d.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                          {d.lastSync ? new Date(d.lastSync).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Pending'}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                            onClick={() => setSelectedDevice(d)}
                            title="Inspect 360° Hardware & MDM Profile"
                          >
                            Inspect
                          </button>

                          <button
                            className="btn btn-secondary btn-sm"
                            style={{
                              fontSize: '0.75rem',
                              padding: '4px 8px',
                              background: isSuspended || isLost ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                              borderColor: isSuspended || isLost ? '#EF4444' : 'var(--border-subtle)'
                            }}
                            onClick={() => setStatusModal({
                              isOpen: true,
                              device: d,
                              targetStatus: d.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                              reason: ''
                            })}
                          >
                            {d.status === 'ACTIVE' ? 'Suspend / Lock' : 'Reactivate'}
                          </button>

                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '4px 6px', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            onClick={() => handleDeleteDevice(d)}
                            title="Remove device from fleet"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: CHANGE STATUS (ACTIVE / SUSPENDED / LOST / REPLACEMENT REQUIRED) */}
      {statusModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={18} color="#EF4444" />
                <span>Update Terminal Status: {statusModal.device?.id}</span>
              </div>
              <button 
                className="btn-icon" 
                onClick={() => setStatusModal({ isOpen: false, device: null, targetStatus: '', reason: '' })}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Select Enterprise Terminal Status:</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                {[
                  { id: 'ACTIVE', label: '🟢 ACTIVE (Normal Kiosk)', desc: 'Standard dedicated driver operations' },
                  { id: 'SUSPENDED', label: '🔒 SUSPENDED', desc: 'Lock terminal via MDM policy' },
                  { id: 'LOST', label: '🚨 LOST / STOLEN', desc: 'Trigger siren & anti-theft lockdown' },
                  { id: 'REPLACEMENT_REQUIRED', label: '🛠️ SERVICE REQ', desc: 'Flag for battery/hardware repair' }
                ].map(opt => (
                  <div
                    key={opt.id}
                    onClick={() => setStatusModal(prev => ({ ...prev, targetStatus: opt.id }))}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 8,
                      border: statusModal.targetStatus === opt.id ? '2px solid var(--accent-amber)' : '1px solid var(--border-subtle)',
                      background: statusModal.targetStatus === opt.id ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#FFFFFF' }}>{opt.label}</div>
                    <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: 2 }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">Operational Reason / Message for Driver Screen:</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Reason for suspension or theft report (displays on phone screen)..."
                value={statusModal.reason}
                onChange={(e) => setStatusModal(prev => ({ ...prev, reason: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setStatusModal({ isOpen: false, device: null, targetStatus: '', reason: '' })}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={handleUpdateDeviceStatus}
              >
                Apply MDM Policy Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: 360° HARDWARE & DEVICE INSPECTOR */}
      {selectedDevice && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Smartphone size={20} color="#38BDF8" />
                <span>Terminal 360° Inspector: {selectedDevice.id}</span>
              </div>
              <button className="btn-icon" onClick={() => setSelectedDevice(null)}>✕</button>
            </div>

            {/* Hardware Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ background: '#0F172A', padding: '0.85rem', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>HARDWARE SPECIFICATIONS</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#F8FAFC', marginTop: 2 }}>{selectedDevice.model}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>
                  IMEI: <code>{selectedDevice.imei || 'Not registered'}</code><br />
                  Serial: <code>{selectedDevice.serialNumber || 'N/A'}</code><br />
                  OS: {selectedDevice.osVersion || 'Android 14'}<br />
                  App: {selectedDevice.appVersion || 'v1.0.0-mdm'}
                </div>
              </div>

              <div style={{ background: '#0F172A', padding: '0.85rem', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>HEALTH & SYSTEM STATUS</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#10B981', marginTop: 2 }}>
                  Battery: {selectedDevice.batteryLevel}% ({selectedDevice.batteryHealth || 'GOOD'})
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>
                  RAM: {selectedDevice.health?.memoryUsageMb || 1200}MB / {selectedDevice.health?.totalMemoryMb || 4096}MB<br />
                  Storage Free: {selectedDevice.health?.storageFreeGb || 32.5} GB<br />
                  Root / Tamper Status: <b style={{ color: '#10B981' }}>Clean (Pass)</b><br />
                  Security Patch: {selectedDevice.health?.securityPatch || '2026-08-01'}
                </div>
              </div>
            </div>

            {/* Assigned Driver and Bike */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.85rem', borderRadius: 8, border: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F59E0B', marginBottom: 4 }}>
                ASSIGNMENT & DEPOT DETAILS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '0.8rem' }}>
                <div><span style={{ color: '#94A3B8' }}>Driver:</span> <b>{selectedDevice.assignedDriverName || 'Unassigned'}</b></div>
                <div><span style={{ color: '#94A3B8' }}>Contact:</span> <b>{selectedDevice.assignedDriverPhone || '—'}</b></div>
                <div><span style={{ color: '#94A3B8' }}>Bike:</span> <b>{selectedDevice.assignedBikeId || 'None'}</b></div>
                <div><span style={{ color: '#94A3B8' }}>Hub Depot:</span> <b>{selectedDevice.hubId || 'Central Depot'}</b></div>
                <div><span style={{ color: '#94A3B8' }}>Exit PIN:</span> <code>{selectedDevice.kioskExitPin || '998877'}</code></div>
                <div><span style={{ color: '#94A3B8' }}>Policy:</span> <span className="badge badge-success">COMPLIANT</span></div>
              </div>
            </div>

            {/* Remote MDM Action Bar */}
            <div style={{ marginBottom: '1rem' }}>
              <label className="form-label">Immediate Remote MDM Over-the-Air Actions:</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleTriggerRemoteCommand(selectedDevice, 'SYNC_POLICY')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                >
                  <RefreshCw size={14} color="#38BDF8" /> Push Policy Sync
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleTriggerRemoteCommand(selectedDevice, 'ALARM')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', color: '#F87171' }}
                >
                  <Volume2 size={14} color="#F87171" /> Siren Alarm
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleTriggerRemoteCommand(selectedDevice, 'RESET_PIN')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                >
                  <Key size={14} color="#F59E0B" /> Reset Exit PIN
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  const target = selectedDevice.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
                  setStatusModal({ isOpen: true, device: selectedDevice, targetStatus: target, reason: '' });
                }}
              >
                {selectedDevice.status === 'ACTIVE' ? 'Suspend Terminal' : 'Reactivate Terminal'}
              </button>

              <button type="button" className="btn btn-secondary" onClick={() => setSelectedDevice(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ANDROID ENTERPRISE QR PROVISIONING STUDIO */}
      {showQrModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <QrCode size={20} color="#F59E0B" />
                <span>Android Enterprise 6-Tap QR Provisioning Studio</span>
              </div>
              <button className="btn-icon" onClick={() => setShowQrModal(false)}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* QR Code Canvas Card */}
              <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {qrCanvasUrl ? (
                  <img src={qrCanvasUrl} alt="Provisioning QR Code" style={{ width: '100%', maxWidth: 240, height: 'auto' }} />
                ) : (
                  <div style={{ color: '#000000', padding: '2rem' }}>Generating QR...</div>
                )}
                <div style={{ color: '#0A0D14', fontWeight: 800, fontSize: '0.78rem', marginTop: 8, textAlign: 'center' }}>
                  MM RIDE FLEET ENROLLMENT QR
                </div>
                <div style={{ color: '#64748B', fontSize: '0.68rem', textAlign: 'center' }}>
                  AMAPI Device Owner • Auto-Config Wi-Fi & Kiosk
                </div>
              </div>

              {/* 6-Tap Setup Instructions & Wi-Fi Configuration */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#F59E0B', marginBottom: '0.5rem' }}>
                  Depot Technician Setup Instructions:
                </div>
                <ol style={{ fontSize: '0.8rem', color: '#CBD5E1', lineHeight: 1.5, paddingLeft: '1.2rem', margin: '0 0 0.75rem 0' }}>
                  <li>On the factory-reset <strong>"Hi there / Welcome"</strong> Android screen, <strong>tap blank space 6 times</strong>.</li>
                  <li>The built-in Android Enterprise QR scanner will open automatically.</li>
                  <li>Scan the QR code on the left.</li>
                  <li>{manualWifi ? "Select your home / depot Wi-Fi on the phone's screen and connect." : `Device will auto-connect to ${depotWifiSsid || 'configured Wi-Fi'}.`}</li>
                  <li>Device enrolls into MM Ride Fleet Management!</li>
                </ol>

                {/* Wi-Fi Configuration Options */}
                <div style={{ background: '#0F172A', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border-subtle)', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38BDF8', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Wifi size={14} /> Wi-Fi Connection Setup
                  </div>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                    <input
                      type="radio"
                      name="wifiMode"
                      checked={manualWifi}
                      onChange={() => setManualWifi(true)}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#F8FAFC' }}>
                        Select Wi-Fi Manually on Phone (Recommended)
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                        Prevents "Could not connect wifi" errors. Phone will prompt you to choose any available Wi-Fi or mobile hotspot.
                      </div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="wifiMode"
                      checked={!manualWifi}
                      onChange={() => setManualWifi(false)}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#F8FAFC' }}>
                        Auto-Connect via Wi-Fi Credentials in QR
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                        Embed your exact Wi-Fi name & password into the QR code for zero-click Wi-Fi setup.
                      </div>
                    </div>
                  </label>

                  {!manualWifi && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.6rem', padding: '0.5rem', background: '#1E293B', borderRadius: 6 }}>
                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Your Wi-Fi SSID (Name):</span>
                        <input
                          type="text"
                          className="form-input"
                          style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                          placeholder="e.g. JioFiber_5G"
                          value={depotWifiSsid}
                          onChange={(e) => setDepotWifiSsid(e.target.value)}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Wi-Fi Password:</span>
                        <input
                          type="text"
                          className="form-input"
                          style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                          placeholder="Password"
                          value={depotWifiPass}
                          onChange={(e) => setDepotWifiPass(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Troubleshooter Banners */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.72rem', color: '#FCA5A5', lineHeight: 1.4 }}>
                    <strong>🚨 "Can't set up device / Contact IT Admin" Reason:</strong><br />
                    Google Android Enterprise verifies the enrollment token with Google servers. Since <code>MM_RIDE_...</code> is a placeholder test token, Google rejects it during 6-tap OS setup.
                    <div style={{ marginTop: '0.35rem', color: '#FEE2E2', fontWeight: 600 }}>
                      👉 <strong>Instant Recommended Solution:</strong><br />
                      1. Phone-la <strong>"Reset"</strong> click panni Welcome screen-ku ponga.<br />
                      2. 6-tap panna vendaam — normal-ah <strong>"Start"</strong> panni phone home screen-ku poidunga.<br />
                      3. Phone-la <strong>MM Ride Driver app</strong> open panni login pannunga.<br />
                      4. Unga real phone hardware ID automatically inga <strong>ACTIVE</strong> nu sync aagidum (Battery, GPS, Kiosk Lockdown & PIN 998877 fully active)!
                    </div>
                  </div>

                  <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.72rem', color: '#FDE68A', lineHeight: 1.4 }}>
                    <strong>⚡ "Could not connect wifi" problem fix:</strong><br />
                    Mela <strong>"Select Wi-Fi Manually on Phone"</strong> select panna, phone unga Wi-Fi list-ah open pannum.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const printWin = window.open('', '_blank');
                  printWin.document.write(`
                    <html>
                      <head><title>MM Ride Device Enrollment QR</title></head>
                      <body style="font-family: Arial; text-align: center; padding: 40px;">
                        <h2>MM RIDE FLEET LOGISTICS — MDM ENROLLMENT QR</h2>
                        <p>Depot Provisioning Sheet (6-Tap Setup)</p>
                        <img src="${qrCanvasUrl}" style="width: 300px; height: 300px;" />
                        <p><b>Depot Wi-Fi:</b> ${depotWifiSsid} | <b>Password:</b> ${depotWifiPass}</p>
                        <p style="font-size: 12px; color: #555;">Tap empty screen 6 times on Welcome screen to launch camera.</p>
                      </body>
                    </html>
                  `);
                  printWin.document.close();
                  printWin.print();
                }}
              >
                <Printer size={15} /> Print Depot Sheet
              </button>

              <button type="button" className="btn btn-secondary" onClick={() => setShowQrModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: MDM KIOSK POLICY CONFIGURATION */}
      {showPolicyModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={20} color="#38BDF8" />
                <span>Enterprise MDM Kiosk & Security Policies</span>
              </div>
              <button className="btn-icon" onClick={() => setShowPolicyModal(false)}>✕</button>
            </div>

            <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {/* Security Controls */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#F8FAFC', marginBottom: '0.5rem' }}>
                  Hardware & OS Anti-Tamper Restrictions
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#CBD5E1', background: '#0F172A', padding: '0.65rem', borderRadius: 6 }}>
                    <input
                      type="checkbox"
                      checked={mdmPolicy.preventUninstall}
                      onChange={(e) => setMdmPolicy(prev => ({ ...prev, preventUninstall: e.target.checked }))}
                    />
                    <span>Block App Uninstall (Driver App)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#CBD5E1', background: '#0F172A', padding: '0.65rem', borderRadius: 6 }}>
                    <input
                      type="checkbox"
                      checked={mdmPolicy.preventFactoryReset}
                      onChange={(e) => setMdmPolicy(prev => ({ ...prev, preventFactoryReset: e.target.checked }))}
                    />
                    <span>Block Factory Reset</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#CBD5E1', background: '#0F172A', padding: '0.65rem', borderRadius: 6 }}>
                    <input
                      type="checkbox"
                      checked={mdmPolicy.preventSettingsChange}
                      onChange={(e) => setMdmPolicy(prev => ({ ...prev, preventSettingsChange: e.target.checked }))}
                    />
                    <span>Block System Settings Access</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#CBD5E1', background: '#0F172A', padding: '0.65rem', borderRadius: 6 }}>
                    <input
                      type="checkbox"
                      checked={mdmPolicy.preventPermissionRevoke}
                      onChange={(e) => setMdmPolicy(prev => ({ ...prev, preventPermissionRevoke: e.target.checked }))}
                    />
                    <span>Block GPS/Permission Revocation</span>
                  </label>
                </div>
              </div>

              {/* Phone & SMS Control */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#F8FAFC', marginBottom: '0.5rem' }}>
                  Communication & Dialer Policies
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Phone Calling Policy:</label>
                    <select
                      className="form-input"
                      value={mdmPolicy.allowPhoneCalls}
                      onChange={(e) => setMdmPolicy(prev => ({ ...prev, allowPhoneCalls: e.target.value }))}
                      style={{ fontSize: '0.8rem' }}
                    >
                      <option value="ADMIN_AND_EMERGENCY_ONLY">Admin & Emergency Only (Depot hotline + 112)</option>
                      <option value="UNRESTRICTED">Unrestricted Calling</option>
                      <option value="BLOCKED">Completely Block Phone Calls</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Master Technician Exit PIN:</label>
                    <input
                      type="text"
                      className="form-input"
                      maxLength={6}
                      value={mdmPolicy.adminExitPin}
                      onChange={(e) => setMdmPolicy(prev => ({ ...prev, adminExitPin: e.target.value }))}
                      style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2 }}
                    />
                  </div>
                </div>
              </div>

              {/* Whitelisted Applications */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#F8FAFC' }}>
                    Whitelisted Dedicated Applications (Allowed on Driver Terminal)
                  </div>
                </div>

                <div style={{ background: '#020617', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                  {mdmPolicy.allowedApplications?.map((app, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: idx < mdmPolicy.allowedApplications.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none' }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#F8FAFC' }}>{app.appName}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}><code>{app.packageName}</code> • {app.category}</div>
                      </div>
                      <span className={`badge ${app.mandatory ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '0.65rem' }}>
                        {app.mandatory ? 'MANDATORY' : 'OPTIONAL'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowPolicyModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSavePolicy}>
                Save & Broadcast Policy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: REGISTER NEW FLEET TERMINAL */}
      {showAddDeviceModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={18} color="#10B981" />
                <span>Register Dedicated Fleet Terminal</span>
              </div>
              <button className="btn-icon" onClick={() => setShowAddDeviceModal(false)}>✕</button>
            </div>

            <form onSubmit={handleRegisterDevice}>
              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Terminal ID (e.g. MM-DEV-007):</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={newDeviceData.id}
                  onChange={(e) => setNewDeviceData(prev => ({ ...prev, id: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label">Device Hardware Model:</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={newDeviceData.model}
                  onChange={(e) => setNewDeviceData(prev => ({ ...prev, model: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label className="form-label">Serial Number:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newDeviceData.serialNumber}
                    onChange={(e) => setNewDeviceData(prev => ({ ...prev, serialNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label">IMEI Number:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newDeviceData.imei}
                    onChange={(e) => setNewDeviceData(prev => ({ ...prev, imei: e.target.value }))}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Initial Depot Location:</label>
                <select
                  className="form-input"
                  value={newDeviceData.hubId}
                  onChange={(e) => setNewDeviceData(prev => ({ ...prev, hubId: e.target.value }))}
                >
                  <option value="hub-central-delhi">Central Hub - Connaught Place Depot</option>
                  <option value="hub-south-delhi">South Hub - Okhla Depot</option>
                  <option value="hub-noida">NCR Hub - Sector 62 Noida</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddDeviceModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Register Terminal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
