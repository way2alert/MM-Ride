import React from 'react';
import { ShieldCheck, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Header({ title, subtitle }) {
  const { userRole } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-title-group">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      <div className="topbar-actions">
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
