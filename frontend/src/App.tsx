import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DemoBanner } from './components/DemoBanner';
import { Navbar } from './components/Navbar';
import { DiscoveryScreen } from './screens/DiscoveryScreen';
import { LoginScreen } from './screens/LoginScreen';
import { CitizenDashboard } from './screens/citizen/CitizenDashboard';
import { CitizenProperties } from './screens/citizen/CitizenProperties';
import { CitizenBills } from './screens/citizen/CitizenBills';
import { PaymentHistory } from './screens/citizen/PaymentHistory';
import { CitizenTracking } from './screens/citizen/CitizenTracking';
import { AdminOverview } from './screens/admin/AdminOverview';
import { AdminProperties } from './screens/admin/AdminProperties';
import { AdminAccounting } from './screens/admin/AdminAccounting';
import { AdminMasterData } from './screens/admin/AdminMasterData';

const MainApp: React.FC = () => {
  const { isAuthenticated, activeRole } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('discovery');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Load theme preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('waste_platform_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('waste_platform_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  // Switch default tab on authentication change
  useEffect(() => {
    if (isAuthenticated) {
      if (activeRole === 'CITIZEN') {
        setCurrentTab('citizen-dashboard');
      } else {
        setCurrentTab('admin-overview');
      }
    } else {
      setCurrentTab('discovery');
    }
  }, [isAuthenticated, activeRole]);

  return (
    <div className="app-layout">
      <DemoBanner />
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="main-content">
        {/* Unauthenticated Screens */}
        {!isAuthenticated && currentTab === 'discovery' && (
          <DiscoveryScreen onGoToLogin={() => setCurrentTab('login')} />
        )}
        {!isAuthenticated && currentTab === 'login' && <LoginScreen />}

        {/* Citizen Portal Screens */}
        {isAuthenticated && activeRole === 'CITIZEN' && (
          <>
            {currentTab === 'citizen-dashboard' && (
              <CitizenDashboard onNavigate={(tab) => setCurrentTab(tab)} />
            )}
            {currentTab === 'citizen-properties' && <CitizenProperties />}
            {currentTab === 'citizen-bills' && <CitizenBills />}
            {currentTab === 'citizen-history' && <PaymentHistory />}
            {currentTab === 'citizen-tracking' && <CitizenTracking />}
          </>
        )}

        {/* Municipal Staff / Admin Dashboard Screens */}
        {isAuthenticated && activeRole !== 'CITIZEN' && (
          <>
            {currentTab === 'admin-overview' && (
              <AdminOverview onNavigate={(tab) => setCurrentTab(tab)} />
            )}
            {currentTab === 'admin-properties' && <AdminProperties />}
            {currentTab === 'admin-accounting' && activeRole === 'MUNICIPAL_ADMIN' && <AdminAccounting />}
            {currentTab === 'admin-master' && <AdminMasterData />}
          </>
        )}
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '1.5rem',
          textAlign: 'center',
          fontSize: '0.825rem',
          color: 'var(--text-muted)',
          backgroundColor: 'var(--bg-secondary)',
          marginTop: 'auto',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            🏛️ <strong>Smart Municipal Solid Waste Management Platform</strong> • Pilot Demonstration Environment
          </div>
          <div>
            Solid Waste Management Rules 2016 Compliant • Double-Entry General Ledger Backed
          </div>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};

export default App;
