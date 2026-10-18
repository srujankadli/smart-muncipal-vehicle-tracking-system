import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import type { CitizenTrackingSnapshot } from '../../types/api.types';
import { formatDateTime, getFreshnessLabel } from '../../utils/formatters';

export const CitizenTracking: React.FC = () => {
  const [vehicles, setVehicles] = useState<CitizenTrackingSnapshot[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<CitizenTrackingSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const fetchTracking = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.getCitizenTracking();
      setVehicles(res.data);
      if (res.data.length > 0) {
        setSelectedVehicle(res.data[0]);
      } else {
        setSelectedVehicle(null);
      }
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve vehicle tracking stream.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
    const interval = setInterval(() => {
      fetchTracking();
    }, 15000); // 15s polling
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>📍 Live Collection Vehicle Tracking</h2>
          <p style={{ fontSize: '0.9rem' }}>
            Authorized tracking for municipal garbage trucks assigned to your registered property localities
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Updated: {lastRefreshedAt.toLocaleTimeString()}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={fetchTracking} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : '🔄 Refresh GPS'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* Synthetic GPS Disclaimer */}
      <div className="alert alert-warning" style={{ fontSize: '0.85rem' }}>
        <span>⚠️</span>
        <div>
          <strong>SIMULATED GPS STREAM:</strong> Coordinates and breadcrumbs shown are synthetic demo telemetries for pilot testing. No live tracking hardware or real drivers are exposed.
        </div>
      </div>

      {isLoading && vehicles.length === 0 && (
        <div className="loading-container">
          <div className="spinner"></div>
          <div>Querying vehicle telemetry stream...</div>
        </div>
      )}

      {!isLoading && vehicles.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-state-icon">🚛</div>
          <div className="empty-state-title">No Vehicles Currently Active in Your Area</div>
          <div className="empty-state-desc">
            There are currently no collection trucks on active shifts within your registered property localities. Trucks will automatically appear here when municipal shifts begin.
          </div>
        </div>
      )}

      {!isLoading && vehicles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '1.5rem' }}>
          {/* Vehicle List Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', color: 'var(--text-secondary)' }}>
              Assigned Vehicles ({vehicles.length})
            </h3>
            {vehicles.map((v) => {
              const isSelected = selectedVehicle?.vehicle_id === v.vehicle_id;
              const isCurrent = v.freshness === 'CURRENT';
              const isStale = v.freshness === 'STALE';

              return (
                <div
                  key={v.vehicle_id}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    padding: '1rem',
                    borderColor: isSelected ? 'var(--brand-primary)' : 'var(--border-default)',
                    background: isSelected ? 'var(--brand-primary-light)' : 'var(--bg-surface)',
                  }}
                  onClick={() => setSelectedVehicle(v)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>🚛</span>
                      <div>
                        <strong>{v.vehicle_label}</strong>
                        <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {v.registration_number}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`badge ${
                        isCurrent ? 'badge-current' : isStale ? 'badge-stale' : 'badge-unavailable'
                      }`}
                    >
                      {isCurrent && <span className="pulse-dot"></span>}
                      {v.freshness}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    <div>Locality: <strong>{v.locality_name}</strong></div>
                    <div>Shift Status: <strong>{v.shift_status}</strong></div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                      {getFreshnessLabel(v.freshness, v.elapsed_seconds)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive SVG Street Map Visualizer */}
          {selectedVehicle && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">
                    🚛 {selectedVehicle.vehicle_label} ({selectedVehicle.registration_number})
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Assigned Locality: {selectedVehicle.locality_name} ({selectedVehicle.ward_number})
                  </div>
                </div>
                <span
                  className={`badge ${
                    selectedVehicle.freshness === 'CURRENT'
                      ? 'badge-current'
                      : selectedVehicle.freshness === 'STALE'
                      ? 'badge-stale'
                      : 'badge-unavailable'
                  }`}
                >
                  {selectedVehicle.freshness === 'CURRENT' && <span className="pulse-dot"></span>}
                  {getFreshnessLabel(selectedVehicle.freshness, selectedVehicle.elapsed_seconds)}
                </span>
              </div>

              {/* Vector SVG Neighborhood Map */}
              <div className="map-canvas-container">
                <svg
                  className="map-svg"
                  viewBox="0 0 600 360"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-label="Interactive neighborhood route map"
                >
                  {/* Grid Lines */}
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width="600" height="360" fill="url(#grid)" />

                  {/* Simulated Road Arteries */}
                  <path d="M 50 180 Q 200 80 350 180 T 550 180" stroke="#334155" strokeWidth="24" strokeLinecap="round" />
                  <path d="M 50 180 Q 200 80 350 180 T 550 180" stroke="#475569" strokeWidth="2" strokeDasharray="8 8" />

                  <path d="M 300 40 L 300 320" stroke="#334155" strokeWidth="20" strokeLinecap="round" />
                  <path d="M 300 40 L 300 320" stroke="#475569" strokeWidth="2" strokeDasharray="8 8" />

                  {/* Neighborhood Landmarks */}
                  <circle cx="120" cy="140" r="16" fill="rgba(2, 132, 199, 0.2)" stroke="#0284c7" strokeWidth="2" />
                  <text x="120" y="145" textAnchor="middle" fill="#38bdf8" fontSize="12" fontWeight="700">🏠</text>
                  <text x="120" y="172" textAnchor="middle" fill="#94a3b8" fontSize="10">Your Locality</text>

                  <circle cx="480" cy="220" r="14" fill="rgba(16, 185, 129, 0.2)" stroke="#10b981" strokeWidth="2" />
                  <text x="480" y="225" textAnchor="middle" fill="#34d399" fontSize="11">♻️</text>
                  <text x="480" y="250" textAnchor="middle" fill="#94a3b8" fontSize="10">Compost Plant</text>

                  {/* Collection Route Waypoints */}
                  <circle cx="210" cy="130" r="6" fill="#10b981" />
                  <text x="210" y="120" textAnchor="middle" fill="#64748b" fontSize="9">Stop 1</text>

                  <circle cx="295" cy="180" r="6" fill="#10b981" />
                  <text x="295" y="170" textAnchor="middle" fill="#64748b" fontSize="9">Stop 2</text>

                  <circle cx="410" cy="195" r="6" fill="#fbbf24" />
                  <text x="410" y="215" textAnchor="middle" fill="#64748b" fontSize="9">Stop 3 (Next)</text>

                  {/* Vehicle Icon on Map */}
                  {selectedVehicle.freshness !== 'UNAVAILABLE' ? (
                    <g transform={`translate(295, 180) rotate(${selectedVehicle.heading_degrees || 85})`}>
                      <circle cx="0" cy="0" r="24" fill="rgba(16, 185, 129, 0.25)" stroke="#10b981" strokeWidth="2" />
                      <rect x="-12" y="-12" width="24" height="24" rx="4" fill="#10b981" />
                      <text x="0" y="5" textAnchor="middle" fill="#ffffff" fontSize="14">🚛</text>
                    </g>
                  ) : (
                    <g transform="translate(295, 180)">
                      <circle cx="0" cy="0" r="22" fill="rgba(100, 116, 139, 0.2)" stroke="#64748b" strokeWidth="2" />
                      <text x="0" y="6" textAnchor="middle" fill="#94a3b8" fontSize="16">⚪</text>
                      <text x="0" y="38" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600">
                        Shift Inactive
                      </text>
                    </g>
                  )}
                </svg>
              </div>

              {/* Telemetry Metrics Panel */}
              <div className="grid-cols-3" style={{ marginTop: '0.5rem' }}>
                <div className="stat-tile" style={{ padding: '0.75rem 1rem' }}>
                  <div className="stat-label">Vehicle Speed</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                    {selectedVehicle.speed_kmh !== null ? `${selectedVehicle.speed_kmh} km/h` : '0 km/h'}
                  </div>
                  <div className="stat-sub">GPS ground velocity</div>
                </div>

                <div className="stat-tile" style={{ padding: '0.75rem 1rem' }}>
                  <div className="stat-label">GPS Coordinates</div>
                  <div className="mono" style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    {selectedVehicle.latitude !== null && selectedVehicle.longitude !== null
                      ? `${selectedVehicle.latitude.toFixed(4)}, ${selectedVehicle.longitude.toFixed(4)}`
                      : 'Fix unavailable'}
                  </div>
                  <div className="stat-sub">WGS84 synthetic datum</div>
                </div>

                <div className="stat-tile" style={{ padding: '0.75rem 1rem' }}>
                  <div className="stat-label">Last Ping Timestamp</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    {formatDateTime(selectedVehicle.last_recorded_at)}
                  </div>
                  <div className="stat-sub">{selectedVehicle.elapsed_seconds}s elapsed</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
