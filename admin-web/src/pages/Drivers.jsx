import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  CheckCircle, 
  XCircle, 
  Ban, 
  RotateCcw, 
  Eye, 
  Bike, 
  FileText,
  Star
} from 'lucide-react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { DRIVER_STATES, getDriverEffectiveStatus, matchesLifecycleState } from '../utils/constants';
import { formatDateTime } from '../utils/formatters';
import Modal from '../components/Modal';

export default function Drivers({ onSelectDriver }) {
  const [drivers, setDrivers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [actionModal, setActionModal] = useState({ isOpen: false, type: '', driver: null, reason: '' });
  const [ratingModal, setRatingModal] = useState({ isOpen: false, driver: null, rating: 5, notes: '' });
  const [loading, setLoading] = useState(false);

  // Dynamic Driver Performance Star Rating (1.0 to 5.0 Stars)
  const calculateDriverRating = (driver) => {
    if (typeof driver.rating === 'number' && driver.rating >= 1 && driver.rating <= 5) {
      return { score: driver.rating.toFixed(1), isManual: true };
    }
    if (typeof driver.starRating === 'number') {
      return { score: driver.starRating.toFixed(1), isManual: true };
    }

    let base = 5.0;
    if (driver.accountStatus === 'SUSPENDED' || driver.isSuspended) base -= 2.5;
    if (driver.approvalStatus === 'REJECTED') base -= 3.0;
    if (driver.verificationStatus !== 'DOCUMENTS_VERIFIED') base -= 0.5;

    const speedViolations = Number(driver.speedViolationCount) || 0;
    base -= Math.min(1.5, speedViolations * 0.3);

    const finalScore = Math.max(1.0, Math.min(5.0, base));
    return { score: finalScore.toFixed(1), isManual: false };
  };

  useEffect(() => {
    return subscribeToCollection('drivers', setDrivers);
  }, []);

  const filteredDrivers = drivers.filter(d => {
    const matchesSearch = 
      (d.fullName || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.mobileNumber || '').includes(search) ||
      (d.id || '').toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;
    return matchesLifecycleState(d, statusFilter);
  });

  const handleStatusChange = async () => {
    const { type, driver, reason } = actionModal;
    if (!driver) return;

    setLoading(true);
    try {
      const driverRef = doc(db, 'drivers', driver.id);
      let updates = { updatedAt: serverTimestamp() };
      let auditAction = '';

      if (type === 'APPROVE') {
        if (driver.verificationStatus !== 'DOCUMENTS_VERIFIED') {
          alert('Cannot approve driver! KYC documents have not been verified yet. Please review and verify their documents in the Document Verification Queue first.');
          setLoading(false);
          setActionModal({ isOpen: false, type: '', driver: null, reason: '' });
          return;
        }
        updates.approvalStatus = 'APPROVED';
        updates.accountStatus = driver.assignedBikeId ? 'BIKE_ASSIGNED' : 'APPROVED_BIKE_NOT_ASSIGNED';
        updates.approvedAt = new Date().toISOString();
        auditAction = 'DRIVER_APPROVED';
      } else if (type === 'REJECT') {
        updates.approvalStatus = 'REJECTED';
        updates.accountStatus = 'REJECTED';
        updates.rejectionReason = reason;
        auditAction = 'DRIVER_REJECTED';
      } else if (type === 'SUSPEND') {
        updates.accountStatus = 'SUSPENDED';
        updates.status = 'SUSPENDED';
        updates.isSuspended = true;
        updates.suspensionReason = reason || 'Suspended by fleet operations administrator';
        auditAction = 'DRIVER_SUSPENDED';

        if (driver.boundDeviceId) {
          await setDoc(doc(db, 'driverDevices', driver.boundDeviceId), {
            status: 'SUSPENDED',
            suspensionReason: reason || 'Driver account suspended',
            policyStatus: 'RESTRICTED',
            updatedAt: serverTimestamp()
          }, { merge: true }).catch(() => {});
          await setDoc(doc(db, 'devices', driver.boundDeviceId), {
            status: 'SUSPENDED',
            suspensionReason: reason || 'Driver account suspended',
            policyStatus: 'RESTRICTED',
            updatedAt: serverTimestamp()
          }, { merge: true }).catch(() => {});
        }
      } else if (type === 'REACTIVATE') {
        updates.accountStatus = driver.assignedBikeId ? 'ACTIVE_DRIVER' : 'APPROVED_BIKE_NOT_ASSIGNED';
        updates.status = 'ACTIVE';
        updates.isSuspended = false;
        updates.suspensionReason = null;
        auditAction = 'DRIVER_REACTIVATED';

        if (driver.boundDeviceId) {
          await setDoc(doc(db, 'driverDevices', driver.boundDeviceId), {
            status: 'ACTIVE',
            suspensionReason: null,
            policyStatus: 'COMPLIANT',
            updatedAt: serverTimestamp()
          }, { merge: true }).catch(() => {});
          await setDoc(doc(db, 'devices', driver.boundDeviceId), {
            status: 'ACTIVE',
            suspensionReason: null,
            policyStatus: 'COMPLIANT',
            updatedAt: serverTimestamp()
          }, { merge: true }).catch(() => {});
        }
      } else if (type === 'CLOSE') {
        updates.accountStatus = 'ACCOUNT_CLOSED';
        auditAction = 'DRIVER_ACCOUNT_CLOSED';
      } else if (type === 'RESET_DEVICE') {
        updates.boundDeviceId = null;
        updates.boundDeviceModel = null;
        updates.boundAt = null;
        auditAction = 'DRIVER_DEVICE_UNBOUND';

        if (driver.boundDeviceId) {
          const devDriverRef = doc(db, 'driverDevices', driver.boundDeviceId);
          const devRef = doc(db, 'devices', driver.boundDeviceId);
          const unbindDevPayload = {
            assignedDriverId: null,
            assignedDriverName: null,
            assignedDriverPhone: null,
            driverId: null,
            assignedBikeId: null,
            dutyStatus: 'OFF_DUTY',
            updatedAt: serverTimestamp()
          };
          await setDoc(devDriverRef, unbindDevPayload, { merge: true }).catch(() => {});
          await setDoc(devRef, unbindDevPayload, { merge: true }).catch(() => {});
        }
      }

      await updateDoc(driverRef, updates);

      await logAdminAudit({
        driverId: driver.id,
        action: auditAction,
        previousValue: driver.accountStatus || 'N/A',
        newValue: updates.accountStatus || driver.accountStatus || 'DEVICE_RESET',
        notes: reason || `Driver action performed: ${auditAction}`
      });

      setActionModal({ isOpen: false, type: '', driver: null, reason: '' });
    } catch (err) {
      alert(`Error updating driver: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRating = async (e) => {
    e.preventDefault();
    if (!ratingModal.driver) return;
    setLoading(true);
    try {
      const numRating = parseFloat(ratingModal.rating);
      await updateDoc(doc(db, 'drivers', ratingModal.driver.id), {
        rating: numRating,
        ratingNotes: ratingModal.notes || '',
        ratingUpdatedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      await logAdminAudit({
        driverId: ratingModal.driver.id,
        action: 'DRIVER_RATING_UPDATED',
        relevantRecordId: ratingModal.driver.id,
        newValue: `${numRating} Stars`,
        notes: `Driver performance star rating updated to ${numRating} Stars. ${ratingModal.notes ? 'Notes: ' + ratingModal.notes : ''}`
      });

      alert(`Rating for ${ratingModal.driver.fullName || 'Driver'} updated to ${numRating} ⭐!`);
      setRatingModal({ isOpen: false, driver: null, rating: 5, notes: '' });
    } catch (err) {
      alert(`Error updating rating: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'ACTIVE_DRIVER': return 'badge-success';
      case 'APPROVED':
      case 'APPROVED_BIKE_NOT_ASSIGNED': return 'badge-info';
      case 'SUSPENDED':
      case 'REJECTED': return 'badge-danger';
      case 'DOCUMENT_VERIFICATION_PENDING':
      case 'ADDRESS_VERIFICATION_PENDING':
      case 'DOCUMENTS_SUBMITTED': return 'badge-warning';
      default: return 'badge-neutral';
    }
  };

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Users size={18} color="#F59E0B" />
            <span>Driver Directory ({filteredDrivers.length})</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search name, phone, ID..."
                className="form-input"
                style={{ paddingLeft: '2.2rem', width: 240 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#64748B' }} />
            </div>

            <select
              className="form-select"
              style={{ minWidth: 260 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Lifecycle States ({drivers.length})</option>
              {Object.entries(DRIVER_STATES).map(([k, label]) => {
                const count = drivers.filter(d => matchesLifecycleState(d, k)).length;
                return (
                  <option key={k} value={k}>
                    {label} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Driver ID / Name</th>
                <th>Mobile Number</th>
                <th>Performance Rating</th>
                <th>Assigned Bike</th>
                <th>Status</th>
                <th>Approval</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.map(d => {
                const effStatus = getDriverEffectiveStatus(d);
                return (
                <tr key={d.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: '#FFF' }}>{d.fullName || 'New Applicant'}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{d.id}</div>
                  </td>
                  <td>{d.mobileNumber || '—'}</td>
                  <td>
                    {(() => {
                      const { score, isManual } = calculateDriverRating(d);
                      const numScore = parseFloat(score);
                      const starColor = numScore >= 4.5 ? '#10B981' : numScore >= 3.5 ? '#F59E0B' : '#EF4444';
                      const bg = numScore >= 4.0 ? 'rgba(16, 185, 129, 0.12)' : numScore >= 3.0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)';
                      return (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: bg,
                            color: starColor,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontWeight: 700,
                            fontSize: '0.82rem'
                          }}>
                            <Star size={13} fill={starColor} color={starColor} />
                            {score} / 5.0
                          </span>
                          <span style={{ fontSize: '0.65rem', color: '#64748B' }}>
                            {isManual ? 'Admin verified' : 'Telemetry score'}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    {d.assignedBikeRegistration ? (
                      <span className="badge badge-info">
                        <Bike size={12} /> {d.assignedBikeRegistration}
                      </span>
                    ) : (
                      <span style={{ color: '#64748B' }}>None</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${effStatus.badgeClass}`}>
                      {effStatus.label}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${d.approvalStatus === 'APPROVED' ? 'badge-success' : d.approvalStatus === 'REJECTED' ? 'badge-danger' : 'badge-warning'}`}>
                      {d.approvalStatus || 'PENDING'}
                    </span>
                  </td>
                  <td>{formatDateTime(d.registeredAt || d.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => onSelectDriver(d)}
                        title="View Full Profile"
                      >
                        <Eye size={14} /> View
                      </button>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#FCD34D' }}
                        onClick={() => setRatingModal({
                          isOpen: true,
                          driver: d,
                          rating: d.rating || Number(calculateDriverRating(d).score),
                          notes: d.ratingNotes || ''
                        })}
                        title="Update Star Rating"
                      >
                        <Star size={13} /> Rating
                      </button>

                      {d.approvalStatus !== 'APPROVED' && (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => setActionModal({ isOpen: true, type: 'APPROVE', driver: d, reason: '' })}
                          title="Approve Driver"
                        >
                          <CheckCircle size={14} /> Approve
                        </button>
                      )}

                      {d.approvalStatus !== 'REJECTED' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setActionModal({ isOpen: true, type: 'REJECT', driver: d, reason: '' })}
                          title="Reject Driver"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      )}

                      {!d.isSuspended ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#F87171' }}
                          onClick={() => setActionModal({ isOpen: true, type: 'SUSPEND', driver: d, reason: '' })}
                          title="Suspend Driver"
                        >
                          <Ban size={14} /> Suspend
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34D399' }}
                          onClick={() => setActionModal({ isOpen: true, type: 'REACTIVATE', driver: d, reason: '' })}
                          title="Reactivate Driver"
                        >
                          <RotateCcw size={14} /> Reactivate
                        </button>
                      )}

                      {d.boundDeviceId && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#FBBF24' }}
                          onClick={() => setActionModal({ isOpen: true, type: 'RESET_DEVICE', driver: d, reason: 'Company phone replacement' })}
                          title={`Bound to hardware ID [${d.boundDeviceId.slice(-6)}]. Click to unbind.`}
                        >
                          📱 Unbind Phone
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}

              {filteredDrivers.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <div style={{ color: '#E2E8F0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      No drivers found in &ldquo;{DRIVER_STATES[statusFilter] || statusFilter}&rdquo;
                    </div>
                    <div style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                      {statusFilter !== 'ALL' 
                        ? `There are currently 0 drivers in the "${DRIVER_STATES[statusFilter] || statusFilter}" lifecycle stage.` 
                        : 'No drivers found matching your search term.'}
                    </div>
                    {(statusFilter !== 'ALL' || search) && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', margin: '0 auto' }}
                        onClick={() => { setStatusFilter('ALL'); setSearch(''); }}
                      >
                        <RotateCcw size={14} /> Show All Lifecycle States ({drivers.length})
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation / Reason Modal */}
      <Modal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal({ isOpen: false, type: '', driver: null, reason: '' })}
        title={`${actionModal.type} Driver: ${actionModal.driver?.fullName || actionModal.driver?.id}`}
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setActionModal({ isOpen: false, type: '', driver: null, reason: '' })}
            >
              Cancel
            </button>
            <button
              className={`btn ${actionModal.type === 'APPROVE' || actionModal.type === 'REACTIVATE' ? 'btn-success' : 'btn-danger'}`}
              onClick={handleStatusChange}
              disabled={loading || (actionModal.type !== 'APPROVE' && actionModal.type !== 'REACTIVATE' && !actionModal.reason)}
            >
              {loading ? 'Processing...' : `Confirm ${actionModal.type}`}
            </button>
          </>
        }
      >
        <p style={{ color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Are you sure you want to <b>{actionModal.type.toLowerCase()}</b> this driver? An immutable audit entry will be created.
        </p>

        {actionModal.type !== 'APPROVE' && actionModal.type !== 'REACTIVATE' && (
          <div className="form-group">
            <label className="form-label">Mandatory Reason / Notes</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="State the explicit operational reason..."
              value={actionModal.reason}
              onChange={(e) => setActionModal(prev => ({ ...prev, reason: e.target.value }))}
            />
          </div>
        )}
      </Modal>

      {/* Update Performance Star Rating Modal */}
      <Modal
        isOpen={ratingModal.isOpen}
        onClose={() => setRatingModal({ isOpen: false, driver: null, rating: 5, notes: '' })}
        title={`Performance Rating: ${ratingModal.driver?.fullName || 'Driver'}`}
      >
        <form onSubmit={handleSaveRating}>
          <div style={{
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '8px',
            padding: '0.85rem',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            color: '#FDE68A'
          }}>
            ⭐ Set driver's official platform rating based on customer feedback, punctuality, speed adherence, and depot vehicle care.
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">Star Rating (1.0 to 5.0)</label>
            <select
              className="form-select"
              value={ratingModal.rating}
              onChange={(e) => setRatingModal({ ...ratingModal, rating: e.target.value })}
              style={{ fontSize: '1rem', fontWeight: 600 }}
            >
              <option value="5.0">⭐⭐⭐⭐⭐ 5.0 - Excellent / Top Performer</option>
              <option value="4.8">⭐⭐⭐⭐⭐ 4.8 - Very Good</option>
              <option value="4.5">⭐⭐⭐⭐ 4.5 - Good</option>
              <option value="4.0">⭐⭐⭐⭐ 4.0 - Satisfactory</option>
              <option value="3.5">⭐⭐⭐ 3.5 - Average</option>
              <option value="3.0">⭐⭐⭐ 3.0 - Needs Improvement</option>
              <option value="2.0">⭐⭐ 2.0 - Poor / Safety Warnings</option>
              <option value="1.0">⭐ 1.0 - Severe Violations</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">Rating Notes / Feedback (Optional)</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="e.g. Excellent vehicle maintenance, punctual shift handover, zero complaints..."
              value={ratingModal.notes}
              onChange={(e) => setRatingModal({ ...ratingModal, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRatingModal({ isOpen: false, driver: null, rating: 5, notes: '' })}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Rating ⭐'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
