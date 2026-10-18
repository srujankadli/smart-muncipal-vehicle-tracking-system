import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import type { Ward, Locality } from '../../types/api.types';

export const AdminMasterData: React.FC = () => {
  const [wards, setWards] = useState<Ward[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [selectedWardId, setSelectedWardId] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [wardsRes, locsRes] = await Promise.all([
        apiClient.getWards(),
        apiClient.getLocalities(),
      ]);
      setWards(wardsRes.data);
      setLocalities(locsRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load master boundary data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredLocalities =
    selectedWardId === 'ALL'
      ? localities
      : localities.filter((l) => l.ward_id === selectedWardId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>🗺️ Municipal Wards & Service Localities</h2>
          <p style={{ fontSize: '0.9rem' }}>
            Administrative boundaries, collection beats, and GIS centroid coordinates
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={fetchData}>
          🔄 Refresh Boundaries
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* Ward Cards */}
      <section>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          Administrative Wards ({wards.length})
        </h3>
        <div className="grid-cols-3">
          {wards.map((w) => {
            const locCount = localities.filter((l) => l.ward_id === w.id).length;
            const isSelected = selectedWardId === w.id;

            return (
              <div
                key={w.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--brand-primary)' : 'var(--border-default)',
                  background: isSelected ? 'var(--brand-primary-light)' : 'var(--bg-surface)',
                }}
                onClick={() => setSelectedWardId(isSelected ? 'ALL' : w.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge badge-partially-paid">{w.ward_number}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{locCount} Localities</span>
                </div>
                <h3 style={{ fontSize: '1.15rem', marginBottom: '0.25rem' }}>{w.ward_name}</h3>
                <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Center: {w.center_latitude?.toFixed(4)}, {w.center_longitude?.toFixed(4)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Localities Breakdown */}
      <section className="card">
        <div className="card-header">
          <h3 className="card-title">
            Localities & Collection Beats ({filteredLocalities.length})
          </h3>
          {selectedWardId !== 'ALL' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSelectedWardId('ALL')}
            >
              Show All Wards
            </button>
          )}
        </div>

        {isLoading && (
          <div className="loading-container">
            <div className="spinner"></div>
            <div>Loading service boundaries...</div>
          </div>
        )}

        {!isLoading && filteredLocalities.length > 0 && (
          <div className="table-container">
            <table className="table" aria-label="Localities table">
              <thead>
                <tr>
                  <th>Locality Name</th>
                  <th>Assigned Ward</th>
                  <th>Centroid Latitude</th>
                  <th>Centroid Longitude</th>
                  <th>Classification</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocalities.map((loc) => (
                  <tr key={loc.id}>
                    <td>
                      <strong>{loc.locality_name}</strong>
                    </td>
                    <td>
                      <span className="badge badge-partially-paid">
                        {loc.ward_number || 'Ward'} {loc.ward_name ? `— ${loc.ward_name}` : ''}
                      </span>
                    </td>
                    <td className="mono">{loc.center_latitude?.toFixed(5) || '—'}</td>
                    <td className="mono">{loc.center_longitude?.toFixed(5) || '—'}</td>
                    <td>
                      <span className="badge badge-paid">Active Beat</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
