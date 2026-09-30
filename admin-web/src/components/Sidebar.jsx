import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  MapPin, 
  Users, 
  FileCheck2, 
  Home, 
  Bike, 
  Warehouse, 
  Smartphone,
  Clock, 
  CircleDollarSign, 
  CalendarOff, 
  AlertTriangle, 
  FileText, 
  ScrollText, 
  Settings, 
  LogOut 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function Sidebar({ currentTab, setTab }) {
  const { currentUser, userRole, logout } = useAuth();
  const [pendingVerifCount, setPendingVerifCount] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'drivers'), (snap) => {
      let count = 0;
      snap.forEach(d => {
        const data = d.data();
        if (
          data.approvalStatus === 'PENDING' ||
          data.accountStatus === 'DOCUMENT_VERIFICATION_PENDING' ||
          data.accountStatus === 'DOCUMENTS_SUBMITTED' ||
          data.verificationStatus === 'PENDING'
        ) {
          count++;
        }
      });
      setPendingVerifCount(count);
    });
    return () => unsub();
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'live-map', label: 'Live Monitoring', icon: MapPin },
    { id: 'drivers', label: 'Drivers', icon: Users, badge: pendingVerifCount },
    { id: 'verification', label: 'Doc Verification', icon: FileCheck2, badge: pendingVerifCount },
    { id: 'address-verif', label: 'Address Verification', icon: Home },
    { id: 'bikes', label: 'Fleet Bikes', icon: Bike },
    { id: 'devices', label: 'Devices (MDM)', icon: Smartphone },
    { id: 'hubs', label: 'Hubs & Depots', icon: Warehouse },
    { id: 'duty-sessions', label: 'Duty Shifts', icon: Clock },
    { id: 'settlements', label: 'Earnings & Settlement', icon: CircleDollarSign },
    { id: 'leave', label: 'Leave Requests', icon: CalendarOff },
    { id: 'incidents', label: 'Incidents & Damages', icon: AlertTriangle },
    { id: 'reports', label: 'Export Reports', icon: FileText },
    { id: 'audit-logs', label: 'Audit Trail', icon: ScrollText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/logo.png" alt="MM Ride Logo" style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'contain' }} />
        <div className="brand-text">
          <h1>MM RIDE</h1>
          <span>ADMIN PLATFORM</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Core Operations</div>
        {navItems.slice(0, 8).map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  backgroundColor: '#EF4444',
                  color: '#FFF',
                  fontSize: '0.68rem',
                  fontWeight: '800',
                  padding: '2px 7px',
                  borderRadius: 9999,
                  boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)'
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="nav-section-title">Finance & Controls</div>
        {navItems.slice(8).map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-snippet">
          <div className="user-avatar">
            {currentUser?.email?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="user-info">
            <span className="user-name">{currentUser?.email || 'admin@mmride.com'}</span>
            <span className="user-role-badge">{userRole || 'SUPER_ADMIN'}</span>
          </div>
        </div>
        <button 
          className="btn btn-secondary btn-sm" 
          onClick={logout}
          title="Sign Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
