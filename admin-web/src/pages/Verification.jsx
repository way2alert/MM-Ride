import React, { useState, useEffect } from 'react';
import { 
  FileCheck2, 
  CheckCircle, 
  XCircle, 
  RotateCw, 
  Eye, 
  ExternalLink 
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
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <FileCheck2 size={18} color="#F59E0B" />
            <span>Document Verification Queue</span>
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
              Firestore rules require this admin user to be registered in the <code>adminUsers</code> collection, or the rules need to be published in Firebase Console.
            </p>
            <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: 6 }}>
              <strong>Quick 1-Minute Fix in Firebase Console:</strong><br />
              1. Open Firebase Console → Firestore Database → <strong>Data</strong><br />
              2. Go to collection <strong><code>adminUsers</code></strong> (or create it)<br />
              3. Add document with ID: <code style={{ color: '#F59E0B' }}>w0rfUy04XkRJXDRoBwkW5K0VTNy2</code><br />
              4. Set fields: <code>email: "owner@mmride.com"</code>, <code>role: "SUPER_ADMIN"</code>, <code>active: true</code><br />
              5. Once saved, refresh this page and all uploaded documents will load!
            </div>
          </div>
        )}

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Document Type</th>
                <th>Document Number</th>
                <th>Uploaded At</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(d => {
                const driver = driversMap[d.driverId];
                return (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#FFF' }}>{driver?.fullName || d.driverName || 'Driver'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{d.driverId}</div>
                    </td>
                    <td><b>{d.type || 'ID Document'}</b></td>
                    <td><code>{d.documentNumber || '—'}</code></td>
                    <td>{formatDateTime(d.uploadedAt || d.createdAt)}</td>
                    <td>
                      <span className={`badge ${
                        d.status === 'VERIFIED' ? 'badge-success' :
                        d.status === 'REJECTED' ? 'badge-danger' :
                        d.status === 'RESUBMIT_REQUIRED' ? 'badge-warning' : 'badge-neutral'
                      }`}>
                        {d.status || 'PENDING'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {d.fileUrl && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setPreviewModal({ isOpen: true, doc: d, imgError: false })}
                            title="Preview Document Photo"
                          >
                            <Eye size={14} /> View
                          </button>
                        )}

                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => {
                            setSelectedDoc(d);
                            setDecisionModal({ isOpen: true, status: 'VERIFIED', reason: '' });
                          }}
                        >
                          <CheckCircle size={14} /> Verify
                        </button>

                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            setSelectedDoc(d);
                            setDecisionModal({ isOpen: true, status: 'REJECTED', reason: '' });
                          }}
                        >
                          <XCircle size={14} /> Reject
                        </button>

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
                      </div>
                    </td>
                  </tr>
                );
              })}

              {documents.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                    No pending documents in the queue.
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
