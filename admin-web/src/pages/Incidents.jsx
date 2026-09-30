import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Wrench, 
  FileText, 
  MapPin, 
  Plus, 
  CheckCircle, 
  ExternalLink,
  PhoneCall
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import Modal from '../components/Modal';

export default function Incidents() {
  const [activeTab, setActiveTab] = useState('incidents'); // incidents, damages, challans
  const [incidents, setIncidents] = useState([]);
  const [damages, setDamages] = useState([]);
  const [challans, setChallans] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [bikes, setBikes] = useState([]);

  const [challanModal, setChallanModal] = useState(false);
  const [damageModal, setDamageModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [newChallan, setNewChallan] = useState({
    challanNumber: '',
    driverId: '',
    bikeId: '',
    amount: '',
    reason: 'Traffic signal violation',
    date: new Date().toISOString().split('T')[0],
    responsibility: 'UNDER_REVIEW' // DRIVER, OWNER, UNDER_REVIEW
  });

  const [newDamage, setNewDamage] = useState({
    bikeId: '',
    driverId: '',
    condition: 'DENT_OR_SCRATCH',
    estimatedCost: '',
    description: '',
    responsibility: 'DRIVER'
  });

  useEffect(() => {
    const unsubInc = subscribeToCollection('incidents', setIncidents);
    const unsubDam = subscribeToCollection('damageReports', setDamages);
    const unsubChal = subscribeToCollection('challans', setChallans);
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    const unsubBikes = subscribeToCollection('bikes', setBikes);

    return () => {
      unsubInc();
      unsubDam();
      unsubChal();
      unsubDrivers();
      unsubBikes();
    };
  }, []);

  const driversMap = Object.fromEntries(drivers.map(d => [d.id, d]));
  const bikesMap = Object.fromEntries(bikes.map(b => [b.registrationNumber || b.id, b]));

  const handleAddChallan = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const chalRef = await addDoc(collection(db, 'challans'), {
        challanNumber: newChallan.challanNumber,
        driverId: newChallan.driverId,
        bikeId: newChallan.bikeId,
        amount: Number(newChallan.amount),
        reason: newChallan.reason,
        date: newChallan.date,
        responsibility: newChallan.responsibility,
        status: 'UNPAID',
        createdAt: serverTimestamp()
      });

      await logAdminAudit({
        driverId: newChallan.driverId,
        action: 'CHALLAN_RECORDED',
        relevantRecordId: chalRef.id,
        notes: `Recorded challan #${newChallan.challanNumber} of ₹${newChallan.amount}. Responsibility: ${newChallan.responsibility}`
      });

      setChallanModal(false);
      setNewChallan({
        challanNumber: '',
        driverId: '',
        bikeId: '',
        amount: '',
        reason: 'Traffic signal violation',
        date: new Date().toISOString().split('T')[0],
        responsibility: 'UNDER_REVIEW'
      });
    } catch (err) {
      alert(`Error recording challan: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDamage = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const dmgRef = await addDoc(collection(db, 'damageReports'), {
        bikeId: newDamage.bikeId,
        driverId: newDamage.driverId || null,
        condition: newDamage.condition,
        estimatedCost: Number(newDamage.estimatedCost) || 0,
        description: newDamage.description,
        responsibility: newDamage.responsibility,
        status: 'PENDING_INSPECTION',
        reportedBy: 'DEPOT_ADMIN',
        timestamp: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      await logAdminAudit({
        action: 'DAMAGE_REPORT_CREATED',
        relevantRecordId: dmgRef.id,
        driverId: newDamage.driverId || null,
        notes: `Recorded damage for bike ${newDamage.bikeId}: ${newDamage.condition} (₹${newDamage.estimatedCost || 0})`
      });

      setDamageModal(false);
      setNewDamage({
        bikeId: '',
        driverId: '',
        condition: 'DENT_OR_SCRATCH',
        estimatedCost: '',
        description: '',
        responsibility: 'DRIVER'
      });
    } catch (err) {
      alert(`Error recording damage: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDamageStatus = async (dmg, newStatus) => {
    try {
      await updateDoc(doc(db, 'damageReports', dmg.id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      await logAdminAudit({
        action: `DAMAGE_${newStatus}`,
        relevantRecordId: dmg.id,
        driverId: dmg.driverId || null,
        notes: `Bike ${dmg.bikeId} damage status changed to ${newStatus}`
      });
    } catch (err) {
      alert(`Error updating damage status: ${err.message}`);
    }
  };

  const handleUpdateChallanStatus = async (challan, newStatus) => {
    try {
      await updateDoc(doc(db, 'challans', challan.id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      await logAdminAudit({
        driverId: challan.driverId,
        action: `CHALLAN_${newStatus}`,
        relevantRecordId: challan.id,
        notes: `Challan #${challan.challanNumber} status updated to ${newStatus}`
      });
    } catch (err) {
      alert(`Error updating challan: ${err.message}`);
    }
  };

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <AlertTriangle size={18} color="#EF4444" />
            <span>Incidents, Bike Damage & Traffic Challans</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, padding: 3, flexWrap: 'wrap', gap: 4 }}>
              <button
                className={`btn btn-sm ${activeTab === 'incidents' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('incidents')}
              >
                Emergency / SOS ({incidents.length})
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'damages' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('damages')}
              >
                Bike Damage ({damages.length})
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'challans' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('challans')}
              >
                Traffic Challans ({challans.length})
              </button>
            </div>

            {activeTab === 'challans' && (
              <button className="btn btn-primary" onClick={() => setChallanModal(true)}>
                <Plus size={16} /> Record Traffic Challan
              </button>
            )}
            {activeTab === 'damages' && (
              <button className="btn btn-primary" onClick={() => setDamageModal(true)}>
                <Plus size={16} /> Record Bike Damage
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: INCIDENTS / EMERGENCY SOS */}
        {activeTab === 'incidents' && (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Driver</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>GPS Location</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map(inc => {
                  const driver = driversMap[inc.driverId];
                  return (
                    <tr key={inc.id}>
                      <td>{formatDateTime(inc.timestamp || inc.createdAt)}</td>
                      <td>
                        <b>{driver?.fullName || 'Driver'}</b>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{inc.driverId}</div>
                      </td>
                      <td>
                        <span className="badge badge-danger">🚨 {inc.type}</span>
                      </td>
                      <td>{inc.description || 'Emergency SOS trigger.'}</td>
                      <td>
                        {inc.gps && inc.gps.latitude ? (
                          <a 
                            href={`https://www.google.com/maps?q=${inc.gps.latitude},${inc.gps.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="badge badge-info"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
                            title="Open Live SOS in Google Maps"
                          >
                            <MapPin size={12} />
                            <code>{Number(inc.gps.latitude).toFixed(4)}, {Number(inc.gps.longitude).toFixed(4)}</code>
                            <ExternalLink size={11} />
                          </a>
                        ) : 'Not reported'}
                      </td>
                      <td>
                        <span className={`badge ${inc.status === 'RESOLVED' ? 'badge-success' : 'badge-warning'}`}>
                          {inc.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          {driver?.mobileNumber && (
                            <a href={`tel:${driver.mobileNumber}`} className="btn btn-secondary btn-sm">
                              <PhoneCall size={13} /> Call
                            </a>
                          )}
                          {inc.status !== 'RESOLVED' && (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={async () => {
                                await updateDoc(doc(db, 'incidents', inc.id), { status: 'RESOLVED' });
                                await logAdminAudit({
                                  driverId: inc.driverId,
                                  action: 'INCIDENT_RESOLVED',
                                  relevantRecordId: inc.id,
                                  notes: 'Incident marked resolved by operations'
                                });
                              }}
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {incidents.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                      No active emergency SOS or incident reports.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: BIKE DAMAGES */}
        {activeTab === 'damages' && (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Reported Date</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Condition</th>
                  <th>Description</th>
                  <th>Est. Cost</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {damages.map(dmg => {
                  const driver = driversMap[dmg.driverId];
                  const bike = bikesMap[dmg.bikeId];
                  return (
                    <tr key={dmg.id}>
                      <td>{formatDateTime(dmg.timestamp || dmg.createdAt)}</td>
                      <td>
                        <b>{dmg.bikeId}</b>
                        {bike && <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{bike.make} {bike.model}</div>}
                      </td>
                      <td>
                        {driver ? (
                          <div>
                            <b>{driver.fullName}</b>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{driver.mobileNumber}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#64748B' }}>{dmg.driverId || 'Not assigned'}</span>
                        )}
                      </td>
                      <td><span className="badge badge-warning">{dmg.condition}</span></td>
                      <td>{dmg.description || 'Depot inspection damage record.'}</td>
                      <td style={{ fontWeight: 700, color: dmg.estimatedCost > 0 ? '#EF4444' : '#94A3B8' }}>
                        {dmg.estimatedCost ? formatCurrency(dmg.estimatedCost) : '—'}
                      </td>
                      <td>
                        <span className={`badge ${
                          dmg.status === 'REPAIRED' ? 'badge-success' :
                          dmg.status === 'UNDER_REPAIR' ? 'badge-warning' : 'badge-danger'
                        }`}>
                          {dmg.status || 'PENDING_INSPECTION'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          {(!dmg.status || dmg.status === 'PENDING_INSPECTION') && (
                            <button
                              className="btn btn-warning btn-sm"
                              onClick={() => handleUpdateDamageStatus(dmg, 'UNDER_REPAIR')}
                            >
                              Send to Repair
                            </button>
                          )}
                          {dmg.status === 'UNDER_REPAIR' && (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleUpdateDamageStatus(dmg, 'REPAIRED')}
                            >
                              Mark Repaired
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {damages.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                      No bike damage reports on file.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: CHALLANS */}
        {activeTab === 'challans' && (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Challan #</th>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Violation Reason</th>
                  <th>Amount</th>
                  <th>Responsibility</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {challans.map(c => {
                  const driver = driversMap[c.driverId];
                  return (
                    <tr key={c.id}>
                      <td><b>{c.challanNumber}</b></td>
                      <td>{c.date}</td>
                      <td>{c.bikeId}</td>
                      <td>
                        <b>{driver?.fullName || 'Driver'}</b>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{c.driverId}</div>
                      </td>
                      <td>{c.reason}</td>
                      <td style={{ color: '#EF4444', fontWeight: 700 }}>{formatCurrency(c.amount)}</td>
                      <td>
                        <span className={`badge ${c.responsibility === 'DRIVER' ? 'badge-danger' : c.responsibility === 'OWNER' ? 'badge-info' : 'badge-warning'}`}>
                          {c.responsibility}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${c.status === 'PAID' ? 'badge-success' : 'badge-neutral'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        {c.status !== 'PAID' && (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleUpdateChallanStatus(c, 'PAID')}
                          >
                            Mark Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {challans.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                      No traffic challans recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Challan Modal */}
      <Modal
        isOpen={challanModal}
        onClose={() => setChallanModal(false)}
        title="Record Traffic Challan"
      >
        <form onSubmit={handleAddChallan}>
          <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Challan Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. DL1234567890"
                value={newChallan.challanNumber}
                onChange={(e) => setNewChallan({ ...newChallan, challanNumber: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Challan Amount (₹)</label>
              <input
                type="number"
                className="form-input"
                placeholder="e.g. 500"
                value={newChallan.amount}
                onChange={(e) => setNewChallan({ ...newChallan, amount: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Driver</label>
              <select
                className="form-select"
                value={newChallan.driverId}
                onChange={(e) => setNewChallan({ ...newChallan, driverId: e.target.value })}
                required
              >
                <option value="">-- Select Driver --</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.fullName} ({d.mobileNumber})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Vehicle</label>
              <select
                className="form-select"
                value={newChallan.bikeId}
                onChange={(e) => setNewChallan({ ...newChallan, bikeId: e.target.value })}
                required
              >
                <option value="">-- Select Bike --</option>
                {bikes.map(b => (
                  <option key={b.id} value={b.registrationNumber}>{b.registrationNumber} ({b.make} {b.model})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Violation Reason</label>
            <input
              type="text"
              className="form-input"
              value={newChallan.reason}
              onChange={(e) => setNewChallan({ ...newChallan, reason: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Responsibility Assessment (Subject to review)</label>
            <select
              className="form-select"
              value={newChallan.responsibility}
              onChange={(e) => setNewChallan({ ...newChallan, responsibility: e.target.value })}
            >
              <option value="UNDER_REVIEW">Under Review (Do not deduct automatically)</option>
              <option value="DRIVER">Driver Liability (Authorised)</option>
              <option value="OWNER">Owner / Vehicle Compliance Issue</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setChallanModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Recording...' : 'Save Challan Record'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Bike Damage Modal */}
      <Modal
        isOpen={damageModal}
        onClose={() => setDamageModal(false)}
        title="Record Bike Damage Report"
      >
        <form onSubmit={handleAddDamage}>
          <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Vehicle / Bike</label>
              <select
                className="form-select"
                value={newDamage.bikeId}
                onChange={(e) => setNewDamage({ ...newDamage, bikeId: e.target.value })}
                required
              >
                <option value="">-- Select Damaged Bike --</option>
                {bikes.map(b => (
                  <option key={b.id} value={b.registrationNumber}>{b.registrationNumber} ({b.make} {b.model})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Driver (Optional / Last User)</label>
              <select
                className="form-select"
                value={newDamage.driverId}
                onChange={(e) => setNewDamage({ ...newDamage, driverId: e.target.value })}
              >
                <option value="">-- General / Depot (No Driver) --</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.fullName} ({d.mobileNumber})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Damage Condition</label>
              <select
                className="form-select"
                value={newDamage.condition}
                onChange={(e) => setNewDamage({ ...newDamage, condition: e.target.value })}
              >
                <option value="DENT_OR_SCRATCH">Dent / Body Scratches</option>
                <option value="BROKEN_MIRROR">Broken Rearview Mirror</option>
                <option value="LIGHT_INDICATOR_DAMAGE">Headlight / Indicator Broken</option>
                <option value="FLAT_TYRE">Punctured / Flat Tyre</option>
                <option value="BRAKE_OR_CLUTCH_FAULT">Brake / Clutch Failure</option>
                <option value="ENGINE_MECHANICAL_FAULT">Engine / Motor Failure</option>
                <option value="MAJOR_COLLISION">Major Accident / Frame Damage</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Estimated Repair Cost (₹)</label>
              <input
                type="number"
                className="form-input"
                placeholder="e.g. 1500"
                value={newDamage.estimatedCost}
                onChange={(e) => setNewDamage({ ...newDamage, estimatedCost: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Damage Responsibility</label>
            <select
              className="form-select"
              value={newDamage.responsibility}
              onChange={(e) => setNewDamage({ ...newDamage, responsibility: e.target.value })}
            >
              <option value="DRIVER">Driver Negligence / Rash Riding</option>
              <option value="DEPOT_WEAR">Normal Wear & Tear / Depot Cost</option>
              <option value="THIRD_PARTY">Third Party Hit & Run / Insurance</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Damage Inspection Description & Findings</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Describe damaged parts, scratch locations, repair requirements..."
              value={newDamage.description}
              onChange={(e) => setNewDamage({ ...newDamage, description: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setDamageModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Recording...' : 'Save Damage Report'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
