import React, { useState, useEffect } from 'react';
import { ScrollText, Search, ShieldCheck, Filter } from 'lucide-react';
import { subscribeToCollection } from '../firebase/services';
import { formatDateTime } from '../utils/formatters';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  useEffect(() => {
    return subscribeToCollection('auditLogs', setLogs);
  }, []);

  const filteredLogs = logs.filter(l => {
    const matchesSearch = 
      (l.action || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.actor || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.driverId || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.notes || '').toLowerCase().includes(search.toLowerCase());
    
    if (actionFilter === 'ALL') return matchesSearch;
    return matchesSearch && l.action.includes(actionFilter);
  });

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <ScrollText size={18} color="#F59E0B" />
            <span>Immutable System Audit Trail ({filteredLogs.length} Events)</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search action, actor, ID..."
                className="form-input"
                style={{ paddingLeft: '2.2rem', width: 240 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#64748B' }} />
            </div>

            <select
              className="form-select"
              style={{ width: 180 }}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="ALL">All Actions</option>
              <option value="DUTY">Duty Events</option>
              <option value="SETTLEMENT">Settlement Events</option>
              <option value="BIKE">Bike Events</option>
              <option value="DRIVER">Driver Events</option>
              <option value="SECURITY">Security Alerts</option>
            </select>
          </div>
        </div>

        <div style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: 8,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.82rem',
          color: '#34D399'
        }}>
          <ShieldCheck size={16} />
          <span><b>Security Enforcement Active:</b> Audit logs are append-only. Modification and deletion permissions are blocked at the Firestore security rule level.</span>
        </div>

        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Driver ID</th>
                <th>Actor</th>
                <th>Source</th>
                <th>GPS Telemetry</th>
                <th>Details / Payload</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(l => (
                <tr key={l.id}>
                  <td>{formatDateTime(l.timestamp || l.createdAt)}</td>
                  <td>
                    <span className="badge badge-info">
                      {l.action}
                    </span>
                  </td>
                  <td>{l.driverId ? <code>{l.driverId}</code> : <span style={{ color: '#64748B' }}>System</span>}</td>
                  <td><b>{l.actor || 'SYSTEM'}</b></td>
                  <td><span className="badge badge-neutral">{l.source || 'CLOUD_FUNCTION'}</span></td>
                  <td>
                    {l.gps ? (
                      <code>{l.gps.latitude?.toFixed(4)}, {l.gps.longitude?.toFixed(4)}</code>
                    ) : <span style={{ color: '#64748B' }}>—</span>}
                  </td>
                  <td>
                    <div style={{ maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {l.notes || l.newValue || '—'}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                    No audit records found matching criteria.
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
