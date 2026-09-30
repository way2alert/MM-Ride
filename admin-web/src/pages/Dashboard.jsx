import React, { useState, useEffect } from 'react';
import { 
  Users, 
  FileClock, 
  UserCheck, 
  Bike, 
  CheckCircle2, 
  Activity, 
  Coffee, 
  Clock, 
  Gauge, 
  DollarSign, 
  AlertOctagon, 
  Wrench,
  ArrowRight,
  ShieldCheck,
  Home,
  FileCheck2
} from 'lucide-react';
import MetricCard from '../components/MetricCard';
import LiveMap from '../components/LiveMap';
import { subscribeToCollection } from '../firebase/services';
import { formatDateTime } from '../utils/formatters';

export default function Dashboard({ setTab }) {
  const [drivers, setDrivers] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [bikes, setBikes] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [dutySessions, setDutySessions] = useState([]);
  const [speedAlerts, setSpeedAlerts] = useState([]);
  const [idleAlerts, setIdleAlerts] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [incidents, setIncidents] = useState([]);

  useEffect(() => {
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    const unsubAddresses = subscribeToCollection('addresses', setAddresses);
    const unsubBikes = subscribeToCollection('bikes', setBikes);
    const unsubHubs = subscribeToCollection('hubs', setHubs);
    const unsubDuty = subscribeToCollection('dutySessions', setDutySessions);
    const unsubSpeed = subscribeToCollection('speedEvents', setSpeedAlerts);
    const unsubIdle = subscribeToCollection('idleAlerts', setIdleAlerts);
    const unsubSettlements = subscribeToCollection('settlements', setSettlements);
    const unsubIncidents = subscribeToCollection('incidents', setIncidents);

    return () => {
      unsubDrivers();
      unsubAddresses();
      unsubBikes();
      unsubHubs();
      unsubDuty();
      unsubSpeed();
      unsubIdle();
      unsubSettlements();
      unsubIncidents();
    };
  }, []);

  // Compute Metrics
  const totalDrivers = drivers.length;
  
  // Pending Document KYC Review
  const pendingDocVerification = drivers.filter(d => 
    d.approvalStatus === 'PENDING' || 
    d.accountStatus === 'DOCUMENT_VERIFICATION_PENDING' || 
    d.accountStatus === 'DOCUMENTS_SUBMITTED' ||
    d.verificationStatus === 'PENDING'
  ).length;

  // Pending Driver Physical Address Verification
  const pendingAddressVerification = (() => {
    const unverifiedDriverIds = new Set(
      addresses
        .filter(a => !a.isVerified && a.verificationStatus !== 'VERIFIED')
        .map(a => a.driverId)
    );
    drivers.forEach(d => {
      if (
        d.accountStatus === 'ADDRESS_VERIFICATION_PENDING' ||
        (!d.addressVerified && d.verificationStatus === 'DOCUMENTS_VERIFIED' && !d.assignedBikeId)
      ) {
        unverifiedDriverIds.add(d.id);
      }
    });
    return unverifiedDriverIds.size;
  })();

  const approvedDrivers = drivers.filter(d => d.approvalStatus === 'APPROVED').length;
  
  const bikesAvailable = bikes.filter(b => b.status === 'AVAILABLE' || b.status === 'RETURNED').length;
  const bikesAssigned = bikes.filter(b => b.status === 'ASSIGNED' || b.status === 'ACTIVE').length;
  const bikesMaintenance = bikes.filter(b => b.status === 'MAINTENANCE' || b.status === 'ACCIDENT').length;
  
  const activeDutySessions = dutySessions.filter(s => s.status === 'ACTIVE');
  const activeDrivers = activeDutySessions.length;
  const driversOnBreak = dutySessions.filter(s => s.status === 'ON_BREAK').length;
  
  const activeIdleAlerts = idleAlerts.filter(a => a.status === 'PENDING_DRIVER_REASON').length;
  const recentSpeedAlerts = speedAlerts.length;
  const pendingSettlements = settlements.filter(s => s.status === 'PENDING_PAYOUT').length;
  const activeIncidents = incidents.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length;

  // Active drivers with coordinates for Live Map preview
  const mapDrivers = drivers.filter(d => d.lastKnownLocation && d.isCurrentlyOnDuty);

  return (
    <div>
      {/* Metric Cards Grid */}
      <div className="metrics-grid">
        <MetricCard
          title="Total Drivers"
          value={totalDrivers}
          subtitle="Registered in system"
          icon={Users}
          onClick={() => setTab('drivers')}
        />
        <MetricCard
          title="Doc Verification"
          value={pendingDocVerification}
          subtitle="KYC docs review"
          icon={FileCheck2}
          highlight={pendingDocVerification > 0}
          onClick={() => setTab('verification')}
        />
        <MetricCard
          title="Address Verification"
          value={pendingAddressVerification}
          subtitle="Field inspection queue"
          icon={Home}
          highlight={pendingAddressVerification > 0}
          onClick={() => setTab('address-verif')}
        />
        <MetricCard
          title="Approved Drivers"
          value={approvedDrivers}
          subtitle="Eligible for bikes"
          icon={UserCheck}
          onClick={() => setTab('drivers')}
        />
        <MetricCard
          title="Bikes Available"
          value={bikesAvailable}
          subtitle="Ready at hubs"
          icon={Bike}
          onClick={() => setTab('bikes')}
        />
        <MetricCard
          title="Bikes Assigned"
          value={bikesAssigned}
          subtitle="With drivers"
          icon={CheckCircle2}
          onClick={() => setTab('bikes')}
        />
        <MetricCard
          title="Active Drivers"
          value={activeDrivers}
          subtitle="Currently on shift"
          icon={Activity}
          highlight={activeDrivers > 0}
          onClick={() => setTab('live-map')}
        />
        <MetricCard
          title="Drivers on Break"
          value={driversOnBreak}
          subtitle="Paused shift"
          icon={Coffee}
          onClick={() => setTab('duty-sessions')}
        />
        <MetricCard
          title="Idle Alerts"
          value={activeIdleAlerts}
          subtitle=">30 mins stationary"
          icon={Clock}
          highlight={activeIdleAlerts > 0}
          onClick={() => setTab('duty-sessions')}
        />
        <MetricCard
          title="Overspeed Alerts"
          value={recentSpeedAlerts}
          subtitle="Exceeded 60 km/h"
          icon={Gauge}
          highlight={recentSpeedAlerts > 0}
          onClick={() => setTab('duty-sessions')}
        />
        <MetricCard
          title="Pending Settlements"
          value={pendingSettlements}
          subtitle="Awaiting daily payout"
          icon={DollarSign}
          highlight={pendingSettlements > 0}
          onClick={() => setTab('settlements')}
        />
        <MetricCard
          title="Active Incidents"
          value={activeIncidents}
          subtitle="Emergency & damage"
          icon={AlertOctagon}
          highlight={activeIncidents > 0}
          onClick={() => setTab('incidents')}
        />
        <MetricCard
          title="Bikes in Maintenance"
          value={bikesMaintenance}
          subtitle="Repairs & inspections"
          icon={Wrench}
          onClick={() => setTab('bikes')}
        />
      </div>

      {/* Main Grid: Live Monitoring Map Preview & Real-Time Alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title">
              <Activity size={18} color="#F59E0B" />
              <span>Live Fleet & Duty Tracking</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setTab('live-map')}>
              Full Screen Map <ArrowRight size={14} />
            </button>
          </div>
          <LiveMap drivers={mapDrivers.length > 0 ? mapDrivers : drivers} hubs={hubs} />
        </div>

        <div className="panel" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <div className="panel-title">
              <AlertOctagon size={18} color="#EF4444" />
              <span>Priority Alerts Queue</span>
            </div>
            <span className="badge badge-danger">{activeIdleAlerts + recentSpeedAlerts + activeIncidents} Active</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {incidents.slice(0, 3).map(inc => (
              <div key={inc.id} style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 8,
                padding: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <b style={{ color: '#EF4444', fontSize: '0.85rem' }}>🚨 {inc.type || 'Incident'}</b>
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{formatDateTime(inc.timestamp)}</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#E2E8F0' }}>{inc.description || 'Driver reported an incident.'}</p>
                <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#CBD5E1' }}>Driver ID: {inc.driverId}</div>
              </div>
            ))}

            {speedAlerts.slice(0, 3).map(sp => (
              <div key={sp.id} style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 8,
                padding: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <b style={{ color: '#F59E0B', fontSize: '0.85rem' }}>⚡ Overspeed Alert</b>
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{formatDateTime(sp.timestamp)}</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#E2E8F0' }}>
                  Recorded speed: <b>{sp.speedKmh} km/h</b> (Threshold: {sp.thresholdKmh || 60} km/h)
                </p>
                <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#CBD5E1' }}>Driver ID: {sp.driverId}</div>
              </div>
            ))}

            {idleAlerts.slice(0, 3).map(idAlert => (
              <div key={idAlert.id} style={{
                background: 'rgba(100, 116, 139, 0.1)',
                border: '1px solid rgba(100, 116, 139, 0.3)',
                borderRadius: 8,
                padding: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <b style={{ color: '#94A3B8', fontSize: '0.85rem' }}>⏳ Stationary Idle Alert</b>
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{formatDateTime(idAlert.timestamp)}</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#E2E8F0' }}>
                  Idle duration: <b>{idAlert.idleDurationMinutes || 30} mins</b>
                </p>
                <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#CBD5E1' }}>
                  Reason: {idAlert.driverReason || 'Awaiting driver input'}
                </div>
              </div>
            ))}

            {incidents.length === 0 && speedAlerts.length === 0 && idleAlerts.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                <ShieldCheck size={36} style={{ margin: '0 auto 0.5rem', display: 'block', color: '#10B981' }} />
                All operations running smoothly. Zero active critical alerts.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
