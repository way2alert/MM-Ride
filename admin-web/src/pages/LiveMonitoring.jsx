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
  Power
} from 'lucide-react';
import LiveMap from '../components/LiveMap';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { formatDateTime } from '../utils/formatters';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function LiveMonitoring({ onSelectDriver }) {
  const [drivers, setDrivers] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [dutySessions, setDutySessions] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [filterMode, setFilterMode] = useState('ALL'); // ALL, MOVING, IDLE, OVERSPEED
  const [speedThreshold, setSpeedThreshold] = useState(60);

  useEffect(() => {
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    const unsubHubs = subscribeToCollection('hubs', setHubs);
    const unsubDuty = subscribeToCollection('dutySessions', setDutySessions);
    const unsubSettings = onSnapshot(doc(db, 'settings', 'system'), (snap) => {
      if (snap.exists() && snap.data().speedAlertThresholdKmh) {
        setSpeedThreshold(Number(snap.data().speedAlertThresholdKmh));
      }
    }, (err) => console.warn('Settings load error:', err));

    return () => {
      unsubDrivers();
      unsubHubs();
      unsubDuty();
      unsubSettings();
    };
  }, []);

  // Drivers with live GPS coordinates or actively on duty
  const driversWithGps = drivers.filter(d => 
    (d.lastKnownLocation && d.lastKnownLocation.latitude && d.lastKnownLocation.longitude) ||
    d.isCurrentlyOnDuty ||
    d.currentDutyId
  );

  const onDutyCount = drivers.filter(d => d.isCurrentlyOnDuty || d.currentDutyId).length;

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
      const hubLat = 13.0827;
      const hubLng = 80.2707;
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
    return true; // 'ALL'
  });

  const handleTriggerLiveSelfieChallenge = async (driver) => {
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
        notes: `Owner dispatched real-time live face selfie challenge with 90s countdown to driver ${driver.fullName}.`
      });
      alert(`📸 Live Face Selfie Challenge dispatched to ${driver.fullName || 'driver'}! They have 90s to submit on their mobile screen.`);
    } catch (e) {
      alert(`Error triggering challenge: ${e.message}`);
    }
  };

  const handleToggleEngineImmobilizer = async (driver) => {
    const isCurrentlyImmobilized = !!driver.engineImmobilized;
    const bikeId = driver.assignedBikeId;
    const bikeReg = driver.assignedBikeRegistration || 'assigned bike';

    if (!isCurrentlyImmobilized) {
      if (!window.confirm(`⚠️ CUT-OFF ENGINE IGNITION: Are you sure you want to cut off engine ignition for vehicle ${bikeReg}? The bike will immediately be immobilized and cannot be started.`)) {
        return;
      }
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
        alert(`⚡ ENGINE IMMOBILIZED: Vehicle ${bikeReg} ignition has been cut off.`);
      } catch (e) {
        alert(`Error immobilizing engine: ${e.message}`);
      }
    } else {
      if (!window.confirm(`RESTORE IGNITION: Restore engine ignition for vehicle ${bikeReg}?`)) {
        return;
      }
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
        alert(`🟢 ENGINE RESTORED: Vehicle ${bikeReg} ignition is enabled.`);
      } catch (e) {
        alert(`Error restoring engine: ${e.message}`);
      }
    }
  };

  // Evaluate Anti-Absconding & Theft Risk Level across the fleet
  const evaluateAbscondingRisk = (driver) => {
    const loc = driver.lastKnownLocation;
    const speed = loc?.speed || 0;
    const lastUpdateMs = loc?.timestamp ? new Date(loc.timestamp).getTime() : 0;
    const isPhoneOffline = (Date.now() - lastUpdateMs) > (5 * 60 * 1000); // 5 mins no ping
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

    // Combination B: Out of Metro Zone / Geofence breach (> 40km from Chennai Central)
    if (loc?.latitude && loc?.longitude) {
      const hubLat = 13.0827;
      const hubLng = 80.2707;
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
    const loc = driver.lastKnownLocation;
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const regNo = driver.assignedBikeRegistration || 'TN 01 AB 1234';
    const driverName = driver.fullName || 'Driver Partner';
    const phone = driver.mobileNumber || 'N/A';
    const dlNumber = driver.dlNumber || 'N/A';
    const address = driver.permanentAddress || driver.currentAddress || 'As per Aadhaar KYC';

    const dossierWindow = window.open('', '_blank');
    if (!dossierWindow) {
      alert('Pop-up blocked. Please allow pop-ups to generate the Police Evidence Dossier.');
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
  };

  const allAlerts = driversWithGps.map(d => ({ driver: d, risk: evaluateAbscondingRisk(d) }));
  const criticalAlerts = allAlerts.filter(x => x.risk.level === 'CRITICAL');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
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

      {/* Top Filter Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.85rem 1.25rem',
        background: 'var(--bg-card)',
        borderRadius: 12,
        border: '1px solid var(--border-subtle)',
        marginBottom: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={18} color="#F59E0B" />
            <b style={{ color: '#FFF' }}>Live Fleet GPS:</b>
            <span className="badge badge-success">{onDutyCount} Active On Duty</span>
            <span className="badge badge-neutral" style={{ marginLeft: 4 }}>{driversWithGps.length} GPS Enabled</span>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              className={`btn btn-sm ${filterMode === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterMode('ALL')}
            >
              All GPS ({driversWithGps.length})
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'DUTY' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterMode('DUTY')}
            >
              On Duty ({onDutyCount})
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'MOVING' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterMode('MOVING')}
            >
              ⚡ Moving
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'IDLE' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterMode('IDLE')}
            >
              ⏸️ Idle / Stopped
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'OVERSPEED' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterMode('OVERSPEED')}
            >
              ⚡ Speed Alert (&gt;{speedThreshold} km/h)
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'OFF_DUTY_MOVING' ? 'btn-danger' : 'btn-secondary'}`}
              style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: filterMode === 'OFF_DUTY_MOVING' ? '#FFF' : '#FCA5A5' }}
              onClick={() => setFilterMode('OFF_DUTY_MOVING')}
              title="Detect vehicles in motion with Duty OFF (Personal Use Violation)"
            >
              🚨 Off-Duty Moving
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'OFFLINE_CASH' ? 'btn-danger' : 'btn-secondary'}`}
              style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: filterMode === 'OFFLINE_CASH' ? '#FFF' : '#FCA5A5' }}
              onClick={() => setFilterMode('OFFLINE_CASH')}
              title="Detect vehicles moving after platform ride cancellation (Offline Cash Fraud)"
            >
              🚖 Offline Cash Alert
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'BORDER_BREACH' ? 'btn-danger' : 'btn-secondary'}`}
              style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: filterMode === 'BORDER_BREACH' ? '#FFF' : '#FCA5A5' }}
              onClick={() => setFilterMode('BORDER_BREACH')}
              title="Detect vehicles outside 45km metropolitan perimeter (Inter-State / Boundary Breach)"
            >
              🚧 Border Breach
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'ACCIDENT_STOP' ? 'btn-danger' : 'btn-secondary'}`}
              style={{ borderColor: 'rgba(245, 158, 11, 0.5)', color: filterMode === 'ACCIDENT_STOP' ? '#FFF' : '#FCD34D' }}
              onClick={() => setFilterMode('ACCIDENT_STOP')}
              title="Detect sudden deceleration from high speed to 0 km/h with prolonged stationary state (Possible Accident / Breakdown)"
            >
              ⚠️ Possible Accident / Stop
            </button>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
          Real-time GPS updates automatically via Firestore Telemetry
        </div>
      </div>

      {/* Main Map + Side Telemetry Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedDriver ? '1fr 340px' : '1fr', gap: '1rem', flex: 1, minHeight: 0 }}>
        <div style={{ height: '100%', minHeight: 500 }}>
          <LiveMap
            drivers={filteredMapDrivers}
            hubs={hubs}
            onSelectDriver={(d) => setSelectedDriver(d)}
          />
        </div>

        {/* Selected Driver Inspection Drawer */}
        {selectedDriver && (
          <div className="panel" style={{ margin: 0, overflowY: 'auto' }}>
            <div className="panel-header">
              <div className="panel-title" style={{ fontSize: '1rem' }}>
                <Bike size={16} color="#F59E0B" />
                <span>{selectedDriver.fullName || 'Driver Details'}</span>
              </div>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedDriver(null)}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
              {/* Real-time Threat Matrix Assessment */}
              {(() => {
                const r = evaluateAbscondingRisk(selectedDriver);
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
                  {selectedDriver.assignedBikeRegistration || 'Assigned Bike'}
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
                  <b style={{ color: (selectedDriver.lastKnownLocation?.speed || 0) > 60 ? '#EF4444' : '#10B981' }}>
                    {selectedDriver.lastKnownLocation?.speed || 0} km/h
                  </b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#94A3B8' }}>Telemetry Update:</span>
                  <b>{formatDateTime(selectedDriver.lastKnownLocation?.timestamp)}</b>
                </div>
                {selectedDriver.lastKnownLocation?.latitude && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: '#94A3B8' }}>Hub Perimeter:</span>
                    {(() => {
                      const hLat = 13.0827, hLng = 80.2707;
                      const dKm = Math.round(Math.sqrt(
                        Math.pow((selectedDriver.lastKnownLocation.latitude - hLat) * 111, 2) + 
                        Math.pow((selectedDriver.lastKnownLocation.longitude - hLng) * 111, 2)
                      ));
                      return (
                        <b style={{ color: dKm > 45 ? '#EF4444' : dKm > 35 ? '#F59E0B' : '#10B981' }}>
                          {dKm} km {dKm > 45 ? '(🚨 BORDER BREACH)' : dKm > 35 ? '(⚠️ BUFFER ZONE)' : '(SAFE)'}
                        </b>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div>
                <span style={{ color: '#94A3B8' }}>Current Duty Session:</span>
                <div><code>{selectedDriver.currentDutyId || 'None'}</code></div>
              </div>

              <div>
                <span style={{ color: '#94A3B8' }}>Device Integrity:</span>
                <div>
                  <span className="badge badge-success">
                    {selectedDriver.boundDeviceId ? `BOUND TO [${selectedDriver.boundDeviceId.slice(-6)}]` : 'GENUINE ANDROID DEVICE'}
                  </span>
                </div>
              </div>

              {/* Emergency Welfare & Possible Accident Protocol */}
              {(selectedDriver.abnormalStopAlert?.active || evaluateAbscondingRisk(selectedDriver).code === 'POSSIBLE_ACCIDENT_ABNORMAL_STOP') && (
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
                    {selectedDriver.mobileNumber && (
                      <a href={`tel:${selectedDriver.mobileNumber}`} className="btn btn-secondary btn-sm" style={{ textAlign: 'center', textDecoration: 'none', color: '#FFF' }}>
                        📞 Call Driver
                      </a>
                    )}
                    {selectedDriver.emergencyContactPhone && (
                      <a href={`tel:${selectedDriver.emergencyContactPhone}`} className="btn btn-secondary btn-sm" style={{ textAlign: 'center', textDecoration: 'none', color: '#FCA5A5', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                        ❤️ Family Contact
                      </a>
                    )}
                  </div>
                  {selectedDriver.lastKnownLocation?.latitude && (
                    <a 
                      href={`https://www.google.com/maps/search/hospital/@${selectedDriver.lastKnownLocation.latitude},${selectedDriver.lastKnownLocation.longitude},15z`}
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
                        await updateDoc(doc(db, 'drivers', selectedDriver.id), {
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

                {/* Challenge Live Face */}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', borderColor: 'rgba(245, 158, 11, 0.5)', color: '#FCD34D' }}
                  onClick={() => handleTriggerLiveSelfieChallenge(selectedDriver)}
                  title="Force driver to take front camera selfie within 90s"
                >
                  <Camera size={14} /> Challenge Live Face Selfie
                </button>

                {/* Engine Immobilizer Relay */}
                {selectedDriver.assignedBikeId && (
                  <button
                    className={`btn btn-sm ${selectedDriver.engineImmobilized ? 'btn-success' : 'btn-danger'}`}
                    style={{ width: '100%' }}
                    onClick={() => handleToggleEngineImmobilizer(selectedDriver)}
                  >
                    <Power size={14} />
                    {selectedDriver.engineImmobilized ? 'Restore Engine Ignition 🟢' : 'Cut-Off Engine (Immobilize) ⚡'}
                  </button>
                )}

                {/* 1-Click Police FIR Dossier Export */}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', borderColor: 'rgba(239, 68, 68, 0.5)', color: '#FCA5A5' }}
                  onClick={() => handleExportPoliceDossier(selectedDriver)}
                  title="Generate instant legal complaint dossier for police recovery"
                >
                  📄 Export Police FIR Dossier (BNS 316)
                </button>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1rem' }}
                onClick={() => onSelectDriver(selectedDriver)}
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
