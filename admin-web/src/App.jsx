import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Drivers from './pages/Drivers';
import DriverDetail from './pages/DriverDetail';
import Verification from './pages/Verification';
import AddressVerification from './pages/AddressVerification';
import Bikes from './pages/Bikes';
import Devices from './pages/Devices';
import Hubs from './pages/Hubs';
import LiveMonitoring from './pages/LiveMonitoring';
import DutySessions from './pages/DutySessions';
import EarningsSettlement from './pages/EarningsSettlement';
import LeaveRequests from './pages/LeaveRequests';
import Incidents from './pages/Incidents';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';

export default function App() {
  const { currentUser, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedDriver, setSelectedDriver] = useState(null);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0d14',
        color: '#F59E0B',
        fontFamily: 'Inter, sans-serif'
      }}>
        Initializing MM Ride Admin Console...
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  const tabTitles = {
    'dashboard': { title: 'Operational Command Dashboard', subtitle: 'Overview of fleet activity, drivers, and high-priority alerts' },
    'live-map': { title: 'Live Fleet & Duty Telemetry', subtitle: 'Real-time GPS tracking and geofence monitoring' },
    'drivers': { title: 'Driver Management', subtitle: 'Complete lifecycle management across all 12 operational states' },
    'driver-detail': { title: 'Driver 360° Profile', subtitle: 'Documents, shifts, telemetry, settlements, and audit history' },
    'verification': { title: 'Document Verification Queue', subtitle: 'Review and approve submitted KYC documents' },
    'address-verif': { title: 'Address Verification', subtitle: 'Mandatory field inspection and GPS proof records' },
    'bikes': { title: 'Fleet Bike Inventory', subtitle: 'Manage company bikes, assignments, and maintenance logs' },
    'devices': { title: 'Dedicated Device Fleet & MDM Control', subtitle: 'Android Enterprise QR enrollment, dedicated kiosk mode, battery health, and remote anti-theft lockdown' },
    'hubs': { title: 'Authorized Hubs & Depots', subtitle: 'Authorized shift pickup/return depots with geofence radii' },
    'duty-sessions': { title: 'Duty Shifts & Breaks', subtitle: 'Active duty hours, 12h compliance, and distance telemetry' },
    'settlements': { title: 'Earnings & Daily Settlements', subtitle: '50/50 net splits, 10% reserve holds, and verified payouts' },
    'leave': { title: 'Driver Leave Management', subtitle: 'Scheduled leaves and weekly off approvals' },
    'incidents': { title: 'Incidents & Accidents', subtitle: 'Emergency SOS logs, damage reports, and traffic challans' },
    'reports': { title: 'Comprehensive Reports & CSV Export', subtitle: 'Downloadable operational and financial audit ledgers' },
    'audit-logs': { title: 'Immutable System Audit Trail', subtitle: 'Append-only event stream for security and governance' },
    'settings': { title: 'System Policies & Rules', subtitle: 'Configure maximum duty hours, speed thresholds, and splits' }
  };

  const currentMeta = tabTitles[currentTab] || { title: 'MM Ride Admin', subtitle: 'Control Console' };

  return (
    <Layout
      currentTab={currentTab}
      setTab={setCurrentTab}
      title={currentMeta.title}
      subtitle={currentMeta.subtitle}
    >
      {currentTab === 'dashboard' && <Dashboard setTab={setCurrentTab} />}
      {currentTab === 'live-map' && (
        <LiveMonitoring
          onSelectDriver={(driver) => {
            setSelectedDriver(driver);
            setCurrentTab('driver-detail');
          }}
        />
      )}
      {currentTab === 'drivers' && (
        <Drivers
          onSelectDriver={(driver) => {
            setSelectedDriver(driver);
            setCurrentTab('driver-detail');
          }}
        />
      )}
      {currentTab === 'driver-detail' && (
        <DriverDetail
          driver={selectedDriver}
          onBack={() => setCurrentTab('drivers')}
        />
      )}
      {currentTab === 'verification' && <Verification />}
      {currentTab === 'address-verif' && <AddressVerification />}
      {currentTab === 'bikes' && <Bikes />}
      {currentTab === 'devices' && (
        <Devices
          onSelectDriver={(driver) => {
            setSelectedDriver(driver);
            setCurrentTab('driver-detail');
          }}
        />
      )}
      {currentTab === 'hubs' && <Hubs />}
      {currentTab === 'duty-sessions' && <DutySessions />}
      {currentTab === 'settlements' && <EarningsSettlement />}
      {currentTab === 'leave' && <LeaveRequests />}
      {currentTab === 'incidents' && <Incidents />}
      {currentTab === 'reports' && <Reports />}
      {currentTab === 'audit-logs' && <AuditLogs />}
      {currentTab === 'settings' && <Settings setTab={setTab} />}
    </Layout>
  );
}
