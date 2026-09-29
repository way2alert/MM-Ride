import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, ShieldAlert, ArrowRight } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('owner@mmride.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to sign in. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at top center, #1e293b 0%, #0a0d14 70%)',
      padding: '1.5rem'
    }}>
      <div style={{
        maxWidth: 420,
        width: '100%',
        background: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: '2.5rem 2rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img
            src="/logo.png"
            alt="MM Ride"
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              objectFit: 'contain',
              boxShadow: '0 0 25px rgba(245, 158, 11, 0.3)',
              marginBottom: '1rem'
            }}
          />
          <h2 style={{ fontSize: '1.5rem', color: '#FFF', fontWeight: 700 }}>MM RIDE ADMIN</h2>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', marginTop: '0.3rem' }}>
            Operations & Fleet Management Portal
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            color: '#F87171',
            fontSize: '0.85rem'
          }}>
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Admin Email</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ paddingLeft: '2.4rem' }}
              />
              <Mail size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#64748B' }} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.75rem' }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: '2.4rem' }}
              />
              <Lock size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#64748B' }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
            {!loading && <ArrowRight size={18} />}
          </button>

          <div style={{ 
            marginTop: '1.5rem', 
            paddingTop: '1.25rem', 
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#64748B'
          }}>
            <div>Connected to Firebase Project: <b>mm-ride-6899f</b></div>
            <div style={{ marginTop: '0.4rem', color: '#94A3B8' }}>
              Test credentials: <code>admin@mmride.com</code> / <code>admin123</code>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
