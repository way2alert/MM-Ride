import React, { useState, useEffect } from 'react';
import { Clock, Coffee, AlertTriangle, Bike, ShieldCheck, MapPin } from 'lucide-react';
import { subscribeToCollection } from '../firebase/services';
import { formatDateTime, formatDurationMinutes } from '../utils/formatters';

export default function DutySessions() {
  const [sessions, setSessions] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [breaks, setBreaks] = useState([]);

  useEffect(() => {
    const unsubSessions = subscribeToCollection('dutySessions', setSessions);
    const unsubDrivers = subscribeToCollection('drivers', setDrivers);
    const unsubBreaks = subscribeToCollection('breaks', setBreaks);
    return () => {
      unsubSessions();
      unsubDrivers();
      unsubBreaks();
    };
  }, []);

  const driversMap = Object.fromEntries(drivers.map(d => [d.id, d]));

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <Clock size={18} color="#F59E0B" />
            <span>Driver Duty Shifts & Sessions</span>
          </div>
          <div className="badge badge-info">
            Max Policy: 12 Hours / Day
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
                <th>Odometer Range</th>
                <th>Distance Covered</th>
                <th>12h Compliance</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const driver = driversMap[s.driverId];
                const isOver12h = s.totalHours && s.totalHours > 12;

                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#FFF' }}>{driver?.fullName || 'Driver'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{s.driverId}</div>
                    </td>
                    <td>
                      <div><b>{s.bikeId}</b></div>
                      <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{s.hubName || 'Authorized Depot'}</div>
                    </td>
                    <td>
                      <span className={`badge ${
                        s.status === 'ACTIVE' ? 'badge-success' :
                        s.status === 'ON_BREAK' ? 'badge-warning' : 'badge-neutral'
                      }`}>
                        {s.status === 'ON_BREAK' ? '⏸️ ON BREAK' : s.status}
                      </span>
                    </td>
                    <td>{formatDateTime(s.startTime)}</td>
                    <td>{s.endTime ? formatDateTime(s.endTime) : <span style={{ color: '#10B981' }}>Active Now</span>}</td>
                    <td>
                      <div><b>{s.totalHours ? `${s.totalHours} hrs` : 'In progress'}</b></div>
                      {s.totalBreakMinutes > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#F59E0B' }}>
                          Break: {s.totalBreakMinutes}m (Net: {s.netWorkingHours}h)
                        </div>
                      )}
                    </td>
                    <td>
                      {s.pickupOdometer} km → {s.returnOdometer ? `${s.returnOdometer} km` : '...'}
                    </td>
                    <td>
                      <b>{s.totalDistanceKm ? `${s.totalDistanceKm} km` : '—'}</b>
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

              {sessions.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                    No duty sessions recorded in system.
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
