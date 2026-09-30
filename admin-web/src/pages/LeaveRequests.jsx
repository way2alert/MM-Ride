import React, { useState, useEffect } from 'react';
import { 
  CalendarOff, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search, 
  Calendar, 
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { formatDateTime } from '../utils/formatters';
import Modal from '../components/Modal';

export default function LeaveRequests() {
  const [leaves, setLeaves] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
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

  // Live KPI metrics
  const pendingLeaves = leaves.filter(l => l.status === 'PENDING');
  const approvedLeaves = leaves.filter(l => l.status === 'APPROVED');
  const rejectedLeaves = leaves.filter(l => l.status === 'REJECTED');

  const filteredLeaves = leaves.filter(l => {
    const driver = driversMap[l.driverId];
    const driverName = (driver?.fullName || '').toLowerCase();
    const driverPhone = (driver?.mobileNumber || '');
    const reasonText = (l.reason || '').toLowerCase();
    const query = search.toLowerCase();

    const matchesSearch = driverName.includes(query) || driverPhone.includes(query) || reasonText.includes(query) || (l.driverId || '').toLowerCase().includes(query);
    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    return l.status === statusFilter;
  });

  const handleDecision = async () => {
    const { leave, status, reason } = decisionModal;
    if (!leave || !status) return;

    setLoading(true);
    try {
      const leaveRef = doc(db, 'leaveRequests', leave.id);
      await updateDoc(leaveRef, {
        status,
        adminNotes: reason || (status === 'APPROVED' ? 'Approved by Operations' : 'Request rejected by Operations'),
        decidedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      await logAdminAudit({
        driverId: leave.driverId,
        action: `LEAVE_${status}`,
        relevantRecordId: leave.id,
        notes: `Leave request (${leave.startDate} to ${leave.endDate || leave.startDate}) marked as ${status}. Admin notes: ${reason || 'Decision confirmed'}`
      });

      setDecisionModal({ isOpen: false, leave: null, status: '', reason: '' });
    } catch (err) {
      alert(`Error updating leave request: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* KPI Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1.1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
            Total Requests
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: '#FFF' }}>{leaves.length}</span>
            <Calendar size={22} color="#94A3B8" />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>Submitted by drivers</div>
        </div>

        <div className="stat-card" style={{ 
          background: pendingLeaves.length > 0 ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-card)', 
          border: pendingLeaves.length > 0 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-subtle)', 
          borderRadius: 10, 
          padding: '1.1rem' 
        }}>
          <div style={{ fontSize: '0.75rem', color: pendingLeaves.length > 0 ? '#FBBF24' : '#94A3B8', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
            Pending Review
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: pendingLeaves.length > 0 ? '#F59E0B' : '#94A3B8' }}>{pendingLeaves.length}</span>
            <Clock size={22} color={pendingLeaves.length > 0 ? '#F59E0B' : '#94A3B8'} />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>Awaiting admin action</div>
        </div>

        <div className="stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1.1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
            Approved Leaves
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10B981' }}>{approvedLeaves.length}</span>
            <CheckCircle size={22} color="#10B981" />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>Authorized time off</div>
        </div>

        <div className="stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1.1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
            Rejected
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: '#EF4444' }}>{rejectedLeaves.length}</span>
            <XCircle size={22} color="#EF4444" />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>Declined requests</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <CalendarOff size={18} color="#F59E0B" />
            <span>Driver Leave & Weekly Off Management ({filteredLeaves.length})</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search driver, phone, reason..."
                className="form-input"
                style={{ paddingLeft: '2.2rem', width: 230 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#64748B' }} />
            </div>

            <select
              className="form-select"
              style={{ width: 170 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses ({leaves.length})</option>
              <option value="PENDING">Pending Review ({pendingLeaves.length})</option>
              <option value="APPROVED">Approved ({approvedLeaves.length})</option>
              <option value="REJECTED">Rejected ({rejectedLeaves.length})</option>
            </select>
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
              {filteredLeaves.map(l => {
                const driver = driversMap[l.driverId];
                return (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#FFF' }}>{driver?.fullName || 'Driver'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{l.driverId}</div>
                    </td>
                    <td>
                      <b>{l.startDate} {l.endDate && l.endDate !== l.startDate ? `→ ${l.endDate}` : ''}</b>
                    </td>
                    <td>{l.durationDays || 1} Day(s)</td>
                    <td>
                      <div style={{ color: '#E2E8F0' }}>{l.reason || 'Personal / Weekly Off'}</div>
                      {l.adminNotes && (
                        <div style={{ fontSize: '0.75rem', color: '#F59E0B', marginTop: 3 }}>
                          💬 Admin: {l.adminNotes}
                        </div>
                      )}
                    </td>
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
                      {l.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => setDecisionModal({ isOpen: true, leave: l, status: 'APPROVED', reason: '' })}
                            title="Approve Leave Request"
                          >
                            <CheckCircle size={14} /> Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDecisionModal({ isOpen: true, leave: l, status: 'REJECTED', reason: '' })}
                            title="Reject Leave Request"
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                          Decided {l.decidedAt ? formatDateTime(l.decidedAt) : '—'}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredLeaves.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <div style={{ color: '#E2E8F0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      No leave requests found
                    </div>
                    <div style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      {leaves.length === 0 
                        ? 'No leave requests submitted yet. When drivers schedule weekly off or emergency leave from their mobile app, they will appear here in real time.'
                        : 'No leave requests match your search or filter.'}
                    </div>
                    {(statusFilter !== 'ALL' || search) && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        onClick={() => { setStatusFilter('ALL'); setSearch(''); }}
                      >
                        <RotateCcw size={14} /> Show All Requests ({leaves.length})
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Decision Modal */}
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
          Are you sure you want to mark this leave request as <b style={{ color: decisionModal.status === 'APPROVED' ? '#10B981' : '#EF4444' }}>{decisionModal.status}</b>?
        </p>

        <div className="form-group">
          <label className="form-label">Notes for Driver (Visible in Driver App)</label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder={decisionModal.status === 'APPROVED' ? 'e.g. Approved. Weekly off authorized.' : 'e.g. Shift coverage required. Please reschedule.'}
            value={decisionModal.reason}
            onChange={(e) => setDecisionModal(prev => ({ ...prev, reason: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
