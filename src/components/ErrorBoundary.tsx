import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#0a0a0a',
        color: '#fff',
        textAlign: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <p style={{ fontSize: 48, marginBottom: 12 }}>💀</p>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something broke</h2>
        <p style={{ color: '#888', fontSize: 14, maxWidth: 360, marginBottom: 20 }}>
          {this.state.error?.message || 'An unexpected error occurred'}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: '#C4FF3C',
            color: '#000',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
