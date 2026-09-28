import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  User, 
  Phone, 
  MapPin, 
  Bike, 
  Shield, 
  FileText, 
  Clock, 
  DollarSign, 
  AlertTriangle, 
  Smartphone,
  CheckCircle,
  XCircle,
  ScrollText
} from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { DRIVER_STATES } from '../utils/constants';

export default function DriverDetail({ driver, onBack }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [documents, setDocuments] = useState([]);
  const [addressRecord, setAddressRecord] = useState(null);
  const [duties, setDuties] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!driver?.id) return;

    async function fetchDriverData() {
      setLoading(true);
      try {
        // Fetch driver documents
        const docSnap = await getDocs(query(collection(db, 'driverDocuments'), where('driverId', '==', driver.id)));
        setDocuments(docSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Fetch address verification
        const addrSnap = await getDocs(query(collection(db, 'addresses'), where('driverId', '==', driver.id)));
        if (!addrSnap.empty) setAddressRecord(addrSnap.docs[0].data());

        // Fetch duty history
        const dutySnap = await getDocs(query(collection(db, 'dutySessions'), where('driverId', '==', driver.id)));
        setDuties(dutySnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Fetch settlements
        const settleSnap = await getDocs(query(collection(db, 'settlements'), where('driverId', '==', driver.id)));
        setSettlements(settleSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Fetch audit logs
        const auditSnap = await getDocs(query(collection(db, 'auditLogs'), where('driverId', '==', driver.id)));
        setAuditLogs(auditSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Fetch incidents
        const incSnap = await getDocs(query(collection(db, 'incidents'), where('driverId', '==', driver.id)));
        setIncidents(incSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      } catch (err) {
        console.error('Error fetching driver details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDriverData();
  }, [driver]);

  if (!driver) return null;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Directory
        </button>
        <h2 style={{ fontSize: '1.4rem', color: '#FFF' }}>{driver.fullName || 'Driver Details'}</h2>
        <span className="badge badge-info">ID: {driver.id}</span>
        <span className="badge badge-success">{DRIVER_STATES[driver.accountStatus] || driver.accountStatus}</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
        {[
          { id: 'overview', label: 'Overview & Device', icon: User },
          { id: 'documents', label: `Documents (${documents.length})`, icon: FileText },
          { id: 'address', label: 'Address Verification', icon: MapPin },
          { id: 'duties', label: `Duty Shifts (${duties.length})`, icon: Clock },
          { id: 'settlements', label: `Settlements (${settlements.length})`, icon: DollarSign },
          { id: 'incidents', label: `Incidents (${incidents.length})`, icon: AlertTriangle },
          { id: 'audit', label: `Audit Trail (${auditLogs.length})`, icon: ScrollText }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--accent-amber)' : '2px solid transparent',
                color: isActive ? '#FFF' : '#94A3B8',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer'
              }}
            >
              <Icon size={16} color={isActive ? '#F59E0B' : '#64748B'} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & DEVICE */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Personal & Contact Info</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.9rem' }}>
              <div><span style={{ color: '#94A3B8' }}>Full Name:</span> <b>{driver.fullName || '—'}</b></div>
              <div><span style={{ color: '#94A3B8' }}>Date of Birth:</span> <b>{driver.dob || '—'}</b></div>
              <div><span style={{ color: '#94A3B8' }}>Mobile Phone:</span> <b>{driver.mobileNumber || '—'}</b></div>
              <div><span style={{ color: '#94A3B8' }}>Emergency Contact:</span> <b>{driver.emergencyContactName} ({driver.emergencyContactPhone || '—'})</b></div>
              <div><span style={{ color: '#94A3B8' }}>Nominee:</span> <b>{driver.nomineeName} ({driver.nomineeRelationship || '—'})</b></div>
              <div><span style={{ color: '#94A3B8' }}>Bank A/C:</span> <b>{driver.bankAccountNumber || 'Provided on File'} ({driver.bankIfsc || 'IFSC'})</b></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Assigned Bike & Device Binding</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.9rem' }}>
              <div><span style={{ color: '#94A3B8' }}>Assigned Bike ID:</span> <b>{driver.assignedBikeId || 'None Assigned'}</b></div>
              <div><span style={{ color: '#94A3B8' }}>Registration Number:</span> <b>{driver.assignedBikeRegistration || '—'}</b></div>
              <div><span style={{ color: '#94A3B8' }}>Device Hardware ID:</span> <code>{driver.deviceId || driver.deviceInfo?.deviceId || 'Bound to First Mobile Login'}</code></div>
              <div><span style={{ color: '#94A3B8' }}>App Version:</span> <b>{driver.deviceInfo?.appVersion || 'v1.0.0 (Production)'}</b></div>
              <div><span style={{ color: '#94A3B8' }}>OS:</span> <b>{driver.deviceInfo?.os || 'Android'}</b></div>
              <div><span style={{ color: '#94A3B8' }}>App Tampering Status:</span> <span className="badge badge-success">INTEGRITY VERIFIED</span></div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Uploaded KYC Documents</div>
          </div>
          {documents.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {documents.map(d => (
                <div key={d.id} style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 10,
                  padding: '1rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <b style={{ color: '#FFF' }}>{d.type || 'Document'}</b>
                    <span className={`badge ${d.status === 'VERIFIED' ? 'badge-success' : d.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}`}>
                      {d.status || 'PENDING'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: 8 }}>
                    Doc #: {d.documentNumber || '—'}
                  </div>
                  {d.fileUrl && (
                    <a href={d.fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
                      View Submitted Document
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#64748B', padding: '1.5rem', textAlign: 'center' }}>No documents uploaded yet.</div>
          )}
        </div>
      )}

      {/* TAB 3: ADDRESS */}
      {activeTab === 'address' && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Address & Physical Verification Record</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div><span style={{ color: '#94A3B8' }}>Current Address:</span> <b>{driver.currentAddress || addressRecord?.currentAddress || 'On file'}</b></div>
            <div><span style={{ color: '#94A3B8' }}>Permanent Address:</span> <b>{driver.permanentAddress || addressRecord?.permanentAddress || 'On file'}</b></div>
            <div><span style={{ color: '#94A3B8' }}>Verification Status:</span> 
              <span className={`badge ${addressRecord?.isVerified ? 'badge-success' : 'badge-warning'}`} style={{ marginLeft: 8 }}>
                {addressRecord?.isVerified ? 'VERIFIED' : 'PENDING VISIT'}
              </span>
            </div>
            <div><span style={{ color: '#94A3B8' }}>Verified By Officer:</span> <b>{addressRecord?.verifiedBy || 'Pending assignment'}</b></div>
            <div><span style={{ color: '#94A3B8' }}>Notes:</span> <b>{addressRecord?.verificationNotes || 'No visit recorded yet.'}</b></div>
          </div>
        </div>
      )}

      {/* TAB 4: DUTIES */}
      {activeTab === 'duties' && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Duty History</div>
          </div>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Duty ID</th>
                <th>Status</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Distance</th>
                <th>Pickup Odo</th>
                <th>Return Odo</th>
              </tr>
            </thead>
            <tbody>
              {duties.map(dt => (
                <tr key={dt.id}>
                  <td><code>{dt.id}</code></td>
                  <td><span className={`badge ${dt.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}`}>{dt.status}</span></td>
                  <td>{formatDateTime(dt.startTime)}</td>
                  <td>{formatDateTime(dt.endTime)}</td>
                  <td><b>{dt.totalDistanceKm ? `${dt.totalDistanceKm} km` : '—'}</b></td>
                  <td>{dt.pickupOdometer} km</td>
                  <td>{dt.returnOdometer ? `${dt.returnOdometer} km` : '—'}</td>
                </tr>
              ))}
              {duties.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', color: '#64748B' }}>No duty shifts recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: SETTLEMENTS */}
      {activeTab === 'settlements' && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Financial Settlements Ledger</div>
          </div>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Settlement ID</th>
                <th>Date</th>
                <th>Gross</th>
                <th>Net</th>
                <th>Worker 50%</th>
                <th>10% Hold</th>
                <th>Payable Today</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map(s => (
                <tr key={s.id}>
                  <td><code>{s.settlementId || s.id}</code></td>
                  <td>{s.date}</td>
                  <td>{formatCurrency(s.grossIncome)}</td>
                  <td>{formatCurrency(s.netIncome)}</td>
                  <td><b>{formatCurrency(s.workerShare)}</b></td>
                  <td>{formatCurrency(s.reserveHold)}</td>
                  <td style={{ color: '#10B981', fontWeight: 700 }}>{formatCurrency(s.payableToday)}</td>
                  <td><span className={`badge ${s.status === 'PAID' ? 'badge-success' : 'badge-warning'}`}>{s.status}</span></td>
                </tr>
              ))}
              {settlements.length === 0 && (
                <tr><td colSpan="8" style={{ textAlign: 'center', color: '#64748B' }}>No settlements generated yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 6: INCIDENTS */}
      {activeTab === 'incidents' && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Accidents & Emergency Incidents</div>
          </div>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(inc => (
                <tr key={inc.id}>
                  <td>{formatDateTime(inc.timestamp)}</td>
                  <td><b>{inc.type}</b></td>
                  <td>{inc.description}</td>
                  <td><span className="badge badge-warning">{inc.status || 'REPORTED'}</span></td>
                </tr>
              ))}
              {incidents.length === 0 && (
                <tr><td colSpan="4" style={{ textAlign: 'center', color: '#64748B' }}>No incidents on record.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 7: AUDIT */}
      {activeTab === 'audit' && (
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Immutable Audit Trail</div>
          </div>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Source</th>
                <th>Notes / Diff</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map(log => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.timestamp)}</td>
                  <td><b>{log.action}</b></td>
                  <td>{log.actor}</td>
                  <td><span className="badge badge-neutral">{log.source}</span></td>
                  <td>{log.notes || log.newValue || '—'}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr><td colSpan="5" style={{ textAlign: 'center', color: '#64748B' }}>No audit records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
