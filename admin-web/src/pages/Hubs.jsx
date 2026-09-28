import React, { useState, useEffect } from 'react';
import { Warehouse, Plus, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import Modal from '../components/Modal';

export default function Hubs() {
  const [hubs, setHubs] = useState([]);
  const [addModal, setAddModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [newHub, setNewHub] = useState({
    name: '',
    address: '',
    latitude: '28.6328',
    longitude: '77.2197',
    radiusMeters: 400,
    managerContact: '+91 9876543210'
  });

  useEffect(() => {
    return subscribeToCollection('hubs', setHubs);
  }, []);

  const handleAddHub = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const hubId = `hub_${Date.now()}`;
      await setDoc(doc(db, 'hubs', hubId), {
        id: hubId,
        name: newHub.name,
        address: newHub.address,
        latitude: Number(newHub.latitude),
        longitude: Number(newHub.longitude),
        radiusMeters: Number(newHub.radiusMeters),
        managerContact: newHub.managerContact,
        active: true,
        createdAt: serverTimestamp()
      });

      await logAdminAudit({
        action: 'HUB_CREATED',
        relevantRecordId: hubId,
        newValue: newHub.name,
        notes: `Created authorized hub: ${newHub.name} with ${newHub.radiusMeters}m geofence`
      });

      setAddModal(false);
      setNewHub({
        name: '',
        address: '',
        latitude: '28.6328',
        longitude: '77.2197',
        radiusMeters: 400,
        managerContact: '+91 9876543210'
      });
    } catch (err) {
      alert(`Error creating hub: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Warehouse size={18} color="#F59E0B" />
            <span>Authorized Pickup & Return Depots ({hubs.length} Hubs)</span>
          </div>
          <button className="btn btn-primary" onClick={() => setAddModal(true)}>
            <Plus size={16} /> Add Authorized Depot
          </button>
        </div>

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Hub Name</th>
                <th>Physical Address</th>
                <th>GPS Coordinates</th>
                <th>Geofence Radius</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {hubs.map(h => (
                <tr key={h.id}>
                  <td><b>{h.name}</b></td>
                  <td>{h.address}</td>
                  <td><code>{h.latitude?.toFixed(4)}, {h.longitude?.toFixed(4)}</code></td>
                  <td><span className="badge badge-warning">{h.radiusMeters || 300} meters</span></td>
                  <td>{h.managerContact || '—'}</td>
                  <td>
                    <span className="badge badge-success">
                      <ShieldCheck size={12} /> ACTIVE DEPOT
                    </span>
                  </td>
                </tr>
              ))}

              {hubs.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                    No authorized hubs configured. Click "Add Authorized Depot" to set up your first depot.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Hub Modal */}
      <Modal
        isOpen={addModal}
        onClose={() => setAddModal(false)}
        title="Add Authorized Pickup & Return Depot"
      >
        <form onSubmit={handleAddHub}>
          <div className="form-group">
            <label className="form-label">Hub / Depot Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. South Extension Depot"
              value={newHub.name}
              onChange={(e) => setNewHub({ ...newHub, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Physical Street Address</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="Complete address of the depot..."
              value={newHub.address}
              onChange={(e) => setNewHub({ ...newHub, address: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Depot Latitude</label>
              <input
                type="text"
                className="form-input"
                value={newHub.latitude}
                onChange={(e) => setNewHub({ ...newHub, latitude: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Depot Longitude</label>
              <input
                type="text"
                className="form-input"
                value={newHub.longitude}
                onChange={(e) => setNewHub({ ...newHub, longitude: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Authorized Geofence Radius (meters)</label>
              <input
                type="number"
                className="form-input"
                value={newHub.radiusMeters}
                onChange={(e) => setNewHub({ ...newHub, radiusMeters: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Manager Contact Phone</label>
              <input
                type="text"
                className="form-input"
                value={newHub.managerContact}
                onChange={(e) => setNewHub({ ...newHub, managerContact: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAddModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving Depot...' : 'Create Depot'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
