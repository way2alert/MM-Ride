import React, { useState, useEffect } from 'react';
import { FileText, Download, Calendar, Filter } from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { exportToCsv } from '../utils/exportCsv';
import { formatDateTime, formatCurrency } from '../utils/formatters';

export default function Reports() {
  const [reportType, setReportType] = useState('settlements');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const reportTypes = [
    { id: 'drivers', label: 'Driver Registry Report', collection: 'drivers' },
    { id: 'bikes', label: 'Fleet Bikes Report', collection: 'bikes' },
    { id: 'dutySessions', label: 'Duty Shifts Report', collection: 'dutySessions' },
    { id: 'settlements', label: 'Settlement Ledger Report', collection: 'settlements' },
    { id: 'earnings', label: 'Earnings Summary Report', collection: 'earnings' },
    { id: 'speedEvents', label: 'Overspeed Events Report', collection: 'speedEvents' },
    { id: 'idleAlerts', label: 'Idle Telemetry Report', collection: 'idleAlerts' },
    { id: 'leaveRequests', label: 'Leave Requests Report', collection: 'leaveRequests' },
    { id: 'incidents', label: 'Incidents & Accidents Report', collection: 'incidents' },
    { id: 'damageReports', label: 'Bike Damage Report', collection: 'damageReports' },
    { id: 'challans', label: 'Traffic Challans Report', collection: 'challans' },
    { id: 'auditLogs', label: 'System Audit Trail Report', collection: 'auditLogs' }
  ];

  const handleFetchReport = async () => {
    setLoading(true);
    try {
      const selected = reportTypes.find(r => r.id === reportType);
      const colName = selected ? selected.collection : 'settlements';
      const snap = await getDocs(collection(db, colName));
      let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Optional date filtering if date field exists
      if (startDate || endDate) {
        rows = rows.filter(r => {
          const dateStr = r.date || r.timestamp || r.createdAt || r.startTime;
          if (!dateStr) return true;
          const d = new Date(dateStr).toISOString().split('T')[0];
          if (startDate && d < startDate) return false;
          if (endDate && d > endDate) return false;
          return true;
        });
      }

      setData(rows);
    } catch (err) {
      alert(`Error loading report: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleFetchReport();
  }, [reportType]);

  const handleExport = () => {
    exportToCsv(`MM_Ride_${reportType}_report`, data);
  };

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">
            <FileText size={18} color="#F59E0B" />
            <span>Operational & Financial Reports</span>
          </div>

          <button className="btn btn-primary" onClick={handleExport} disabled={data.length === 0}>
            <Download size={16} /> Export to CSV ({data.length} records)
          </button>
        </div>

        {/* Filter Controls */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          background: 'rgba(0, 0, 0, 0.2)',
          padding: '1.25rem',
          borderRadius: 8,
          marginBottom: '1.5rem',
          alignItems: 'end'
        }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Report Category</label>
            <select
              className="form-select"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              {reportTypes.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Start Date</label>
            <input
              type="date"
              className="form-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">End Date</label>
            <input
              type="date"
              className="form-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <button className="btn btn-secondary" onClick={handleFetchReport} disabled={loading} style={{ height: 42 }}>
            <Filter size={15} /> {loading ? 'Loading...' : 'Filter Records'}
          </button>
        </div>

        {/* Report Preview Table */}
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                {data.length > 0 && Object.keys(data[0]).slice(0, 7).map(col => (
                  <th key={col}>{col.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 50).map((row, idx) => (
                <tr key={row.id || idx}>
                  {Object.keys(data[0]).slice(0, 7).map(col => (
                    <td key={col}>
                      {typeof row[col] === 'object' && row[col] !== null ? (
                        <code>{JSON.stringify(row[col])}</code>
                      ) : (
                        String(row[col] ?? '—')
                      )}
                    </td>
                  ))}
                </tr>
              ))}

              {data.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748B' }}>
                    No records found for the selected category and dates.
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
