import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { Municipality } from '../types/api.types';

interface DiscoveryScreenProps {
  onGoToLogin: () => void;
}

export const DiscoveryScreen: React.FC<DiscoveryScreenProps> = ({ onGoToLogin }) => {
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMunicipalities = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiClient.getMunicipalities();
        setMunicipalities(res.data);
        if (res.data.length > 0) {
          setSelectedMunicipality(res.data[0]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load municipalities list.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchMunicipalities();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Hero Welcome Section */}
      <section className="card" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(2, 132, 199, 0.12))' }}>
        <div style={{ maxWidth: '750px' }}>
          <div className="badge badge-current" style={{ marginBottom: '0.75rem' }}>
            <span className="pulse-dot"></span> Civic Solid Waste Operations
          </div>
          <h1 style={{ marginBottom: '0.75rem', fontSize: '2.25rem' }}>
            Smart Municipal Solid Waste Management
          </h1>
          <p style={{ fontSize: '1.05rem', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
            Transparent fee billing, live garbage collection vehicle tracking, and multi-tenant civic operations across participating Urban Local Bodies.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={onGoToLogin}>
              🔐 Citizen / Staff Sign In
            </button>
            <a href="#schedule-section" className="btn btn-secondary btn-lg">
              📅 View Collection Schedules
            </a>
          </div>
        </div>
      </section>

      {/* Municipality Directory */}
      <section id="schedule-section">
        <div className="card-header">
          <h2 className="card-title">🏛️ Participating Municipalities & Collection Timetables</h2>
          <span className="badge badge-unavailable">Synthetic Pilot Tenants</span>
        </div>

        {isLoading && (
          <div className="loading-container">
            <div className="spinner"></div>
            <div>Loading registered municipalities...</div>
          </div>
        )}

        {error && (
          <div className="alert alert-danger" role="alert">
            <span>⚠️</span>
            <div>{error}</div>
          </div>
        )}

        {!isLoading && municipalities.length === 0 && !error && (
          <div className="empty-state">
            <div className="empty-state-icon">🏛️</div>
            <div className="empty-state-title">No Municipalities Available</div>
            <div className="empty-state-desc">No active municipal corporations were found in the platform database.</div>
          </div>
        )}

        {!isLoading && municipalities.length > 0 && (
          <div className="grid-cols-3" style={{ marginBottom: '2rem' }}>
            {municipalities.map((m) => (
              <div
                key={m.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  borderColor: selectedMunicipality?.id === m.id ? 'var(--brand-primary)' : 'var(--border-default)',
                  background: selectedMunicipality?.id === m.id ? 'var(--brand-primary-light)' : 'var(--bg-surface)',
                }}
                onClick={() => setSelectedMunicipality(m)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedMunicipality(m);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.15rem' }}>{m.name}</h3>
                  {m.isDemo && <span className="badge badge-stale" style={{ fontSize: '0.65rem' }}>Demo</span>}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Region: {m.stateOrUt || 'State of Fictional Demo'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
                  {m.wards?.length || 2} Wards Active • View Timetable →
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Selected Municipality Timetable */}
        {selectedMunicipality && (
          <div className="card">
            <div className="card-header">
              <div>
                <h3>{selectedMunicipality.name} — Waste Segregation & Pickup Timetable</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Door-to-door solid waste segregation norms pursuant to SWM Rules 2016
                </p>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={onGoToLogin}>
                Sign In to Track My Truck
              </button>
            </div>

            <div className="grid-cols-3">
              <div className="stat-tile" style={{ borderLeft: '4px solid #10b981' }}>
                <div className="stat-label">🟢 Wet Waste (Biodegradable)</div>
                <div style={{ fontWeight: 700, margin: '0.25rem 0' }}>Daily • 06:30 AM – 09:30 AM</div>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  Kitchen food scraps, vegetable peels, fruit rinds, tea leaves, fallen garden leaves. Keep in green bin.
                </p>
              </div>

              <div className="stat-tile" style={{ borderLeft: '4px solid #0284c7' }}>
                <div className="stat-label">🔵 Dry Waste (Recyclable)</div>
                <div style={{ fontWeight: 700, margin: '0.25rem 0' }}>Tue, Thu, Sat • 07:00 AM – 10:00 AM</div>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  Clean paper, cardboard boxes, plastic packaging, milk pouches, tins, metal scraps. Keep in blue bin.
                </p>
              </div>

              <div className="stat-tile" style={{ borderLeft: '4px solid #ef4444' }}>
                <div className="stat-label">🔴 Domestic Hazardous Waste</div>
                <div style={{ fontWeight: 700, margin: '0.25rem 0' }}>Every Sunday • 08:00 AM – 11:00 AM</div>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  Expired medicines, used batteries, fluorescent tube lights, aerosol cans, sanitary napkins in marked bag.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
