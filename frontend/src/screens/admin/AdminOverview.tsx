import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import type { Property, Ward, Locality, ChartOfAccount } from '../../types/api.types';

interface AdminOverviewProps {
  onNavigate: (tab: string) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({ onNavigate }) => {
  const { activeTenant, activeRole } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [healthData, setHealthData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAdminData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [propsRes, wardsRes, locsRes, accountsRes, healthRes] = await Promise.allSettled([
          apiClient.listProperties(),
          apiClient.getWards(),
          apiClient.getLocalities(),
          apiClient.getChartOfAccounts(),
          fetch('/health').then((r) => r.json()).catch(() => null),
        ]);

        if (propsRes.status === 'fulfilled') setProperties(propsRes.value.data);
        if (wardsRes.status === 'fulfilled') setWards(wardsRes.value.data);
        if (locsRes.status === 'fulfilled') setLocalities(locsRes.value.data);
        if (accountsRes.status === 'fulfilled') setAccounts(accountsRes.value.data);
        if (healthRes.status === 'fulfilled') setHealthData(healthRes.value);
      } catch (err: any) {
        setError(err.message || 'Failed to load administrative overview.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdminData();
  }, [activeTenant]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header Banner */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(16, 185, 129, 0.08))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="badge badge-partially-paid" style={{ marginBottom: '0.5rem' }}>
              Municipal Administration Console
            </div>
            <h2>{activeTenant?.tenantName}</h2>
            <p style={{ marginTop: '0.25rem' }}>
              Staff Role: <strong>{activeRole}</strong> • Tenant ID: <span className="mono">{activeTenant?.tenantId}</span>
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => onNavigate('admin-accounting')}>
            📖 General Ledger Console
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* KPI Stat Tiles */}
      <div className="grid-cols-4">
        <div className="stat-tile">
          <div className="stat-label">🏢 Total Properties</div>
          <div className="stat-value">{isLoading ? '—' : properties.length}</div>
          <div className="stat-sub">Across all municipal wards</div>
        </div>

        <div className="stat-tile">
          <div className="stat-label">🗺️ Administrative Wards</div>
          <div className="stat-value" style={{ color: 'var(--brand-secondary)' }}>
            {isLoading ? '—' : wards.length}
          </div>
          <div className="stat-sub">{localities.length} total localities</div>
        </div>

        <div className="stat-tile">
          <div className="stat-label">📖 General Ledger Accounts</div>
          <div className="stat-value" style={{ color: 'var(--brand-primary)' }}>
            {isLoading ? '—' : accounts.length}
          </div>
          <div className="stat-sub">Chart of accounts defined</div>
        </div>

        <div className="stat-tile">
          <div className="stat-label">🔒 Doorstep Cash Status</div>
          <div className="stat-value" style={{ fontSize: '1.4rem', color: 'var(--status-danger-text)' }}>
            DEACTIVATED
          </div>
          <div className="stat-sub">Physical cash prohibited</div>
        </div>
      </div>

      {/* Municipal Policy Status Callout */}
      {healthData?.policies && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">⚖️ Municipal Statutory & Integration Policies</h3>
            <span className="badge badge-stale">Unresolved Policy Controls</span>
          </div>

          <div className="grid-cols-2" style={{ gap: '1rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Statutory GST Tax Status:</span>
              <span className="badge badge-stale">Unconfirmed (Provisional 0%)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Financial Accounting Policy:</span>
              <span className="badge badge-stale">Pending Municipal Council Approval</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Property ID Strategy:</span>
              <span className="badge badge-partially-paid">Platform Synthetic UUIDs</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Doorstep Cash Collection:</span>
              <span className="badge badge-unpaid">Strictly Disabled (Policy Enforced)</span>
            </div>
          </div>
        </div>
      )}

      {/* Admin Module Links */}
      <div className="grid-cols-3">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🏢 Properties Roster</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate('admin-properties')}>
              Open
            </button>
          </div>
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            Browse registered property premises, filter by ward, and inspect fee assessment tariffs.
          </p>
          <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => onNavigate('admin-properties')}>
            View Property Register →
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📖 Double-Entry Accounting</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate('admin-accounting')}>
              Open
            </button>
          </div>
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            Review Chart of Accounts, audit clearing accounts (`1030`), and draft balanced journal entries.
          </p>
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => onNavigate('admin-accounting')}>
            Open General Ledger Console →
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🗺️ Master Boundaries</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate('admin-master')}>
              Open
            </button>
          </div>
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            Inspect administrative wards, localities, and geographic coordinates for collection routing.
          </p>
          <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => onNavigate('admin-master')}>
            Manage Wards & Localities →
          </button>
        </div>
      </div>
    </div>
  );
};
