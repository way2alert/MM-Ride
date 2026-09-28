import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, ShieldAlert } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAdminAudit } from '../firebase/services';

export default function Settings() {
  const [settings, setSettings] = useState({
    maxDutyHoursPerDay: 12,
    speedAlertThresholdKmh: 60,
    idleAlertThresholdMinutes: 30,
    workerSharePercent: 50,
    ownerSharePercent: 50,
    reserveHoldPercent: 10,
    defaultGeofenceRadiusMeters: 300
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'system'));
        if (snap.exists()) {
          setSettings(prev => ({ ...prev, ...snap.data() }));
        }
      } catch (err) {
        console.warn('Using default policy settings:', err.message);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'system'), {
        ...settings,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await logAdminAudit({
        action: 'SYSTEM_SETTINGS_UPDATED',
        relevantRecordId: 'system',
        newValue: JSON.stringify(settings),
        notes: 'Updated core operational policies & financial thresholds'
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert(`Error saving settings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="panel" style={{ maxWidth: 800 }}>
        <div className="panel-header">
          <div className="panel-title">
            <SettingsIcon size={18} color="#F59E0B" />
            <span>Operational & Business Policy Configuration</span>
          </div>
          {saved && <span className="badge badge-success">Settings Saved!</span>}
        </div>

        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Maximum Daily Duty Limit (Hours)</label>
              <input
                type="number"
                className="form-input"
                value={settings.maxDutyHoursPerDay}
                onChange={(e) => setSettings({ ...settings, maxDutyHoursPerDay: Number(e.target.value) })}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Fixed limit: 12 hours per policy</span>
            </div>

            <div className="form-group">
              <label className="form-label">Overspeed Warning Alert Threshold (km/h)</label>
              <input
                type="number"
                className="form-input"
                value={settings.speedAlertThresholdKmh}
                onChange={(e) => setSettings({ ...settings, speedAlertThresholdKmh: Number(e.target.value) })}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Triggers speed event & notification</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Continuous Idle Alert Threshold (Minutes)</label>
              <input
                type="number"
                className="form-input"
                value={settings.idleAlertThresholdMinutes}
                onChange={(e) => setSettings({ ...settings, idleAlertThresholdMinutes: Number(e.target.value) })}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Triggers stationary alert to driver and admin</span>
            </div>

            <div className="form-group">
              <label className="form-label">Authorized Hub Geofence Radius (Meters)</label>
              <input
                type="number"
                className="form-input"
                value={settings.defaultGeofenceRadiusMeters}
                onChange={(e) => setSettings({ ...settings, defaultGeofenceRadiusMeters: Number(e.target.value) })}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Default pickup/return tolerance</span>
            </div>
          </div>

          <div style={{ 
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 10,
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <h4 style={{ color: '#FCD34D', fontSize: '0.95rem', marginBottom: '1rem' }}>
              Financial Formula (Phase 1 Agreement)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-label">Worker Share</label>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFF' }}>50%</div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Of Net Ride Income</div>
              </div>
              <div>
                <label className="form-label">Owner Share</label>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFF' }}>50%</div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Covers petrol & maintenance</div>
              </div>
              <div>
                <label className="form-label">Temporary Hold</label>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#F59E0B' }}>10%</div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Held in settlement reserve</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Save size={16} /> {loading ? 'Saving...' : 'Save System Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
