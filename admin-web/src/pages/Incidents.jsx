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

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, padding: 2 }}>
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
                        {inc.gps ? (
                          <code>{inc.gps.latitude?.toFixed(4)}, {inc.gps.longitude?.toFixed(4)}</code>
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
                  <th>Bike ID</th>
                  <th>Driver</th>
                  <th>Condition</th>
                  <th>Description</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {damages.map(dmg => (
                  <tr key={dmg.id}>
                    <td>{formatDateTime(dmg.timestamp || dmg.createdAt)}</td>
                    <td><b>{dmg.bikeId}</b></td>
                    <td>{dmg.driverId}</td>
                    <td><span className="badge badge-warning">{dmg.condition}</span></td>
                    <td>{dmg.description || 'Inspection flagged damage.'}</td>
                    <td><span className="badge badge-danger">{dmg.status || 'PENDING_INSPECTION'}</span></td>
                  </tr>
                ))}

                {damages.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
    </div>
  );
}
