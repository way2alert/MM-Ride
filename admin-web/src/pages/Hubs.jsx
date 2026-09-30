import React, { useState, useEffect } from 'react';
import { Warehouse, Plus, MapPin, Phone, ShieldCheck, LocateFixed, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import Modal from '../components/Modal';

export default function Hubs() {
  const [hubs, setHubs] = useState([]);
  const [addModal, setAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState({
    loading: false,
    success: false,
    error: null,
    accuracy: null
  });

  const [newHub, setNewHub] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    radiusMeters: 400,
    managerContact: ''
  });

  const fetchDepotGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus({
        loading: false,
        success: false,
        error: 'Geolocation sensor is not supported by your browser.',
        accuracy: null
      });
      return;
    }

    setGpsStatus({ loading: true, success: false, error: null, accuracy: null });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const accuracy = Math.round(position.coords.accuracy);

        setNewHub(prev => ({
          ...prev,
          latitude: lat,
          longitude: lng
        }));

        setGpsStatus({
          loading: false,
          success: true,
          error: null,
          accuracy
        });
      },
      (error) => {
        let msg = 'Failed to detect depot GPS location.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission denied. Please allow GPS location in your browser.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'GPS signal unavailable. Ensure location is turned ON on this device.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'GPS location request timed out. Please try again.';
        }
        setGpsStatus({
          loading: false,
          success: false,
          error: msg,
          accuracy: null
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  };

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
        latitude: Number(newHub.latitude) || 0,
        longitude: Number(newHub.longitude) || 0,
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
        latitude: '',
        longitude: '',
        radiusMeters: 400,
        managerContact: ''
      });
      setGpsStatus({ loading: false, success: false, error: null, accuracy: null });
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
                  <td>
                    {h.latitude && h.longitude ? (
                      <a 
                        href={`https://www.google.com/maps?q=${h.latitude},${h.longitude}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="badge badge-info"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        title="Open Depot Location on Google Maps"
                      >
                        <MapPin size={11} />
                        <span>{Number(h.latitude).toFixed(4)}, {Number(h.longitude).toFixed(4)}</span>
                      </a>
                    ) : '—'}
                  </td>
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

          {/* GPS Auto-Detection for Depot */}
          <div style={{
            marginBottom: '1.25rem',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '10px',
            padding: '0.85rem 1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LocateFixed size={18} color="#F59E0B" />
                <div>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFF' }}>Depot Location GPS</span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: '#94A3B8' }}>Auto-fetch current position if standing at depot</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={fetchDepotGps}
                disabled={gpsStatus.loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  backgroundColor: '#F59E0B',
                  color: '#000',
                  fontWeight: 700,
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px'
                }}
              >
                {gpsStatus.loading ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>Detecting GPS...</span>
                  </>
                ) : (
                  <>
                    <LocateFixed size={14} />
                    <span>{newHub.latitude ? 'Re-Detect GPS' : 'Auto-Fetch Current GPS'}</span>
                  </>
                )}
              </button>
            </div>

            {gpsStatus.loading && (
              <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#FCD34D', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Loader2 size={13} className="spin" />
                <span>Reading device GPS satellites... Please allow browser location access if prompted.</span>
              </div>
            )}

            {gpsStatus.success && (
              <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                <CheckCircle size={14} />
                <span>Depot GPS locked (Accuracy: ±{gpsStatus.accuracy}m). Latitude & Longitude set.</span>
              </div>
            )}

            {gpsStatus.error && (
              <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                <XCircle size={14} />
                <span>{gpsStatus.error}</span>
              </div>
            )}
          </div>

          <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Depot Latitude</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 13.0827"
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
                placeholder="e.g. 80.2707"
                value={newHub.longitude}
                onChange={(e) => setNewHub({ ...newHub, longitude: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-row-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                placeholder="+91 98765 43210"
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
