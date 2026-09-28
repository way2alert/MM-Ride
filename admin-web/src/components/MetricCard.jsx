import React from 'react';

export default function MetricCard({ title, value, subtitle, icon: Icon, highlight = false, badge = null, onClick = null }) {
  return (
    <div 
      className={`metric-card ${highlight ? 'highlight' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="metric-header">
        <span className="metric-title">{title}</span>
        {Icon && (
          <div className="metric-icon-box">
            <Icon size={20} />
          </div>
        )}
      </div>
      <div className="metric-value">{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem' }}>
        <div className="metric-subtitle">{subtitle}</div>
        {badge && <div className="badge badge-warning">{badge}</div>}
      </div>
    </div>
  );
}
