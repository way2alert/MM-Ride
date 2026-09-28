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
  ShieldAlert,
  Info,
  Image as ImageIcon,
  MapPin,
  AlertTriangle,
  Check,
  X
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
  const [bikes, setBikes] = useState([]);
  const [dutySessions, setDutySessions] = useState([]);
  const [platformRideEvents, setPlatformRideEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('settlements'); // settlements, submissions, fuel, platformAudit

  const [createModal, setCreateModal] = useState(false);
  const [payoutModal, setPayoutModal] = useState({ isOpen: false, settlement: null, paymentRef: '', paymentMethod: 'UPI' });
  const [adjModal, setAdjModal] = useState({ isOpen: false, settlement: null, amount: '', type: 'CREDIT', reason: '' });
  const [viewingFuelProof, setViewingFuelProof] = useState(null);
  const [loading, setLoading] = useState(false);

  const [newSettlement, setNewSettlement] = useState({
    driverId: '',
    date: new Date().toISOString().split('T')[0],
    grossIncome: '',
    platformCharges: '0',
    cashRidesCollected: '0',
    fuelExpenseAmount: '0',
    personalKm: '0',
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
    const unsubBikes = subscribeToCollection('bikes', setBikes);
    const unsubDuties = subscribeToCollection('dutySessions', setDutySessions);
    const unsubPlatform = subscribeToCollection('platformRideEvents', setPlatformRideEvents);
    return () => {
      unsubSubmissions();
      unsubSettlements();
      unsubDrivers();
      unsubFuel();
      unsubBikes();
      unsubDuties();
      unsubPlatform();
    };
  }, []);

  const driversMap = Object.fromEntries(drivers.map(d => [d.id, d]));
  const bikesMap = Object.fromEntries(bikes.map(b => [b.id, b]));
  const dutySessionsMap = Object.fromEntries(dutySessions.map(ds => [ds.id, ds]));

  // Calculate live split preview
  const gross = Number(newSettlement.grossIncome) || 0;
  const fees = Number(newSettlement.platformCharges) || 0;
  const net = Math.max(0, gross - fees);
  const worker50 = Math.round((net * 0.5) * 100) / 100;
  const owner50 = Math.round((net * 0.5) * 100) / 100;
  const reserve10 = Math.round((worker50 * 0.10) * 100) / 100;
  const personalKm = Number(newSettlement.personalKm) || 0;
  const personalFuelCharge = personalKm > 0 ? Math.round((personalKm / 55) * 102.5) : 0;
  const payableToday = Math.max(0, Math.round((worker50 - reserve10 - personalFuelCharge) * 100) / 100);
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

  // 3-Way Fuel Mileage Analysis
  const computeFuelMileage = (fuel) => {
    const duty = fuel.dutyId ? dutySessionsMap[fuel.dutyId] : null;
    const litres = Number(fuel.litres) || 0;
    if (!litres || litres <= 0) return { mileage: null, status: 'UNKNOWN', distanceKm: null };

    let distanceKm = null;
    if (duty) {
      if (duty.totalDistanceKm) {
        distanceKm = Number(duty.totalDistanceKm);
      } else if (duty.returnOdometer && duty.pickupOdometer) {
        distanceKm = Number(duty.returnOdometer) - Number(duty.pickupOdometer);
      } else if (fuel.odometerAtFill && duty.pickupOdometer) {
        distanceKm = Number(fuel.odometerAtFill) - Number(duty.pickupOdometer);
      }
    }

    if (distanceKm === null || distanceKm <= 0) {
      return { mileage: null, status: 'NO_SHIFT_DATA', distanceKm: null };
    }

    const mileage = Math.round((distanceKm / litres) * 10) / 10;
    let status = 'OPTIMAL';
    let note = 'Normal Splendor mileage (45-65 km/L)';

    if (mileage < 38) {
      status = 'HIGH_CONSUMPTION';
      note = '🚨 Abnormal high consumption! Fuel siphoning or false litres claim suspected';
    } else if (mileage > 75) {
      status = 'ODOMETER_ANOMALY';
      note = '⚠️ Unusually high mileage. Check odometer cable or incorrect reading';
    }

    return { mileage, status, note, distanceKm };
  };

  const handleApproveFuel = async (fuel) => {
    const driverName = driversMap[fuel.driverId]?.fullName || 'driver';
    if (!window.confirm(`Approve fuel reimbursement of ₹${fuel.amount} (${fuel.litres || '—'}L) for ${driverName}?`)) return;
    try {
      await updateDoc(doc(db, 'fuelExpenses', fuel.id), {
        status: 'APPROVED',
        approvedAt: new Date().toISOString(),
        approvedBy: 'ADMIN'
      });
      await logAdminAudit({
        driverId: fuel.driverId,
        action: 'FUEL_CLAIM_APPROVED',
        relevantRecordId: fuel.id,
        notes: `Approved petrol claim ₹${fuel.amount} (${fuel.litres || '—'}L). Reconciled with shift mileage.`
      });
    } catch (e) {
      alert('Error approving fuel claim: ' + e.message);
    }
  };

  const handleRejectFuel = async (fuel) => {
    const reason = window.prompt(
      'Enter reason for rejecting fuel claim (e.g. Siphoning suspected, duplicate bill, meter mismatch):',
      'Mileage anomaly / Suspicious fuel consumption'
    );
    if (!reason) return;
    try {
      await updateDoc(doc(db, 'fuelExpenses', fuel.id), {
        status: 'REJECTED',
        rejectionReason: reason,
        rejectedAt: new Date().toISOString(),
        rejectedBy: 'ADMIN'
      });
      await addDoc(collection(db, 'securityAlerts'), {
        type: 'FUEL_CLAIM_REJECTED',
        driverId: fuel.driverId,
        bikeId: fuel.bikeId || null,
        severity: 'HIGH',
        message: `Fuel claim ₹${fuel.amount} (${fuel.litres || '—'}L) rejected. Reason: ${reason}`,
        timestamp: new Date().toISOString()
      });
      await logAdminAudit({
        driverId: fuel.driverId,
        action: 'FUEL_CLAIM_REJECTED',
        relevantRecordId: fuel.id,
        notes: `Rejected fuel claim ₹${fuel.amount}. Reason: ${reason}`
      });
    } catch (e) {
      alert('Error rejecting fuel claim: ' + e.message);
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
              <button
                className={`btn btn-sm ${activeTab === 'platformAudit' ? 'btn-primary' : 'btn-secondary'}`}
                style={platformRideEvents.some(e => e.suspectedOfflineCashRide || (e.eventType === 'RIDE_CANCELLED' && e.distanceAfterEventKm > 2)) ? { borderColor: '#EF4444', color: '#FCA5A5' } : {}}
                onClick={() => setActiveTab('platformAudit')}
              >
                🚖 Platform Rides Audit ({platformRideEvents.length})
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
                  <th>Completed / Cancels</th>
                  <th>Cash Collected</th>
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
                      <td>
                        <b>{formatCurrency(sub.grossIncome)}</b>
                        <div style={{ fontSize: '0.72rem', color: '#EF4444' }}>Comm: -{formatCurrency(sub.platformCharges || 0)}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#FFF' }}>
                          {sub.completedRidesCount || '—'} Done • {sub.cancelledRidesCount || 0} Cancels
                        </div>
                        {Number(sub.cancelledRidesCount) > 2 && (
                          <span className="badge badge-warning" style={{ fontSize: '0.65rem', marginTop: 2 }}>
                            ⚠️ {sub.cancelledRidesCount} Cancelled Rides
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#F59E0B', fontSize: '0.9rem' }}>
                          ₹{sub.cashRidesCollected || 0}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Cash Passenger Fares</div>
                      </td>
                      <td>
                        {sub.screenshotUrl ? (
                          <a href={sub.screenshotUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                            <ExternalLink size={13} /> View Proof
                          </a>
                        ) : (
                          <span style={{ color: '#64748B', fontSize: '0.75rem' }}>No photo attached</span>
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

        {/* TAB 3: THREE-WAY FUEL AUDIT & ANTI-FRAUD RECONCILIATION CONSOLE */}
        {activeTab === 'fuel' && (
          <div>
            {/* Top KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="card" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Total Fuel Claimed
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FFF', marginTop: 4 }}>
                  ₹{fuelExpenses.reduce((sum, f) => sum + (Number(f.amount) || 0), 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                  {fuelExpenses.reduce((sum, f) => sum + (Number(f.litres) || 0), 0).toFixed(1)} Litres Recorded
                </div>
              </div>

              <div className="card" style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Approved Owner Expense
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981', marginTop: 4 }}>
                  ₹{fuelExpenses.filter(f => f.status === 'APPROVED' || !f.status).reduce((sum, f) => sum + (Number(f.amount) || 0), 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                  Direct Depot & Verified Claims
                </div>
              </div>

              <div className="card" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Pending Driver Claims
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#60A5FA', marginTop: 4 }}>
                  {fuelExpenses.filter(f => f.status === 'PENDING_APPROVAL').length} Claims
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                  ₹{fuelExpenses.filter(f => f.status === 'PENDING_APPROVAL').reduce((sum, f) => sum + (Number(f.amount) || 0), 0).toLocaleString()} Awaiting Audit
                </div>
              </div>

              <div className="card" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#EF4444', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Flagged Mileage Anomalies
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#EF4444', marginTop: 4 }}>
                  {fuelExpenses.filter(f => {
                    const a = computeFuelMileage(f);
                    return a.status === 'HIGH_CONSUMPTION' || a.status === 'ODOMETER_ANOMALY';
                  }).length} Flags
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                  Siphoning or Cable Disconnect
                </div>
              </div>
            </div>

            {/* Three-Way Audit Protocol Explanation */}
            <div style={{ padding: '0.85rem 1rem', background: 'rgba(245, 158, 11, 0.08)', borderRadius: 10, marginBottom: '1.25rem', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F59E0B', fontSize: '0.88rem', fontWeight: 700 }}>
                <Fuel size={17} /> THREE-WAY FUEL RECONCILIATION FORMULA (Anti-Petrol Cheating System)
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: '#CBD5E1', lineHeight: 1.5 }}>
                <b>Litres Claimed ÷ (Shift Odometer Delta & GPS Actual KM) = Real-World Mileage (km/L).</b> Normal Hero Splendor operates at <b>45–65 km/L</b>. Mileage below <b>38 km/L</b> flags automated siphoning risk. Driver cannot claim manual amount without pump dispenser camera proof and matching pump odometer.
              </p>
            </div>

            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Date / Claim ID</th>
                    <th>Driver & Bike</th>
                    <th>Amount & Litres</th>
                    <th>Pump Odometer & GPS</th>
                    <th>Camera Proofs</th>
                    <th>3-Way Mileage Audit</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fuelExpenses.map(f => {
                    const driver = driversMap[f.driverId];
                    const bike = bikesMap[f.bikeId];
                    const analysis = computeFuelMileage(f);
                    const unitRate = f.amount && f.litres ? Math.round((Number(f.amount) / Number(f.litres)) * 10) / 10 : null;

                    return (
                      <tr key={f.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#FFF' }}>{f.date}</div>
                          <code style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{f.id.substring(0, 10)}...</code>
                        </td>
                        <td>
                          <b>{driver?.fullName || 'Driver'}</b>
                          <div style={{ fontSize: '0.75rem', color: '#60A5FA' }}>
                            {bike?.registrationNumber || driver?.assignedBikeRegistration || 'Assigned Bike'}
                          </div>
                        </td>
                        <td>
                          <b style={{ color: '#F59E0B', fontSize: '1rem' }}>₹{f.amount}</b>
                          {f.litres && (
                            <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>
                              {f.litres} L {unitRate ? `(@ ₹${unitRate}/L)` : ''}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#E2E8F0', fontSize: '0.85rem' }}>
                            {f.odometerAtFill ? `${f.odometerAtFill} km` : '—'}
                          </div>
                          {f.pumpGps ? (
                            <a 
                              href={`https://www.google.com/maps?q=${f.pumpGps.latitude},${f.pumpGps.longitude}`}
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.72rem', color: '#60A5FA', textDecoration: 'none', marginTop: 2 }}
                            >
                              <MapPin size={11} /> Pump GPS ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Depot record</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {f.dispenserPhotoUrl && (
                              <img 
                                src={f.dispenserPhotoUrl} 
                                alt="Dispenser" 
                                onClick={() => setViewingFuelProof(f)}
                                style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', border: '1.5px solid #F59E0B' }} 
                                title="Dispenser Machine Screen (Click to inspect)"
                              />
                            )}
                            {f.meterPhotoUrl && (
                              <img 
                                src={f.meterPhotoUrl} 
                                alt="Meter" 
                                onClick={() => setViewingFuelProof(f)}
                                style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', border: '1.5px solid #60A5FA' }} 
                                title="Bike Odometer (Click to inspect)"
                              />
                            )}
                            {f.receiptPhotoUrl && (
                              <img 
                                src={f.receiptPhotoUrl} 
                                alt="Receipt" 
                                onClick={() => setViewingFuelProof(f)}
                                style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', border: '1.5px solid #10B981' }} 
                                title="Pump Receipt Bill (Click to inspect)"
                              />
                            )}
                            {(!f.dispenserPhotoUrl && !f.meterPhotoUrl && !f.receiptPhotoUrl) ? (
                              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Direct Ledger</span>
                            ) : (
                              <button 
                                onClick={() => setViewingFuelProof(f)}
                                style={{ background: 'none', border: 'none', color: '#60A5FA', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                              >
                                View 🔍
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          {analysis.mileage !== null ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{
                                  fontSize: '0.85rem',
                                  fontWeight: 800,
                                  color: analysis.status === 'HIGH_CONSUMPTION' ? '#EF4444' : analysis.status === 'ODOMETER_ANOMALY' ? '#F59E0B' : '#10B981'
                                }}>
                                  {analysis.mileage} km/L
                                </span>
                                {analysis.status === 'HIGH_CONSUMPTION' && (
                                  <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>🚨 Siphoning?</span>
                                )}
                                {analysis.status === 'ODOMETER_ANOMALY' && (
                                  <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>⚠️ Tampering?</span>
                                )}
                                {analysis.status === 'OPTIMAL' && (
                                  <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>🟢 Normal</span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                                Shift: {analysis.distanceKm} km ÷ {f.litres} L
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                              {f.odometerAtFill ? `Odo: ${f.odometerAtFill} km` : 'No Shift Cross-check'}
                            </span>
                          )}
                        </td>
                        <td>
                          {f.status === 'PENDING_APPROVAL' ? (
                            <span className="badge badge-warning">Pending Approval</span>
                          ) : f.status === 'APPROVED' ? (
                            <span className="badge badge-success">Approved ✅</span>
                          ) : f.status === 'REJECTED' ? (
                            <span className="badge badge-danger" title={f.rejectionReason}>Rejected ❌</span>
                          ) : (
                            <span className="badge badge-neutral">Settled</span>
                          )}
                        </td>
                        <td>
                          {f.status === 'PENDING_APPROVAL' ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn-success"
                                style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                onClick={() => handleApproveFuel(f)}
                                title="Approve fuel claim"
                              >
                                <Check size={14} /> Approve
                              </button>
                              <button
                                className="btn-danger"
                                style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                onClick={() => handleRejectFuel(f)}
                                title="Reject fuel claim"
                              >
                                <X size={14} /> Reject
                              </button>
                            </div>
                          ) : f.status === 'REJECTED' ? (
                            <div style={{ fontSize: '0.7rem', color: '#F87171', maxWidth: 120 }}>
                              {f.rejectionReason || 'Rejected'}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Reconciled</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {fuelExpenses.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                        No fuel expenses logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: PLATFORM RIDE NOTIFICATIONS & OFFLINE CASH RADAR (Problem 4) */}
        {activeTab === 'platformAudit' && (
          <div>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="card" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#60A5FA', textTransform: 'uppercase' }}>
                  Total Platform Pings
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FFF', marginTop: 4 }}>
                  {platformRideEvents.length} Events
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                  Ola, Uber & Rapido Telemetry
                </div>
              </div>

              <div className="card" style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10B981', textTransform: 'uppercase' }}>
                  Platform Completed Trips
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981', marginTop: 4 }}>
                  {platformRideEvents.filter(e => e.eventType === 'RIDE_COMPLETED').length} Trips
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                  Verified In-App Completions
                </div>
              </div>

              <div className="card" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#F59E0B', textTransform: 'uppercase' }}>
                  App-Cancelled Bookings
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F59E0B', marginTop: 4 }}>
                  {platformRideEvents.filter(e => e.eventType === 'RIDE_CANCELLED').length} Cancels
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                  Subject to Trajectory Audit
                </div>
              </div>

              <div className="card" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#EF4444', textTransform: 'uppercase' }}>
                  Suspected Offline Cash Trips
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#EF4444', marginTop: 4 }}>
                  {platformRideEvents.filter(e => e.suspectedOfflineCashRide || (e.eventType === 'RIDE_CANCELLED' && e.distanceAfterEventKm > 2)).length} Violations
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                  Vehicle moved &gt;2km after cancel
                </div>
              </div>
            </div>

            {/* Educational Heuristic Protocol Banner */}
            <div style={{ padding: '0.85rem 1rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 10, marginBottom: '1.25rem', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#EF4444', fontSize: '0.88rem', fontWeight: 700 }}>
                <ShieldAlert size={17} /> OFFLINE CASH RIDE DETECTION RADAR (Induced App Cancellation Defense)
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: '#CBD5E1', lineHeight: 1.5 }}>
                When a customer or driver cancels a ride on Ola/Uber/Rapido, but the vehicle immediately accelerates and executes a <b>&gt;2 km journey</b>, the system automatically detects an <b>Offline Direct Cash Ride</b>. Unaccounted mileage is calculated into an estimated stolen fare (@ ₹14/km) and clawed back during daily settlement.
              </p>
            </div>

            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Driver & Bike</th>
                    <th>Platform</th>
                    <th>Notification Event</th>
                    <th>Subsequent GPS Movement</th>
                    <th>Fraud Radar Assessment</th>
                    <th>Est. Undeclared Fare</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {platformRideEvents.map(e => {
                    const driver = driversMap[e.driverId];
                    const bike = bikesMap[e.bikeId];
                    const isSuspectedFraud = e.suspectedOfflineCashRide || (e.eventType === 'RIDE_CANCELLED' && e.distanceAfterEventKm > 2);
                    const estFare = Math.round((e.distanceAfterEventKm || 0) * 14);

                    return (
                      <tr key={e.id} style={isSuspectedFraud ? { background: 'rgba(239, 68, 68, 0.05)' } : {}}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#FFF' }}>
                            {e.timestamp ? new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                            {e.timestamp ? e.timestamp.split('T')[0] : ''}
                          </div>
                        </td>
                        <td>
                          <b>{driver?.fullName || 'Driver'}</b>
                          <div style={{ fontSize: '0.75rem', color: '#60A5FA' }}>
                            {bike?.registrationNumber || driver?.assignedBikeRegistration || 'Assigned Bike'}
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-neutral" style={{ fontWeight: 700 }}>
                            {e.platform}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: e.eventType === 'RIDE_CANCELLED' ? '#EF4444' : e.eventType === 'RIDE_COMPLETED' ? '#10B981' : '#60A5FA' }}>
                            {e.eventType}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#CBD5E1', maxWidth: 200 }} numberOfLines={1}>
                            {e.title ? `${e.title}: ` : ''}{e.textSnippet || ''}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#FFF' }}>
                            {e.distanceAfterEventKm ? `${e.distanceAfterEventKm.toFixed(1)} km` : '0 km'}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                            Traveled after ping
                          </div>
                        </td>
                        <td>
                          {isSuspectedFraud ? (
                            <div>
                              <span className="badge badge-danger">
                                🚨 SUSPECTED OFFLINE CASH
                              </span>
                              <div style={{ fontSize: '0.7rem', color: '#FCA5A5', marginTop: 2 }}>
                                Cancelled in app, but bike traveled {e.distanceAfterEventKm?.toFixed(1)} km
                              </div>
                            </div>
                          ) : e.eventType === 'RIDE_CANCELLED' ? (
                            <div>
                              <span className="badge badge-neutral">
                                ⚪ Genuine Cancellation
                              </span>
                              <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: 2 }}>
                                Vehicle stayed stationary (&lt;500m)
                              </div>
                            </div>
                          ) : (
                            <span className="badge badge-success">
                              🟢 Normal Operational Ping
                            </span>
                          )}
                        </td>
                        <td>
                          {isSuspectedFraud ? (
                            <div>
                              <b style={{ color: '#F59E0B', fontSize: '0.95rem' }}>₹{estFare}</b>
                              <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Est. Stolen Cash</div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>—</span>
                          )}
                        </td>
                        <td>
                          {isSuspectedFraud ? (
                            <button
                              className="btn btn-danger btn-sm"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => {
                                const settle = settlements.find(s => s.driverId === e.driverId);
                                if (!settle) {
                                  alert(`No active settlement found for driver ${driver?.fullName}. You can deduct this in their next daily settlement.`);
                                  return;
                                }
                                setAdjModal({
                                  isOpen: true,
                                  settlement: settle,
                                  amount: String(estFare),
                                  type: 'DEBIT',
                                  reason: `Clawback undeclared offline cash trip on ${e.platform}: Cancelled in app but vehicle traveled ${e.distanceAfterEventKm?.toFixed(1)} km.`
                                });
                              }}
                            >
                              Clawback Fare ⚖️
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Logged</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {platformRideEvents.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                        No platform ride events logged yet. Drivers will broadcast Ola/Uber/Rapido telemetry automatically while on duty.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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

            <div className="form-group">
              <label className="form-label">Unauthorized Personal Use (Joyriding) KM</label>
              <input
                type="number"
                step="1"
                className="form-input"
                placeholder="0"
                value={newSettlement.personalKm}
                onChange={(e) => setNewSettlement({ ...newSettlement, personalKm: e.target.value })}
              />
              <span style={{ fontSize: '0.72rem', color: '#F87171' }}>
                {personalFuelCharge > 0 ? `Deducting ${formatCurrency(personalFuelCharge)} personal fuel from worker share` : 'Off-duty km fuel is deducted from worker'}
              </span>
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
            {personalFuelCharge > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
                <span style={{ color: '#F87171' }}>Personal Joyriding Fuel Deduction ({personalKm} km):</span>
                <b style={{ color: '#F87171' }}>-{formatCurrency(personalFuelCharge)}</b>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-subtle)', fontSize: '0.95rem' }}>
              <span style={{ color: '#FFF', fontWeight: 600 }}>Payable to Driver Today (After Deductions):</span>
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

      {/* Three-Way Fuel Proof Inspection Lightbox Modal */}
      <Modal
        isOpen={!!viewingFuelProof}
        onClose={() => setViewingFuelProof(null)}
        title="Three-Way Fuel Proof Inspection (நேரடி சான்றுகள்)"
      >
        {viewingFuelProof && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              {/* Proof 1: Dispenser Screen */}
              <div style={{ background: '#1E293B', padding: '0.75rem', borderRadius: 8, textAlign: 'center', border: '1px solid #F59E0B' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#FCD34D', marginBottom: 6 }}>
                  1. Dispenser Screen (Litres & ₹)
                </div>
                {viewingFuelProof.dispenserPhotoUrl ? (
                  <a href={viewingFuelProof.dispenserPhotoUrl} target="_blank" rel="noopener noreferrer">
                    <img 
                      src={viewingFuelProof.dispenserPhotoUrl} 
                      alt="Dispenser" 
                      style={{ width: '100%', height: 180, objectFit: 'contain', borderRadius: 6, background: '#0F172A' }} 
                    />
                    <div style={{ fontSize: '0.72rem', color: '#60A5FA', marginTop: 4 }}>Click for full resolution ↗</div>
                  </a>
                ) : (
                  <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '0.8rem' }}>
                    No Dispenser Photo
                  </div>
                )}
              </div>

              {/* Proof 2: Bike Odometer */}
              <div style={{ background: '#1E293B', padding: '0.75rem', borderRadius: 8, textAlign: 'center', border: '1px solid #60A5FA' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#60A5FA', marginBottom: 6 }}>
                  2. Bike Odometer & Fuel Gauge
                </div>
                {viewingFuelProof.meterPhotoUrl ? (
                  <a href={viewingFuelProof.meterPhotoUrl} target="_blank" rel="noopener noreferrer">
                    <img 
                      src={viewingFuelProof.meterPhotoUrl} 
                      alt="Odometer" 
                      style={{ width: '100%', height: 180, objectFit: 'contain', borderRadius: 6, background: '#0F172A' }} 
                    />
                    <div style={{ fontSize: '0.72rem', color: '#60A5FA', marginTop: 4 }}>Click for full resolution ↗</div>
                  </a>
                ) : (
                  <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '0.8rem' }}>
                    No Meter Photo
                  </div>
                )}
              </div>

              {/* Proof 3: Receipt Bill */}
              <div style={{ background: '#1E293B', padding: '0.75rem', borderRadius: 8, textAlign: 'center', border: '1px solid #10B981' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34D399', marginBottom: 6 }}>
                  3. Cash Receipt / Bill
                </div>
                {viewingFuelProof.receiptPhotoUrl ? (
                  <a href={viewingFuelProof.receiptPhotoUrl} target="_blank" rel="noopener noreferrer">
                    <img 
                      src={viewingFuelProof.receiptPhotoUrl} 
                      alt="Receipt" 
                      style={{ width: '100%', height: 180, objectFit: 'contain', borderRadius: 6, background: '#0F172A' }} 
                    />
                    <div style={{ fontSize: '0.72rem', color: '#60A5FA', marginTop: 4 }}>Click for full resolution ↗</div>
                  </a>
                ) : (
                  <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '0.8rem' }}>
                    No Receipt Bill (Optional)
                  </div>
                )}
              </div>
            </div>

            {/* Audit Summary Card in Modal */}
            <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#94A3B8' }}>Claim Amount:</span>
                  <div style={{ fontWeight: 800, color: '#F59E0B', fontSize: '1.1rem' }}>₹{viewingFuelProof.amount}</div>
                </div>
                <div>
                  <span style={{ color: '#94A3B8' }}>Litres Filled:</span>
                  <div style={{ fontWeight: 700, color: '#FFF' }}>{viewingFuelProof.litres || '—'} Litres</div>
                </div>
                <div>
                  <span style={{ color: '#94A3B8' }}>Pump Odometer:</span>
                  <div style={{ fontWeight: 700, color: '#FFF' }}>{viewingFuelProof.odometerAtFill ? `${viewingFuelProof.odometerAtFill} km` : '—'}</div>
                </div>
              </div>

              {viewingFuelProof.pumpGps && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                    Geotagged Pump Location: {viewingFuelProof.pumpGps.latitude?.toFixed(4)}, {viewingFuelProof.pumpGps.longitude?.toFixed(4)}
                  </span>
                  <a 
                    href={`https://www.google.com/maps?q=${viewingFuelProof.pumpGps.latitude},${viewingFuelProof.pumpGps.longitude}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.8rem', color: '#60A5FA', fontWeight: 600, textDecoration: 'none' }}
                  >
                    Open in Google Maps ↗
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
