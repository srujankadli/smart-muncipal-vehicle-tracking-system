import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import type { Property, AssessmentRate } from '../../types/api.types';
import { formatPaise, formatDate } from '../../utils/formatters';

export const AdminProperties: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [rates, setRates] = useState<AssessmentRate[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPropertiesAndRates = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [propsRes, ratesRes] = await Promise.all([
        apiClient.listProperties(),
        apiClient.getAssessmentRates(),
      ]);
      setProperties(propsRes.data);
      setRates(ratesRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load property register.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPropertiesAndRates();
  }, []);

  const filteredProperties = properties.filter((p) => {
    const matchesSearch =
      (p.address_line || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.locality_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.custom_identifier || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'ALL' || p.property_type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>🏢 Municipal Property Register & Assessment Tariffs</h2>
          <p style={{ fontSize: '0.9rem' }}>
            Authoritative master data for assessed premises and monthly fee tariffs
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={fetchPropertiesAndRates}>
          🔄 Refresh Register
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* Assessment Fee Tariffs */}
      <section>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          📋 Active Solid Waste Fee Tariffs
        </h3>
        <div className="grid-cols-4">
          {rates.map((r) => (
            <div key={r.id} className="stat-tile" style={{ borderTop: '3px solid var(--brand-primary)' }}>
              <div className="stat-label">{r.property_type}</div>
              <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--brand-primary)' }}>
                {formatPaise(r.monthly_rate_minor_units)}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/mo</span>
              </div>
              <div className="stat-sub">Effective from: {formatDate(r.effective_from)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Property Search & Filter Controls */}
      <section className="card">
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search by address, locality, or PIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div>
            <select
              className="form-control"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ minWidth: '180px' }}
            >
              <option value="ALL">All Classifications</option>
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="INSTITUTIONAL">Institutional</option>
              <option value="INDUSTRIAL">Industrial</option>
            </select>
          </div>
        </div>

        {isLoading && (
          <div className="loading-container">
            <div className="spinner"></div>
            <div>Loading municipal properties...</div>
          </div>
        )}

        {!isLoading && filteredProperties.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🏢</div>
            <div className="empty-state-title">No Matching Properties</div>
            <div className="empty-state-desc">No property records matched your search filters.</div>
          </div>
        )}

        {!isLoading && filteredProperties.length > 0 && (
          <div className="table-container">
            <table className="table" aria-label="Municipal property register table">
              <thead>
                <tr>
                  <th>Custom PIN / ID</th>
                  <th>Classification</th>
                  <th>Premises Address</th>
                  <th>Locality</th>
                  <th>Ward</th>
                  <th>Citizen ID</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProperties.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong className="mono">{p.custom_identifier || p.id.slice(0, 8)}</strong>
                    </td>
                    <td>
                      <span className="badge badge-partially-paid">{p.property_type}</span>
                    </td>
                    <td>{p.address_line}</td>
                    <td>{p.locality_name || 'Designated Locality'}</td>
                    <td>{p.ward_number || 'Ward 01'}</td>
                    <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {p.citizen_user_id ? p.citizen_user_id.slice(0, 8) + '...' : '—'}
                    </td>
                    <td>
                      <span className="badge badge-paid">Active</span>
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
