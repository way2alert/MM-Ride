import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Coffee, 
  AlertTriangle, 
  Bike, 
  ShieldCheck, 
  MapPin, 
  Search, 
  Activity, 
  CheckCircle2,
  Calendar,
  RotateCcw
} from 'lucide-react';
import { subscribeToCollection } from '../firebase/services';
import { formatDateTime } from '../utils/formatters';

export default function DutySessions() {
  const [sessions, setSessions] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [bikes, setBikes] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [breaks, setBreaks] = useState([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsubSessions = subscribeToCollection('dutySessions', setSessions);
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    const unsubBikes = subscribeToCollection('bikes', setBikes);
    const unsubHubs = subscribeToCollection('hubs', setHubs);
    const unsubBreaks = subscribeToCollection('breaks', setBreaks);
    return () => {
      unsubSessions();
      unsubDrivers();
      unsubBikes();
      unsubHubs();
      unsubBreaks();
    };
  }, []);

  const driversMap = Object.fromEntries(drivers.map(d => [d.id, d]));
  const bikesMap = Object.fromEntries(bikes.map(b => [b.id, b]));
  const hubsMap = Object.fromEntries(hubs.map(h => [h.id, h]));

  // Live KPI metrics
  const activeSessions = sessions.filter(s => s.status === 'ACTIVE');
  const breakSessions = sessions.filter(s => s.status === 'ON_BREAK');
  const completedSessions = sessions.filter(s => s.status === 'COMPLETED');
  
  // Calculate live duration for active sessions
  const getSessionDuration = (session) => {
    if (session.totalHours) return `${session.totalHours} hrs`;
    if (session.startTime) {
      const elapsedMs = Math.max(0, Date.now() - new Date(session.startTime).getTime());
      const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
      const mins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${mins}m (Live)`;
    }
    return 'In progress';
  };

  const isSessionOver12h = (session) => {
    if (session.totalHours && session.totalHours > 12) return true;
    if (session.status === 'ACTIVE' && session.startTime) {
      const elapsedHours = (Date.now() - new Date(session.startTime).getTime()) / (1000 * 60 * 60);
      return elapsedHours > 12;
    }
    return false;
  };

  const violationsCount = sessions.filter(s => isSessionOver12h(s)).length;

  // Filtered sessions
  const filteredSessions = sessions.filter(s => {
    const driver = driversMap[s.driverId];
    const driverName = (driver?.fullName || '').toLowerCase();
    const driverPhone = (driver?.mobileNumber || '');
    const bikeText = (bikesMap[s.bikeId]?.registrationNumber || s.bikeRegistration || s.bikeId || '').toLowerCase();
    const query = search.toLowerCase();

    const matchesSearch = driverName.includes(query) || driverPhone.includes(query) || bikeText.includes(query) || s.id.toLowerCase().includes(query);
    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    return s.status === statusFilter;
  });

  return (
    <div>
      {/* KPI Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1.1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
            Active On Duty
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10B981' }}>{activeSessions.length}</span>
            <Activity size={22} color="#10B981" />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>Currently on shift</div>
        </div>

        <div className="stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1.1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
            Drivers On Break
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: '#F59E0B' }}>{breakSessions.length}</span>
            <Coffee size={22} color="#F59E0B" />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>Paused shift timer</div>
        </div>

        <div className="stat-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1.1rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
            Completed Shifts
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: '#38BDF8' }}>{completedSessions.length}</span>
            <CheckCircle2 size={22} color="#38BDF8" />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>Successfully logged</div>
        </div>

        <div className="stat-card" style={{ 
          background: violationsCount > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-card)', 
          border: violationsCount > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-subtle)', 
          borderRadius: 10, 
          padding: '1.1rem' 
        }}>
          <div style={{ fontSize: '0.75rem', color: violationsCount > 0 ? '#F87171' : '#94A3B8', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
            12H Limit Risk
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: violationsCount > 0 ? '#EF4444' : '#10B981' }}>{violationsCount}</span>
            <ShieldCheck size={22} color={violationsCount > 0 ? '#EF4444' : '#10B981'} />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 4 }}>Max 12h policy compliance</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Clock size={18} color="#F59E0B" />
            <span>Driver Duty Shifts & Sessions ({filteredSessions.length})</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search driver, bike, hub..."
                className="form-input"
                style={{ paddingLeft: '2.2rem', width: 220 }}
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
              <option value="ALL">All Shifts ({sessions.length})</option>
              <option value="ACTIVE">Active Now ({activeSessions.length})</option>
              <option value="ON_BREAK">On Break ({breakSessions.length})</option>
              <option value="COMPLETED">Completed ({completedSessions.length})</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Bike / Hub</th>
                <th>Status</th>
                <th>Shift Started</th>
                <th>Shift Ended</th>
                <th>Total Hours</th>
                <th>Rides & Earnings</th>
                <th>Odometer Range</th>
                <th>Distance Covered</th>
                <th>12h Compliance</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map(s => {
                const driver = driversMap[s.driverId];
                const bike = bikesMap[s.bikeId];
                const hub = hubsMap[s.hubId];
                const isOver12h = isSessionOver12h(s);
                const bikeDisplay = bike?.registrationNumber || s.bikeRegistration || s.bikeId || 'Assigned Bike';
                const hubDisplay = hub?.name || s.hubName || 'Authorized Depot';

                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#FFF' }}>{driver?.fullName || s.driverName || 'Driver'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{s.driverId}</div>
                    </td>
                    <td>
                      <div>
                        <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Bike size={12} /> {bikeDisplay}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 3 }}>
                        <MapPin size={11} style={{ display: 'inline', marginRight: 2 }} /> {hubDisplay}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${
                        s.status === 'ACTIVE' ? 'badge-success' :
                        s.status === 'ON_BREAK' ? 'badge-warning' : 'badge-neutral'
                      }`}>
                        {s.status === 'ACTIVE' ? '⚡ ACTIVE NOW' :
                         s.status === 'ON_BREAK' ? '⏸️ ON BREAK' : 'COMPLETED'}
                      </span>
                    </td>
                    <td>{formatDateTime(s.startTime)}</td>
                    <td>{s.endTime ? formatDateTime(s.endTime) : <span style={{ color: '#10B981', fontWeight: 600 }}>Active Now</span>}</td>
                    <td>
                      <div><b>{getSessionDuration(s)}</b></div>
                      {s.totalBreakMinutes > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#F59E0B' }}>
                          Break: {s.totalBreakMinutes}m (Net: {s.netWorkingHours || '—'}h)
                        </div>
                      )}
                    </td>
                    <td>
                      {s.totalRidesLogged ? (
                        <div>
                          <b style={{ color: '#10B981', fontSize: '0.9rem' }}>{s.totalRidesLogged} rides</b>
                          <div style={{ fontSize: '0.72rem', color: '#CBD5E1' }}>₹{s.grossEarningsLogged || 0} gross</div>
                        </div>
                      ) : (
                        <span style={{ color: '#64748B', fontSize: '0.8rem' }}>0 logged</span>
                      )}
                    </td>
                    <td>
                      {s.pickupOdometer != null ? `${s.pickupOdometer} km` : '—'} → {s.returnOdometer != null ? `${s.returnOdometer} km` : '...'}
                    </td>
                    <td>
                      <b>{s.totalDistanceKm != null ? `${s.totalDistanceKm} km` : s.status === 'ACTIVE' ? 'Tracking Live' : '—'}</b>
                    </td>
                    <td>
                      {isOver12h ? (
                        <span className="badge badge-danger">
                          <AlertTriangle size={12} /> EXCEEDED 12H
                        </span>
                      ) : (
                        <span className="badge badge-success">
                          <ShieldCheck size={12} /> COMPLIANT
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredSessions.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <div style={{ color: '#E2E8F0', fontSize: '1rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                      No duty shifts match the selected filter
                    </div>
                    <div style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      {sessions.length === 0 
                        ? 'No duty sessions recorded in system yet. When drivers tap "Start Duty" in the driver app, their active shifts will appear here automatically in real time.'
                        : 'No shifts match your search term or status filter.'}
                    </div>
                    {(statusFilter !== 'ALL' || search) && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        onClick={() => { setStatusFilter('ALL'); setSearch(''); }}
                      >
                        <RotateCcw size={14} /> Show All Shifts ({sessions.length})
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
