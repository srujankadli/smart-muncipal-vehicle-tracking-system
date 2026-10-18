import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginScreen: React.FC = () => {
  const { login, isLoading, error, clearError } = useAuth();
  const [mobileNumber, setMobileNumber] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    const cleanMobile = mobileNumber.trim();
    if (!cleanMobile) {
      setLocalError('Please enter your registered mobile number.');
      return;
    }

    if (!password) {
      setLocalError('Please enter your account password.');
      return;
    }

    try {
      await login(cleanMobile, password);
    } catch {
      // Error handled in AuthContext
    }
  };

  const fillDemoAccount = (mobile: string) => {
    clearError();
    setLocalError(null);
    setMobileNumber(mobile);
    setPassword('DemoPass@2026!');
  };

  const activeError = localError || error;

  return (
    <div style={{ maxWidth: '480px', margin: '2rem auto', width: '100%' }}>
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div className="navbar-brand-emblem" style={{ margin: '0 auto 1rem auto', width: '48px', height: '48px', fontSize: '1.5rem' }}>
            🚛
          </div>
          <h2>Sign In to Municipal Portal</h2>
          <p style={{ fontSize: '0.875rem', marginTop: '0.35rem' }}>
            Access property records, sanitation bills, and collection vehicle tracking
          </p>
        </div>

        {activeError && (
          <div className="alert alert-danger" role="alert" style={{ marginBottom: '1.25rem' }}>
            <span>⚠️</span>
            <div>{activeError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="mobile-input" className="form-label">
              Mobile Number
            </label>
            <input
              id="mobile-input"
              type="tel"
              className="form-control"
              placeholder="+919876543213"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              autoComplete="tel"
              required
            />
            <div className="form-hint">E.164 format with country code (e.g. +919876543210)</div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="password-input" className="form-label">
                Password
              </label>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--brand-primary)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password text' : 'Show password text'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="password-input"
              type={showPassword ? 'text' : 'password'}
              className="form-control"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={isLoading}
          >
            {isLoading ? 'Verifying Credentials...' : 'Sign In'}
          </button>
        </form>

        {/* Demo Account Presets */}
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ⚡ One-Click Demo Test Accounts:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'space-between' }}
              onClick={() => fillDemoAccount('+919876543213')}
            >
              <span>👤 <strong>Sunita Patel</strong> (Citizen — Verdant Hills)</span>
              <span className="badge badge-paid" style={{ fontSize: '0.65rem' }}>Citizen</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'space-between' }}
              onClick={() => fillDemoAccount('+919876543214')}
            >
              <span>👤 <strong>Ananya Roy</strong> (Citizen — Oceanfront NP)</span>
              <span className="badge badge-paid" style={{ fontSize: '0.65rem' }}>Citizen</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'space-between' }}
              onClick={() => fillDemoAccount('+919876543210')}
            >
              <span>🏛️ <strong>Aarav Sharma</strong> (Municipal Admin)</span>
              <span className="badge badge-partially-paid" style={{ fontSize: '0.65rem' }}>Admin</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'space-between' }}
              onClick={() => fillDemoAccount('+919876543211')}
            >
              <span>🔍 <strong>Vikram Singh</strong> (Field Supervisor)</span>
              <span className="badge badge-stale" style={{ fontSize: '0.65rem' }}>Supervisor</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
