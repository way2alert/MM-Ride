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
  LogOut,
  X,
  Radio
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function Sidebar({ currentTab, setTab, mobileOpen, onClose }) {
  const { currentUser, userRole, logout } = useAuth();
  const [pendingVerifCount, setPendingVerifCount] = useState(0);
  const [pendingAddressCount, setPendingAddressCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  useEffect(() => {
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
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

    const unsubAddresses = onSnapshot(collection(db, 'addresses'), (snap) => {
      let addrCount = 0;
      snap.forEach(a => {
        const data = a.data();
        if (!data.isVerified && data.verificationStatus !== 'VERIFIED') {
          addrCount++;
        }
      });
      setPendingAddressCount(addrCount);
    });

    const unsubLeaves = onSnapshot(collection(db, 'leaveRequests'), (snap) => {
      let lCount = 0;
      snap.forEach(l => {
        if (l.data().status === 'PENDING') {
          lCount++;
        }
      });
      setPendingLeaveCount(lCount);
    });

    return () => {
      unsubDrivers();
      unsubAddresses();
      unsubLeaves();
    };
  }, []);

  const navCategories = [
    {
      title: 'Fleet Command',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'live-map', label: 'Live Monitoring', icon: MapPin },
        { id: 'rides-radar', label: 'Rides & Trip Radar', icon: Radio },
        { id: 'duty-sessions', label: 'Duty Shifts & Log', icon: Clock },
      ]
    },
    {
      title: 'Drivers & Onboarding',
      items: [
        { id: 'drivers', label: 'Driver Directory', icon: Users },
        { id: 'verification', label: 'Doc Verification', icon: FileCheck2, badge: pendingVerifCount },
        { id: 'address-verif', label: 'Address Verification', icon: Home, badge: pendingAddressCount },
        { id: 'leave', label: 'Leave Requests', icon: CalendarOff, badge: pendingLeaveCount },
      ]
    },
    {
      title: 'Vehicles & Hardware',
      items: [
        { id: 'bikes', label: 'Fleet Bikes', icon: Bike },
        { id: 'devices', label: 'Devices (MDM)', icon: Smartphone },
        { id: 'hubs', label: 'Hubs & Depots', icon: Warehouse },
        { id: 'incidents', label: 'Incidents & Damages', icon: AlertTriangle },
      ]
    },
    {
      title: 'Finance & Accounts',
      items: [
        { id: 'settlements', label: 'Earnings & Settlement', icon: CircleDollarSign },
        { id: 'reports', label: 'Export Reports', icon: FileText },
      ]
    },
    {
      title: 'Security & System',
      items: [
        { id: 'audit-logs', label: 'Immutable Audit Trail', icon: ScrollText },
        { id: 'settings', label: 'System Policies', icon: Settings },
      ]
    }
  ];

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={onClose} />
      )}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <img src="/logo.png" alt="MM Ride Logo" style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'contain' }} />
          <div className="brand-text">
            <h1>MM RIDE</h1>
            <span>ADMIN PLATFORM</span>
          </div>
          <button 
            className="sidebar-close-btn" 
            onClick={onClose} 
            title="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navCategories.map((group) => (
            <div key={group.title} className="nav-group">
              <div className="nav-section-title">
                <span>{group.title}</span>
              </div>
              <div className="nav-group-items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      className={`nav-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setTab(item.id);
                        if (onClose) onClose();
                      }}
                      title={item.label}
                    >
                      <div className="nav-icon-wrap">
                        <Icon size={16} />
                      </div>
                      <span className="nav-item-label">{item.label}</span>
                      {item.badge > 0 && (
                        <span className="nav-badge">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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
    </>
  );
}
