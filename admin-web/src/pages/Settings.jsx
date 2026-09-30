import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, ShieldAlert, MessageSquare, QrCode, Smartphone, ExternalLink, CheckCircle } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { logAdminAudit } from '../firebase/services';
import Modal from '../components/Modal';
import QRCode from 'qrcode';

export default function Settings({ setTab }) {
  const [settings, setSettings] = useState({
    maxDutyHoursPerDay: 12,
    speedAlertThresholdKmh: 60,
    idleAlertThresholdMinutes: 30,
    workerSharePercent: 50,
    ownerSharePercent: 50,
    reserveHoldPercent: 10,
    defaultGeofenceRadiusMeters: 300,
    primaryAdminWhatsapp: '7200723901',
    adminAlertPhone2: '9976294844',
    adminAlertPhone3: '9841307455'
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    if (showQrModal) {
      const payloadObj = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME": "com.google.android.apps.work.clouddpc",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": "gZs0YwH7V3b_8V8VwL3f4jX_0e4k=",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.google.android.apps.work.clouddpc/.receivers.CloudDeviceAdminReceiver",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://play.google.com/managed/download/AndroidDevicePolicy.apk",
        "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
          "com.google.android.apps.work.clouddpc.EXTRA_ENROLLMENT_TOKEN": "MM_RIDE_ENTERPRISE_TOKEN_AMAPI",
          "serverUrl": "https://androidmanagement.googleapis.com",
          "policy": "mmride_dedicated_kiosk_v1",
          "company": "MM Ride Fleet Logistics Pvt Ltd"
        },
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": false,
        "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false
      };
      QRCode.toDataURL(JSON.stringify(payloadObj), { width: 300, margin: 2, color: { dark: '#0A0D14', light: '#FFFFFF' } })
        .then(url => setQrUrl(url))
        .catch(err => console.error(err));
    }
  }, [showQrModal]);

  useEffect(() => {
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'system'));
        if (snap.exists()) {
          const data = snap.data();
          setSettings(prev => ({ 
            ...prev, 
            ...data,
            primaryAdminWhatsapp: data.primaryAdminWhatsapp || '7200723901',
            adminAlertPhone2: (data.adminAlertPhones && data.adminAlertPhones[1]) || data.adminAlertPhone2 || '9976294844',
            adminAlertPhone3: (data.adminAlertPhones && data.adminAlertPhones[2]) || data.adminAlertPhone3 || '9841307455'
          }));
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
      const phones = [settings.primaryAdminWhatsapp, settings.adminAlertPhone2, settings.adminAlertPhone3]
        .map(p => (p || '').trim())
        .filter(Boolean);

      await setDoc(doc(db, 'settings', 'system'), {
        ...settings,
        adminAlertPhones: phones,
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

          {/* Admin Verification & WhatsApp Alert Numbers */}
          <div style={{ 
            background: 'rgba(37, 211, 102, 0.08)',
            border: '1px solid rgba(37, 211, 102, 0.3)',
            borderRadius: 10,
            padding: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={18} color="#25D366" />
                <h4 style={{ color: '#86EFAC', fontSize: '0.95rem', margin: 0, fontWeight: 700 }}>
                  Admin WhatsApp & Instant Alert Phone Numbers
                </h4>
              </div>
              <span className="badge" style={{ backgroundColor: '#25D366', color: '#000', fontWeight: 800 }}>
                Instant KYC Alerts Active
              </span>
            </div>

            <p style={{ color: '#CBD5E1', fontSize: '0.78rem', marginBottom: '1rem', lineHeight: 1.4 }}>
              When new drivers register and submit KYC documents, the driver app provides instant 1-tap WhatsApp notifications to these numbers for rapid 5-minute verification & approval.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ color: '#86EFAC' }}>
                  Primary Admin WhatsApp *
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.primaryAdminWhatsapp || ''}
                  onChange={(e) => setSettings({ ...settings, primaryAdminWhatsapp: e.target.value })}
                  placeholder="7200723901"
                  required
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Main Owner Contact</span>
                  <a
                    href={`https://wa.me/91${(settings.primaryAdminWhatsapp || '').replace(/\D/g, '')}?text=MM%20Ride%20Admin%20Alert%20Test`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.7rem', color: '#25D366', textDecoration: 'none', fontWeight: 600 }}
                  >
                    Test WhatsApp ➔
                  </a>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Backup Admin 2</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.adminAlertPhone2 || ''}
                  onChange={(e) => setSettings({ ...settings, adminAlertPhone2: e.target.value })}
                  placeholder="9976294844"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Operations Hub</span>
                  <a
                    href={`https://wa.me/91${(settings.adminAlertPhone2 || '').replace(/\D/g, '')}?text=MM%20Ride%20Admin%20Alert%20Test`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.7rem', color: '#25D366', textDecoration: 'none', fontWeight: 600 }}
                  >
                    Test WhatsApp ➔
                  </a>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Backup Admin 3</label>
                <input
                  type="text"
                  className="form-input"
                  value={settings.adminAlertPhone3 || ''}
                  onChange={(e) => setSettings({ ...settings, adminAlertPhone3: e.target.value })}
                  placeholder="9841307455"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Fleet Support</span>
                  <a
                    href={`https://wa.me/91${(settings.adminAlertPhone3 || '').replace(/\D/g, '')}?text=MM%20Ride%20Admin%20Alert%20Test`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.7rem', color: '#25D366', textDecoration: 'none', fontWeight: 600 }}
                  >
                    Test WhatsApp ➔
                  </a>
                </div>
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

      {/* Android Enterprise MDM & Device Tamper Lock (Anti-Uninstall / Anti-Clear Data) */}
      <div className="panel" style={{ maxWidth: 800, marginTop: '2rem' }}>
        <div className="panel-header">
          <div className="panel-title">
            <ShieldAlert size={18} color="#EF4444" />
            <span>Android Enterprise MDM – Anti-Tamper & Kiosk Policy (Problem #6)</span>
          </div>
          <span className="badge badge-danger">Device Owner Enforced</span>
        </div>

        <p style={{ color: '#94A3B8', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          Standard user apps cannot block uninstallation or cache clearing in Android. For company-owned fleet phones, 
          provision the device as an <strong>Android Enterprise Device Owner</strong>. This removes the driver's ability 
          to uninstall the app, clear storage/cache, force-stop, or factory reset.
        </p>

        {/* Policy Badges */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ background: '#0F172A', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Uninstall Prevention</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10B981', marginTop: 4 }}>
              ✓ BLOCKED (OS Level)
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2 }}>uninstallAppsDisabled: true</div>
          </div>

          <div style={{ background: '#0F172A', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Clear Data & Cache</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10B981', marginTop: 4 }}>
              ✓ BLOCKED (OS Level)
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2 }}>userControlDisabled: true</div>
          </div>

          <div style={{ background: '#0F172A', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Force Stop & Reset</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10B981', marginTop: 4 }}>
              ✓ BLOCKED (OS Level)
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2 }}>factoryResetDisabled: true</div>
          </div>
        </div>

        {/* Driver Device Experience Simulation */}
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.05)', 
          border: '1px solid rgba(239, 68, 68, 0.2)', 
          borderRadius: 8, 
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <h5 style={{ color: '#FCA5A5', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>
            Driver Phone Screen Behavior (When Driver attempts Tampering)
          </h5>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: '#020617', padding: '0.75rem', borderRadius: 6, border: '1px dashed #334155' }}>
              <div style={{ color: '#F87171', fontSize: '0.75rem', fontWeight: 700, marginBottom: 4 }}>
                1. Driver taps "Uninstall"
              </div>
              <div style={{ color: '#E2E8F0', fontSize: '0.72rem', background: '#1E293B', padding: '6px 8px', borderRadius: 4 }}>
                ⚠️ <strong>"Action not allowed"</strong><br />
                <em>"MM Ride Driver is managed by your organization. You cannot uninstall this app."</em>
              </div>
            </div>

            <div style={{ background: '#020617', padding: '0.75rem', borderRadius: 6, border: '1px dashed #334155' }}>
              <div style={{ color: '#F87171', fontSize: '0.75rem', fontWeight: 700, marginBottom: 4 }}>
                2. Driver taps "Clear Storage / Clear Cache"
              </div>
              <div style={{ color: '#E2E8F0', fontSize: '0.72rem', background: '#1E293B', padding: '6px 8px', borderRadius: 4 }}>
                ⚠️ <strong>"Action not allowed"</strong><br />
                <em>"Storage controls are disabled for MM Ride Driver by your administrator."</em>
              </div>
            </div>
          </div>
        </div>

        {/* Google Android Management API Policy JSON Viewer */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label className="form-label" style={{ marginBottom: 0 }}>
              Google Android Management API (AMAPI) Production Policy JSON
            </label>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ fontSize: '0.75rem', padding: '3px 8px' }}
              onClick={() => {
                const policyJson = JSON.stringify({
                  "applications": [
                    {
                      "packageName": "com.mmride.driver",
                      "installType": "REQUIRED_FORCED",
                      "defaultPermissionPolicy": "GRANT",
                      "userControlSettings": {
                        "userControlDisabled": true
                      }
                    },
                    { "packageName": "com.olacabs.driver", "installType": "FORCE_INSTALLED" },
                    { "packageName": "com.ubercab.driver", "installType": "FORCE_INSTALLED" },
                    { "packageName": "com.rapido.driver", "installType": "FORCE_INSTALLED" },
                    { "packageName": "com.google.android.apps.maps", "installType": "FORCE_INSTALLED" }
                  ],
                  "uninstallAppsDisabled": true,
                  "factoryResetDisabled": true,
                  "safeBootDisabled": true,
                  "developerSettingsDisabled": true,
                  "locationMode": "LOCATION_ENFORCED",
                  "modifyAccountsDisabled": true,
                  "adjustVolumeDisabled": false
                }, null, 2);
                navigator.clipboard.writeText(policyJson);
                alert("AMAPI Policy JSON copied to clipboard!");
              }}
            >
              Copy Policy JSON
            </button>
          </div>
          <pre style={{ 
            background: '#020617', 
            color: '#38BDF8', 
            padding: '1rem', 
            borderRadius: 8, 
            fontSize: '0.72rem', 
            overflowX: 'auto',
            maxHeight: 220,
            border: '1px solid #1E293B'
          }}>
{`{
  "applications": [
    {
      "packageName": "com.mmride.driver",
      "installType": "REQUIRED_FORCED",
      "defaultPermissionPolicy": "GRANT",
      "userControlSettings": {
        "userControlDisabled": true  // <-- BLOCKS CLEAR CACHE & CLEAR DATA & FORCE STOP
      }
    },
    { "packageName": "com.olacabs.driver", "installType": "FORCE_INSTALLED" },
    { "packageName": "com.ubercab.driver", "installType": "FORCE_INSTALLED" },
    { "packageName": "com.rapido.driver", "installType": "FORCE_INSTALLED" },
    { "packageName": "com.google.android.apps.maps", "installType": "FORCE_INSTALLED" }
  ],
  "uninstallAppsDisabled": true,       // <-- BLOCKS UNINSTALL ON ALL APPS
  "factoryResetDisabled": true,       // <-- BLOCKS SYSTEM RESET
  "safeBootDisabled": true,           // <-- BLOCKS SAFE MODE BYPASS
  "developerSettingsDisabled": true,  // <-- BLOCKS USB DEBUGGING & MOCK LOCATION
  "locationMode": "LOCATION_ENFORCED" // <-- BLOCKS TURNING OFF GPS
}`}
          </pre>
        </div>

        {/* 6-Tap QR Provisioning Guide */}
        <div style={{ background: '#0F172A', padding: '1rem', borderRadius: 8, border: '1px solid #334155' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
            📲 6-Tap Device Owner Provisioning (Depot Setup):
          </div>
          <ol style={{ fontSize: '0.78rem', color: '#CBD5E1', margin: 0, paddingLeft: '1.25rem', lineHeight: 1.6 }}>
            <li>Power on brand-new or factory-reset Android device.</li>
            <li>Tap the empty white space on the "Hi there / Welcome" screen <strong>6 times consecutively</strong>.</li>
            <li>Scan the MDM Enrollment QR Code generated from Google AMAPI or Headwind MDM.</li>
            <li>Connect to Wi-Fi. The phone automatically downloads the policy, installs MM Ride, and permanently locks down!</li>
          </ol>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowQrModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
            >
              <QrCode size={16} /> Scan Enrollment QR Code Now
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTab && setTab('devices')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Smartphone size={16} /> Open Full Devices (MDM) Console
            </button>
          </div>
        </div>
      </div>

      {/* 6-Tap Device Owner QR Code Modal */}
      <Modal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        title="Android Enterprise 6-Tap Device Owner QR Code"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (setTab) {
                  setShowQrModal(false);
                  setTab('devices');
                }
              }}
            >
              <Smartphone size={14} /> Go to Devices (MDM)
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowQrModal(false)}
            >
              Done
            </button>
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
          <div style={{
            background: '#FFFFFF',
            padding: '1.25rem',
            borderRadius: 12,
            display: 'inline-block',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
            marginBottom: '1rem'
          }}>
            {qrUrl ? (
              <img src={qrUrl} alt="AMAPI Device Owner QR Code" style={{ width: 260, height: 260, display: 'block' }} />
            ) : (
              <div style={{ width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
                Generating QR Code...
              </div>
            )}
          </div>

          <div style={{ textAlign: 'left', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 8, padding: '0.85rem', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#FCD34D', marginBottom: 4 }}>
              ⚡ How to scan this QR code on Driver Phone:
            </div>
            <ol style={{ fontSize: '0.75rem', color: '#CBD5E1', paddingLeft: '1.2rem', margin: 0, lineHeight: 1.5 }}>
              <li>Factory reset the fleet Android phone.</li>
              <li>When the phone turns ON at the <strong>"Hi there / Welcome"</strong> language screen, tap the empty white background <strong>6 times</strong>.</li>
              <li>A camera scanner will automatically launch on the phone.</li>
              <li>Point the phone camera at this QR code on your computer screen.</li>
              <li>Connect to Wi-Fi. Google Device Policy will auto-download and lock the phone into Device Owner mode!</li>
            </ol>
          </div>

          <div style={{ textAlign: 'left', background: '#0F172A', borderRadius: 8, padding: '0.75rem', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10B981', marginBottom: 4 }}>
              ✓ Locked Policy Restrictions Applied Automatically:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.72rem', color: '#94A3B8' }}>
              <div>• App Uninstall Blocked</div>
              <div>• Clear Storage/Data Blocked</div>
              <div>• Force Stop Blocked</div>
              <div>• GPS Turn-Off Blocked</div>
              <div>• Factory Reset Blocked</div>
              <div>• Developer USB Mode Blocked</div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
