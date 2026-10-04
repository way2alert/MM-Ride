import React, { useState, useEffect } from 'react';
import { 
  Home, 
  MapPin, 
  CheckCircle, 
  XCircle, 
  RotateCw, 
  Calendar,
  LocateFixed,
  Loader2
} from 'lucide-react';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
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
    latitude: '',
    longitude: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState({
    loading: false,
    success: false,
    error: null,
    accuracy: null
  });

  const fetchCurrentGps = () => {
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

        setVerifModal(prev => ({
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
        let msg = 'Failed to detect officer GPS location.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission denied. Please allow GPS location in your browser settings.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'GPS signal unavailable. Please ensure mobile phone Location / GPS is turned ON.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'GPS location request timed out. Please tap retry.';
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
        const dSnap = await getDoc(doc(db, 'drivers', selectedAddr.driverId));
        const dData = dSnap.exists() ? dSnap.data() : {};
        const isKycDone = dData.verificationStatus === 'DOCUMENTS_VERIFIED';

        await updateDoc(doc(db, 'drivers', selectedAddr.driverId), {
          addressVerified: true,
          addressVerificationStatus: 'VERIFIED',
          ...(isKycDone ? {
            accountStatus: 'APPROVED_BIKE_NOT_ASSIGNED',
            approvalStatus: 'APPROVED'
          } : {})
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
                      {a.verificationGps && a.verificationGps.latitude && (
                        <div style={{ marginTop: '0.25rem' }}>
                          <a
                            href={`https://www.google.com/maps?q=${a.verificationGps.latitude},${a.verificationGps.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="badge badge-info"
                            style={{ fontSize: '0.68rem', padding: '2px 6px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                            title="Open verified location in Google Maps"
                          >
                            <MapPin size={10} />
                            <span>{Number(a.verificationGps.latitude).toFixed(4)}, {Number(a.verificationGps.longitude).toFixed(4)}</span>
                          </a>
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSelectedAddr(a);
                          setVerifModal({
                            isOpen: true,
                            result: 'VERIFIED',
                            officerName: 'Field Inspector',
                            latitude: '',
                            longitude: '',
                            notes: ''
                          });
                          fetchCurrentGps();
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

        {/* GPS Auto-Detection Card */}
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
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFF' }}>Officer Live GPS</span>
                <span style={{ display: 'block', fontSize: '0.72rem', color: '#94A3B8' }}>Auto-detected from phone sensor</span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchCurrentGps}
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
                  <span>Locking GPS...</span>
                </>
              ) : (
                <>
                  <LocateFixed size={14} />
                  <span>{verifModal.latitude ? 'Re-Detect GPS' : 'Auto-Fetch GPS'}</span>
                </>
              )}
            </button>
          </div>

          {gpsStatus.loading && (
            <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#FCD34D', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Loader2 size={13} className="spin" />
              <span>Querying device GPS sensors... Please allow location permission if prompted.</span>
            </div>
          )}

          {gpsStatus.success && (
            <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
              <CheckCircle size={14} />
              <span>GPS captured (Accuracy: ±{gpsStatus.accuracy}m). Latitude & Longitude auto-filled.</span>
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
            <label className="form-label">Officer GPS Latitude</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. 13.0827"
              value={verifModal.latitude}
              onChange={(e) => setVerifModal(prev => ({ ...prev, latitude: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Officer GPS Longitude</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. 80.2707"
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
