import React, { useState, useEffect } from 'react';
import {
  Bike,
  Plus,
  UserCheck,
  UserX,
  Wrench,
  AlertTriangle,
  Eye,
  BatteryCharging,
  Fuel,
  CheckCircle2,
  ShieldCheck,
  FileText,
  Key,
  Camera,
  Check
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { BIKE_STATUSES } from '../utils/constants';
import Modal from '../components/Modal';

export default function Bikes() {
  const [bikes, setBikes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [handovers, setHandovers] = useState([]);
  const [custodyModal, setCustodyModal] = useState({ isOpen: false, bike: null, handover: null });
  const [addModal, setAddModal] = useState(false);
  const [assignModal, setAssignModal] = useState({ isOpen: false, bike: null, driverId: '' });
  const [docModal, setDocModal] = useState({
    isOpen: false,
    bike: null,
    insuranceNumber: '',
    insuranceExpiry: '',
    pucValidUntil: '',
    cngHydroTestExpiry: '',
    fitnessExpiry: ''
  });
  const [loading, setLoading] = useState(false);

  const [newBike, setNewBike] = useState({
    registrationNumber: '',
    make: 'Hero',
    model: 'Splendor Plus',
    year: '2024',
    fuelType: 'PETROL',
    hubId: '',
    providerType: 'DEPOT', // 'DEPOT' | 'HOST'
    providerName: '',
    providerPhone: '',
    pickupAddress: '',
    pickupLandmark: '',
    pickupLatitude: '',
    pickupLongitude: '',
    currentOdometer: '0',
    currentFuelCharge: '100',
    insuranceNumber: '',
    insuranceExpiry: '',
    pucValidUntil: '',
    cngHydroTestExpiry: '',
    fitnessExpiry: ''
  });

  useEffect(() => {
    const unsubBikes = subscribeToCollection('bikes', setBikes);
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    const unsubHubs = subscribeToCollection('hubs', setHubs);
    const unsubHandovers = subscribeToCollection('bikeHandovers', setHandovers);
    return () => {
      unsubBikes();
      unsubDrivers();
      unsubHubs();
      unsubHandovers();
    };
  }, []);

  const eligibleDrivers = drivers.filter(d =>
    d.approvalStatus === 'APPROVED' &&
    d.verificationStatus === 'DOCUMENTS_VERIFIED' &&
    d.accountStatus !== 'REJECTED' &&
    d.accountStatus !== 'SUSPENDED' &&
    !d.assignedBikeId
  );

  // Real-Time Legal & RTO Document Expiry Health Evaluator
  const evaluateDocumentHealth = (bike) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkDoc = (dateStr, label) => {
      if (!dateStr) return { label, status: 'MISSING', text: 'Not Recorded', daysLeft: -999 };
      const exp = new Date(dateStr);
      const diffTime = exp.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return { label, status: 'EXPIRED', text: `EXPIRED (${Math.abs(diffDays)}d ago)`, daysLeft: diffDays };
      if (diffDays <= 15) return { label, status: 'EXPIRING_SOON', text: `Expires in ${diffDays}d`, daysLeft: diffDays };
      return { label, status: 'VALID', text: `Valid (${diffDays}d left)`, daysLeft: diffDays };
    };

    const ins = checkDoc(bike.insuranceExpiry, 'Insurance');
    const puc = checkDoc(bike.pucValidUntil, 'PUCC (Pollution)');
    const isCng = bike.fuelType === 'CNG' || bike.fuelType === 'CNG_PETROL';
    const cngHydro = isCng ? checkDoc(bike.cngHydroTestExpiry, 'CNG Hydro-Test (PESO)') : null;
    const fitness = bike.fitnessExpiry ? checkDoc(bike.fitnessExpiry, 'Fitness (FC)') : null;

    const list = [ins, puc, cngHydro, fitness].filter(Boolean);
    const hasExpired = list.some(d => d.status === 'EXPIRED');
    const hasExpiringSoon = list.some(d => d.status === 'EXPIRING_SOON');

    return {
      hasExpired,
      hasExpiringSoon,
      docs: list,
      badge: hasExpired ? 'badge-danger' : hasExpiringSoon ? 'badge-warning' : 'badge-success',
      label: hasExpired ? '🚨 EXPIRED' : hasExpiringSoon ? '⚠️ EXPIRING SOON' : '🟢 VALID'
    };
  };

  const handleAddBike = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const selectedHub = hubs.find(h => h.id === newBike.hubId) || hubs[0] || null;
      const effectiveHubId = newBike.hubId || selectedHub?.id || null;
      const isHost = newBike.providerType === 'HOST';

      const pickupAddress = isHost
        ? (newBike.pickupAddress || selectedHub?.address || 'Host Specified Address')
        : (selectedHub?.address || newBike.pickupAddress || 'Depot Address');

      const providerName = isHost
        ? (newBike.providerName || 'Bike Provider Host')
        : (selectedHub?.name || 'Company Hub Depot');

      const providerPhone = isHost
        ? (newBike.providerPhone || '')
        : (selectedHub?.managerContact || '+91 9876543210');

      const pickupLatitude = Number(newBike.pickupLatitude) || selectedHub?.latitude || 28.611529;
      const pickupLongitude = Number(newBike.pickupLongitude) || selectedHub?.longitude || 77.081742;

      const bikeId = `bike_${newBike.registrationNumber.replace(/\s+/g, '-').toLowerCase()}`;
      await setDoc(doc(db, 'bikes', bikeId), {
        id: bikeId,
        registrationNumber: newBike.registrationNumber.toUpperCase(),
        make: newBike.make,
        model: newBike.model,
        year: Number(newBike.year),
        fuelType: newBike.fuelType,
        hubId: effectiveHubId,
        hubName: selectedHub?.name || 'Central Hub',
        providerType: newBike.providerType,
        providerName,
        providerPhone,
        pickupAddress,
        pickupLandmark: newBike.pickupLandmark || '',
        pickupLatitude,
        pickupLongitude,
        status: 'AVAILABLE',
        currentOdometer: Number(newBike.currentOdometer) || 0,
        lastServiceOdometer: Number(newBike.currentOdometer) || 0,
        nextServiceOdometer: (Number(newBike.currentOdometer) || 0) + 2500,
        lastServiceDate: new Date().toISOString(),
        serviceDue: false,
        currentFuelCharge: Number(newBike.currentFuelCharge) || 100,
        insuranceNumber: newBike.insuranceNumber,
        insuranceExpiry: newBike.insuranceExpiry,
        pucValidUntil: newBike.pucValidUntil,
        cngHydroTestExpiry: newBike.cngHydroTestExpiry || null,
        fitnessExpiry: newBike.fitnessExpiry || null,
        assignedDriverId: null,
        assignedDriverName: null,
        createdAt: serverTimestamp()
      });

      await logAdminAudit({
        action: 'BIKE_ADDED',
        relevantRecordId: bikeId,
        newValue: newBike.registrationNumber,
        notes: `New bike added to fleet: ${newBike.registrationNumber} at ${pickupAddress}`
      });

      setAddModal(false);
      setNewBike({
        registrationNumber: '',
        make: 'Hero',
        model: 'Splendor Plus',
        year: '2024',
        fuelType: 'PETROL',
        hubId: '',
        providerType: 'DEPOT',
        providerName: '',
        providerPhone: '',
        pickupAddress: '',
        pickupLandmark: '',
        pickupLatitude: '',
        pickupLongitude: '',
        currentOdometer: '0',
        currentFuelCharge: '100',
        insuranceNumber: '',
        insuranceExpiry: '',
        pucValidUntil: '',
        cngHydroTestExpiry: '',
        fitnessExpiry: ''
      });
    } catch (err) {
      alert(`Error creating bike: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignBike = async () => {
    const { bike, driverId } = assignModal;
    if (!bike || !driverId) return;

    // Legal Compliance Guard: Block assignment if Insurance or PUCC or CNG Hydro is expired
    const docHealth = evaluateDocumentHealth(bike);
    if (docHealth.hasExpired) {
      const expiredList = docHealth.docs.filter(d => d.status === 'EXPIRED').map(d => `${d.label} (${d.text})`).join(', ');
      alert(`❌ CANNOT ASSIGN BIKE: Vehicle ${bike.registrationNumber} has EXPIRED compliance documents!\n\nExpired Items: ${expiredList}\n\nDispatching a commercial vehicle with expired Insurance, PUCC, or CNG Hydro-test certificate violates Motor Vehicles Act / PESO regulations and invites a ₹10,000 fine or police impoundment.\n\nPlease update valid document dates in the vehicle profile before assigning to a driver.`);
      return;
    }

    setLoading(true);
    try {
      const selectedDriver = drivers.find(d => d.id === driverId);
      if (!selectedDriver) throw new Error("Selected driver not found.");

      const selectedHub = hubs.find(h => h.id === bike.hubId);
      const effectiveAddress = bike.pickupAddress || selectedHub?.address || 'Depot Address';
      const effectiveLat = bike.pickupLatitude || selectedHub?.latitude || 28.611529;
      const effectiveLng = bike.pickupLongitude || selectedHub?.longitude || 77.081742;
      const effectiveProviderName = bike.providerName || selectedHub?.name || 'Fleet Hub';
      const effectiveProviderPhone = bike.providerPhone || selectedHub?.managerContact || '';

      // Create bike assignment
      const assignRef = await addDoc(collection(db, 'bikeAssignments'), {
        bikeId: bike.id,
        bikeRegistration: bike.registrationNumber,
        driverId: selectedDriver.id,
        driverName: selectedDriver.fullName,
        driverPhone: selectedDriver.mobileNumber,
        hubId: bike.hubId || null,
        pickupAddress: effectiveAddress,
        status: 'HANDOVER_PENDING',
        assignedAt: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      // Update bike status
      await updateDoc(doc(db, 'bikes', bike.id), {
        status: 'ASSIGNED',
        assignedDriverId: selectedDriver.id,
        assignedDriverName: selectedDriver.fullName,
        currentAssignmentId: assignRef.id
      });

      // Update driver status with complete pickup location & host contact details
      await updateDoc(doc(db, 'drivers', selectedDriver.id), {
        accountStatus: 'BIKE_ASSIGNED',
        assignedBikeId: bike.id,
        assignedBikeRegistration: bike.registrationNumber,
        assignedHubId: bike.hubId || null,
        pickupAddress: effectiveAddress,
        pickupLatitude: effectiveLat,
        pickupLongitude: effectiveLng,
        providerName: effectiveProviderName,
        providerPhone: effectiveProviderPhone,
        currentAssignmentId: assignRef.id
      });

      await logAdminAudit({
        driverId: selectedDriver.id,
        action: 'BIKE_ASSIGNED',
        relevantRecordId: bike.id,
        notes: `Bike ${bike.registrationNumber} assigned to ${selectedDriver.fullName} (Pickup: ${effectiveAddress})`
      });

      setAssignModal({ isOpen: false, bike: null, driverId: '' });
    } catch (err) {
      alert(`Error assigning bike: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUnassignBike = async (bike) => {
    if (!window.confirm(`Unassign bike ${bike.registrationNumber} from current driver?`)) return;

    try {
      if (bike.assignedDriverId) {
        await updateDoc(doc(db, 'drivers', bike.assignedDriverId), {
          accountStatus: 'APPROVED_BIKE_NOT_ASSIGNED',
          assignedBikeId: null,
          assignedBikeRegistration: null,
          currentAssignmentId: null
        });
      }

      await updateDoc(doc(db, 'bikes', bike.id), {
        status: 'AVAILABLE',
        assignedDriverId: null,
        assignedDriverName: null,
        currentAssignmentId: null
      });

      await logAdminAudit({
        driverId: bike.assignedDriverId,
        action: 'BIKE_UNASSIGNED',
        relevantRecordId: bike.id,
        notes: `Bike ${bike.registrationNumber} unassigned`
      });
    } catch (err) {
      alert(`Error unassigning bike: ${err.message}`);
    }
  };

  const handleMarkBikeServiced = async (b) => {
    const curOdo = Number(b.currentOdometer) || 0;
    const nextOdo = curOdo + 2500;
    if (!window.confirm(`Confirm 2,500 KM Oil Change & Periodic Service for Bike ${b.registrationNumber} at ${curOdo} KM?\n\nNext oil change will be set to: ${nextOdo} KM.`)) {
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, 'bikes', b.id), {
        lastServiceOdometer: curOdo,
        nextServiceOdometer: nextOdo,
        lastServiceDate: new Date().toISOString(),
        serviceDue: false
      });

      await addDoc(collection(db, 'bikeMaintenanceLogs'), {
        bikeId: b.id,
        registrationNumber: b.registrationNumber,
        serviceType: 'OIL_CHANGE_AND_INSPECTION',
        odometer: curOdo,
        nextServiceOdometer: nextOdo,
        servicedAt: new Date().toISOString(),
        notes: '2,500 KM Periodic engine oil replacement, chain lube & brake check.'
      });

      await logAdminAudit({
        action: 'BIKE_SERVICED',
        relevantRecordId: b.id,
        notes: `Bike ${b.registrationNumber} serviced at ${curOdo} KM. Next service at ${nextOdo} KM.`
      });

      alert(`Bike ${b.registrationNumber} marked Serviced! Next oil change at ${nextOdo} KM. ✅`);
    } catch (e) {
      alert(`Error updating service: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDocs = async (e) => {
    e.preventDefault();
    if (!docModal.bike) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'bikes', docModal.bike.id), {
        insuranceNumber: docModal.insuranceNumber || '',
        insuranceExpiry: docModal.insuranceExpiry || '',
        pucValidUntil: docModal.pucValidUntil || '',
        cngHydroTestExpiry: docModal.cngHydroTestExpiry || null,
        fitnessExpiry: docModal.fitnessExpiry || null,
        updatedAt: serverTimestamp()
      });

      await logAdminAudit({
        action: 'BIKE_DOCUMENTS_UPDATED',
        relevantRecordId: docModal.bike.id,
        notes: `Legal compliance documents updated for ${docModal.bike.registrationNumber} (Ins: ${docModal.insuranceExpiry}, PUC: ${docModal.pucValidUntil})`
      });

      alert(`Compliance documents updated successfully for ${docModal.bike.registrationNumber}! ✅`);
      setDocModal({ isOpen: false, bike: null, insuranceNumber: '', insuranceExpiry: '', pucValidUntil: '', cngHydroTestExpiry: '', fitnessExpiry: '' });
    } catch (err) {
      alert(`Error updating documents: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const expiredDocsBikes = bikes.filter(b => evaluateDocumentHealth(b).hasExpired);
  const expiringSoonBikes = bikes.filter(b => !evaluateDocumentHealth(b).hasExpired && evaluateDocumentHealth(b).hasExpiringSoon);
  const serviceOverdueBikes = bikes.filter(b => {
    const cur = Number(b.currentOdometer) || 0;
    const next = Number(b.nextServiceOdometer) || (cur + 2500);
    return (next - cur) <= 0;
  });

  const hubsMap = Object.fromEntries(hubs.map(h => [h.id, h.name]));

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Bike size={18} color="#F59E0B" />
            <span>Fleet Inventory ({bikes.length} Vehicles)</span>
          </div>
          <button className="btn btn-primary" onClick={() => setAddModal(true)}>
            <Plus size={16} /> Register New Bike
          </button>
        </div>

        {/* Legal Compliance & Service Alert Banners */}
        {expiredDocsBikes.length > 0 && (
          <div style={{
            margin: '1rem',
            padding: '1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: '#F87171'
          }}>
            <AlertTriangle size={20} />
            <div>
              <div style={{ fontWeight: 600 }}>
                🚨 {expiredDocsBikes.length} Vehicle(s) Have EXPIRED Legal Compliance Documents!
              </div>
              <div style={{ fontSize: '0.85rem', color: '#FCA5A5', marginTop: '2px' }}>
                Affected bikes: {expiredDocsBikes.map(b => b.registrationNumber).join(', ')}. Under Motor Vehicles Act / PESO, commercial dispatch is blocked to prevent ₹10,000 traffic fines and impoundment. Please update valid certificates.
              </div>
            </div>
          </div>
        )}

        {expiringSoonBikes.length > 0 && (
          <div style={{
            margin: '1rem',
            padding: '1rem',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: '#FCD34D'
          }}>
            <AlertTriangle size={20} />
            <div>
              <div style={{ fontWeight: 600 }}>
                ⚠️ {expiringSoonBikes.length} Vehicle(s) Documents Expiring Soon (Within 15 Days)
              </div>
              <div style={{ fontSize: '0.85rem', color: '#FDE68A', marginTop: '2px' }}>
                Bikes due for renewal: {expiringSoonBikes.map(b => b.registrationNumber).join(', ')}. Please arrange Insurance / PUCC renewal promptly.
              </div>
            </div>
          </div>
        )}

        {serviceOverdueBikes.length > 0 && (
          <div style={{
            margin: '1rem',
            padding: '1rem',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: '#38BDF8'
          }}>
            <Wrench size={20} />
            <div>
              <div style={{ fontWeight: 600 }}>
                🔧 {serviceOverdueBikes.length} Vehicle(s) Overdue for 2,500 KM Oil Change & Maintenance
              </div>
              <div style={{ fontSize: '0.85rem', color: '#BAE6FD', marginTop: '2px' }}>
                Overdue bikes: {serviceOverdueBikes.map(b => b.registrationNumber).join(', ')}. Schedule immediate periodic oil change at hub depot.
              </div>
            </div>
          </div>
        )}

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Registration #</th>
                <th>Make & Model</th>
                <th>Type</th>
                <th>Stationed Hub & Pickup Location</th>
                <th>Legal Compliance (Expiry)</th>
                <th>Odometer</th>
                <th>Service & Oil Change</th>
                <th>Fuel/Charge</th>
                <th>Status</th>
                <th>Assigned Driver</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bikes.map(b => (
                <tr key={b.id}>
                  <td><b>{b.registrationNumber}</b></td>
                  <td>{b.make} {b.model} ({b.year})</td>
                  <td>
                    <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {b.fuelType === 'EV' ? (
                        <BatteryCharging size={13} color="#10B981" />
                      ) : (b.fuelType === 'CNG' || b.fuelType === 'CNG_PETROL') ? (
                        <span style={{ fontSize: 13 }}>🟢</span>
                      ) : (
                        <Fuel size={13} color="#F59E0B" />
                      )}
                      {b.fuelType === 'CNG_PETROL' ? 'CNG + Petrol' : b.fuelType || 'PETROL'}
                    </span>
                  </td>
                  <td>
                    <div>
                      <b>{hubsMap[b.hubId] || b.hubName || 'Sitapuri Hub'}</b>
                      {b.providerType === 'HOST' ? (
                        <div style={{ marginTop: 3 }}>
                          <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>🏡 Host Provided</span>
                          <div style={{ fontSize: '0.78rem', color: '#CBD5E1', marginTop: 2 }}>👤 {b.providerName} {b.providerPhone && `(${b.providerPhone})`}</div>
                          <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>📍 {b.pickupAddress || 'Host Address'}</div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: 2 }}>
                          🏢 Depot Stock • {b.pickupAddress || 'Depot Address'}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    {(() => {
                      const health = evaluateDocumentHealth(b);
                      return (
                        <div>
                          <span className={`badge ${health.badge}`} style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            {health.label}
                          </span>
                          <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {health.docs.map((d, i) => (
                              <div key={i} style={{ color: d.status === 'EXPIRED' ? '#F87171' : d.status === 'EXPIRING_SOON' ? '#FCD34D' : '#94A3B8' }}>
                                • {d.label}: <b>{d.text}</b>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td>{b.currentOdometer || 0} km</td>
                  <td>
                    {(() => {
                      const cur = Number(b.currentOdometer) || 0;
                      const next = Number(b.nextServiceOdometer) || (cur + 2500);
                      const rem = next - cur;
                      const isOverdue = rem <= 0;
                      const isDueSoon = rem > 0 && rem <= 250;
                      return (
                        <div>
                          <span className={`badge ${isOverdue ? 'badge-danger' : isDueSoon ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.72rem' }}>
                            {isOverdue ? `🔴 OVERDUE (${Math.abs(rem)} km)` : isDueSoon ? `🟠 Due Soon (${rem} km)` : `🟢 ${rem} km left`}
                          </span>
                          <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: 3 }}>
                            Next: {next} km
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td><b>{b.currentFuelCharge || 100}%</b></td>
                  <td>
                    <span className={`badge ${b.status === 'AVAILABLE' ? 'badge-success' :
                        b.status === 'ACTIVE' ? 'badge-info' :
                          b.status === 'MAINTENANCE' || b.status === 'ACCIDENT' ? 'badge-danger' : 'badge-warning'
                      }`}>
                      {BIKE_STATUSES[b.status] || b.status}
                    </span>
                  </td>
                  <td>
                    {b.assignedDriverName ? (
                      <span className="badge badge-info">{b.assignedDriverName}</span>
                    ) : (
                      <span style={{ color: '#64748B' }}>Unassigned</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {b.status === 'AVAILABLE' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34D399' }}
                          onClick={() => setAssignModal({ isOpen: true, bike: b, driverId: '' })}
                        >
                          <UserCheck size={14} /> Assign
                        </button>
                      )}

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ borderColor: 'rgba(168, 85, 247, 0.4)', color: '#C084FC' }}
                        onClick={() => setDocModal({
                          isOpen: true,
                          bike: b,
                          insuranceNumber: b.insuranceNumber || '',
                          insuranceExpiry: b.insuranceExpiry || '',
                          pucValidUntil: b.pucValidUntil || '',
                          cngHydroTestExpiry: b.cngHydroTestExpiry || '',
                          fitnessExpiry: b.fitnessExpiry || ''
                        })}
                        title="Update Legal Compliance & RTO Documents"
                      >
                        <FileText size={13} /> Docs
                      </button>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38BDF8' }}
                        onClick={() => handleMarkBikeServiced(b)}
                        title="Record 2,500 KM Oil Change & Service"
                      >
                        <Wrench size={13} /> Service (Oil)
                      </button>

                      {(b.status === 'RETURNED' || b.status === 'MAINTENANCE') && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34D399' }}
                          onClick={async () => {
                            if (window.confirm(`Mark bike ${b.registrationNumber} as AVAILABLE after depot inspection?`)) {
                              if (b.assignedDriverId) {
                                try {
                                  await updateDoc(doc(db, 'drivers', b.assignedDriverId), {
                                    assignedBikeId: null,
                                    assignedBikeRegistration: null,
                                    currentAssignmentId: null,
                                    accountStatus: 'APPROVED_BIKE_NOT_ASSIGNED'
                                  });
                                } catch (e) {
                                  console.warn('Driver unassign on mark available:', e);
                                }
                              }
                              await updateDoc(doc(db, 'bikes', b.id), {
                                status: 'AVAILABLE',
                                assignedDriverId: null,
                                assignedDriverName: null,
                                currentAssignmentId: null
                              });
                              await logAdminAudit({
                                action: 'BIKE_MARKED_AVAILABLE',
                                relevantRecordId: b.id,
                                notes: `Bike ${b.registrationNumber} inspected at depot and confirmed AVAILABLE.`
                              });
                            }
                          }}
                        >
                          <CheckCircle2 size={14} /> Inspect & Mark Available
                        </button>
                      )}

                      {(b.lastHandoverId || b.assignedDriverId || b.status !== 'AVAILABLE') && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#FCD34D' }}
                          onClick={() => {
                            const handover = handovers.find(h => h.id === b.lastHandoverId || h.bikeId === b.id);
                            setCustodyModal({ isOpen: true, bike: b, handover });
                          }}
                          title="View Custody & 360 Inspection Record"
                        >
                          <ShieldCheck size={14} /> Custody Record
                        </button>
                      )}

                      {b.assignedDriverId && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#F87171' }}
                          onClick={() => handleUnassignBike(b)}
                          title="Unassign Driver"
                        >
                          <UserX size={14} /> Unassign
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {bikes.length === 0 && (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                    No fleet bikes in inventory. Click "Register New Bike" to add.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Bike Modal */}
      <Modal
        isOpen={addModal}
        onClose={() => setAddModal(false)}
        title="Register New Fleet Bike"
      >
        <form onSubmit={handleAddBike}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Registration Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. DL 01 AB 1234"
                value={newBike.registrationNumber}
                onChange={(e) => setNewBike({ ...newBike, registrationNumber: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fuel / Power Type</label>
              <select
                className="form-select"
                value={newBike.fuelType}
                onChange={(e) => {
                  const val = e.target.value;
                  const updates = { fuelType: val };
                  if ((val === 'CNG' || val === 'CNG_PETROL') && newBike.make === 'Hero') {
                    updates.make = 'Bajaj';
                    updates.model = 'Freedom 125 CNG';
                  } else if (val === 'PETROL' && newBike.make === 'Bajaj' && newBike.model === 'Freedom 125 CNG') {
                    updates.make = 'Hero';
                    updates.model = 'Splendor Plus';
                  }
                  setNewBike({ ...newBike, ...updates });
                }}
              >
                <option value="PETROL">Petrol (Owner paid)</option>
                <option value="CNG">CNG (Owner paid)</option>
                <option value="CNG_PETROL">CNG + Petrol Dual-Fuel (Bajaj Freedom)</option>
                <option value="EV">EV Electric</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Make</label>
              <input
                type="text"
                className="form-input"
                placeholder="Hero, Honda, TVS..."
                value={newBike.make}
                onChange={(e) => setNewBike({ ...newBike, make: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Model</label>
              <input
                type="text"
                className="form-input"
                placeholder="Splendor Plus, Shine..."
                value={newBike.model}
                onChange={(e) => setNewBike({ ...newBike, model: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Initial Odometer (km)</label>
              <input
                type="number"
                className="form-input"
                value={newBike.currentOdometer}
                onChange={(e) => setNewBike({ ...newBike, currentOdometer: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Assigned Hub</label>
              <select
                className="form-select"
                value={newBike.hubId}
                onChange={(e) => setNewBike({ ...newBike, hubId: e.target.value })}
              >
                <option value="">Select Pickup & Return Hub</option>
                {hubs.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Insurance Policy Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="Policy #"
                value={newBike.insuranceNumber}
                onChange={(e) => setNewBike({ ...newBike, insuranceNumber: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Insurance Expiry Date</label>
              <input
                type="date"
                className="form-input"
                value={newBike.insuranceExpiry}
                onChange={(e) => setNewBike({ ...newBike, insuranceExpiry: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
            <div className="form-group">
              <label className="form-label">PUCC (Pollution) Expiry Date</label>
              <input
                type="date"
                className="form-input"
                value={newBike.pucValidUntil}
                onChange={(e) => setNewBike({ ...newBike, pucValidUntil: e.target.value })}
              />
            </div>
            {(newBike.fuelType === 'CNG' || newBike.fuelType === 'CNG_PETROL') ? (
              <div className="form-group">
                <label className="form-label">CNG PESO Hydro-Test Expiry</label>
                <input
                  type="date"
                  className="form-input"
                  value={newBike.cngHydroTestExpiry}
                  onChange={(e) => setNewBike({ ...newBike, cngHydroTestExpiry: e.target.value })}
                  placeholder="Mandatory every 3 yrs"
                />
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Fitness (FC) Expiry Date (Optional)</label>
                <input
                  type="date"
                  className="form-input"
                  value={newBike.fitnessExpiry}
                  onChange={(e) => setNewBike({ ...newBike, fitnessExpiry: e.target.value })}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAddModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Registering...' : 'Register Bike'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Update Legal & RTO Documents Modal */}
      <Modal
        isOpen={docModal.isOpen}
        onClose={() => setDocModal({ isOpen: false, bike: null, insuranceNumber: '', insuranceExpiry: '', pucValidUntil: '', cngHydroTestExpiry: '', fitnessExpiry: '' })}
        title={`Legal Compliance & RTO Documents: ${docModal.bike?.registrationNumber || ''}`}
      >
        <form onSubmit={handleUpdateDocs}>
          <div style={{
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '8px',
            padding: '0.85rem',
            marginBottom: '1rem',
            fontSize: '0.82rem',
            color: '#FDE68A'
          }}>
            ℹ️ Update renewed document certificates to clear dispatch locks and maintain legal compliance under the Motor Vehicles Act & PESO guidelines.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Insurance Policy Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="Policy Number"
                value={docModal.insuranceNumber}
                onChange={(e) => setDocModal({ ...docModal, insuranceNumber: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Insurance Expiry Date</label>
              <input
                type="date"
                className="form-input"
                value={docModal.insuranceExpiry}
                onChange={(e) => setDocModal({ ...docModal, insuranceExpiry: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">PUCC (Pollution) Expiry Date</label>
              <input
                type="date"
                className="form-input"
                value={docModal.pucValidUntil}
                onChange={(e) => setDocModal({ ...docModal, pucValidUntil: e.target.value })}
                required
              />
            </div>
            {(docModal.bike?.fuelType === 'CNG' || docModal.bike?.fuelType === 'CNG_PETROL') ? (
              <div className="form-group">
                <label className="form-label">CNG PESO Hydro-Test Expiry</label>
                <input
                  type="date"
                  className="form-input"
                  value={docModal.cngHydroTestExpiry}
                  onChange={(e) => setDocModal({ ...docModal, cngHydroTestExpiry: e.target.value })}
                  placeholder="Mandatory 3-yr Hydro-test"
                  required
                />
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Fitness Certificate (FC) Expiry (Optional)</label>
                <input
                  type="date"
                  className="form-input"
                  value={docModal.fitnessExpiry}
                  onChange={(e) => setDocModal({ ...docModal, fitnessExpiry: e.target.value })}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDocModal({ isOpen: false, bike: null, insuranceNumber: '', insuranceExpiry: '', pucValidUntil: '', cngHydroTestExpiry: '', fitnessExpiry: '' })}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving Changes...' : 'Save Updated Certificates'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Bike Modal */}
      <Modal
        isOpen={assignModal.isOpen}
        onClose={() => setAssignModal({ isOpen: false, bike: null, driverId: '' })}
        title={`Assign Bike: ${assignModal.bike?.registrationNumber}`}
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setAssignModal({ isOpen: false, bike: null, driverId: '' })}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAssignBike}
              disabled={loading || !assignModal.driverId}
            >
              {loading ? 'Assigning...' : 'Confirm Assignment'}
            </button>
          </>
        }
      >
        <p style={{ color: '#E2E8F0', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Select an approved driver for <b>{assignModal.bike?.registrationNumber}</b>. Only drivers with completed verification and approval are eligible.
        </p>

        <div className="form-group">
          <label className="form-label">Eligible Approved Drivers ({eligibleDrivers.length})</label>
          <select
            className="form-select"
            value={assignModal.driverId}
            onChange={(e) => setAssignModal(prev => ({ ...prev, driverId: e.target.value }))}
          >
            <option value="">-- Choose Approved Driver --</option>
            {eligibleDrivers.map(d => (
              <option key={d.id} value={d.id}>
                {d.fullName} (Phone: {d.mobileNumber}) - ID: {d.id}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      {/* Custody & Anti-Fraud Inspection Modal */}
      <Modal
        isOpen={custodyModal.isOpen}
        onClose={() => setCustodyModal({ isOpen: false, bike: null, handover: null })}
        title={`🛡️ Custody & Anti-Fraud Record: ${custodyModal.bike?.registrationNumber || ''}`}
        footer={
          <button
            className="btn btn-secondary"
            onClick={() => setCustodyModal({ isOpen: false, bike: null, handover: null })}
          >
            Close Record
          </button>
        }
      >
        {custodyModal.handover ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header Status Banner */}
            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '10px',
              padding: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ color: '#10B981', fontWeight: 'bold', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={18} /> Verified Custody Baseline
                </div>
                <div style={{ color: '#94A3B8', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                  Driver: <b style={{ color: '#FFFFFF' }}>{custodyModal.handover.driverName || custodyModal.bike?.assignedDriverName || 'Assigned Driver'}</b> ({custodyModal.handover.driverPhone || 'N/A'})
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="badge badge-success">ACTIVE CUSTODY</span>
                <div style={{ color: '#64748B', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {custodyModal.handover.timestamp ? new Date(custodyModal.handover.timestamp).toLocaleString() : 'N/A'}
                </div>
              </div>
            </div>

            {/* Baseline Readings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#182238', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Baseline Odometer</div>
                <div style={{ color: '#FCD34D', fontSize: '1.2rem', fontWeight: 'bold' }}>
                  {custodyModal.handover.odometer || custodyModal.bike?.currentOdometer || 0} km
                </div>
              </div>
              <div style={{ backgroundColor: '#182238', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Handover Fuel Level</div>
                <div style={{ color: '#10B981', fontSize: '1.2rem', fontWeight: 'bold' }}>
                  {custodyModal.handover.fuelCharge || 100}%
                </div>
              </div>
              <div style={{ backgroundColor: '#182238', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>Keys & Helmets Count</div>
                <div style={{ color: '#60A5FA', fontSize: '1.1rem', fontWeight: 'bold' }}>
                  🔑 {custodyModal.handover.keysCount || 1} Key • 🪖 {custodyModal.handover.helmetsCount || 1} Helmet
                </div>
              </div>
            </div>

            {/* 360 Photographic Baseline */}
            <div style={{ backgroundColor: '#111726', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ color: '#F59E0B', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Camera size={16} /> 360° Inspection Photographic Baseline
              </div>

              {custodyModal.handover.photos360 && Object.keys(custodyModal.handover.photos360).length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                  {['front', 'rear', 'left', 'right', 'meter'].map(angle => {
                    const url = custodyModal.handover.photos360[angle];
                    return (
                      <div key={angle} style={{ textAlign: 'center' }}>
                        <div style={{
                          height: '90px',
                          borderRadius: '6px',
                          overflow: 'hidden',
                          backgroundColor: '#1E293B',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" title={`Click to view full ${angle} photo`}>
                              <img src={url} alt={angle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </a>
                          ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '0.75rem' }}>
                              No Photo
                            </div>
                          )}
                        </div>
                        <div style={{ color: '#94A3B8', fontSize: '0.7rem', marginTop: '0.25rem', textTransform: 'capitalize' }}>
                          {angle} {angle === 'meter' ? 'Console' : 'View'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#64748B', fontSize: '0.85rem', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  Inspection completed with digital checklist. Photos not captured for this legacy session.
                </div>
              )}
            </div>

            {/* Checklist Verification Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#182238', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#FCD34D', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  📄 Identity & Documents Check
                </div>
                <div style={{ fontSize: '0.8rem', color: '#E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Check size={14} color="#10B981" /> Chassis Number physically verified
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Check size={14} color="#10B981" /> Engine Number physically verified
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Check size={14} color="#10B981" /> Original RC Smart Card retained by Owner
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Check size={14} color="#10B981" /> Commercial Insurance valid & present
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#182238', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: '#FCD34D', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  🔧 Mechanical & Anti-Tamper Check
                </div>
                <div style={{ fontSize: '0.8rem', color: '#E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div>• Front Tyre: <b style={{ color: '#10B981' }}>{custodyModal.handover.tyreCondition?.front || 'GOOD'}</b></div>
                  <div>• Rear Tyre: <b style={{ color: '#10B981' }}>{custodyModal.handover.tyreCondition?.rear || 'GOOD'}</b></div>
                  <div>• GPS Tracker: <b style={{ color: '#10B981' }}>Active & Monitored</b></div>
                  <div>• Existing Damage: <span style={{ color: '#94A3B8' }}>{custodyModal.handover.existingDamage || 'None'}</span></div>
                </div>
              </div>
            </div>

            {/* Signed Legal Declaration */}
            <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <div style={{ color: '#F59E0B', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                ⚖️ Legal Anti-Fraud Declaration Signed
              </div>
              <div style={{ color: '#FDE68A', fontSize: '0.75rem', lineHeight: '1.2rem' }}>
                "Driver signed custody agreement confirming vehicle received in verified condition. Acknowledged: (1) Original RC in Owner safe, (2) Sub-leasing & personal use forbidden, (3) Parts swapping constitutes Criminal Breach of Trust, (4) Daily platform earnings subject to depot physical verification."
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>
            <Bike size={36} color="#64748B" style={{ marginBottom: '1rem' }} />
            <div style={{ fontWeight: 'bold', color: '#FFFFFF', marginBottom: '0.5rem' }}>
              No Handover Record Available Yet
            </div>
            <div style={{ fontSize: '0.85rem', maxWidth: '400px', margin: '0 auto', lineHeight: '1.4rem' }}>
              When the assigned driver completes the 360° inspection and signs the Custody Declaration in the mobile app, full baseline records, photos, and checklist will appear here.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
