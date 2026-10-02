import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  MapPin, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ShieldAlert, 
  Car, 
  Bike, 
  Phone, 
  ExternalLink, 
  DollarSign, 
  Clock, 
  ArrowUpRight, 
  Sparkles,
  RefreshCw,
  Eye,
  SlidersHorizontal,
  ChevronRight,
  TrendingUp,
  UserCheck
} from 'lucide-react';
import { subscribeToCollection, logAdminAudit } from '../firebase/services';
import { formatDateTime } from '../utils/formatters';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function RidesRadar({ onSelectDriver }) {
  const [platformEvents, setPlatformEvents] = useState([]);
  const [shiftRides, setShiftRides] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [bikes, setBikes] = useState([]);
  const [dutySessions, setDutySessions] = useState([]);
  
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'ACCEPTED' | 'CANCELLED' | 'COMPLETED' | 'SHIFT_LOGS' | 'VIOLATIONS'
  const [platformFilter, setPlatformFilter] = useState('ALL'); // 'ALL' | 'OLA' | 'UBER' | 'RAPIDO'
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL'); // 'ALL' | 'TODAY'
  const [simulating, setSimulating] = useState(false);
  const [inspectModal, setInspectModal] = useState(null);

  useEffect(() => {
    const unsubEvents = subscribeToCollection('platformRideEvents', setPlatformEvents);
    const unsubShift = subscribeToCollection('shiftRideEntries', setShiftRides);
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    const unsubBikes = subscribeToCollection('bikes', setBikes);
    const unsubDuties = subscribeToCollection('dutySessions', setDutySessions);

    return () => {
      unsubEvents();
      unsubShift();
      unsubDrivers();
      unsubBikes();
      unsubDuties();
    };
  }, []);

  const driversMap = Object.fromEntries(drivers.map(d => [d.id, d]));
  const bikesMap = Object.fromEntries(bikes.map(b => [b.id, b]));
  const dutiesMap = Object.fromEntries(dutySessions.map(ds => [ds.id, ds]));

  // Categorize Events
  const acceptedEvents = platformEvents.filter(e => e.eventType === 'RIDE_ACCEPTED');
  const cancelledEvents = platformEvents.filter(e => e.eventType === 'RIDE_CANCELLED');
  const completedEvents = platformEvents.filter(e => e.eventType === 'RIDE_COMPLETED');
  const violationEvents = platformEvents.filter(e => 
    e.suspectedOfflineCashRide || (e.eventType === 'RIDE_CANCELLED' && (e.distanceAfterEventKm || 0) > 2)
  );

  // In-shift logged rides stats
  const totalShiftFare = shiftRides.reduce((acc, r) => acc + (Number(r.fare) || 0), 0);
  const totalShiftCash = shiftRides.filter(r => r.paymentMethod === 'CASH').reduce((acc, r) => acc + (Number(r.fare) || 0), 0);
  const totalShiftUpi = shiftRides.filter(r => r.paymentMethod !== 'CASH').reduce((acc, r) => acc + (Number(r.fare) || 0), 0);

  // Filter by Date helper
  const isToday = (isoDate) => {
    if (!isoDate) return false;
    const todayStr = new Date().toISOString().split('T')[0];
    return isoDate.startsWith(todayStr);
  };

  // Build unified feed list based on active tab
  let rawList = [];
  if (activeTab === 'SHIFT_LOGS') {
    rawList = shiftRides.map(r => ({ ...r, _source: 'SHIFT_LOG' }));
  } else if (activeTab === 'ACCEPTED') {
    rawList = acceptedEvents.map(e => ({ ...e, _source: 'PLATFORM_EVENT' }));
  } else if (activeTab === 'CANCELLED') {
    rawList = cancelledEvents.map(e => ({ ...e, _source: 'PLATFORM_EVENT' }));
  } else if (activeTab === 'COMPLETED') {
    rawList = completedEvents.map(e => ({ ...e, _source: 'PLATFORM_EVENT' }));
  } else if (activeTab === 'VIOLATIONS') {
    rawList = violationEvents.map(e => ({ ...e, _source: 'PLATFORM_EVENT' }));
  } else {
    // 'ALL' - Combine both streams sorted by timestamp descending
    const combined = [
      ...platformEvents.map(e => ({ ...e, _source: 'PLATFORM_EVENT' })),
      ...shiftRides.map(r => ({ ...r, _source: 'SHIFT_LOG' }))
    ];
    rawList = combined;
  }

  // Sort descending by timestamp
  rawList.sort((a, b) => {
    const tA = new Date(a.timestamp || 0).getTime();
    const tB = new Date(b.timestamp || 0).getTime();
    return tB - tA;
  });

  // Apply Platform, Date, and Search filters
  const filteredList = rawList.filter(item => {
    // Date filter
    if (dateFilter === 'TODAY' && !isToday(item.timestamp)) {
      return false;
    }

    // Platform filter
    const itemPlatform = (item.platform || '').toUpperCase();
    if (platformFilter !== 'ALL' && itemPlatform !== platformFilter) {
      return false;
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const driver = driversMap[item.driverId];
      const bike = bikesMap[item.bikeId];
      const driverName = (driver?.fullName || item.driverName || '').toLowerCase();
      const phone = (driver?.mobileNumber || '').toLowerCase();
      const bikeReg = (bike?.registrationNumber || driver?.assignedBikeRegistration || '').toLowerCase();
      const title = (item.title || '').toLowerCase();
      const text = (item.textSnippet || '').toLowerCase();
      const eventType = (item.eventType || '').toLowerCase();
      const fare = item.fare ? String(item.fare) : '';

      return driverName.includes(q) || 
             phone.includes(q) || 
             bikeReg.includes(q) || 
             itemPlatform.includes(q) || 
             title.includes(q) || 
             text.includes(q) || 
             eventType.includes(q) ||
             fare.includes(q);
    }

    return true;
  });

  // Test Simulation Generator (allows admin to test live telemetry pipeline without mobile drive)
  const handleSimulateTestPing = async (type = 'RIDE_ACCEPTED', platform = 'UBER') => {
    setSimulating(true);
    try {
      const targetDriver = drivers.find(d => d.fullName?.includes('Shivkumar')) || drivers[0];
      const driverId = targetDriver?.id || 'wpfB2Sy82NeY8lRB83qut1ulQTu1';
      const activeDuty = dutySessions.find(ds => ds.driverId === driverId && ds.status === 'ACTIVE');
      const nowIso = new Date().toISOString();

      let textSnippet = '';
      if (type === 'RIDE_ACCEPTED') {
        textSnippet = 'Picking up passenger at Connaught Place Inner Circle';
      } else if (type === 'RIDE_CANCELLED') {
        textSnippet = 'Rider cancelled booking. Fee waived.';
      } else if (type === 'RIDE_COMPLETED') {
        textSnippet = 'Trip ended. Cash to collect ₹140.00';
      }

      await addDoc(collection(db, 'platformRideEvents'), {
        driverId,
        dutyId: activeDuty?.id || null,
        bikeId: targetDriver?.assignedBikeId || 'bike-dl9sbh6153',
        platform,
        packageName: platform === 'UBER' ? 'com.ubercab.driver' : platform === 'OLA' ? 'com.olacabs.partner' : 'com.rapido.rider',
        title: `${platform} Captain`,
        textSnippet,
        eventType: type,
        timestamp: nowIso,
        location: targetDriver?.lastKnownLocation || { latitude: 28.6115, longitude: 77.0817, speed: 26 },
        isSimulated: true,
        distanceAfterEventKm: type === 'RIDE_CANCELLED' ? 3.4 : 0,
        suspectedOfflineCashRide: type === 'RIDE_CANCELLED',
        createdAt: serverTimestamp()
      });

      // Also log driver profile lastPlatformRideEvent for live map
      await updateDoc(doc(db, 'drivers', driverId), {
        lastPlatformRideEvent: {
          platform,
          eventType: type,
          timestamp: nowIso,
          location: targetDriver?.lastKnownLocation || { latitude: 28.6115, longitude: 77.0817 }
        }
      });

      await logAdminAudit('SIMULATE_RIDE_TELEMETRY', 'admin-console', {
        driverId,
        eventType: type,
        platform
      });
    } catch (e) {
      console.error('Simulation error:', e);
      alert('Simulation error: ' + (e.message || e));
    } finally {
      setSimulating(false);
    }
  };

  const getPlatformBadge = (platform) => {
    const p = (platform || '').toUpperCase();
    if (p === 'OLA') {
      return <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#FCD34D', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 800 }}>🚖 OLA</span>;
    }
    if (p === 'UBER') {
      return <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#93C5FD', border: '1px solid rgba(59, 130, 246, 0.3)', fontWeight: 800 }}>⚡ UBER</span>;
    }
    if (p === 'RAPIDO') {
      return <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#FCA5A5', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 800 }}>🛵 RAPIDO</span>;
    }
    return <span className="badge badge-neutral">GIG</span>;
  };

  const getEventBadge = (eventType) => {
    switch (eventType) {
      case 'RIDE_ACCEPTED':
        return <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>🟢 Ride Accepted</span>;
      case 'RIDE_CANCELLED':
        return <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>🔴 Ride Cancelled</span>;
      case 'RIDE_COMPLETED':
        return <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34D399', border: '1px solid #10B981', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>🏁 Ride Completed</span>;
      case 'RIDE_REQUEST':
        return <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>📲 Ride Request</span>;
      default:
        return <span className="badge badge-neutral">📡 Telemetry Ping</span>;
    }
  };

  return (
    <div>
      {/* Top Banner / Status Line */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(17, 24, 39, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: '0 0 10px #10B981'
            }} />
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#FFF', letterSpacing: '-0.02em', margin: 0 }}>
              Live Rides & Gig Telemetry Radar
            </h2>
          </div>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: 0 }}>
            Real-time feed of passenger ride offers, driver accepts, passenger cancellations, completed trips, and driver in-shift fare logs across Ola, Uber & Rapido.
          </p>
        </div>

        {/* Quick Simulation / Test Pipeline Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.78rem', gap: 5 }}
            onClick={() => handleSimulateTestPing('RIDE_ACCEPTED', 'UBER')}
            disabled={simulating}
            title="Simulate driver accepting an Uber ride"
          >
            <Sparkles size={14} color="#60A5FA" />
            + Test Accept (Uber)
          </button>
          <button 
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.78rem', gap: 5, borderColor: 'rgba(239, 68, 68, 0.4)', color: '#FCA5A5' }}
            onClick={() => handleSimulateTestPing('RIDE_CANCELLED', 'OLA')}
            disabled={simulating}
            title="Simulate customer cancelling an Ola ride (triggers fraud radar)"
          >
            <AlertTriangle size={14} color="#EF4444" />
            + Test Cancel (Ola)
          </button>
          <button 
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.78rem', gap: 5, borderColor: 'rgba(16, 185, 129, 0.4)', color: '#86EFAC' }}
            onClick={() => handleSimulateTestPing('RIDE_COMPLETED', 'RAPIDO')}
            disabled={simulating}
            title="Simulate completing a Rapido ride"
          >
            <CheckCircle2 size={14} color="#10B981" />
            + Test Complete
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        {/* Card 1: Total Events */}
        <div className="card" style={{
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          padding: '1.1rem',
          borderRadius: 12
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Total Telemetry Pings
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#FFF', marginTop: 4 }}>
            {platformEvents.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 3 }}>
            Ola, Uber & Rapido Sniffer
          </div>
        </div>

        {/* Card 2: Accepted Rides */}
        <div className="card" style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          padding: '1.1rem',
          borderRadius: 12
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Accepted Bookings
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#10B981', marginTop: 4 }}>
            {acceptedEvents.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 3 }}>
            Driver actively fulfilled
          </div>
        </div>

        {/* Card 3: Cancelled Bookings */}
        <div className="card" style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          padding: '1.1rem',
          borderRadius: 12
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Cancelled Bookings
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#EF4444', marginTop: 4 }}>
            {cancelledEvents.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 3 }}>
            Customer or Driver drop
          </div>
        </div>

        {/* Card 4: In-Shift Quick Logged Rides */}
        <div className="card" style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          padding: '1.1rem',
          borderRadius: 12
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            In-Shift Driver Logs
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#F59E0B', marginTop: 4 }}>
            {shiftRides.length} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#CBD5E1' }}>(₹{totalShiftFare})</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 3 }}>
            Cash: ₹{totalShiftCash} • UPI: ₹{totalShiftUpi}
          </div>
        </div>

        {/* Card 5: Fraud Violations */}
        <div className="card" style={{
          background: violationEvents.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
          border: violationEvents.length > 0 ? '1px solid #EF4444' : '1px solid var(--border-subtle)',
          padding: '1.1rem',
          borderRadius: 12
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: violationEvents.length > 0 ? '#F87171' : '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Offline Cash Radar
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 900, color: violationEvents.length > 0 ? '#EF4444' : '#10B981', marginTop: 4 }}>
            {violationEvents.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 3 }}>
            {violationEvents.length > 0 ? '⚠️ >2km travel after cancel' : '🛡️ Clean audit'}
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="panel">
        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0.75rem 1.25rem',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'All Telemetry & Logs', count: platformEvents.length + shiftRides.length, color: '#3B82F6' },
              { id: 'ACCEPTED', label: 'Accepted Rides', count: acceptedEvents.length, color: '#10B981' },
              { id: 'CANCELLED', label: 'Cancelled Bookings', count: cancelledEvents.length, color: '#EF4444' },
              { id: 'COMPLETED', label: 'Completed Trips', count: completedEvents.length, color: '#059669' },
              { id: 'SHIFT_LOGS', label: 'In-Shift Fare Logs', count: shiftRides.length, color: '#F59E0B' },
              { id: 'VIOLATIONS', label: 'Violations Radar', count: violationEvents.length, color: '#DC2626' }
            ].map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    border: 'none',
                    borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
                    color: isActive ? '#FFF' : '#94A3B8',
                    padding: '0.5rem 0.85rem',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{tab.label}</span>
                  <span style={{
                    fontSize: '0.7rem',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontWeight: 700,
                    background: isActive ? tab.color : 'rgba(255, 255, 255, 0.1)',
                    color: isActive ? '#FFF' : '#CBD5E1'
                  }}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search driver, bike, fare..."
                className="form-input"
                style={{ paddingLeft: '2.1rem', width: 200, fontSize: '0.82rem', height: 34 }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search size={14} style={{ position: 'absolute', left: 9, top: 10, color: '#64748B' }} />
            </div>

            {/* Platform Filter */}
            <select
              className="form-select"
              style={{ width: 130, fontSize: '0.82rem', height: 34 }}
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
            >
              <option value="ALL">All Platforms</option>
              <option value="OLA">Ola</option>
              <option value="UBER">Uber</option>
              <option value="RAPIDO">Rapido</option>
            </select>

            {/* Date Filter */}
            <select
              className="form-select"
              style={{ width: 120, fontSize: '0.82rem', height: 34 }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today Only</option>
            </select>
          </div>
        </div>

        {/* Educational Anti-Cheat Banner when viewing Violations */}
        {activeTab === 'VIOLATIONS' && (
          <div style={{
            margin: '1rem 1.25rem 0.5rem 1.25rem',
            padding: '0.85rem 1rem',
            background: 'rgba(239, 68, 68, 0.08)',
            borderRadius: 10,
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#EF4444', fontSize: '0.86rem', fontWeight: 700 }}>
              <ShieldAlert size={16} /> OFFLINE CASH RIDE DETECTION RADAR (Induced Cancellation Defense)
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#CBD5E1', lineHeight: 1.5 }}>
              When a booking is cancelled on Ola/Uber/Rapido, but the vehicle immediately continues traveling <b>&gt;2 km</b>, the system automatically detects an <b>Offline Direct Cash Ride</b>. Stolen fare is estimated at ₹14/km and clawed back during daily settlement.
            </p>
          </div>
        )}

        {/* Table View */}
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Driver & Bike</th>
                <th>Platform</th>
                <th>Type / Source</th>
                <th>Details / Fare</th>
                <th>Post-Event GPS Trajectory</th>
                <th>Radar Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map(item => {
                const driver = driversMap[item.driverId];
                const bike = bikesMap[item.bikeId];
                const isShiftLog = item._source === 'SHIFT_LOG';
                const isSuspectedFraud = item.suspectedOfflineCashRide || (item.eventType === 'RIDE_CANCELLED' && (item.distanceAfterEventKm || 0) > 2);
                const estStolenFare = Math.round((item.distanceAfterEventKm || 0) * 14);

                return (
                  <tr 
                    key={item.id} 
                    style={isSuspectedFraud ? { background: 'rgba(239, 68, 68, 0.06)' } : {}}
                  >
                    {/* Timestamp */}
                    <td>
                      <div style={{ fontWeight: 600, color: '#FFF', fontSize: '0.85rem' }}>
                        {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                        {item.timestamp ? item.timestamp.split('T')[0] : ''}
                      </div>
                    </td>

                    {/* Driver & Bike */}
                    <td>
                      <div 
                        style={{ fontWeight: 700, color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                        onClick={() => driver && onSelectDriver && onSelectDriver(driver)}
                        title="Click to view driver 360 profile"
                      >
                        <span>{driver?.fullName || item.driverName || 'Shivkumar (Driver)'}</span>
                        {driver && <ArrowUpRight size={13} color="#60A5FA" />}
                      </div>
                      <div style={{ fontSize: '0.73rem', color: '#94A3B8', marginTop: 2 }}>
                        📞 {driver?.mobileNumber || 'N/A'} • <span style={{ color: '#F59E0B' }}>🏍️ {bike?.registrationNumber || driver?.assignedBikeRegistration || 'DL9SBH6153'}</span>
                      </div>
                    </td>

                    {/* Platform */}
                    <td>
                      {getPlatformBadge(item.platform)}
                    </td>

                    {/* Type / Source */}
                    <td>
                      {isShiftLog ? (
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#FCD34D', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 700 }}>
                          ⚡ In-Shift Quick Log
                        </span>
                      ) : (
                        getEventBadge(item.eventType)
                      )}
                    </td>

                    {/* Details / Fare */}
                    <td>
                      {isShiftLog ? (
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#10B981' }}>
                            ₹{item.fare || 0}
                          </div>
                          <span className="badge badge-neutral" style={{ fontSize: '0.68rem', marginTop: 2 }}>
                            {item.paymentMethod === 'CASH' ? '💵 Cash Received' : '📲 UPI Digital'}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 600, color: '#E2E8F0', fontSize: '0.82rem', maxWidth: 240 }} title={item.textSnippet}>
                            {item.title ? `${item.title}: ` : ''}{item.textSnippet || 'Notification Captured'}
                          </div>
                          {item.isSimulated && (
                            <span style={{ fontSize: '0.68rem', color: '#818CF8', fontWeight: 600 }}>
                              🧪 Test Telemetry
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* GPS Trajectory */}
                    <td>
                      {isShiftLog ? (
                        item.location ? (
                          <a 
                            href={`https://maps.google.com/?q=${item.location.latitude},${item.location.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#60A5FA', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}
                          >
                            <MapPin size={12} /> View Drop GPS
                          </a>
                        ) : (
                          <span style={{ color: '#64748B', fontSize: '0.75rem' }}>No GPS tag</span>
                        )
                      ) : (
                        <div>
                          <div style={{ fontWeight: 700, color: item.distanceAfterEventKm > 2 ? '#EF4444' : '#FFF', fontSize: '0.85rem' }}>
                            {item.distanceAfterEventKm ? `${item.distanceAfterEventKm.toFixed(1)} km` : '0 km'}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                            Movement after ping
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Radar Status */}
                    <td>
                      {isSuspectedFraud ? (
                        <div>
                          <span className="badge badge-danger" style={{ fontWeight: 800 }}>
                            🚨 Suspected Cash Ride
                          </span>
                          <div style={{ fontSize: '0.72rem', color: '#F87171', marginTop: 2 }}>
                            Clawback: <b>₹{estStolenFare}</b>
                          </div>
                        </div>
                      ) : isShiftLog ? (
                        <span className="badge badge-success" style={{ fontWeight: 700 }}>
                          ✅ Driver Logged
                        </span>
                      ) : (
                        <span className="badge badge-neutral" style={{ color: '#94A3B8' }}>
                          Verified Stream
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        onClick={() => setInspectModal(item)}
                        title="View raw telemetry details"
                      >
                        <Eye size={13} /> Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredList.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📡</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#FFF' }}>
                      No Ride Events Found
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#94A3B8', marginTop: 4, maxWidth: 450, margin: '6px auto' }}>
                      {searchQuery 
                        ? `No rides matching "${searchQuery}". Try clearing search.`
                        : 'Real-time telemetry stream is awaiting live driver phone activity or test simulation.'}
                    </div>
                    <button 
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 12 }}
                      onClick={() => handleSimulateTestPing('RIDE_ACCEPTED', 'UBER')}
                    >
                      <Sparkles size={14} /> Send Test Telemetry Ping
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Modal */}
      {inspectModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#111827',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 14,
            padding: 24,
            maxWidth: 500,
            width: '100%',
            color: '#FFF'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                {inspectModal._source === 'SHIFT_LOG' ? '💵 In-Shift Ride Record' : '📡 Telemetry Event Details'}
              </h3>
              <button 
                onClick={() => setInspectModal(null)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 8, fontSize: '0.85rem', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94A3B8' }}>Platform:</span>
                <b>{inspectModal.platform}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94A3B8' }}>Driver ID:</span>
                <span style={{ fontFamily: 'monospace' }}>{inspectModal.driverId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94A3B8' }}>Event Type:</span>
                <b>{inspectModal.eventType || 'QUICK_LOG'}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94A3B8' }}>Timestamp:</span>
                <span>{inspectModal.timestamp}</span>
              </div>
              {inspectModal.fare !== undefined && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#94A3B8' }}>Fare:</span>
                  <b style={{ color: '#10B981' }}>₹{inspectModal.fare} ({inspectModal.paymentMethod})</b>
                </div>
              )}
            </div>

            {inspectModal.textSnippet && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginBottom: 4 }}>Notification Body Snippet:</div>
                <div style={{ background: '#1E293B', padding: 10, borderRadius: 6, fontSize: '0.82rem', color: '#CBD5E1' }}>
                  {inspectModal.textSnippet}
                </div>
              </div>
            )}

            <button 
              className="btn btn-primary btn-block"
              onClick={() => setInspectModal(null)}
              style={{ width: '100%' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
