import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import type { Bill, Property, CitizenTrackingSnapshot } from '../../types/api.types';
import { formatPaise } from '../../utils/formatters';

interface CitizenDashboardProps {
  onNavigate: (tab: string) => void;
}

export const CitizenDashboard: React.FC<CitizenDashboardProps> = ({ onNavigate }) => {
  const { user, activeTenant } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [trackingVehicles, setTrackingVehicles] = useState<CitizenTrackingSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [propsRes, billsRes, trackingRes] = await Promise.allSettled([
          apiClient.listProperties(),
          apiClient.listCitizenBills(),
          apiClient.getCitizenTracking(),
        ]);

        if (propsRes.status === 'fulfilled') {
          setProperties(propsRes.value.data);
        }
        if (billsRes.status === 'fulfilled') {
          setBills(billsRes.value.data.bills);
        }
        if (trackingRes.status === 'fulfilled') {
          setTrackingVehicles(trackingRes.value.data);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard data.');
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, [activeTenant]);

  const unpaidBills = bills.filter((b) => b.status === 'UNPAID' || b.status === 'PARTIALLY_PAID');
  const totalDuePaise = unpaidBills.reduce((acc, b) => {
    const due = parseInt(b.amount_due_minor_units || '0', 10);
    const paid = parseInt(b.amount_paid_minor_units || '0', 10);
    return acc + Math.max(0, due - paid);
  }, 0);

  const activeTruckCount = trackingVehicles.filter((v) => v.freshness === 'CURRENT').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Welcome & Municipal Jurisdiction Header */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(2, 132, 199, 0.08))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="badge badge-paid" style={{ marginBottom: '0.5rem' }}>
              Citizen Self-Service Portal
            </div>
            <h2>Welcome back, {user?.fullName}</h2>
            <p style={{ marginTop: '0.25rem' }}>
              Jurisdiction: <strong>{activeTenant?.tenantName}</strong> • Registered Mobile: <span className="mono">{user?.mobileNumber}</span>
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => onNavigate('citizen-bills')}>
            💳 View & Pay Bills
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* KPI Tiles */}
      <div className="grid-cols-4">
        <div className="stat-tile">
          <div className="stat-label">🏠 Linked Properties</div>
          <div className="stat-value">{isLoading ? '—' : properties.length}</div>
          <div className="stat-sub">Registered service premises</div>
        </div>

        <div className="stat-tile">
          <div className="stat-label">💳 Outstanding Fee</div>
          <div className="stat-value" style={{ color: totalDuePaise > 0 ? 'var(--status-danger-text)' : 'var(--brand-primary)' }}>
            {isLoading ? '—' : formatPaise(totalDuePaise)}
          </div>
          <div className="stat-sub">{unpaidBills.length} pending bill(s)</div>
        </div>

        <div className="stat-tile">
          <div className="stat-label">🚛 Active Collection Trucks</div>
          <div className="stat-value" style={{ color: 'var(--brand-primary)' }}>
            {isLoading ? '—' : activeTruckCount}
          </div>
          <div className="stat-sub">Live in your neighborhood</div>
        </div>

        <div className="stat-tile">
          <div className="stat-label">📄 Sanitation Receipts</div>
          <div className="stat-value">{isLoading ? '—' : bills.filter((b) => b.status === 'PAID').length}</div>
          <div className="stat-sub">Settled municipal payments</div>
        </div>
      </div>

      {/* Quick Access Action Hub */}
      <div className="grid-cols-3">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🏠 Properties</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate('citizen-properties')}>
              Manage
            </button>
          </div>
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            {properties.length > 0
              ? `You have ${properties.length} active registered property accounts in this municipality.`
              : 'No properties registered yet. Link your household to receive garbage collection services.'}
          </p>
          <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => onNavigate('citizen-properties')}>
            + Register New Property
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">💳 Sanitation Bills</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate('citizen-bills')}>
              View All
            </button>
          </div>
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            {unpaidBills.length > 0
              ? `You have ${unpaidBills.length} outstanding assessment bill(s) totaling ${formatPaise(totalDuePaise)}.`
              : 'All sanitation user charges are up to date! No outstanding dues.'}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => onNavigate('citizen-bills')}
            disabled={unpaidBills.length === 0}
          >
            {unpaidBills.length > 0 ? 'Pay Now (Sandbox)' : 'Dues Cleared'}
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📍 Vehicle Tracking</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate('citizen-tracking')}>
              Live Map
            </button>
          </div>
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            {trackingVehicles.length > 0
              ? `${trackingVehicles.length} vehicle(s) on shifts across your registered localities.`
              : 'No collection trucks currently operating in your localities.'}
          </p>
          <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={() => onNavigate('citizen-tracking')}>
            View Truck Live Status →
          </button>
        </div>
      </div>
    </div>
  );
};
