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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: '#94A3B8' }}>Driver ID:</span>
                <div style={{ fontWeight: 600, color: '#FFF' }}>{selectedDriver.id}</div>
              </div>

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
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94A3B8' }}>Telemetry Update:</span>
                  <b>{formatDateTime(selectedDriver.lastKnownLocation?.timestamp)}</b>
                </div>
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
                  <ShieldAlert size={14} /> Remote Fleet Security Controls
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
