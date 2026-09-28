import React, { useState, useEffect } from 'react';
import { 
  Home, 
  MapPin, 
  CheckCircle, 
  XCircle, 
  RotateCw, 
  Calendar 
} from 'lucide-react';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { formatDateTime } from '../utils/formatters';
import Modal from '../components/Modal';

export default function AddressVerification() {
  const [addresses, setAddresses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedAddr, setSelectedAddr] = useState(null);
  const [verifModal, setVerifModal] = useState({
    isOpen: false,
    result: 'VERIFIED',
    officerName: 'Field Inspector',
    latitude: '28.6139',
    longitude: '77.2090',
    notes: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubAddr = subscribeToCollection('addresses', setAddresses);
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    return () => {
      unsubAddr();
      unsubDrivers();
    };
  }, []);

  const driversMap = Object.fromEntries(drivers.map(d => [d.id, d]));

  const handleSubmitVerification = async () => {
    if (!selectedAddr) return;
    setLoading(true);
    try {
      const isVerified = verifModal.result === 'VERIFIED';
      const addrRef = doc(db, 'addresses', selectedAddr.id);

      // Update address document
      await updateDoc(addrRef, {
        isVerified,
        verificationStatus: verifModal.result,
        verifiedBy: verifModal.officerName,
        verifiedAt: new Date().toISOString(),
        verificationNotes: verifModal.notes,
        verificationGps: {
          latitude: Number(verifModal.latitude) || null,
          longitude: Number(verifModal.longitude) || null
        },
        updatedAt: serverTimestamp()
      });

      // Record in immutable addressVerifications collection
      await addDoc(collection(db, 'addressVerifications'), {
        addressId: selectedAddr.id,
        driverId: selectedAddr.driverId,
        result: verifModal.result,
        officer: verifModal.officerName,
        gps: {
          latitude: Number(verifModal.latitude) || null,
          longitude: Number(verifModal.longitude) || null
        },
        notes: verifModal.notes,
        timestamp: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });

      // Progress driver status if address is verified
      if (isVerified) {
        await updateDoc(doc(db, 'drivers', selectedAddr.driverId), {
          addressVerified: true,
          accountStatus: 'APPROVED_BIKE_NOT_ASSIGNED',
          approvalStatus: 'APPROVED'
        });
      }

      await logAdminAudit({
        driverId: selectedAddr.driverId,
        action: `ADDRESS_VERIFICATION_${verifModal.result}`,
        relevantRecordId: selectedAddr.id,
        notes: `Physical address verification: ${verifModal.result} by ${verifModal.officerName}`
      });

      setVerifModal({ isOpen: false, result: 'VERIFIED', officerName: '', latitude: '', longitude: '', notes: '' });
      setSelectedAddr(null);
    } catch (err) {
      alert(`Error recording address verification: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Home size={18} color="#F59E0B" />
            <span>Driver Physical Address Verification</span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Current Address</th>
                <th>Permanent Address</th>
                <th>Status</th>
                <th>Verified By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {addresses.map(a => {
                const driver = driversMap[a.driverId];
                return (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#FFF' }}>{driver?.fullName || a.driverName || 'Driver'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{a.driverId}</div>
                    </td>
                    <td>{a.currentAddress || '—'}</td>
                    <td>{a.permanentAddress || '—'}</td>
                    <td>
                      <span className={`badge ${
                        a.isVerified || a.verificationStatus === 'VERIFIED' ? 'badge-success' :
                        a.verificationStatus === 'FAILED' ? 'badge-danger' :
                        a.verificationStatus === 'REVISIT_REQUIRED' ? 'badge-warning' : 'badge-neutral'
                      }`}>
                        {a.verificationStatus || (a.isVerified ? 'VERIFIED' : 'PENDING VISIT')}
                      </span>
                    </td>
                    <td>
                      <div>{a.verifiedBy || '—'}</div>
                      {a.verifiedAt && <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{formatDateTime(a.verifiedAt)}</div>}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSelectedAddr(a);
                          setVerifModal({
                            isOpen: true,
                            result: 'VERIFIED',
                            officerName: 'Inspector Kumar',
                            latitude: '28.6139',
                            longitude: '77.2090',
                            notes: 'Physical residence confirmed. Met family member.'
                          });
                        }}
                      >
                        <MapPin size={14} /> Record Visit
                      </button>
                    </td>
                  </tr>
                );
              })}

              {addresses.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                    No pending address verification requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Physical Visit Modal */}
      <Modal
        isOpen={verifModal.isOpen}
        onClose={() => setVerifModal(prev => ({ ...prev, isOpen: false }))}
        title="Record Physical Address Verification"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setVerifModal(prev => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmitVerification}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Physical Verification'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Verification Outcome</label>
          <select
            className="form-select"
            value={verifModal.result}
            onChange={(e) => setVerifModal(prev => ({ ...prev, result: e.target.value }))}
          >
            <option value="VERIFIED">Verified (Address Confirmed)</option>
            <option value="FAILED">Failed (Address Not Found / Fake)</option>
            <option value="REVISIT_REQUIRED">Revisit Required (Driver Absent / Locked)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Verification Officer Name</label>
          <input
            type="text"
            className="form-input"
            value={verifModal.officerName}
            onChange={(e) => setVerifModal(prev => ({ ...prev, officerName: e.target.value }))}
            required
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Officer GPS Latitude</label>
            <input
              type="text"
              className="form-input"
              value={verifModal.latitude}
              onChange={(e) => setVerifModal(prev => ({ ...prev, latitude: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Officer GPS Longitude</label>
            <input
              type="text"
              className="form-input"
              value={verifModal.longitude}
              onChange={(e) => setVerifModal(prev => ({ ...prev, longitude: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Inspection Notes & Findings</label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder="Record who was present, landmarks, house number check..."
            value={verifModal.notes}
            onChange={(e) => setVerifModal(prev => ({ ...prev, notes: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
