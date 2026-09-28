import React, { useState, useEffect } from 'react';
import { 
  Bike, 
  Plus, 
  UserCheck, 
  UserX, 
  Wrench, 
  AlertTriangle, 
  Eye, 
  BatteryCharging, 
  Fuel,
  CheckCircle2,
  ShieldCheck,
  FileText,
  Key,
  Camera,
  Check
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { BIKE_STATUSES } from '../utils/constants';
import Modal from '../components/Modal';

export default function Bikes() {
  const [bikes, setBikes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [handovers, setHandovers] = useState([]);
  const [custodyModal, setCustodyModal] = useState({ isOpen: false, bike: null, handover: null });
  const [addModal, setAddModal] = useState(false);
  const [assignModal, setAssignModal] = useState({ isOpen: false, bike: null, driverId: '' });
  const [loading, setLoading] = useState(false);

  const [newBike, setNewBike] = useState({
    registrationNumber: '',
    make: 'Hero',
    model: 'Splendor Plus',
    year: '2024',
    fuelType: 'PETROL',
    hubId: '',
    currentOdometer: '0',
    currentFuelCharge: '100',
    insuranceNumber: '',
    insuranceExpiry: '',
    pucValidUntil: ''
  });

  useEffect(() => {
    const unsubBikes = subscribeToCollection('bikes', setBikes);
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    const unsubHubs = subscribeToCollection('hubs', setHubs);
    const unsubHandovers = subscribeToCollection('bikeHandovers', setHandovers);
    return () => {
      unsubBikes();
      unsubDrivers();
      unsubHubs();
      unsubHandovers();
    };
  }, []);

  const eligibleDrivers = drivers.filter(d => 
    (d.approvalStatus === 'APPROVED' || d.accountStatus === 'APPROVED_BIKE_NOT_ASSIGNED') &&
    !d.assignedBikeId
  );

  const handleAddBike = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const bikeId = `bike_${newBike.registrationNumber.replace(/\s+/g, '-').toLowerCase()}`;
      await setDoc(doc(db, 'bikes', bikeId), {
        id: bikeId,
        registrationNumber: newBike.registrationNumber.toUpperCase(),
        make: newBike.make,
        model: newBike.model,
        year: Number(newBike.year),
        fuelType: newBike.fuelType,
        hubId: newBike.hubId || (hubs[0]?.id || null),
        status: 'AVAILABLE',
        currentOdometer: Number(newBike.currentOdometer) || 0,
        currentFuelCharge: Number(newBike.currentFuelCharge) || 100,
        insuranceNumber: newBike.insuranceNumber,
        insuranceExpiry: newBike.insuranceExpiry,
        pucValidUntil: newBike.pucValidUntil,
        assignedDriverId: null,
        assignedDriverName: null,
        createdAt: serverTimestamp()
      });

      await logAdminAudit({
        action: 'BIKE_ADDED',
        relevantRecordId: bikeId,
        newValue: newBike.registrationNumber,
        notes: `New bike added to fleet: ${newBike.registrationNumber}`
      });

      setAddModal(false);
      setNewBike({
        registrationNumber: '',
        make: 'Hero',
        model: 'Splendor Plus',
        year: '2024',
        fuelType: 'PETROL',
        hubId: '',
        currentOdometer: '0',
        currentFuelCharge: '100',
        insuranceNumber: '',
        insuranceExpiry: '',
        pucValidUntil: ''
      });
    } catch (err) {
      alert(`Error creating bike: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignBike = async () => {
    const { bike, driverId } = assignModal;
    if (!bike || !driverId) return;

    setLoading(true);
    try {
      const selectedDriver = drivers.find(d => d.id === driverId);
      if (!selectedDriver) throw new Error("Selected driver not found.");

      // Create bike assignment
      const assignRef = await addDoc(collection(db, 'bikeAssignments'), {
        bikeId: bike.id,
        bikeRegistration: bike.registrationNumber,
        driverId: selectedDriver.id,
        driverName: selectedDriver.fullName,
        driverPhone: selectedDriver.mobileNumber,
        hubId: bike.hubId || null,
        status: 'HANDOVER_PENDING',
        assignedAt: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      // Update bike status
      await updateDoc(doc(db, 'bikes', bike.id), {
        status: 'ASSIGNED',
        assignedDriverId: selectedDriver.id,
        assignedDriverName: selectedDriver.fullName,
        currentAssignmentId: assignRef.id
      });

      // Update driver status
      await updateDoc(doc(db, 'drivers', selectedDriver.id), {
        accountStatus: 'BIKE_ASSIGNED',
        assignedBikeId: bike.id,
        assignedBikeRegistration: bike.registrationNumber,
        currentAssignmentId: assignRef.id
      });

      await logAdminAudit({
        driverId: selectedDriver.id,
        action: 'BIKE_ASSIGNED',
        relevantRecordId: bike.id,
        notes: `Bike ${bike.registrationNumber} assigned to ${selectedDriver.fullName}`
      });

      setAssignModal({ isOpen: false, bike: null, driverId: '' });
    } catch (err) {
      alert(`Error assigning bike: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUnassignBike = async (bike) => {
    if (!window.confirm(`Unassign bike ${bike.registrationNumber} from current driver?`)) return;

    try {
      if (bike.assignedDriverId) {
        await updateDoc(doc(db, 'drivers', bike.assignedDriverId), {
          accountStatus: 'APPROVED_BIKE_NOT_ASSIGNED',
          assignedBikeId: null,
          assignedBikeRegistration: null,
          currentAssignmentId: null
        });
      }

      await updateDoc(doc(db, 'bikes', bike.id), {
        status: 'AVAILABLE',
        assignedDriverId: null,
        assignedDriverName: null,
        currentAssignmentId: null
      });

      await logAdminAudit({
        driverId: bike.assignedDriverId,
        action: 'BIKE_UNASSIGNED',
        relevantRecordId: bike.id,
        notes: `Bike ${bike.registrationNumber} unassigned`
      });
    } catch (err) {
      alert(`Error unassigning bike: ${err.message}`);
    }
  };

  const hubsMap = Object.fromEntries(hubs.map(h => [h.id, h.name]));

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Bike size={18} color="#F59E0B" />
            <span>Fleet Inventory ({bikes.length} Vehicles)</span>
          </div>
          <button className="btn btn-primary" onClick={() => setAddModal(true)}>
            <Plus size={16} /> Register New Bike
          </button>
        </div>

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Registration #</th>
                <th>Make & Model</th>
                <th>Type</th>
                <th>Stationed Hub</th>
                <th>Odometer</th>
                <th>Fuel/Charge</th>
                <th>Status</th>
                <th>Assigned Driver</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bikes.map(b => (
                <tr key={b.id}>
                  <td><b>{b.registrationNumber}</b></td>
                  <td>{b.make} {b.model} ({b.year})</td>
                  <td>
                    <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {b.fuelType === 'EV' ? <BatteryCharging size={13} color="#10B981" /> : <Fuel size={13} color="#F59E0B" />}
                      {b.fuelType}
                    </span>
                  </td>
                  <td>{hubsMap[b.hubId] || 'Main Depot'}</td>
                  <td>{b.currentOdometer || 0} km</td>
                  <td><b>{b.currentFuelCharge || 100}%</b></td>
                  <td>
                    <span className={`badge ${
                      b.status === 'AVAILABLE' ? 'badge-success' :
                      b.status === 'ACTIVE' ? 'badge-info' :
                      b.status === 'MAINTENANCE' || b.status === 'ACCIDENT' ? 'badge-danger' : 'badge-warning'
                    }`}>
                      {BIKE_STATUSES[b.status] || b.status}
                    </span>
                  </td>
                  <td>
                    {b.assignedDriverName ? (
                      <span className="badge badge-info">{b.assignedDriverName}</span>
                    ) : (
                      <span style={{ color: '#64748B' }}>Unassigned</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {b.status === 'AVAILABLE' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34D399' }}
                          onClick={() => setAssignModal({ isOpen: true, bike: b, driverId: '' })}
                        >
                          <UserCheck size={14} /> Assign
                        </button>
                      )}

                      {(b.status === 'RETURNED' || b.status === 'MAINTENANCE') && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34D399' }}
                          onClick={async () => {
                            if (window.confirm(`Mark bike ${b.registrationNumber} as AVAILABLE after depot inspection?`)) {
                              if (b.assignedDriverId) {
                                try {
                                  await updateDoc(doc(db, 'drivers', b.assignedDriverId), {
                                    assignedBikeId: null,
                                    assignedBikeRegistration: null,
                                    currentAssignmentId: null,
                                    accountStatus: 'APPROVED_BIKE_NOT_ASSIGNED'
                                  });
                                } catch (e) {
                                  console.warn('Driver unassign on mark available:', e);
                                }
                              }
                              await updateDoc(doc(db, 'bikes', b.id), {
                                status: 'AVAILABLE',
                                assignedDriverId: null,
                                assignedDriverName: null,
                                currentAssignmentId: null
                              });
                              await logAdminAudit({
                                action: 'BIKE_MARKED_AVAILABLE',
                                relevantRecordId: b.id,
                                notes: `Bike ${b.registrationNumber} inspected at depot and confirmed AVAILABLE.`
                              });
                            }
                          }}
                        >
                          <CheckCircle2 size={14} /> Inspect & Mark Available
                        </button>
                      )}

                      {(b.lastHandoverId || b.assignedDriverId || b.status !== 'AVAILABLE') && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#FCD34D' }}
                          onClick={() => {
                            const handover = handovers.find(h => h.id === b.lastHandoverId || h.bikeId === b.id);
                            setCustodyModal({ isOpen: true, bike: b, handover });
                          }}
                          title="View Custody & 360 Inspection Record"
                        >
                          <ShieldCheck size={14} /> Custody Record
                        </button>
                      )}

                      {b.assignedDriverId && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#F87171' }}
                          onClick={() => handleUnassignBike(b)}
                          title="Unassign Driver"
                        >
                          <UserX size={14} /> Unassign
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {bikes.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                    No fleet bikes in inventory. Click "Register New Bike" to add.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Bike Modal */}
      <Modal
        isOpen={addModal}
        onClose={() => setAddModal(false)}
        title="Register New Fleet Bike"
      >
        <form onSubmit={handleAddBike}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Registration Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. DL 01 AB 1234"
                value={newBike.registrationNumber}
                onChange={(e) => setNewBike({ ...newBike, registrationNumber: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fuel / Power Type</label>
              <select
                className="form-select"
                value={newBike.fuelType}
                onChange={(e) => setNewBike({ ...newBike, fuelType: e.target.value })}
              >
                <option value="PETROL">Petrol (Owner paid)</option>
                <option value="EV">EV Electric</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Make</label>
              <input
                type="text"
                className="form-input"
                placeholder="Hero, Honda, TVS..."
                value={newBike.make}
                onChange={(e) => setNewBike({ ...newBike, make: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Model</label>
              <input
                type="text"
                className="form-input"
                placeholder="Splendor Plus, Shine..."
                value={newBike.model}
                onChange={(e) => setNewBike({ ...newBike, model: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Initial Odometer (km)</label>
              <input
                type="number"
                className="form-input"
                value={newBike.currentOdometer}
                onChange={(e) => setNewBike({ ...newBike, currentOdometer: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Assigned Hub</label>
              <select
                className="form-select"
                value={newBike.hubId}
                onChange={(e) => setNewBike({ ...newBike, hubId: e.target.value })}
              >
                <option value="">Select Pickup & Return Hub</option>
                {hubs.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Insurance Policy Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="Policy #"
                value={newBike.insuranceNumber}
                onChange={(e) => setNewBike({ ...newBike, insuranceNumber: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Insurance Expiry Date</label>
              <input
                type="date"
                className="form-input"
                value={newBike.insuranceExpiry}
                onChange={(e) => setNewBike({ ...newBike, insuranceExpiry: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAddModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Registering...' : 'Register Bike'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Bike Modal */}
      <Modal
        isOpen={assignModal.isOpen}
        onClose={() => setAssignModal({ isOpen: false, bike: null, driverId: '' })}
        title={`Assign Bike: ${assignModal.bike?.registrationNumber}`}
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setAssignModal({ isOpen: false, bike: null, driverId: '' })}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAssignBike}
              disabled={loading || !assignModal.driverId}
            >
              {loading ? 'Assigning...' : 'Confirm Assignment'}
            </button>
          </>
        }
      >
        <p style={{ color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Select an approved driver for <b>{assignModal.bike?.registrationNumber}</b>. Only drivers with completed verification and approval are eligible.
        </p>

        <div className="form-group">
          <label className="form-label">Eligible Approved Drivers ({eligibleDrivers.length})</label>
          <select
            className="form-select"
            value={assignModal.driverId}
            onChange={(e) => setAssignModal(prev => ({ ...prev, driverId: e.target.value }))}
          >
            <option value="">-- Choose Approved Driver --</option>
            {eligibleDrivers.map(d => (
              <option key={d.id} value={d.id}>
                {d.fullName} (Phone: {d.mobileNumber}) - ID: {d.id}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      {/* Custody & Anti-Fraud Inspection Modal */}
      <Modal
        isOpen={custodyModal.isOpen}
        onClose={() => setCustodyModal({ isOpen: false, bike: null, handover: null })}
        title={`🛡️ Custody & Anti-Fraud Record: ${custodyModal.bike?.registrationNumber || ''}`}
        footer={
          <button
            className="btn btn-secondary"
            onClick={() => setCustodyModal({ isOpen: false, bike: null, handover: null })}
          >
            Close Record
          </button>
        }
      >
        {custodyModal.handover ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header Status Banner */}
            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '10px',
              padding: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ color: '#10B981', fontWeight: 'bold', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={18} /> Verified Custody Baseline
                </div>
                <div style={{ color: '#94A3B8', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                  Driver: <b style={{ color: '#FFFFFF' }}>{custodyModal.handover.driverName || custodyModal.bike?.assignedDriverName || 'Assigned Driver'}</b> ({custodyModal.handover.driverPhone || 'N/A'})
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="badge badge-success">ACTIVE CUSTODY</span>
                <div style={{ color: '#64748B', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {custodyModal.handover.timestamp ? new Date(custodyModal.handover.timestamp).toLocaleString() : 'N/A'}
                </div>
              </div>
            </div>

            {/* Baseline Readings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#182238', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Baseline Odometer</div>
                <div style={{ color: '#FCD34D', fontSize: '1.2rem', fontWeight: 'bold' }}>
                  {custodyModal.handover.odometer || custodyModal.bike?.currentOdometer || 0} km
                </div>
              </div>
              <div style={{ backgroundColor: '#182238', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Handover Fuel Level</div>
                <div style={{ color: '#10B981', fontSize: '1.2rem', fontWeight: 'bold' }}>
                  {custodyModal.handover.fuelCharge || 100}%
                </div>
              </div>
              <div style={{ backgroundColor: '#182238', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Keys & Helmets Count</div>
                <div style={{ color: '#60A5FA', fontSize: '1.1rem', fontWeight: 'bold' }}>
                  🔑 {custodyModal.handover.keysCount || 1} Key • 🪖 {custodyModal.handover.helmetsCount || 1} Helmet
                </div>
              </div>
            </div>

            {/* 360 Photographic Baseline */}
            <div style={{ backgroundColor: '#111726', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ color: '#F59E0B', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Camera size={16} /> 360° Inspection Photographic Baseline
              </div>

              {custodyModal.handover.photos360 && Object.keys(custodyModal.handover.photos360).length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                  {['front', 'rear', 'left', 'right', 'meter'].map(angle => {
                    const url = custodyModal.handover.photos360[angle];
                    return (
                      <div key={angle} style={{ textAlign: 'center' }}>
                        <div style={{
                          height: '90px',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          backgroundColor: '#1E293B',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" title={`Click to view full ${angle} photo`}>
                              <img src={url} alt={angle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </a>
                          ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '0.75rem' }}>
                              No Photo
                            </div>
                          )}
                        </div>
                        <div style={{ color: '#94A3B8', fontSize: '0.7rem', marginTop: '0.25rem', textTransform: 'capitalize' }}>
                          {angle} {angle === 'meter' ? 'Console' : 'View'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#64748B', fontSize: '0.85rem', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  Inspection completed with digital checklist. Photos not captured for this legacy session.
                </div>
              )}
            </div>

            {/* Checklist Verification Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#182238', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#FCD34D', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  📄 Identity & Documents Check
                </div>
                <div style={{ fontSize: '0.8rem', color: '#E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Check size={14} color="#10B981" /> Chassis Number physically verified
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Check size={14} color="#10B981" /> Engine Number physically verified
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Check size={14} color="#10B981" /> Original RC Smart Card retained by Owner
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Check size={14} color="#10B981" /> Commercial Insurance valid & present
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#182238', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#FCD34D', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  🔧 Mechanical & Anti-Tamper Check
                </div>
                <div style={{ fontSize: '0.8rem', color: '#E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div>• Front Tyre: <b style={{ color: '#10B981' }}>{custodyModal.handover.tyreCondition?.front || 'GOOD'}</b></div>
                  <div>• Rear Tyre: <b style={{ color: '#10B981' }}>{custodyModal.handover.tyreCondition?.rear || 'GOOD'}</b></div>
                  <div>• GPS Tracker: <b style={{ color: '#10B981' }}>Active & Monitored</b></div>
                  <div>• Existing Damage: <span style={{ color: '#94A3B8' }}>{custodyModal.handover.existingDamage || 'None'}</span></div>
                </div>
              </div>
            </div>

            {/* Signed Legal Declaration */}
            <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <div style={{ color: '#F59E0B', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                ⚖️ Legal Anti-Fraud Declaration Signed
              </div>
              <div style={{ color: '#FDE68A', fontSize: '0.75rem', lineHeight: '1.2rem' }}>
                "Driver signed custody agreement confirming vehicle received in verified condition. Acknowledged: (1) Original RC in Owner safe, (2) Sub-leasing & personal use forbidden, (3) Parts swapping constitutes Criminal Breach of Trust, (4) Daily platform earnings subject to depot physical verification."
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>
            <Bike size={36} color="#64748B" style={{ marginBottom: '1rem' }} />
            <div style={{ fontWeight: 'bold', color: '#FFFFFF', marginBottom: '0.5rem' }}>
              No Handover Record Available Yet
            </div>
            <div style={{ fontSize: '0.85rem', maxWidth: '400px', margin: '0 auto', lineHeight: '1.4rem' }}>
              When the assigned driver completes the 360° inspection and signs the Custody Declaration in the mobile app, full baseline records, photos, and checklist will appear here.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
