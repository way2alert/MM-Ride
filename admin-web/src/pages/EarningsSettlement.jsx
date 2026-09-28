import React, { useState, useEffect } from 'react';
import { 
  CircleDollarSign, 
  Plus, 
  CheckCircle, 
  ExternalLink, 
  DollarSign, 
  AlertCircle, 
  FileCheck2,
  Lock,
  Fuel,
  Smartphone,
  ShieldCheck,
  Info
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import Modal from '../components/Modal';

export default function EarningsSettlement() {
  const [submissions, setSubmissions] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [fuelExpenses, setFuelExpenses] = useState([]);
  const [activeTab, setActiveTab] = useState('settlements'); // settlements, submissions, fuel

  const [createModal, setCreateModal] = useState(false);
  const [payoutModal, setPayoutModal] = useState({ isOpen: false, settlement: null, paymentRef: '', paymentMethod: 'UPI' });
  const [adjModal, setAdjModal] = useState({ isOpen: false, settlement: null, amount: '', type: 'CREDIT', reason: '' });
  const [loading, setLoading] = useState(false);

  const [newSettlement, setNewSettlement] = useState({
    driverId: '',
    date: new Date().toISOString().split('T')[0],
    grossIncome: '',
    platformCharges: '0',
    cashRidesCollected: '0',
    fuelExpenseAmount: '0',
    fuelPaymentSource: 'OWNER_DIRECT',
    verificationMethod: 'PHYSICAL_PHONE_INSPECTION',
    submissionId: null,
    notes: ''
  });

  useEffect(() => {
    const unsubSubmissions = subscribeToCollection('dailyEarningsSubmissions', setSubmissions);
    const unsubSettlements = subscribeToCollection('settlements', setSettlements);
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    const unsubFuel = subscribeToCollection('fuelExpenses', setFuelExpenses);
    return () => {
      unsubSubmissions();
      unsubSettlements();
      unsubDrivers();
      unsubFuel();
    };
  }, []);

  const driversMap = Object.fromEntries(drivers.map(d => [d.id, d]));

  // Calculate live split preview
  const gross = Number(newSettlement.grossIncome) || 0;
  const fees = Number(newSettlement.platformCharges) || 0;
  const net = Math.max(0, gross - fees);
  const worker50 = Math.round((net * 0.5) * 100) / 100;
  const owner50 = Math.round((net * 0.5) * 100) / 100;
  const reserve10 = Math.round((worker50 * 0.10) * 100) / 100;
  const payableToday = Math.round((worker50 - reserve10) * 100) / 100;
  const fuelAmount = Number(newSettlement.fuelExpenseAmount) || 0;

  const handleCreateSettlement = async (e) => {
    e.preventDefault();
    if (!newSettlement.driverId) {
      alert("Please select a driver.");
      return;
    }
    setLoading(true);
    try {
      const settlementId = `SETTLE_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      const settlementData = {
        settlementId,
        driverId: newSettlement.driverId,
        date: newSettlement.date,
        grossIncome: gross,
        platformCharges: fees,
        netIncome: net,
        workerShare: worker50,
        ownerShare: owner50,
        reserveHold: reserve10,
        payableToday,
        cashRidesCollected: Number(newSettlement.cashRidesCollected) || 0,
        fuelExpenseAmount: fuelAmount,
        fuelPaymentSource: newSettlement.fuelPaymentSource,
        verificationMethod: newSettlement.verificationMethod || 'PHYSICAL_PHONE_INSPECTION',
        status: 'PENDING_PAYOUT',
        paidAmount: 0,
        pendingReserve: reserve10,
        submissionId: newSettlement.submissionId || null,
        notes: newSettlement.notes,
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, 'settlements', settlementId), settlementData);

      // Create driver earnings record for mobile app HUD
      await setDoc(doc(db, 'earnings', `EARN_${settlementId}`), {
        earningId: `EARN_${settlementId}`,
        settlementId,
        driverId: newSettlement.driverId,
        date: newSettlement.date,
        grossIncome: gross,
        platformCharges: fees,
        netIncome: net,
        workerShare: worker50,
        ownerShare: owner50,
        reserveHold: reserve10,
        payableToday,
        verificationMethod: newSettlement.verificationMethod || 'PHYSICAL_PHONE_INSPECTION',
        fuelExpenseSeparatelyRecorded: fuelAmount,
        createdAt: serverTimestamp()
      });

      // If separate owner fuel expense was entered, route it to fuelExpenses ledger
      if (fuelAmount > 0) {
        const fuelRef = await addDoc(collection(db, 'fuelExpenses'), {
          settlementId,
          driverId: newSettlement.driverId,
          amount: fuelAmount,
          date: newSettlement.date,
          paymentSource: newSettlement.fuelPaymentSource,
          notes: `Owner fuel expense: ${newSettlement.notes || 'Recorded at depot settlement'}`,
          recordedAt: new Date().toISOString(),
          createdAt: serverTimestamp()
        });

        await logAdminAudit({
          driverId: newSettlement.driverId,
          action: 'OWNER_FUEL_EXPENSE_RECORDED',
          relevantRecordId: fuelRef.id,
          notes: `Owner fuel expense ₹${fuelAmount} recorded separately (${newSettlement.fuelPaymentSource}). Zero impact on worker's 50% ride share.`
        });
      }

      // If linked to a driver submission, mark it APPROVED
      if (newSettlement.submissionId) {
        await updateDoc(doc(db, 'dailyEarningsSubmissions', newSettlement.submissionId), {
          status: 'APPROVED',
          settlementId,
          verifiedAt: new Date().toISOString()
        });
      }

      await logAdminAudit({
        driverId: newSettlement.driverId,
        action: 'SETTLEMENT_CREATED',
        relevantRecordId: settlementId,
        newValue: JSON.stringify({ gross, fees, net, worker50, owner50, reserve10, payableToday, fuelAmount }),
        notes: `Owner verified daily phone platforms (${newSettlement.verificationMethod}). Net: ₹${net}, Worker: ₹${worker50}. Fuel ₹${fuelAmount} routed to company ledger.`
      });

      setCreateModal(false);
      setNewSettlement({
        driverId: '',
        date: new Date().toISOString().split('T')[0],
        grossIncome: '',
        platformCharges: '0',
        cashRidesCollected: '0',
        fuelExpenseAmount: '0',
        fuelPaymentSource: 'OWNER_DIRECT',
        verificationMethod: 'PHYSICAL_PHONE_INSPECTION',
        submissionId: null,
        notes: ''
      });
    } catch (err) {
      alert(`Error creating settlement: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmissionAtDepot = (sub) => {
    setNewSettlement({
      driverId: sub.driverId,
      date: sub.date || new Date().toISOString().split('T')[0],
      grossIncome: String(sub.grossIncome || ''),
      platformCharges: String(sub.platformCharges || '0'),
      cashRidesCollected: String(sub.cashRidesCollected || '0'),
      fuelExpenseAmount: '0',
      fuelPaymentSource: 'OWNER_DIRECT',
      verificationMethod: 'PHYSICAL_PHONE_INSPECTION',
      submissionId: sub.id,
      notes: `Verified against driver mobile app (${sub.id})`
    });
    setCreateModal(true);
  };

  const handleProcessPayout = async () => {
    const { settlement, paymentRef, paymentMethod } = payoutModal;
    if (!settlement) return;

    setLoading(true);
    try {
      const settlementRef = doc(db, 'settlements', settlement.id);
      await updateDoc(settlementRef, {
        status: 'PAID',
        paidAmount: settlement.payableToday,
        paymentReference: paymentRef || `TXN_${Date.now()}`,
        paymentMethod: paymentMethod || 'UPI',
        paidAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      await logAdminAudit({
        driverId: settlement.driverId,
        action: 'SETTLEMENT_PAID',
        relevantRecordId: settlement.id,
        notes: `Disbursed ₹${settlement.payableToday} to driver via ${paymentMethod}. Ref: ${paymentRef}`
      });

      setPayoutModal({ isOpen: false, settlement: null, paymentRef: '', paymentMethod: 'UPI' });
    } catch (err) {
      alert(`Error processing payout: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyAdjustment = async () => {
    const { settlement, amount, type, reason } = adjModal;
    if (!settlement || !amount || !reason) return;

    if (reason.trim().length < 5) {
      alert("A clear reason (at least 5 characters) is mandatory for financial adjustments.");
      return;
    }

    setLoading(true);
    try {
      const delta = type === 'CREDIT' ? Number(amount) : -Number(amount);
      const adjRef = await addDoc(collection(db, 'settlementAdjustments'), {
        settlementId: settlement.id,
        driverId: settlement.driverId,
        amount: Number(amount),
        type,
        reason,
        timestamp: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });

      const currentAdj = settlement.totalAdjustments || 0;
      await updateDoc(doc(db, 'settlements', settlement.id), {
        totalAdjustments: currentAdj + delta,
        status: 'ADJUSTED'
      });

      await logAdminAudit({
        driverId: settlement.driverId,
        action: 'SETTLEMENT_ADJUSTMENT_APPLIED',
        relevantRecordId: settlement.id,
        notes: `Adjustment of ${type} ₹${amount} applied. Reason: ${reason}`
      });

      setAdjModal({ isOpen: false, settlement: null, amount: '', type: 'CREDIT', reason: '' });
    } catch (err) {
      alert(`Error applying adjustment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <CircleDollarSign size={18} color="#F59E0B" />
            <span>Driver Earnings & Daily Settlements</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, padding: 2 }}>
              <button
                className={`btn btn-sm ${activeTab === 'settlements' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('settlements')}
              >
                Official Settlements ({settlements.length})
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'submissions' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('submissions')}
              >
                Driver Ride Submissions ({submissions.filter(s => s.status === 'PENDING').length} Pending)
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'fuel' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('fuel')}
              >
                ⛽ Fuel Ledger ({fuelExpenses.length})
              </button>
            </div>

            <button className="btn btn-primary" onClick={() => {
              setNewSettlement({
                driverId: '',
                date: new Date().toISOString().split('T')[0],
                grossIncome: '',
                platformCharges: '0',
                cashRidesCollected: '0',
                fuelExpenseAmount: '0',
                fuelPaymentSource: 'OWNER_DIRECT',
                verificationMethod: 'PHYSICAL_PHONE_INSPECTION',
                submissionId: null,
                notes: ''
              });
              setCreateModal(true);
            }}>
              <Plus size={16} /> Verify Phone & Settle
            </button>
          </div>
        </div>

        {/* TAB 1: OFFICIAL SETTLEMENTS LEDGER */}
        {activeTab === 'settlements' && (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Settlement ID / Date</th>
                  <th>Driver</th>
                  <th>Verified Gross</th>
                  <th>Platform Fees</th>
                  <th>Net Ride Income</th>
                  <th>Worker 50%</th>
                  <th>10% Hold</th>
                  <th>Payable Today (45%)</th>
                  <th>Verification Method</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map(s => {
                  const driver = driversMap[s.driverId];
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#FFF' }}>{s.settlementId || s.id}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{s.date}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{driver?.fullName || 'Driver'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{s.driverId}</div>
                      </td>
                      <td><b>{formatCurrency(s.grossIncome)}</b></td>
                      <td style={{ color: '#EF4444' }}>-{formatCurrency(s.platformCharges || 0)}</td>
                      <td><b style={{ color: '#60A5FA' }}>{formatCurrency(s.netIncome)}</b></td>
                      <td><b style={{ color: '#34D399' }}>{formatCurrency(s.workerShare)}</b></td>
                      <td><span style={{ color: '#FCD34D' }}>{formatCurrency(s.reserveHold)}</span></td>
                      <td>
                        <b style={{ fontSize: '1rem', color: '#10B981' }}>{formatCurrency(s.payableToday)}</b>
                        {s.totalAdjustments ? (
                          <div style={{ fontSize: '0.72rem', color: s.totalAdjustments > 0 ? '#34D399' : '#F87171' }}>
                            Adj: {s.totalAdjustments > 0 ? `+₹${s.totalAdjustments}` : `-₹${Math.abs(s.totalAdjustments)}`}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                          <Smartphone size={11} style={{ marginRight: 3 }} />
                          {s.verificationMethod === 'PHYSICAL_PHONE_INSPECTION' ? 'Phone Checked' : 'Proof Verified'}
                        </span>
                        {s.fuelExpenseAmount > 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#F59E0B', marginTop: 2 }}>
                            ⛽ Fuel: ₹{s.fuelExpenseAmount} (Owner)
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${
                          s.status === 'PAID' ? 'badge-success' :
                          s.status === 'ADJUSTED' ? 'badge-warning' : 'badge-neutral'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          {s.status !== 'PAID' && (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => setPayoutModal({ isOpen: true, settlement: s, paymentRef: '', paymentMethod: 'UPI' })}
                              title="Process Payout"
                            >
                              Pay ₹{s.payableToday}
                            </button>
                          )}
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setAdjModal({ isOpen: true, settlement: s, amount: '', type: 'CREDIT', reason: '' })}
                            title="Audited Adjustment"
                          >
                            Adjust
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {settlements.length === 0 && (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                      No settlements generated yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: DRIVER RIDE SUBMISSIONS (SUPPORTING EVIDENCE) */}
        {activeTab === 'submissions' && (
          <div className="table-responsive">
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 8, marginBottom: '1rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#60A5FA', fontSize: '0.85rem', fontWeight: 600 }}>
                <Info size={16} /> PHASE 1 SUPPORTING EVIDENCE QUEUE
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>
                Driver screenshots and reported numbers below are supporting evidence only. When the driver returns the bike, inspect the driver's phone (Ola/Uber/Rapido apps) and click <b>Verify Driver Phone & Settle</b> to record the verified daily totals.
              </p>
            </div>

            <table className="custom-table">
              <thead>
                <tr>
                  <th>Submission ID</th>
                  <th>Driver</th>
                  <th>Date</th>
                  <th>Reported Gross</th>
                  <th>Reported Deductions</th>
                  <th>Supporting Screenshot</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(sub => {
                  const driver = driversMap[sub.driverId];
                  return (
                    <tr key={sub.id}>
                      <td><code>{sub.id}</code></td>
                      <td>
                        <b>{driver?.fullName || 'Driver'}</b>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{sub.driverId}</div>
                      </td>
                      <td>{sub.date}</td>
                      <td><b>{formatCurrency(sub.grossIncome)}</b></td>
                      <td style={{ color: '#EF4444' }}>-{formatCurrency(sub.platformCharges || 0)}</td>
                      <td>
                        {sub.screenshotUrl ? (
                          <a href={sub.screenshotUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                            <ExternalLink size={13} /> View Ola/Uber Proof
                          </a>
                        ) : (
                          <span style={{ color: '#64748B' }}>No photo attached</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${sub.status === 'APPROVED' ? 'badge-success' : 'badge-warning'}`}>
                          {sub.status === 'APPROVED' ? 'VERIFIED & SETTLED' : 'SUPPORTING EVIDENCE'}
                        </span>
                      </td>
                      <td>
                        {sub.status === 'PENDING' && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleVerifySubmissionAtDepot(sub)}
                          >
                            <Smartphone size={14} /> Verify Driver Phone & Settle
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {submissions.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                      No driver ride submissions in queue.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: SEPARATE OWNER FUEL EXPENSE LEDGER */}
        {activeTab === 'fuel' && (
          <div className="table-responsive">
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(245, 158, 11, 0.08)', borderRadius: 8, marginBottom: '1rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F59E0B', fontSize: '0.85rem', fontWeight: 600 }}>
                <Fuel size={16} /> OWNER PETROL & FUEL EXPENSE LEDGER
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>
                Per MM Ride policy, petrol is an <b>Owner Expense</b>. Fuel costs are recorded here in the company operational ledger and are <u>never</u> deducted from the driver's 50% ride income share.
              </p>
            </div>

            <table className="custom-table">
              <thead>
                <tr>
                  <th>Expense ID / Date</th>
                  <th>Driver</th>
                  <th>Amount (₹)</th>
                  <th>Payment Source</th>
                  <th>Settlement Link</th>
                  <th>Notes</th>
                  <th>Logged At</th>
                </tr>
              </thead>
              <tbody>
                {fuelExpenses.map(f => {
                  const driver = driversMap[f.driverId];
                  return (
                    <tr key={f.id}>
                      <td>
                        <code>{f.id}</code>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{f.date}</div>
                      </td>
                      <td>
                        <b>{driver?.fullName || 'Driver'}</b>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{f.driverId}</div>
                      </td>
                      <td>
                        <b style={{ color: '#F59E0B', fontSize: '0.95rem' }}>₹{f.amount}</b>
                      </td>
                      <td>
                        <span className="badge badge-neutral">
                          {f.paymentSource === 'REIMBURSED_TO_DRIVER' ? 'Reimbursed to Driver' : 'Owner Direct'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: '#60A5FA' }}>{f.settlementId || 'Direct Fuel'}</span>
                      </td>
                      <td>{f.notes || '—'}</td>
                      <td>{formatDateTime(f.createdAt || f.recordedAt)}</td>
                    </tr>
                  );
                })}

                {fuelExpenses.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                      No fuel expenses logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Physical Phone Verification Modal */}
      <Modal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        title="Depot Owner Verification & Daily Settlement"
      >
        <form onSubmit={handleCreateSettlement}>
          {/* Operational Policy Guidance Banner */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 8,
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
            fontSize: '0.82rem',
            color: '#FDE68A'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#F59E0B', marginBottom: 4 }}>
              <Smartphone size={16} /> PHASE 1 OPERATIONAL RULE: PHYSICAL PHONE VERIFICATION
            </div>
            <div>• Check driver's phone (Ola Driver, Uber Driver, Rapido Captain).</div>
            <div>• Enter combined verified daily gross ride income and app platform deductions.</div>
            <div>• <b>Cash Rides:</b> Must remain included in verified Gross Income.</div>
            <div>• <b>Petrol Policy:</b> Petrol is an <u>Owner Expense</u>. Never deduct petrol from ride income! Record it below in the separate Owner Fuel Ledger.</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Select Driver</label>
              <select
                className="form-select"
                value={newSettlement.driverId}
                onChange={(e) => setNewSettlement({ ...newSettlement, driverId: e.target.value })}
                required
              >
                <option value="">-- Choose Driver --</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.fullName} ({d.mobileNumber})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Shift Date</label>
              <input
                type="date"
                className="form-input"
                value={newSettlement.date}
                onChange={(e) => setNewSettlement({ ...newSettlement, date: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Verified Gross Platform Income (₹)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="e.g. 2500"
                value={newSettlement.grossIncome}
                onChange={(e) => setNewSettlement({ ...newSettlement, grossIncome: e.target.value })}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Total of Ola + Uber + Rapido fares (incl. cash)</span>
            </div>

            <div className="form-group">
              <label className="form-label">Platform Charges / Commission Deducted (₹)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="e.g. 500"
                value={newSettlement.platformCharges}
                onChange={(e) => setNewSettlement({ ...newSettlement, platformCharges: e.target.value })}
              />
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Platform commission fees shown in apps</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Cash Fares Collected by Driver (₹)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="e.g. 800"
                value={newSettlement.cashRidesCollected}
                onChange={(e) => setNewSettlement({ ...newSettlement, cashRidesCollected: e.target.value })}
              />
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Included in Gross; cannot be kept for petrol</span>
            </div>

            <div className="form-group">
              <label className="form-label">Separate Owner Petrol Expense (₹) (Optional)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="e.g. 500"
                value={newSettlement.fuelExpenseAmount}
                onChange={(e) => setNewSettlement({ ...newSettlement, fuelExpenseAmount: e.target.value })}
              />
              <span style={{ fontSize: '0.72rem', color: '#F59E0B' }}>Owner expense ledger — ZERO deduction on worker share</span>
            </div>
          </div>

          {fuelAmount > 0 && (
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Petrol Payment Source</label>
              <select
                className="form-select"
                value={newSettlement.fuelPaymentSource}
                onChange={(e) => setNewSettlement({ ...newSettlement, fuelPaymentSource: e.target.value })}
              >
                <option value="OWNER_DIRECT">Owner Paid Directly (Depot card / UPI)</option>
                <option value="REIMBURSED_TO_DRIVER">Driver Paid (Reimbursed separately by Owner)</option>
              </select>
            </div>
          )}

          {/* Real-time Calculation Breakdown Preview */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            borderRadius: 10,
            padding: '1rem',
            border: '1px solid var(--border-subtle)',
            marginBottom: '1.25rem'
          }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#F59E0B', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={16} /> Server Calculation (50/50 Split & 10% Reserve Hold):
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
              <span style={{ color: '#94A3B8' }}>Net Ride Income (Gross - Platform Fees):</span>
              <b>{formatCurrency(net)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
              <span style={{ color: '#94A3B8' }}>Worker Share (50% of Net):</span>
              <b style={{ color: '#34D399' }}>{formatCurrency(worker50)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
              <span style={{ color: '#94A3B8' }}>Owner Share (50% of Net):</span>
              <b style={{ color: '#60A5FA' }}>{formatCurrency(owner50)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
              <span style={{ color: '#94A3B8' }}>10% Temporary Reserve Hold from Worker Share:</span>
              <b style={{ color: '#FCD34D' }}>{formatCurrency(reserve10)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-subtle)', fontSize: '0.95rem' }}>
              <span style={{ color: '#FFF', fontWeight: 600 }}>Payable to Driver Today (90% of Worker Share):</span>
              <b style={{ color: '#10B981' }}>{formatCurrency(payableToday)}</b>
            </div>

            {fuelAmount > 0 && (
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed rgba(245, 158, 11, 0.4)', fontSize: '0.8rem', color: '#FDE68A' }}>
                ⛽ <b>Owner Petrol Expense:</b> {formatCurrency(fuelAmount)} routed to Company Ledger ({newSettlement.fuelPaymentSource}). Zero deduction on worker's {formatCurrency(worker50)} share.
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Inspection Notes</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Verified Ola and Uber apps on phone; cash rides confirmed."
              value={newSettlement.notes}
              onChange={(e) => setNewSettlement({ ...newSettlement, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !gross}>
              {loading ? 'Creating...' : 'Confirm & Finalize Settlement'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Process Payout Modal */}
      <Modal
        isOpen={payoutModal.isOpen}
        onClose={() => setPayoutModal({ isOpen: false, settlement: null, paymentRef: '', paymentMethod: 'UPI' })}
        title={`Disburse Settlement Payout: ${payoutModal.settlement?.settlementId || payoutModal.settlement?.id}`}
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setPayoutModal({ isOpen: false, settlement: null, paymentRef: '', paymentMethod: 'UPI' })}
            >
              Cancel
            </button>
            <button
              className="btn btn-success"
              onClick={handleProcessPayout}
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Mark as Paid'}
            </button>
          </>
        }
      >
        <p style={{ color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Mark payable amount of <b>{formatCurrency(payoutModal.settlement?.payableToday)}</b> as disbursed to the driver.
        </p>

        <div className="form-group">
          <label className="form-label">Payment Method</label>
          <select
            className="form-select"
            value={payoutModal.paymentMethod}
            onChange={(e) => setPayoutModal(prev => ({ ...prev, paymentMethod: e.target.value }))}
          >
            <option value="UPI">UPI Transfer</option>
            <option value="NEFT">Bank Transfer (NEFT/IMPS)</option>
            <option value="CASH">Cash at Depot Counter</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Transaction Reference Number / UTR</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. UPI/3910291039 or Receipt #"
            value={payoutModal.paymentRef}
            onChange={(e) => setPayoutModal(prev => ({ ...prev, paymentRef: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Manual Adjustment Modal */}
      <Modal
        isOpen={adjModal.isOpen}
        onClose={() => setAdjModal({ isOpen: false, settlement: null, amount: '', type: 'CREDIT', reason: '' })}
        title="Apply Authorised Financial Adjustment"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setAdjModal({ isOpen: false, settlement: null, amount: '', type: 'CREDIT', reason: '' })}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleApplyAdjustment}
              disabled={loading || !adjModal.amount || !adjModal.reason}
            >
              {loading ? 'Applying...' : 'Record Adjustment Entry'}
            </button>
          </>
        }
      >
        <p style={{ color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Per core security principle: Historical settlement records are immutable. A separate audit adjustment entry with mandatory reason will be created.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Adjustment Type</label>
            <select
              className="form-select"
              value={adjModal.type}
              onChange={(e) => setAdjModal(prev => ({ ...prev, type: e.target.value }))}
            >
              <option value="CREDIT">Credit (Add to worker)</option>
              <option value="DEBIT">Debit (Authorized charge)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Amount (₹)</label>
            <input
              type="number"
              className="form-input"
              placeholder="e.g. 100"
              value={adjModal.amount}
              onChange={(e) => setAdjModal(prev => ({ ...prev, amount: e.target.value }))}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Mandatory Authorised Reason (min 5 chars)</label>
          <textarea
            className="form-textarea"
            rows={3}
            placeholder="State explicit reason for adjustment..."
            value={adjModal.reason}
            onChange={(e) => setAdjModal(prev => ({ ...prev, reason: e.target.value }))}
            required
          />
        </div>
      </Modal>
    </div>
  );
}
