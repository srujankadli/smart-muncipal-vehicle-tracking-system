import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab, theme, onToggleTheme }) => {
  const { user, isAuthenticated, activeTenant, activeRole, memberships, switchTenant, logout } = useAuth();
  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <button
            type="button"
            className="navbar-brand"
            onClick={() => onSelectTab(isAuthenticated ? (activeRole === 'CITIZEN' ? 'citizen-dashboard' : 'admin-overview') : 'discovery')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div className="navbar-brand-emblem">🚛</div>
            <div>
              <div>Smart Municipal Waste</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
                {activeTenant ? activeTenant.tenantName : 'Municipal Platform'}
              </div>
            </div>
          </button>

          {/* Navigation Links */}
          <nav aria-label="Main Navigation">
            <ul className="navbar-nav">
              {!isAuthenticated && (
                <>
                  <li>
                    <button
                      type="button"
                      className={`nav-link ${currentTab === 'discovery' ? 'active' : ''}`}
                      onClick={() => onSelectTab('discovery')}
                    >
                      🏛️ Municipalities
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={`nav-link ${currentTab === 'login' ? 'active' : ''}`}
                      onClick={() => onSelectTab('login')}
                    >
                      🔐 Sign In
                    </button>
                  </li>
                </>
              )}

              {isAuthenticated && activeRole === 'CITIZEN' && (
                <>
                  <li>
                    <button
                      type="button"
                      className={`nav-link ${currentTab === 'citizen-dashboard' ? 'active' : ''}`}
                      onClick={() => onSelectTab('citizen-dashboard')}
                    >
                      📊 Dashboard
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={`nav-link ${currentTab === 'citizen-properties' ? 'active' : ''}`}
                      onClick={() => onSelectTab('citizen-properties')}
                    >
                      🏠 My Properties
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={`nav-link ${currentTab === 'citizen-bills' ? 'active' : ''}`}
                      onClick={() => onSelectTab('citizen-bills')}
                    >
                      💳 Bills & Pay
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={`nav-link ${currentTab === 'citizen-history' ? 'active' : ''}`}
                      onClick={() => onSelectTab('citizen-history')}
                    >
                      📄 Receipts
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={`nav-link ${currentTab === 'citizen-tracking' ? 'active' : ''}`}
                      onClick={() => onSelectTab('citizen-tracking')}
                    >
                      📍 Live Tracking
                    </button>
                  </li>
                </>
              )}

              {isAuthenticated && activeRole !== 'CITIZEN' && (
                <>
                  <li>
                    <button
                      type="button"
                      className={`nav-link ${currentTab === 'admin-overview' ? 'active' : ''}`}
                      onClick={() => onSelectTab('admin-overview')}
                    >
                      🏛️ Admin Overview
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className={`nav-link ${currentTab === 'admin-properties' ? 'active' : ''}`}
                      onClick={() => onSelectTab('admin-properties')}
                    >
                      🏢 Properties & Rates
                    </button>
                  </li>
                  {activeRole === 'MUNICIPAL_ADMIN' && (
                    <li>
                      <button
                        type="button"
                        className={`nav-link ${currentTab === 'admin-accounting' ? 'active' : ''}`}
                        onClick={() => onSelectTab('admin-accounting')}
                      >
                        📖 General Ledger
                      </button>
                    </li>
                  )}
                  <li>
                    <button
                      type="button"
                      className={`nav-link ${currentTab === 'admin-master' ? 'active' : ''}`}
                      onClick={() => onSelectTab('admin-master')}
                    >
                      🗺️ Wards & Localities
                    </button>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>

        {/* Right Actions: Tenant Selector, User Profile, Theme, Logout */}
        <div className="navbar-actions">
          {isAuthenticated && memberships.length > 1 && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsTenantMenuOpen(!isTenantMenuOpen)}
                aria-expanded={isTenantMenuOpen}
                aria-haspopup="true"
              >
                🏢 Switch Municipality ▾
              </button>
              {isTenantMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '0.5rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    minWidth: '220px',
                    zIndex: 200,
                    padding: '0.5rem',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.25rem 0.5rem' }}>
                    Select Municipal Tenant:
                  </div>
                  {memberships.map((m) => (
                    <button
                      key={m.tenantId}
                      type="button"
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        background: m.tenantId === activeTenant?.tenantId ? 'var(--brand-primary-light)' : 'transparent',
                        color: m.tenantId === activeTenant?.tenantId ? 'var(--brand-primary)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}
                      onClick={() => {
                        switchTenant(m.tenantId);
                        setIsTenantMenuOpen(false);
                      }}
                    >
                      <div>{m.tenantName}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Role: {m.roleName}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isAuthenticated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ textAlign: 'right', display: 'none', minWidth: '100px' }} className="d-sm-block">
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.fullName}</div>
                <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>{activeRole}</div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={logout}
                title="Sign out"
              >
                Sign Out
              </button>
            </div>
          )}

          {/* Theme Toggle Button */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
};
