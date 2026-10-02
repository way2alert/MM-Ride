import React, { useState, useEffect } from 'react';
import { 
  FileCheck2, 
  CheckCircle, 
  XCircle, 
  RotateCw, 
  Eye, 
  ExternalLink,
  Clock,
  Search,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { formatDateTime } from '../utils/formatters';
import Modal from '../components/Modal';

export default function Verification() {
  const [documents, setDocuments] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [decisionModal, setDecisionModal] = useState({ isOpen: false, status: '', reason: '' });
  const [previewModal, setPreviewModal] = useState({ isOpen: false, doc: null, imgError: false });
  const [loading, setLoading] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [activeTab, setActiveTab] = useState('PENDING'); // 'PENDING' | 'VERIFIED' | 'REJECTED' | 'ALL'
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handleErr = (err) => {
      if (err?.code === 'permission-denied' || err?.message?.includes('permission')) {
        setPermissionError(true);
      }
    };
    const unsubDocs = subscribeToCollection('driverDocuments', (data) => {
      setDocuments(data);
      setPermissionError(false);
    }, [], handleErr);
    const unsubDrivers = subscribeToCollection('drivers', setDrivers, [], handleErr);
    return () => {
      unsubDocs();
      unsubDrivers();
    };
  }, []);

  const driversMap = Object.fromEntries(drivers.map(d => [d.id, d]));

  const pendingDocs = documents.filter(d => !d.status || d.status === 'PENDING' || d.status === 'SUBMITTED');
  const verifiedDocs = documents.filter(d => d.status === 'VERIFIED');
  const rejectedDocs = documents.filter(d => d.status === 'REJECTED' || d.status === 'RESUBMIT_REQUIRED');

  // Filter by active tab
  let tabFilteredDocs = documents;
  if (activeTab === 'PENDING') {
    tabFilteredDocs = pendingDocs;
  } else if (activeTab === 'VERIFIED') {
    tabFilteredDocs = verifiedDocs;
  } else if (activeTab === 'REJECTED') {
    tabFilteredDocs = rejectedDocs;
  }

  // Filter by search query
  const displayedDocs = tabFilteredDocs.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const driver = driversMap[d.driverId];
    const driverName = (driver?.fullName || d.driverName || '').toLowerCase();
    const phone = (driver?.mobileNumber || '').toLowerCase();
    const type = (d.type || '').toLowerCase();
    const docNum = (d.documentNumber || '').toLowerCase();
    return driverName.includes(q) || phone.includes(q) || type.includes(q) || docNum.includes(q);
  });

  const handleDecision = async () => {
    if (!selectedDoc || !decisionModal.status) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'driverDocuments', selectedDoc.id);
      const updates = {
        status: decisionModal.status,
        rejectionReason: decisionModal.reason || null,
        verifiedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      };

      await updateDoc(docRef, updates);

      // Check if driver has all required documents verified
      const driverDocs = documents.filter(d => d.driverId === selectedDoc.driverId);
      const allVerified = driverDocs.length > 0 && driverDocs.every(d => 
        d.id === selectedDoc.id ? decisionModal.status === 'VERIFIED' : d.status === 'VERIFIED'
      );

      if (allVerified) {
        // Automatically progress driver state if eligible
        await updateDoc(doc(db, 'drivers', selectedDoc.driverId), {
          verificationStatus: 'DOCUMENTS_VERIFIED',
          accountStatus: 'ADDRESS_VERIFICATION_PENDING'
        });
      }

      await logAdminAudit({
        driverId: selectedDoc.driverId,
        action: `DOCUMENT_${decisionModal.status}`,
        relevantRecordId: selectedDoc.id,
        previousValue: selectedDoc.status,
        newValue: decisionModal.status,
        notes: `Document ${selectedDoc.type} marked as ${decisionModal.status}. Reason: ${decisionModal.reason || 'Approved'}`
      });

      setDecisionModal({ isOpen: false, status: '', reason: '' });
      setSelectedDoc(null);
    } catch (err) {
      alert(`Error updating document: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Top Metric Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '1rem',
        marginBottom: '1.25rem'
      }}>
        <div 
          className="stat-card" 
          style={{ 
            borderLeft: '4px solid #F59E0B', 
            cursor: 'pointer',
            backgroundColor: activeTab === 'PENDING' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface)' 
          }} 
          onClick={() => setActiveTab('PENDING')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: 600 }}>PENDING QUEUE</span>
            <Clock size={18} color="#F59E0B" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#FCD34D', marginTop: '0.4rem' }}>
            {pendingDocs.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Awaiting operational review</span>
        </div>

        <div 
          className="stat-card" 
          style={{ 
            borderLeft: '4px solid #10B981', 
            cursor: 'pointer',
            backgroundColor: activeTab === 'VERIFIED' ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface)' 
          }} 
          onClick={() => setActiveTab('VERIFIED')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: 600 }}>APPROVED DOCUMENTS</span>
            <CheckCircle size={18} color="#10B981" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#34D399', marginTop: '0.4rem' }}>
            {verifiedDocs.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Verified & compliant</span>
        </div>

        <div 
          className="stat-card" 
          style={{ 
            borderLeft: '4px solid #EF4444', 
            cursor: 'pointer',
            backgroundColor: activeTab === 'REJECTED' ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface)' 
          }} 
          onClick={() => setActiveTab('REJECTED')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: 600 }}>REJECTED / RESUBMIT</span>
            <XCircle size={18} color="#EF4444" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#F87171', marginTop: '0.4rem' }}>
            {rejectedDocs.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Correction requested</span>
        </div>

        <div 
          className="stat-card" 
          style={{ 
            borderLeft: '4px solid #3B82F6', 
            cursor: 'pointer',
            backgroundColor: activeTab === 'ALL' ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-surface)' 
          }} 
          onClick={() => setActiveTab('ALL')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontWeight: 600 }}>TOTAL DOCUMENTS</span>
            <FileCheck2 size={18} color="#3B82F6" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#93C5FD', marginTop: '0.4rem' }}>
            {documents.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>All records in registry</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div className="panel-title">
            <FileCheck2 size={18} color="#F59E0B" />
            <span>Document Verification Management</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
              Showing: <b style={{ color: '#FFF' }}>{displayedDocs.length}</b> of {documents.length} docs
            </span>
          </div>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.85rem 1.25rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          gap: '1rem',
          flexWrap: 'wrap',
          backgroundColor: 'rgba(0, 0, 0, 0.15)'
        }}>
          <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: activeTab === 'PENDING' ? '700' : '500',
                backgroundColor: activeTab === 'PENDING' ? '#F59E0B' : 'transparent',
                color: activeTab === 'PENDING' ? '#000' : '#CBD5E1',
                border: 'none',
                borderRadius: '8px',
                padding: '0.45rem 0.85rem',
                cursor: 'pointer'
              }}
              onClick={() => setActiveTab('PENDING')}
            >
              <Clock size={15} />
              <span>Pending Queue</span>
              <span style={{
                background: activeTab === 'PENDING' ? '#000' : 'rgba(245, 158, 11, 0.2)',
                color: activeTab === 'PENDING' ? '#F59E0B' : '#FCD34D',
                padding: '1px 7px',
                borderRadius: '12px',
                fontSize: '0.72rem',
                fontWeight: '800'
              }}>
                {pendingDocs.length}
              </span>
            </button>

            <button
              className="btn btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: activeTab === 'VERIFIED' ? '700' : '500',
                backgroundColor: activeTab === 'VERIFIED' ? '#10B981' : 'transparent',
                color: activeTab === 'VERIFIED' ? '#000' : '#CBD5E1',
                border: 'none',
                borderRadius: '8px',
                padding: '0.45rem 0.85rem',
                cursor: 'pointer'
              }}
              onClick={() => setActiveTab('VERIFIED')}
            >
              <CheckCircle size={15} />
              <span>Verified Documents</span>
              <span style={{
                background: activeTab === 'VERIFIED' ? '#000' : 'rgba(16, 185, 129, 0.2)',
                color: activeTab === 'VERIFIED' ? '#10B981' : '#34D399',
                padding: '1px 7px',
                borderRadius: '12px',
                fontSize: '0.72rem',
                fontWeight: '800'
              }}>
                {verifiedDocs.length}
              </span>
            </button>

            <button
              className="btn btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: activeTab === 'REJECTED' ? '700' : '500',
                backgroundColor: activeTab === 'REJECTED' ? '#EF4444' : 'transparent',
                color: activeTab === 'REJECTED' ? '#FFF' : '#CBD5E1',
                border: 'none',
                borderRadius: '8px',
                padding: '0.45rem 0.85rem',
                cursor: 'pointer'
              }}
              onClick={() => setActiveTab('REJECTED')}
            >
              <XCircle size={15} />
              <span>Rejected / Resubmit</span>
              <span style={{
                background: activeTab === 'REJECTED' ? 'rgba(0,0,0,0.4)' : 'rgba(239, 68, 68, 0.2)',
                color: activeTab === 'REJECTED' ? '#FFF' : '#F87171',
                padding: '1px 7px',
                borderRadius: '12px',
                fontSize: '0.72rem',
                fontWeight: '800'
              }}>
                {rejectedDocs.length}
              </span>
            </button>

            <button
              className="btn btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: activeTab === 'ALL' ? '700' : '500',
                backgroundColor: activeTab === 'ALL' ? '#3B82F6' : 'transparent',
                color: activeTab === 'ALL' ? '#FFF' : '#CBD5E1',
                border: 'none',
                borderRadius: '8px',
                padding: '0.45rem 0.85rem',
                cursor: 'pointer'
              }}
              onClick={() => setActiveTab('ALL')}
            >
              <FileCheck2 size={15} />
              <span>All ({documents.length})</span>
            </button>
          </div>

          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
            <input
              type="text"
              placeholder="Search driver, doc #..."
              className="form-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '28px', height: '36px', fontSize: '0.82rem' }}
            />
          </div>
        </div>

        {permissionError && (
          <div style={{
            margin: '1rem',
            padding: '1rem 1.25rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 8,
            color: '#FCA5A5',
            fontSize: '0.9rem',
            lineHeight: 1.5
          }}>
            <strong style={{ color: '#EF4444' }}>⚠️ Firestore Security Rules: Admin Access Restricted</strong>
            <p style={{ marginTop: '0.4rem', color: '#FEE2E2', fontSize: '0.85rem' }}>
              Firestore rules require this admin user to be registered in the <code>adminUsers</code> collection.
            </p>
          </div>
        )}

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Document Type</th>
                <th>Document Number</th>
                <th>{activeTab === 'VERIFIED' ? 'Verified At' : 'Uploaded At'}</th>
                {activeTab === 'REJECTED' && <th>Rejection Reason</th>}
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedDocs.map(d => {
                const driver = driversMap[d.driverId];
                return (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#FFF' }}>{driver?.fullName || d.driverName || 'Driver'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>📱 {driver?.mobileNumber || 'N/A'}</span>
                        {driver?.mobileNumber && (
                          <a
                            href={`https://wa.me/91${driver.mobileNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${driver.fullName || 'Partner'}, this is MM Ride Operations regarding your document verification.`)}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              backgroundColor: 'rgba(37, 211, 102, 0.15)',
                              color: '#25D366',
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontSize: '0.7rem',
                              textDecoration: 'none',
                              fontWeight: 700
                            }}
                            title="Chat with driver on WhatsApp"
                          >
                            💬 WhatsApp
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748B' }}>ID: {d.driverId}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#E2E8F0' }}>
                        {d.type?.replace(/_/g, ' ') || 'ID Document'}
                      </span>
                    </td>
                    <td><code>{d.documentNumber || '—'}</code></td>
                    <td style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                      {formatDateTime(activeTab === 'VERIFIED' && d.verifiedAt ? d.verifiedAt : (d.uploadedAt || d.createdAt))}
                    </td>
                    {activeTab === 'REJECTED' && (
                      <td style={{ maxWidth: '220px', color: '#FCA5A5', fontSize: '0.8rem' }}>
                        {d.rejectionReason || 'No reason specified'}
                      </td>
                    )}
                    <td>
                      <span className={`badge ${
                        d.status === 'VERIFIED' ? 'badge-success' :
                        d.status === 'REJECTED' ? 'badge-danger' :
                        d.status === 'RESUBMIT_REQUIRED' ? 'badge-warning' : 'badge-neutral'
                      }`}>
                        {d.status === 'VERIFIED' ? '🟢 VERIFIED' : 
                         d.status === 'REJECTED' ? '🔴 REJECTED' : 
                         d.status === 'RESUBMIT_REQUIRED' ? '🟠 RESUBMIT' : '🟡 PENDING'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {d.fileUrl && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setPreviewModal({ isOpen: true, doc: d, imgError: false })}
                            title="Preview Document Photo"
                          >
                            <Eye size={14} /> View
                          </button>
                        )}

                        {d.status !== 'VERIFIED' && (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => {
                              setSelectedDoc(d);
                              setDecisionModal({ isOpen: true, status: 'VERIFIED', reason: '' });
                            }}
                          >
                            <CheckCircle size={14} /> Verify
                          </button>
                        )}

                        {d.status !== 'REJECTED' && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              setSelectedDoc(d);
                              setDecisionModal({ isOpen: true, status: 'REJECTED', reason: '' });
                            }}
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        )}

                        {d.status !== 'RESUBMIT_REQUIRED' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#FCD34D' }}
                            onClick={() => {
                              setSelectedDoc(d);
                              setDecisionModal({ isOpen: true, status: 'RESUBMIT_REQUIRED', reason: '' });
                            }}
                          >
                            <RotateCw size={14} /> Resubmit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {displayedDocs.length === 0 && (
                <tr>
                  <td colSpan={activeTab === 'REJECTED' ? 7 : 6} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
                      {activeTab === 'PENDING' ? '🎉' : activeTab === 'VERIFIED' ? '📑' : '🔍'}
                    </div>
                    <div style={{ fontWeight: 600, color: '#94A3B8', fontSize: '0.95rem' }}>
                      {activeTab === 'PENDING' && 'All Caught Up! No pending documents awaiting review.'}
                      {activeTab === 'VERIFIED' && 'No verified documents found.'}
                      {activeTab === 'REJECTED' && 'No rejected or resubmit documents.'}
                      {activeTab === 'ALL' && 'No documents found matching criteria.'}
                    </div>
                    {searchQuery && (
                      <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.25rem' }}>
                        No results for "{searchQuery}". Try clearing the search.
                      </div>
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
        onClose={() => setDecisionModal({ isOpen: false, status: '', reason: '' })}
        title={`Review Document: ${selectedDoc?.type}`}
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setDecisionModal({ isOpen: false, status: '', reason: '' })}
            >
              Cancel
            </button>
            <button
              className={`btn ${decisionModal.status === 'VERIFIED' ? 'btn-success' : 'btn-danger'}`}
              onClick={handleDecision}
              disabled={loading || (decisionModal.status !== 'VERIFIED' && !decisionModal.reason)}
            >
              {loading ? 'Submitting...' : `Confirm ${decisionModal.status}`}
            </button>
          </>
        }
      >
        <p style={{ color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Marking document as <b>{decisionModal.status}</b>.
        </p>

        {decisionModal.status !== 'VERIFIED' && (
          <div className="form-group">
            <label className="form-label">Mandatory Rejection / Resubmit Reason</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="e.g. Document image is blurry or expired..."
              value={decisionModal.reason}
              onChange={(e) => setDecisionModal(prev => ({ ...prev, reason: e.target.value }))}
            />
          </div>
        )}
      </Modal>

      {/* In-App Document Photo Preview Lightbox */}
      <Modal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal({ isOpen: false, doc: null, imgError: false })}
        title={`Document Preview: ${previewModal.doc?.type || 'ID Document'}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div>
              {previewModal.doc?.fileUrl && (
                <a
                  href={previewModal.doc.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  title="Open original file in browser tab"
                >
                  <ExternalLink size={14} /> Open Link
                </a>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-success btn-sm"
                onClick={() => {
                  setSelectedDoc(previewModal.doc);
                  setDecisionModal({ isOpen: true, status: 'VERIFIED', reason: '' });
                  setPreviewModal({ isOpen: false, doc: null, imgError: false });
                }}
              >
                <CheckCircle size={14} /> Verify
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setSelectedDoc(previewModal.doc);
                  setDecisionModal({ isOpen: true, status: 'REJECTED', reason: '' });
                  setPreviewModal({ isOpen: false, doc: null, imgError: false });
                }}
              >
                <XCircle size={14} /> Reject
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPreviewModal({ isOpen: false, doc: null, imgError: false })}
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        {previewModal.doc && (
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.04)',
              padding: '0.6rem 1rem',
              borderRadius: 8,
              marginBottom: '1rem',
              fontSize: '0.85rem'
            }}>
              <div>
                <span style={{ color: '#94A3B8' }}>Driver: </span>
                <strong style={{ color: '#FFF' }}>
                  {driversMap[previewModal.doc.driverId]?.fullName || previewModal.doc.driverId}
                </strong>
              </div>
              <div>
                <span style={{ color: '#94A3B8' }}>Doc #: </span>
                <code style={{ color: '#F59E0B' }}>{previewModal.doc.documentNumber || '—'}</code>
              </div>
              <div>
                <span style={{ color: '#94A3B8' }}>Status: </span>
                <span className={`badge ${
                  previewModal.doc.status === 'VERIFIED' ? 'badge-success' :
                  previewModal.doc.status === 'REJECTED' ? 'badge-danger' : 'badge-neutral'
                }`}>
                  {previewModal.doc.status || 'PENDING'}
                </span>
              </div>
            </div>

            {previewModal.imgError ? (
              <div style={{
                padding: '2rem 1.5rem',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px dashed rgba(239, 68, 68, 0.4)',
                borderRadius: 10,
                textAlign: 'center',
                color: '#FCA5A5'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
                <strong style={{ fontSize: '1rem', color: '#EF4444' }}>
                  Corrupted Image File Detected
                </strong>
                <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#CBD5E1', maxWidth: 460, margin: '0.5rem auto 0' }}>
                  This file was uploaded from an earlier app build where React Native blob returned 14-byte <code>"File not found"</code> text instead of JPEG bytes.
                </p>
                <div style={{ marginTop: '1.25rem' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ borderColor: 'rgba(245, 158, 11, 0.5)', color: '#FCD34D' }}
                    onClick={() => {
                      setSelectedDoc(previewModal.doc);
                      setDecisionModal({
                        isOpen: true,
                        status: 'RESUBMIT_REQUIRED',
                        reason: 'Photo file was corrupted during previous mobile upload. Please retake photo with camera.'
                      });
                      setPreviewModal({ isOpen: false, doc: null, imgError: false });
                    }}
                  >
                    <RotateCw size={14} /> Request Driver to Retake Photo
                  </button>
                </div>
              </div>
            ) : (
              <div style={{
                maxHeight: '65vh',
                overflow: 'auto',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#05070a',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.06)',
                padding: '0.75rem'
              }}>
                <img
                  src={previewModal.doc.fileUrl}
                  alt={previewModal.doc.type}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '58vh',
                    objectFit: 'contain',
                    borderRadius: 6
                  }}
                  onError={() => setPreviewModal(prev => ({ ...prev, imgError: true }))}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
