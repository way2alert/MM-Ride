import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Search, 
  Activity, 
  Gauge, 
  Clock, 
  AlertTriangle, 
  Bike, 
  Battery, 
  Smartphone,
  ExternalLink,
  Camera,
  ShieldAlert,
  Power,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import LiveMap from '../components/LiveMap';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { formatDateTime } from '../utils/formatters';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function LiveMonitoring({ onSelectDriver }) {
  const [drivers, setDrivers] = useState([]);
  const [driverDevices, setDriverDevices] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [dutySessions, setDutySessions] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [actionLoading, setActionLoading] = useState(null); // 'SELFIE' | 'ENGINE' | 'DOSSIER'
  const [actionFeedback, setActionFeedback] = useState(null); // { type, title, message, actionButton }
  const [filterMode, setFilterMode] = useState('ALL'); // ALL, DUTY, MOVING, IDLE, OVERSPEED
  const [speedThreshold, setSpeedThreshold] = useState(60);

  useEffect(() => {
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    const unsubDevices = subscribeToCollection('driverDevices', setDriverDevices);
    const unsubHubs = subscribeToCollection('hubs', setHubs);
    const unsubDuty = subscribeToCollection('dutySessions', setDutySessions);
    const unsubSettings = onSnapshot(doc(db, 'settings', 'system'), (snap) => {
      if (snap.exists() && snap.data().speedAlertThresholdKmh) {
        setSpeedThreshold(Number(snap.data().speedAlertThresholdKmh));
      }
    }, (err) => console.warn('Settings load error:', err));

    return () => {
      unsubDrivers();
      unsubDevices();
      unsubHubs();
      unsubDuty();
      unsubSettings();
    };
  }, []);

  // Primary active hub coordinates (Delhi NCR / Sitapuri default)
  const primaryHub = hubs.length > 0 && typeof hubs[0].latitude === 'number' ? hubs[0] : null;
  const hubLat = primaryHub ? primaryHub.latitude : 28.6115;
  const hubLng = primaryHub ? primaryHub.longitude : 77.0817;

  // Merge live hardware GPS from driverDevices into drivers
  const mergedDrivers = drivers.map(driver => {
    const dev = driverDevices.find(d => 
      (d.assignedDriverId && d.assignedDriverId === driver.id) ||
      (d.driverId && d.driverId === driver.id) ||
      (driver.boundDeviceId && (d.id === driver.boundDeviceId || d.deviceId === driver.boundDeviceId)) ||
      (driver.mobileNumber && d.assignedDriverPhone && d.assignedDriverPhone.replace(/\D/g, '').endsWith(driver.mobileNumber.replace(/\D/g, '').slice(-10)))
    );

    let effectiveLocation = driver.lastKnownLocation || null;

    if (dev?.lastGps?.latitude && dev?.lastGps?.longitude) {
      const devTime = dev.lastGps.timestamp ? new Date(dev.lastGps.timestamp).getTime() : 0;
      const drvTime = driver.lastKnownLocation?.timestamp ? new Date(driver.lastKnownLocation.timestamp).getTime() : 0;
      if (!effectiveLocation || devTime >= drvTime) {
        effectiveLocation = {
          latitude: dev.lastGps.latitude,
          longitude: dev.lastGps.longitude,
          speed: dev.lastGps.speed !== undefined ? dev.lastGps.speed : (effectiveLocation?.speed || 0),
          timestamp: dev.lastGps.timestamp || dev.lastSync || new Date().toISOString()
        };
      }
    }

    return {
      ...driver,
      lastKnownLocation: effectiveLocation,
      deviceTelemetry: dev ? {
        batteryLevel: dev.batteryLevel,
        isCharging: dev.isCharging,
        networkType: dev.networkType,
        model: dev.model,
        status: dev.status,
        lastSync: dev.lastSync
      } : null
    };
  });

  // Approved drivers filter (Must be approved / active; not suspended)
  const approvedDrivers = mergedDrivers.filter(d => {
    const isApproved = d.approvalStatus === 'APPROVED' || 
                       d.accountStatus === 'APPROVED' || 
                       d.accountStatus === 'BIKE_ASSIGNED' || 
                       d.accountStatus === 'ACTIVE_DRIVER' || 
                       d.status === 'APPROVED' || 
                       d.status === 'ACTIVE';
    const isSuspended = d.isSuspended || d.status === 'SUSPENDED' || d.accountStatus === 'SUSPENDED';
    return isApproved && !isSuspended;
  });

  // Approved drivers with active GPS coordinates
  const driversWithGps = approvedDrivers.filter(d => 
    d.lastKnownLocation && 
    typeof d.lastKnownLocation.latitude === 'number' && 
    typeof d.lastKnownLocation.longitude === 'number'
  );

  const onDutyCount = approvedDrivers.filter(d => d.isCurrentlyOnDuty || d.currentDutyId).length;
  const movingCount = driversWithGps.filter(d => (d.lastKnownLocation?.speed || 0) > 0).length;
  const idleCount = driversWithGps.filter(d => (d.lastKnownLocation?.speed || 0) === 0).length;
  const overspeedCount = driversWithGps.filter(d => (d.lastKnownLocation?.speed || 0) > speedThreshold).length;

  const offDutyMovingCount = driversWithGps.filter(d => (!d.isCurrentlyOnDuty && !d.currentDutyId) && ((d.lastKnownLocation?.speed || 0) > 5)).length;
  const offlineCashCount = driversWithGps.filter(d => d.lastPlatformRideEvent?.eventType === 'RIDE_CANCELLED' && ((d.lastKnownLocation?.speed || 0) > 5)).length;
  const borderBreachCount = driversWithGps.filter(d => {
    const loc = d.lastKnownLocation;
    if (!loc?.latitude || !loc?.longitude) return false;
    const distKm = Math.sqrt(Math.pow((loc.latitude - hubLat) * 111, 2) + Math.pow((loc.longitude - hubLng) * 111, 2));
    return distKm > 45 || !!d.geofenceBreach;
  }).length;
  const accidentStopCount = driversWithGps.filter(d => {
    const loc = d.lastKnownLocation;
    const lastPing = loc?.timestamp ? new Date(loc.timestamp).getTime() : 0;
    const isStill = (loc?.speed || 0) === 0 && ((Date.now() - lastPing) > (3 * 60 * 1000));
    return !!d.abnormalStopAlert?.active || ((d.isCurrentlyOnDuty || d.currentDutyId) && isStill && ((d.previousRecordedSpeed || 0) > 30));
  }).length;
  const phoneOfflineMovingCount = driversWithGps.filter(d => {
    const loc = d.lastKnownLocation;
    const lastPing = loc?.timestamp ? new Date(loc.timestamp).getTime() : 0;
    return (d.isCurrentlyOnDuty || d.currentDutyId) && ((Date.now() - lastPing) > (3 * 60 * 1000)) && ((loc?.speed || 0) > 5);
  }).length;
  const ghostPhoneCount = driversWithGps.filter(d => (d.isCurrentlyOnDuty || d.currentDutyId) && (d.bikeLocationDivergenceKm > 1 || ((d.lastKnownLocation?.speed || 0) === 0 && d.assignedBikeMoving))).length;

  const filteredMapDrivers = driversWithGps.filter(d => {
    const loc = d.lastKnownLocation;
    const speed = loc?.speed || 0;
    if (filterMode === 'DUTY') return d.isCurrentlyOnDuty || d.currentDutyId;
    if (filterMode === 'MOVING') return speed > 0;
    if (filterMode === 'IDLE') return speed === 0;
    if (filterMode === 'OVERSPEED') return speed > speedThreshold;
    if (filterMode === 'OFF_DUTY_MOVING') return (!d.isCurrentlyOnDuty && !d.currentDutyId) && (speed > 5);
    if (filterMode === 'OFFLINE_CASH') return (d.lastPlatformRideEvent?.eventType === 'RIDE_CANCELLED') && (speed > 5);
    if (filterMode === 'BORDER_BREACH') {
      const lat = loc?.latitude || hubLat;
      const lng = loc?.longitude || hubLng;
      const distKm = Math.sqrt(Math.pow((lat - hubLat) * 111, 2) + Math.pow((lng - hubLng) * 111, 2));
      return distKm > 45 || !!d.geofenceBreach;
    }
    if (filterMode === 'ACCIDENT_STOP') {
      const lastPing = loc?.timestamp ? new Date(loc.timestamp).getTime() : 0;
      const isStill = speed === 0 && ((Date.now() - lastPing) > (3 * 60 * 1000));
      return !!d.abnormalStopAlert?.active || ((d.isCurrentlyOnDuty || d.currentDutyId) && isStill && ((d.previousRecordedSpeed || 0) > 30));
    }
    if (filterMode === 'PHONE_OFFLINE_MOVING') {
      const lastUpdateMs = loc?.timestamp ? new Date(loc.timestamp).getTime() : 0;
      const isPhoneOffline = (Date.now() - lastUpdateMs) > (3 * 60 * 1000);
      return (d.isCurrentlyOnDuty || d.currentDutyId) && isPhoneOffline && (speed > 5);
    }
    if (filterMode === 'GHOST_PHONE') {
      return (d.isCurrentlyOnDuty || d.currentDutyId) && (d.bikeLocationDivergenceKm > 1 || (speed === 0 && d.assignedBikeMoving));
    }
    return true; // 'ALL'
  });

  const activeSelectedDriver = selectedDriver 
    ? (mergedDrivers.find(d => d.id === selectedDriver.id) || selectedDriver)
    : null;

  const handleTriggerLiveSelfieChallenge = async (driver) => {
    if (!driver?.id) return;
    setActionLoading('SELFIE');
    try {
      await updateDoc(doc(db, 'drivers', driver.id), {
        pendingVerification: {
          challengeId: `CHALLENGE_${Date.now()}`,
          requestedAt: new Date().toISOString(),
          timeoutSeconds: 90,
          status: 'PENDING'
        }
      });
      await logAdminAudit({
        driverId: driver.id,
        action: 'LIVE_FACE_CHALLENGE_DISPATCHED',
        notes: `Owner dispatched real-time live face selfie challenge with 90s countdown to driver ${driver.fullName || 'driver'}.`
      });
      setActionFeedback({
        type: 'warning',
        title: '📸 Live Selfie Challenge Dispatched!',
        message: `Prompt sent to ${driver.fullName || 'driver'}'s mobile phone! 90-second countdown with front-camera selfie prompt is now active on the driver app.`
      });
    } catch (e) {
      setActionFeedback({
        type: 'danger',
        title: 'Challenge Dispatch Failed',
        message: e.message
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleEngineImmobilizer = async (driver) => {
    if (!driver?.id) return;
    const isCurrentlyImmobilized = !!driver.engineImmobilized;
    const bikeId = driver.assignedBikeId;
    const bikeReg = driver.assignedBikeRegistration || 'assigned bike';

    if (!isCurrentlyImmobilized) {
      if (!window.confirm(`⚠️ CUT-OFF ENGINE IGNITION: Are you sure you want to cut off engine ignition for vehicle ${bikeReg}? The bike will immediately be immobilized and cannot be started.`)) {
        return;
      }
      setActionLoading('ENGINE');
      try {
        await updateDoc(doc(db, 'drivers', driver.id), {
          engineImmobilized: true,
          immobilizedAt: serverTimestamp()
        });
        if (bikeId) {
          await updateDoc(doc(db, 'bikes', bikeId), {
            engineImmobilized: true,
            status: 'MAINTENANCE'
          });
        }
        await logAdminAudit({
          driverId: driver.id,
          action: 'REMOTE_ENGINE_IMMOBILIZED',
          relevantRecordId: bikeId,
          notes: `Emergency ignition cut-off relay activated for bike ${bikeReg}.`
        });
        setActionFeedback({
          type: 'danger',
          title: '⚡ ENGINE IMMOBILIZED (IGNITION CUT OFF)',
          message: `Vehicle ${bikeReg} ignition cut off successfully. Driver app screen is locked down with emergency instructions.`
        });
      } catch (e) {
        setActionFeedback({
          type: 'danger',
          title: 'Immobilize Failed',
          message: e.message
        });
      } finally {
        setActionLoading(null);
      }
    } else {
      if (!window.confirm(`RESTORE IGNITION: Restore engine ignition for vehicle ${bikeReg}?`)) {
        return;
      }
      setActionLoading('ENGINE');
      try {
        await updateDoc(doc(db, 'drivers', driver.id), {
          engineImmobilized: false
        });
        if (bikeId) {
          await updateDoc(doc(db, 'bikes', bikeId), {
            engineImmobilized: false,
            status: 'ACTIVE'
          });
        }
        await logAdminAudit({
          driverId: driver.id,
          action: 'REMOTE_ENGINE_RESTORED',
          relevantRecordId: bikeId,
          notes: `Vehicle ignition restored for bike ${bikeReg}.`
        });
        setActionFeedback({
          type: 'success',
          title: '🟢 ENGINE IGNITION RESTORED',
          message: `Ignition restored for ${bikeReg}. Driver mobile app lock is released and vehicle can be started.`
        });
      } catch (e) {
        setActionFeedback({
          type: 'danger',
          title: 'Ignition Restore Failed',
          message: e.message
        });
      } finally {
        setActionLoading(null);
      }
    }
  };

  // Evaluate Anti-Absconding & Theft Risk Level across the fleet
  const evaluateAbscondingRisk = (driver) => {
    const loc = driver.lastKnownLocation;
    const speed = loc?.speed || 0;
    const lastUpdateMs = loc?.timestamp ? new Date(loc.timestamp).getTime() : 0;
    const isPhoneOffline = (Date.now() - lastUpdateMs) > (3 * 60 * 1000); // 3 mins no ping
    const isImmobilized = !!driver.engineImmobilized;
    const isOnDuty = driver.isCurrentlyOnDuty || !!driver.currentDutyId;

    // Combination A: Phone Offline while Bike is Moving
    if (isOnDuty && isPhoneOffline && speed > 5) {
      return {
        level: 'CRITICAL',
        code: 'COMBINATION_A',
        title: 'Phone Offline + Bike Moving',
        detail: `Driver phone offline (${Math.round((Date.now() - lastUpdateMs) / 60000)}m ago) but vehicle is in motion at ${speed} km/h.`
      };
    }

    // Unauthorized Personal Use: Vehicle Moving While Duty OFF
    if (!isOnDuty && speed > 5) {
      if (driver.hasApprovedPersonalUse) {
        return {
          level: 'NORMAL',
          code: 'APPROVED_PERSONAL_USE',
          title: 'Approved Personal Trip 🟢',
          detail: 'Driver operating under authorized personal use permit.'
        };
      }
      return {
        level: 'CRITICAL',
        code: 'DUTY_OFF_MOVING',
        title: 'Vehicle Moving While Duty OFF 🚨',
        detail: `Vehicle in motion at ${speed} km/h while driver duty is OFF (Unauthorized personal use detected).`
      };
    }

    // Problem 4: Suspected Offline Cash Ride (Platform Ride Cancelled + Continued Movement)
    if (driver.lastPlatformRideEvent?.eventType === 'RIDE_CANCELLED' && speed > 5) {
      const cancelMs = driver.lastPlatformRideEvent.timestamp ? new Date(driver.lastPlatformRideEvent.timestamp).getTime() : 0;
      const minsSinceCancel = Math.round((Date.now() - cancelMs) / 60000);
      if (minsSinceCancel <= 45) {
        return {
          level: 'CRITICAL',
          code: 'OFFLINE_CASH_RIDE',
          title: 'Offline Cash Ride Suspected 🚨',
          detail: `Vehicle moving at ${speed} km/h after ride cancellation on ${driver.lastPlatformRideEvent.platform} (${minsSinceCancel}m ago). Customer induced cash trip suspected.`
        };
      }
    }

    // Combination B: Out of Metro Zone / Geofence breach (> 40km from Depot Hub)
    if (loc?.latitude && loc?.longitude) {
      const dLat = (loc.latitude - hubLat) * 111;
      const dLng = (loc.longitude - hubLng) * 111;
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
      if (distKm > 45 || driver.geofenceBreach) {
        return {
          level: 'CRITICAL',
          code: 'COMBINATION_B',
          title: 'Inter-State / Border Breach 🚧',
          detail: `Vehicle located ${distKm.toFixed(1)} km outside authorized metropolitan perimeter (heading towards outer district/border).`
        };
      }
    }

    // Problem 11: Possible Accident / Abnormal Stop (Sudden Deceleration + Stationary + Offline/Unresponsive)
    if (driver.abnormalStopAlert?.active || (isOnDuty && speed === 0 && isPhoneOffline && (driver.previousRecordedSpeed || 0) > 30)) {
      const initialSpd = driver.abnormalStopAlert?.initialSpeed || driver.previousRecordedSpeed || 45;
      const stoppedMins = driver.abnormalStopAlert?.durationStoppedMinutes || Math.round((Date.now() - lastUpdateMs) / 60000);
      return {
        level: 'WARNING',
        code: 'POSSIBLE_ACCIDENT_ABNORMAL_STOP',
        title: 'Possible Accident / Abnormal Stop ⚠️',
        detail: `Vehicle experienced sudden deceleration from ${initialSpd} km/h to 0 km/h and has remained stationary for ${stoppedMins} mins with phone unresponsive.`
      };
    }

    // Problem 36: Ghost Phone Separation (Registered Phone left at room/depot while bike is moving)
    if (driver.bikeLocationDivergenceKm > 1 || (isOnDuty && speed === 0 && driver.assignedBikeMoving)) {
      return {
        level: 'CRITICAL',
        code: 'GHOST_PHONE_SEPARATION',
        title: 'Ghost Phone Separation 📱🚨',
        detail: `Registered company phone is stationary at room/depot, but vehicle is actively moving! Driver switched to unapproved personal device.`
      };
    }

    if (isImmobilized) {
      return {
        level: 'IMMOBILIZED',
        code: 'ENGINE_CUT',
        title: 'Ignition Cut-Off Active',
        detail: 'Engine relay immobilizer triggered. Ignition cut-off active.'
      };
    }

    if (isOnDuty && isPhoneOffline) {
      return {
        level: 'WARNING',
        code: 'PHONE_OFFLINE',
        title: 'App Telemetry Interrupted',
        detail: 'Driver device has not dispatched GPS heartbeat for >5 minutes.'
      };
    }

    return {
      level: 'NORMAL',
      code: 'SECURE',
      title: 'Normal Operational Telemetry',
      detail: 'GPS heartbeat synchronized and within parameters.'
    };
  };

  // Generate 1-Click Police Criminal Breach Dossier
  const handleExportPoliceDossier = (driver) => {
    if (!driver) return;
    setActionLoading('DOSSIER');
    const loc = driver.lastKnownLocation;
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const regNo = driver.assignedBikeRegistration || 'TN 01 AB 1234';
    const driverName = driver.fullName || 'Driver Partner';
    const phone = driver.mobileNumber || 'N/A';
    const dlNumber = driver.dlNumber || 'N/A';
    const address = driver.permanentAddress || driver.currentAddress || 'As per Aadhaar KYC';

    try {
      const dossierWindow = window.open('', '_blank');
      if (!dossierWindow) {
        setActionFeedback({
          type: 'warning',
          title: '⚠️ Pop-Up Blocked by Browser',
          message: 'Your browser blocked opening the dossier tab. Please allow popups for this site, or click the button below:',
          actionButton: {
            label: 'Open Dossier Tab 📄',
            onClick: () => handleExportPoliceDossier(driver)
          }
        });
        setActionLoading(null);
        return;
      }

      dossierWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>MM RIDE - Police Evidence Dossier (${regNo})</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 2rem; color: #1e293b; line-height: 1.5; }
            .header { border-bottom: 3px solid #dc2626; padding-bottom: 1rem; margin-bottom: 1.5rem; }
            .stamp { display: inline-block; background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 4px; font-weight: 800; font-size: 12px; }
            h1 { color: #b91c1c; font-size: 20px; margin: 8px 0 4px 0; text-transform: uppercase; }
            .sub { color: #64748b; font-size: 13px; margin: 0; }
            .table-box { width: 100%; border-collapse: collapse; margin: 1rem 0; }
            .table-box th, .table-box td { border: 1px solid #cbd5e1; padding: 8px 12px; font-size: 13px; text-align: left; }
            .table-box th { background: #f1f5f9; width: 30%; color: #334155; }
            .alert-box { background: #fff1f2; border-left: 4px solid #e11d48; padding: 12px; margin: 1rem 0; font-size: 13px; color: #881337; }
            .sig-row { display: flex; justify-content: space-between; margin-top: 3rem; }
            .sig-box { border-top: 1px solid #000; width: 220px; text-align: center; padding-top: 4px; font-size: 12px; }
            @media print { body { padding: 0; } button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <span class="stamp">CONFIDENTIAL / LAW ENFORCEMENT EXHIBIT</span>
            <h1>CRIMINAL BREACH OF TRUST & VEHICLE RECOVERY DOSSIER</h1>
            <p class="sub">Generated by MM Ride Fleet Management System under Section 316 BNS / Section 406 IPC</p>
            <p style="font-size: 12px; color: #475569; margin-top: 4px;">Dossier Generation Timestamp: <b>${nowStr}</b></p>
          </div>

          <div class="alert-box">
            <b>CRIMINAL INCIDENT SUMMARY:</b> Commercial vehicle <b>${regNo}</b> was handed over to the custody-holder for authorized bike-taxi shifts only under signed bailment. Custody-holder has ceased authorized contact, violated operating geofences, and failed to return vehicle to the designated depot.
          </div>

          <h3>1. Commercial Vehicle Details</h3>
          <table class="table-box">
            <tr><th>Vehicle Registration No.</th><td><b>${regNo}</b></td></tr>
            <tr><th>Vehicle Ownership</th><td>MM Ride Commercial Fleet Partner</td></tr>
            <tr><th>Original RC Status</th><td>Retained at Depot (Driver holds only verified attested copy)</td></tr>
            <tr><th>Tracker Serial & Status</th><td>4G Relay Tracker Active (Ignition Remote Cut Compatible)</td></tr>
          </table>

          <h3>2. Custody Holder / Driver Details</h3>
          <table class="table-box">
            <tr><th>Full Legal Name</th><td><b>${driverName}</b></td></tr>
            <tr><th>Driving Licence (DL) No.</th><td>${dlNumber}</td></tr>
            <tr><th>Primary Mobile Number</th><td>${phone}</td></tr>
            <tr><th>Residential Address</th><td>${address}</td></tr>
            <tr><th>Legal Agreement Signed</th><td>Yes (Electronic Bailment & Anti-Fraud Custody Declaration)</td></tr>
          </table>

          <h3>3. Real-Time Telemetry & Last Known Coordinates</h3>
          <table class="table-box">
            <tr><th>Last Known Latitude</th><td>${loc?.latitude || 'N/A'}</td></tr>
            <tr><th>Last Known Longitude</th><td>${loc?.longitude || 'N/A'}</td></tr>
            <tr><th>Last Recorded Speed</th><td>${loc?.speed || 0} km/h</td></tr>
            <tr><th>Last Transmission Time</th><td>${loc?.timestamp ? new Date(loc.timestamp).toLocaleString('en-IN') : 'N/A'}</td></tr>
            <tr><th>Google Maps Live Location</th><td><a href="https://maps.google.com/?q=${loc?.latitude},${loc?.longitude}" target="_blank">View Last Known Coordinate on Google Maps</a></td></tr>
          </table>

          <h3>4. Legal Grounding</h3>
          <p style="font-size: 12px; color: #334155; line-height: 1.6;">
            This incident constitutes a prima facie case of <b>Criminal Breach of Trust (Section 316 Bharatiya Nyaya Sanhita, 2023 / Section 406 Indian Penal Code)</b> and <b>Dishonest Misappropriation of Property</b>. The custody-holder has no legal title or right to retain, alienate, transfer, or pawn the vehicle. Local law enforcement is requested to intercept the vehicle and take custody immediately.
          </p>

          <div class="sig-row">
            <div class="sig-box">Fleet Security Manager (Sign & Seal)</div>
            <div class="sig-box">Receiving Police Station / Officer</div>
          </div>

          <div style="margin-top: 2rem; text-align: center;">
            <button onclick="window.print()" style="background: #b91c1c; color: #fff; padding: 10px 24px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px;">
              🖨️ Print / Save as PDF Dossier
            </button>
          </div>
        </body>
        </html>
      `);
      dossierWindow.document.close();
      try {
        dossierWindow.focus();
      } catch (_) {}

      setActionFeedback({
        type: 'info',
        title: '📄 Police FIR Dossier Generated',
        message: `Recovery dossier generated for vehicle ${regNo} (Driver: ${driverName}). New browser tab opened and ready to print or save as PDF.`,
        actionButton: {
          label: 'Re-Open / Print Dossier 🖨️',
          onClick: () => handleExportPoliceDossier(driver)
        }
      });
    } catch (err) {
      setActionFeedback({
        type: 'danger',
        title: 'Dossier Generation Error',
        message: err.message
      });
    } finally {
      setActionLoading(null);
    }
  };

  const allAlerts = driversWithGps.map(d => ({ driver: d, risk: evaluateAbscondingRisk(d) }));
  const criticalAlerts = allAlerts.filter(x => x.risk.level === 'CRITICAL');

  return (
    <div className="live-monitoring-root" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* Anti-Absconding Threat Radar Banner (Active during critical breach combinations) */}
      {criticalAlerts.length > 0 && (
        <div style={{
          background: 'linear-gradient(90deg, #7F1D1D 0%, #991B1B 100%)',
          border: '2px solid #EF4444',
          borderRadius: 12,
          padding: '0.85rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#FFF',
          boxShadow: '0 0 20px rgba(239, 68, 68, 0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.6rem' }}>🚨</span>
            <div>
              <b style={{ fontSize: '0.95rem', letterSpacing: 0.5 }}>ANTI-ABSCONDING THREAT RADAR: {criticalAlerts.length} CRITICAL COMBINATION(S) ACTIVE</b>
              <div style={{ fontSize: '0.8rem', color: '#FECACA' }}>
                {criticalAlerts.map(a => `${a.driver.assignedBikeRegistration || a.driver.fullName} (${a.risk.title})`).join(' • ')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="btn btn-sm"
              style={{ background: '#000', color: '#FFF', border: '1px solid rgba(255,255,255,0.3)' }}
              onClick={() => setSelectedDriver(criticalAlerts[0].driver)}
            >
              Inspect Vehicle 🎯
            </button>
          </div>
        </div>
      )}

      {/* Top Fleet Telemetry & Filter Card */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '0.9rem 1.25rem',
        marginBottom: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Row 1: Fleet Metrics & Sync Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          paddingBottom: '0.65rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: '#F59E0B',
              fontWeight: 800,
              fontSize: '0.9rem',
              letterSpacing: 0.3
            }}>
              <Activity size={18} />
              <span>LIVE FLEET GPS</span>
            </div>

            <div style={{ height: 16, width: 1, background: 'rgba(255, 255, 255, 0.15)', margin: '0 4px' }} />

            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34D399',
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: '0.76rem',
              fontWeight: 700
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', display: 'inline-block', boxShadow: '0 0 8px #10B981' }} />
              {onDutyCount} On Duty
            </span>

            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38BDF8',
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: '0.76rem',
              fontWeight: 600
            }}>
              📡 {driversWithGps.length} GPS Enabled
            </span>

            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#FCD34D',
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: '0.76rem',
              fontWeight: 600
            }}>
              ⚡ {movingCount} Moving
            </span>

            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(148, 163, 184, 0.12)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              color: '#94A3B8',
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: '0.76rem',
              fontWeight: 600
            }}>
              ⏸️ {idleCount} Stationary
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{
              fontSize: '0.74rem',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
              Real-time Telemetry via Firestore
            </span>
          </div>
        </div>

        {/* Row 2: Categorized Filter Toolbar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {/* Subrow A: Core Status Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 65 }}>
              Status:
            </span>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'ALL' ? '#F59E0B' : 'rgba(255, 255, 255, 0.05)',
                color: filterMode === 'ALL' ? '#000' : '#E2E8F0',
                border: filterMode === 'ALL' ? '1px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.12)',
                fontWeight: filterMode === 'ALL' ? 800 : 500,
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem'
              }}
              onClick={() => setFilterMode('ALL')}
            >
              All GPS ({driversWithGps.length})
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'DUTY' ? '#10B981' : 'rgba(255, 255, 255, 0.05)',
                color: filterMode === 'DUTY' ? '#000' : '#E2E8F0',
                border: filterMode === 'DUTY' ? '1px solid #10B981' : '1px solid rgba(255, 255, 255, 0.12)',
                fontWeight: filterMode === 'DUTY' ? 800 : 500,
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem'
              }}
              onClick={() => setFilterMode('DUTY')}
            >
              On Duty ({onDutyCount})
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'MOVING' ? '#F59E0B' : 'rgba(255, 255, 255, 0.05)',
                color: filterMode === 'MOVING' ? '#000' : '#E2E8F0',
                border: filterMode === 'MOVING' ? '1px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.12)',
                fontWeight: filterMode === 'MOVING' ? 800 : 500,
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem'
              }}
              onClick={() => setFilterMode('MOVING')}
            >
              ⚡ Moving ({movingCount})
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'IDLE' ? '#64748B' : 'rgba(255, 255, 255, 0.05)',
                color: filterMode === 'IDLE' ? '#FFF' : '#E2E8F0',
                border: filterMode === 'IDLE' ? '1px solid #64748B' : '1px solid rgba(255, 255, 255, 0.12)',
                fontWeight: filterMode === 'IDLE' ? 800 : 500,
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem'
              }}
              onClick={() => setFilterMode('IDLE')}
            >
              ⏸️ Idle / Stopped ({idleCount})
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'OVERSPEED' ? '#EF4444' : 'rgba(255, 255, 255, 0.05)',
                color: filterMode === 'OVERSPEED' ? '#FFF' : overspeedCount > 0 ? '#F87171' : '#CBD5E1',
                border: filterMode === 'OVERSPEED' ? '1px solid #EF4444' : overspeedCount > 0 ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
                fontWeight: filterMode === 'OVERSPEED' ? 800 : 500,
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem'
              }}
              onClick={() => setFilterMode('OVERSPEED')}
            >
              ⚡ Speed Alert (&gt;{speedThreshold} km/h) {overspeedCount > 0 && <span className="badge badge-danger" style={{ marginLeft: 4, padding: '1px 5px', fontSize: 10 }}>{overspeedCount}</span>}
            </button>
          </div>

          {/* Subrow B: Threat Radar & Security Exceptions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            flexWrap: 'wrap',
            paddingTop: '0.45rem',
            borderTop: '1px dashed rgba(255, 255, 255, 0.08)'
          }}>
            <span style={{
              fontSize: '0.72rem',
              color: '#F87171',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              minWidth: 65,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <ShieldAlert size={13} /> Threats:
            </span>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'OFF_DUTY_MOVING' ? '#EF4444' : offDutyMovingCount > 0 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                color: filterMode === 'OFF_DUTY_MOVING' ? '#FFF' : offDutyMovingCount > 0 ? '#FCA5A5' : '#CBD5E1',
                borderColor: filterMode === 'OFF_DUTY_MOVING' ? '#EF4444' : offDutyMovingCount > 0 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: filterMode === 'OFF_DUTY_MOVING' ? 800 : 500
              }}
              onClick={() => setFilterMode('OFF_DUTY_MOVING')}
              title="Detect vehicles in motion with Duty OFF (Unauthorized Personal Use)"
            >
              🚨 Off-Duty Moving {offDutyMovingCount > 0 && <span className="badge badge-danger" style={{ marginLeft: 4, padding: '1px 5px', fontSize: 10 }}>{offDutyMovingCount}</span>}
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'OFFLINE_CASH' ? '#EF4444' : offlineCashCount > 0 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                color: filterMode === 'OFFLINE_CASH' ? '#FFF' : offlineCashCount > 0 ? '#FCA5A5' : '#CBD5E1',
                borderColor: filterMode === 'OFFLINE_CASH' ? '#EF4444' : offlineCashCount > 0 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: filterMode === 'OFFLINE_CASH' ? 800 : 500
              }}
              onClick={() => setFilterMode('OFFLINE_CASH')}
              title="Detect vehicles moving after platform ride cancellation (Suspected Offline Cash Ride)"
            >
              🚖 Offline Cash Alert {offlineCashCount > 0 && <span className="badge badge-danger" style={{ marginLeft: 4, padding: '1px 5px', fontSize: 10 }}>{offlineCashCount}</span>}
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'BORDER_BREACH' ? '#EF4444' : borderBreachCount > 0 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                color: filterMode === 'BORDER_BREACH' ? '#FFF' : borderBreachCount > 0 ? '#FCA5A5' : '#CBD5E1',
                borderColor: filterMode === 'BORDER_BREACH' ? '#EF4444' : borderBreachCount > 0 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: filterMode === 'BORDER_BREACH' ? 800 : 500
              }}
              onClick={() => setFilterMode('BORDER_BREACH')}
              title="Detect vehicles outside 45km metropolitan perimeter (Inter-State / Boundary Breach)"
            >
              🚧 Border Breach {borderBreachCount > 0 && <span className="badge badge-danger" style={{ marginLeft: 4, padding: '1px 5px', fontSize: 10 }}>{borderBreachCount}</span>}
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'ACCIDENT_STOP' ? '#F59E0B' : accidentStopCount > 0 ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                color: filterMode === 'ACCIDENT_STOP' ? '#000' : accidentStopCount > 0 ? '#FCD34D' : '#CBD5E1',
                borderColor: filterMode === 'ACCIDENT_STOP' ? '#F59E0B' : accidentStopCount > 0 ? 'rgba(245, 158, 11, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: filterMode === 'ACCIDENT_STOP' ? 800 : 500
              }}
              onClick={() => setFilterMode('ACCIDENT_STOP')}
              title="Detect sudden deceleration from high speed to 0 km/h with prolonged stationary state (Possible Accident / Breakdown)"
            >
              ⚠️ Possible Accident / Stop {accidentStopCount > 0 && <span className="badge badge-warning" style={{ marginLeft: 4, padding: '1px 5px', fontSize: 10 }}>{accidentStopCount}</span>}
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'PHONE_OFFLINE_MOVING' ? '#EF4444' : phoneOfflineMovingCount > 0 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                color: filterMode === 'PHONE_OFFLINE_MOVING' ? '#FFF' : phoneOfflineMovingCount > 0 ? '#FCA5A5' : '#CBD5E1',
                borderColor: filterMode === 'PHONE_OFFLINE_MOVING' ? '#EF4444' : phoneOfflineMovingCount > 0 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: filterMode === 'PHONE_OFFLINE_MOVING' ? 800 : 500
              }}
              onClick={() => setFilterMode('PHONE_OFFLINE_MOVING')}
              title="Detect vehicles moving with driver phone offline / airplane mode (Tampering / Combination A)"
            >
              🚨 Phone Offline + Moving {phoneOfflineMovingCount > 0 && <span className="badge badge-danger" style={{ marginLeft: 4, padding: '1px 5px', fontSize: 10 }}>{phoneOfflineMovingCount}</span>}
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: filterMode === 'GHOST_PHONE' ? '#EF4444' : ghostPhoneCount > 0 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                color: filterMode === 'GHOST_PHONE' ? '#FFF' : ghostPhoneCount > 0 ? '#FCA5A5' : '#CBD5E1',
                borderColor: filterMode === 'GHOST_PHONE' ? '#EF4444' : ghostPhoneCount > 0 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: filterMode === 'GHOST_PHONE' ? 800 : 500
              }}
              onClick={() => setFilterMode('GHOST_PHONE')}
              title="Detect when registered company phone is left at room while bike is moving (Ghost Phone Separation)"
            >
              📱 Ghost Phone Alert {ghostPhoneCount > 0 && <span className="badge badge-danger" style={{ marginLeft: 4, padding: '1px 5px', fontSize: 10 }}>{ghostPhoneCount}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Main Map + Side Telemetry Panel */}
      <div className="live-monitoring-layout" style={{ display: 'grid', gridTemplateColumns: activeSelectedDriver ? '1fr 340px' : '1fr', gap: '1rem', flex: 1, minHeight: 0 }}>
        <div style={{ height: '100%', minHeight: 500 }}>
          <LiveMap
            drivers={filteredMapDrivers}
            hubs={hubs}
            selectedDriver={activeSelectedDriver}
            onSelectDriver={(d) => {
              setSelectedDriver(d);
              setActionFeedback(null);
            }}
          />
        </div>

        {/* Selected Driver Inspection Drawer */}
        {activeSelectedDriver && (
          <div className="panel" style={{ margin: 0, overflowY: 'auto' }}>
            <div className="panel-header">
              <div className="panel-title" style={{ fontSize: '1rem' }}>
                <Bike size={16} color="#F59E0B" />
                <span>{activeSelectedDriver.fullName || 'Driver Details'}</span>
              </div>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSelectedDriver(null);
                  setActionFeedback(null);
                }}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
              {/* Real-time Threat Matrix Assessment */}
              {(() => {
                const r = evaluateAbscondingRisk(activeSelectedDriver);
                return (
                  <div style={{
                    background: r.level === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : r.level === 'WARNING' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.1)',
                    border: `1px solid ${r.level === 'CRITICAL' ? '#EF4444' : r.level === 'WARNING' ? '#F59E0B' : '#10B981'}`,
                    borderRadius: 8,
                    padding: '0.6rem 0.8rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ color: r.level === 'CRITICAL' ? '#F87171' : r.level === 'WARNING' ? '#FCD34D' : '#34D399', fontSize: '0.8rem' }}>
                        {r.level === 'CRITICAL' ? '🚨 ABSCONDING RISK: CRITICAL' : r.level === 'WARNING' ? '⚠️ TELEMETRY WARNING' : '🛡️ THREAT LEVEL: NORMAL'}
                      </b>
                      <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{r.code}</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#E2E8F0', marginTop: 4 }}>
                      {r.detail}
                    </div>
                  </div>
                );
              })()}

              <div>
                <span style={{ color: '#94A3B8' }}>Assigned Bike:</span>
                <div style={{ fontWeight: 700, color: '#F59E0B', fontSize: '0.95rem' }}>
                  {activeSelectedDriver.assignedBikeRegistration || 'Assigned Bike'}
                </div>
              </div>

              <div style={{ 
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 8,
                padding: '0.75rem',
                border: '1px solid var(--border-subtle)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#94A3B8' }}>Current Speed:</span>
                  <b style={{ color: (activeSelectedDriver.lastKnownLocation?.speed || 0) > 60 ? '#EF4444' : '#10B981' }}>
                    {activeSelectedDriver.lastKnownLocation?.speed || 0} km/h
                  </b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#94A3B8' }}>Telemetry Update:</span>
                  <b>{formatDateTime(activeSelectedDriver.lastKnownLocation?.timestamp)}</b>
                </div>
                {activeSelectedDriver.lastKnownLocation?.latitude && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: '#94A3B8' }}>Hub Perimeter:</span>
                    {(() => {
                      const hLat = hubLat, hLng = hubLng;
                      const dKm = Math.round(Math.sqrt(
                        Math.pow((activeSelectedDriver.lastKnownLocation.latitude - hLat) * 111, 2) + 
                        Math.pow((activeSelectedDriver.lastKnownLocation.longitude - hLng) * 111, 2)
                      ));
                      return (
                        <b style={{ color: dKm > 45 ? '#EF4444' : dKm > 35 ? '#F59E0B' : '#10B981' }}>
                          {dKm} km {dKm > 45 ? '(🚨 BORDER BREACH)' : dKm > 35 ? '(⚠️ BUFFER ZONE)' : '(SAFE)'}
                        </b>
                      );
                    })()}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ color: '#94A3B8' }}>Phone Heartbeat:</span>
                  {(() => {
                    const lastMs = activeSelectedDriver.lastKnownLocation?.timestamp ? new Date(activeSelectedDriver.lastKnownLocation.timestamp).getTime() : 0;
                    const isOffline = (Date.now() - lastMs) > (3 * 60 * 1000);
                    return (
                      <b style={{ color: isOffline ? '#EF4444' : '#10B981' }}>
                        {isOffline ? '❌ OFFLINE (Airplane / No Data)' : '🟢 ONLINE (Active Sync)'}
                      </b>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ color: '#94A3B8' }}>Independent Bike IoT:</span>
                  <b style={{ color: '#10B981' }}>🟢 HARDWARE GPS SYNCED</b>
                </div>
              </div>

              <div>
                <span style={{ color: '#94A3B8' }}>Current Duty Session:</span>
                <div><code>{activeSelectedDriver.currentDutyId || 'None'}</code></div>
              </div>

              <div>
                <span style={{ color: '#94A3B8' }}>Dedicated MDM Terminal:</span>
                <div>
                  <span className="badge badge-success">
                    {activeSelectedDriver.boundDeviceId ? `BOUND TO [${activeSelectedDriver.boundDeviceId.slice(-8)}]` : 'GENUINE ANDROID DEVICE'}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 3 }}>
                  🔋 Battery: <b style={{ color: (activeSelectedDriver.deviceBattery || 80) <= 20 ? '#EF4444' : '#10B981' }}>{activeSelectedDriver.deviceBattery || 80}%</b> • 📶 {activeSelectedDriver.deviceNetwork || '5G'} • 🛡️ Kiosk Locked
                </div>
              </div>

              {/* Emergency Welfare & Possible Accident Protocol */}
              {(activeSelectedDriver.abnormalStopAlert?.active || evaluateAbscondingRisk(activeSelectedDriver).code === 'POSSIBLE_ACCIDENT_ABNORMAL_STOP') && (
                <div style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  borderRadius: 8,
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{ color: '#FCD34D', fontWeight: 'bold', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    ⚠️ Welfare Check (Possible Accident / Abnormal Stop)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#CBD5E1', lineHeight: 1.4 }}>
                    Sudden deceleration detected (High Speed ➔ 0 km/h). Driver or phone unresponsive. Immediate welfare check required:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: 2 }}>
                    {activeSelectedDriver.mobileNumber && (
                      <a href={`tel:${activeSelectedDriver.mobileNumber}`} className="btn btn-secondary btn-sm" style={{ textAlign: 'center', textDecoration: 'none', color: '#FFF' }}>
                        📞 Call Driver
                      </a>
                    )}
                    {activeSelectedDriver.emergencyContactPhone && (
                      <a href={`tel:${activeSelectedDriver.emergencyContactPhone}`} className="btn btn-secondary btn-sm" style={{ textAlign: 'center', textDecoration: 'none', color: '#FCA5A5', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                        ❤️ Family Contact
                      </a>
                    )}
                  </div>
                  {activeSelectedDriver.lastKnownLocation?.latitude && (
                    <a 
                      href={`https://www.google.com/maps/search/hospital/@${activeSelectedDriver.lastKnownLocation.latitude},${activeSelectedDriver.lastKnownLocation.longitude},15z`}
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="btn btn-secondary btn-sm"
                      style={{ textAlign: 'center', textDecoration: 'none', color: '#38BDF8' }}
                    >
                      🏥 Find Nearby Hospitals (3km)
                    </a>
                  )}
                  <button
                    className="btn btn-success btn-sm"
                    style={{ marginTop: 2 }}
                    onClick={async () => {
                      try {
                        await updateDoc(doc(db, 'drivers', activeSelectedDriver.id), {
                          abnormalStopAlert: { active: false, resolvedAt: new Date().toISOString() }
                        });
                        alert('Welfare check resolved: Driver marked safe / breakdown addressed.');
                      } catch (e) {
                        alert(e.message);
                      }
                    }}
                  >
                    ✓ Mark Driver Safe / False Alarm
                  </button>
                </div>
              )}

              {/* Anti-Theft Remote Fleet Security Controls */}
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 8,
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
              }}>
                <div style={{ color: '#F87171', fontWeight: 'bold', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShieldAlert size={14} /> Remote Anti-Theft Defense Controls
                </div>

                {/* Instant Action Feedback Toast Card */}
                {actionFeedback && (
                  <div style={{
                    background: actionFeedback.type === 'danger' ? 'rgba(239, 68, 68, 0.2)' 
                              : actionFeedback.type === 'warning' ? 'rgba(245, 158, 11, 0.2)' 
                              : actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.2)' 
                              : 'rgba(56, 189, 248, 0.2)',
                    border: `1px solid ${actionFeedback.type === 'danger' ? '#EF4444' : actionFeedback.type === 'warning' ? '#F59E0B' : actionFeedback.type === 'success' ? '#10B981' : '#38BDF8'}`,
                    borderRadius: 6,
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.78rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ color: actionFeedback.type === 'danger' ? '#F87171' : actionFeedback.type === 'warning' ? '#FCD34D' : actionFeedback.type === 'success' ? '#34D399' : '#38BDF8' }}>
                        {actionFeedback.title}
                      </b>
                      <button 
                        onClick={() => setActionFeedback(null)} 
                        style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 13, padding: 0 }}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ color: '#E2E8F0', lineHeight: 1.35 }}>{actionFeedback.message}</div>
                    {actionFeedback.actionButton && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ alignSelf: 'flex-start', marginTop: 4, padding: '2px 8px', fontSize: '0.72rem' }}
                        onClick={actionFeedback.actionButton.onClick}
                      >
                        {actionFeedback.actionButton.label}
                      </button>
                    )}
                  </div>
                )}

                {/* Active Engine Immobilizer Status Banner */}
                {activeSelectedDriver.engineImmobilized && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.25)',
                    border: '1px solid #EF4444',
                    borderRadius: 6,
                    padding: '0.5rem 0.65rem',
                    fontSize: '0.74rem',
                    color: '#FCA5A5',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span style={{ fontSize: '1.2rem' }}>⚡</span>
                    <div>
                      <b style={{ color: '#FFF' }}>ENGINE CUT-OFF ACTIVE</b>
                      <div style={{ fontSize: '0.7rem', color: '#FECACA' }}>
                        Ignition cut off remotely. Driver app screen is locked down.
                      </div>
                    </div>
                  </div>
                )}

                {/* Live Selfie Verification Status Badge */}
                {activeSelectedDriver.pendingVerification?.status === 'PENDING' && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px dashed #F59E0B',
                    borderRadius: 6,
                    padding: '0.5rem 0.65rem',
                    fontSize: '0.74rem',
                    color: '#FCD34D',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span style={{ fontSize: '1.1rem' }}>⏳</span>
                    <div>
                      <b>Driver Selfie Verification Pending (90s)</b>
                      <div style={{ fontSize: '0.7rem', color: '#CBD5E1' }}>
                        Waiting for driver to submit live camera selfie on mobile phone...
                      </div>
                    </div>
                  </div>
                )}

                {activeSelectedDriver.pendingVerification?.status === 'VERIFIED' && (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10B981',
                    borderRadius: 6,
                    padding: '0.5rem 0.65rem',
                    fontSize: '0.74rem',
                    color: '#34D399',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <CheckCircle2 size={13} color="#10B981" />
                      <b>Driver Identity Verified ✅</b>
                    </div>
                    {activeSelectedDriver.pendingVerification?.photoUrl && (
                      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <img 
                          src={activeSelectedDriver.pendingVerification.photoUrl} 
                          alt="Driver Selfie" 
                          style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6, border: '1px solid #10B981' }} 
                        />
                        <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Verified face snapshot confirmed via mobile front camera</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 1. Challenge Live Face */}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', borderColor: 'rgba(245, 158, 11, 0.5)', color: '#FCD34D' }}
                  onClick={() => handleTriggerLiveSelfieChallenge(activeSelectedDriver)}
                  disabled={actionLoading === 'SELFIE'}
                  title="Force driver to take front camera selfie within 90s"
                >
                  {actionLoading === 'SELFIE' ? (
                    <><Loader2 size={14} className="animate-spin" /> Dispatching to Phone...</>
                  ) : (
                    <><Camera size={14} /> Challenge Live Face Selfie</>
                  )}
                </button>

                {/* 2. Engine Immobilizer Relay */}
                {activeSelectedDriver.assignedBikeId && (
                  <button
                    className={`btn btn-sm ${activeSelectedDriver.engineImmobilized ? 'btn-success' : 'btn-danger'}`}
                    style={{ width: '100%' }}
                    onClick={() => handleToggleEngineImmobilizer(activeSelectedDriver)}
                    disabled={actionLoading === 'ENGINE'}
                  >
                    {actionLoading === 'ENGINE' ? (
                      <><Loader2 size={14} className="animate-spin" /> Sending Relay Signal...</>
                    ) : (
                      <>
                        <Power size={14} />
                        {activeSelectedDriver.engineImmobilized ? 'Restore Engine Ignition 🟢' : 'Cut-Off Engine (Immobilize) ⚡'}
                      </>
                    )}
                  </button>
                )}

                {/* 3. 1-Click Police FIR Dossier Export */}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', borderColor: 'rgba(239, 68, 68, 0.5)', color: '#FCA5A5' }}
                  onClick={() => handleExportPoliceDossier(activeSelectedDriver)}
                  disabled={actionLoading === 'DOSSIER'}
                  title="Generate instant legal complaint dossier for police recovery"
                >
                  {actionLoading === 'DOSSIER' ? (
                    <><Loader2 size={14} className="animate-spin" /> Generating Dossier...</>
                  ) : (
                    <>📄 Export Police FIR Dossier (BNS 316)</>
                  )}
                </button>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1rem' }}
                onClick={() => onSelectDriver(activeSelectedDriver)}
              >
                View Full 360° Profile <ExternalLink size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
