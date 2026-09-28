import React, { useState, useEffect } from 'react';
import { CalendarOff, CheckCircle, XCircle, Clock } from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { formatDateTime } from '../utils/formatters';
import Modal from '../components/Modal';

export default function LeaveRequests() {
  const [leaves, setLeaves] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [decisionModal, setDecisionModal] = useState({ isOpen: false, leave: null, status: '', reason: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubLeaves = subscribeToCollection('leaveRequests', setLeaves);
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    return () => {
      unsubLeaves();
      unsubDrivers();
    };
  }, []);

  const driversMap = Object.fromEntries(drivers.map(d => [d.id, d]));

  const handleDecision = async () => {
    const { leave, status, reason } = decisionModal;
    if (!leave || !status) return;

    setLoading(true);
    try {
      const leaveRef = doc(db, 'leaveRequests', leave.id);
      await updateDoc(leaveRef, {
        status,
        adminNotes: reason || null,
        decidedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      await logAdminAudit({
        driverId: leave.driverId,
        action: `LEAVE_${status}`,
        relevantRecordId: leave.id,
        notes: `Leave from ${leave.startDate} to ${leave.endDate || leave.startDate} marked as ${status}. Reason: ${reason || 'Approved'}`
      });

      setDecisionModal({ isOpen: false, leave: null, status: '', reason: '' });
    } catch (err) {
      alert(`Error updating leave: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <CalendarOff size={18} color="#F59E0B" />
            <span>Driver Leave & Weekly Off Management</span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Leave Dates</th>
                <th>Days / Duration</th>
                <th>Reason</th>
                <th>Requested At</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map(l => {
                const driver = driversMap[l.driverId];
                return (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#FFF' }}>{driver?.fullName || 'Driver'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{l.driverId}</div>
                    </td>
                    <td><b>{l.startDate} {l.endDate && l.endDate !== l.startDate ? `→ ${l.endDate}` : ''}</b></td>
                    <td>{l.durationDays || 1} Day(s)</td>
                    <td>{l.reason || 'Personal / Weekly Off'}</td>
                    <td>{formatDateTime(l.createdAt || l.requestedAt)}</td>
                    <td>
                      <span className={`badge ${
                        l.status === 'APPROVED' ? 'badge-success' :
                        l.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'
                      }`}>
                        {l.status || 'PENDING'}
                      </span>
                    </td>
                    <td>
                      {l.status === 'PENDING' && (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => setDecisionModal({ isOpen: true, leave: l, status: 'APPROVED', reason: '' })}
                          >
                            <CheckCircle size={14} /> Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDecisionModal({ isOpen: true, leave: l, status: 'REJECTED', reason: '' })}
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {leaves.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                    No leave requests submitted.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={decisionModal.isOpen}
        onClose={() => setDecisionModal({ isOpen: false, leave: null, status: '', reason: '' })}
        title={`Decision on Leave Request (${decisionModal.status})`}
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setDecisionModal({ isOpen: false, leave: null, status: '', reason: '' })}
            >
              Cancel
            </button>
            <button
              className={`btn ${decisionModal.status === 'APPROVED' ? 'btn-success' : 'btn-danger'}`}
              onClick={handleDecision}
              disabled={loading}
            >
              {loading ? 'Saving...' : `Confirm ${decisionModal.status}`}
            </button>
          </>
        }
      >
        <p style={{ color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Mark this leave request as <b>{decisionModal.status}</b>.
        </p>

        <div className="form-group">
          <label className="form-label">Notes for Driver</label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder="Optional comments or conditions..."
            value={decisionModal.reason}
            onChange={(e) => setDecisionModal(prev => ({ ...prev, reason: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
