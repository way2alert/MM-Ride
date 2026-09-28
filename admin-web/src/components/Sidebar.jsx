import React from 'react';
import { 
  LayoutDashboard, 
  MapPin, 
  Users, 
  FileCheck2, 
  Home, 
  Bike, 
  Warehouse, 
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

export default function Sidebar({ currentTab, setTab }) {
  const { currentUser, userRole, logout } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'live-map', label: 'Live Monitoring', icon: MapPin },
    { id: 'drivers', label: 'Drivers', icon: Users },
    { id: 'verification', label: 'Doc Verification', icon: FileCheck2 },
    { id: 'address-verif', label: 'Address Verification', icon: Home },
    { id: 'bikes', label: 'Fleet Bikes', icon: Bike },
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
        <div className="brand-logo-badge">MM</div>
        <div className="brand-text">
          <h1>MM RIDE</h1>
          <span>ADMIN PLATFORM</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">Core Operations</div>
        {navItems.slice(0, 7).map((item) => {
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

        <div className="nav-section-title">Finance & Controls</div>
        {navItems.slice(7).map((item) => {
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
