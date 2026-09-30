import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0d14',
          color: '#F8FAFC',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: '2rem'
        }}>
          <div style={{
            maxWidth: 580,
            width: '100%',
            background: 'rgba(17, 24, 39, 0.95)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 12,
            padding: '2rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            <h2 style={{ color: '#EF4444', fontSize: '1.25rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚠️ Application Interface Error
            </h2>
            <p style={{ color: '#94A3B8', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1rem' }}>
              An error occurred while loading this view. You can reload the page or reset your view.
            </p>
            {this.state.error && (
              <pre style={{
                background: '#020617',
                border: '1px solid #1E293B',
                color: '#FCA5A5',
                padding: '0.75rem',
                borderRadius: 8,
                fontSize: '0.8rem',
                overflowX: 'auto',
                marginBottom: '1.25rem',
                whiteSpace: 'pre-wrap'
              }}>
                {this.state.error.toString()}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              style={{
                background: '#F59E0B',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                padding: '8px 18px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              🔄 Refresh Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
