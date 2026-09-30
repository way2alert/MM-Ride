import React, { useState, useEffect } from 'react';
import { ShieldCheck, Bell, Volume2, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { playNotificationChime } from './NotificationBanner';

export default function Header({ title, subtitle, setTab, onMenuToggle }) {
  const { userRole } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'drivers'), (snap) => {
      let count = 0;
      snap.forEach((d) => {
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
      setPendingCount(count);
    });
    return () => unsub();
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left-group">
        <button 
          type="button"
          className="mobile-menu-toggle-btn"
          onClick={onMenuToggle}
          title="Open Menu"
          aria-label="Open Navigation Menu"
        >
          <Menu size={22} />
        </button>
        <div className="topbar-title-group">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="topbar-actions">
        {/* Instant Verification Queue Shortcut Button */}
        {pendingCount > 0 && (
          <button
            onClick={() => setTab && setTab('verification')}
            className="badge badge-warning"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              border: 'none',
              padding: '5px 12px',
              backgroundColor: '#FEF3C7',
              color: '#92400E',
              fontWeight: 700,
              borderRadius: 6
            }}
            title="Click to Review and Approve Pending Drivers"
          >
            <Bell size={14} color="#D97706" />
            <span>{pendingCount} Driver(s) Pending Approval ⚡</span>
          </button>
        )}

        <button
          onClick={() => playNotificationChime()}
          title="Test Alert Chime Sound"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 6,
            padding: '5px 8px',
            color: '#94A3B8',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.75rem'
          }}
        >
          <Volume2 size={14} />
          <span>Test Chime</span>
        </button>

        <div className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <ShieldCheck size={14} />
          <span>RBAC: {userRole || 'SUPER_ADMIN'}</span>
        </div>
        <div className="badge badge-success">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', display: 'inline-block' }}></span>
          <span>Firebase Live</span>
        </div>
      </div>
    </header>
  );
}
