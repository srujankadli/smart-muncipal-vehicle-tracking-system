import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import type { Property, Locality } from '../../types/api.types';
import { Modal } from '../../components/Modal';

export const CitizenProperties: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Registration Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [localityId, setLocalityId] = useState<string>('');
  const [propertyType, setPropertyType] = useState<string>('RESIDENTIAL');
  const [addressLine, setAddressLine] = useState<string>('');
  const [customIdentifier, setCustomIdentifier] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchPropertiesAndLocalities = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [propsRes, locsRes] = await Promise.all([
        apiClient.listProperties(),
        apiClient.getLocalities(),
      ]);
      setProperties(propsRes.data);
      setLocalities(locsRes.data);
      if (locsRes.data.length > 0) {
        setLocalityId(locsRes.data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load property service accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPropertiesAndLocalities();
  }, []);

  const handleRegisterProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!localityId || !addressLine.trim()) {
      setModalError('Please choose a locality and provide a complete address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.createProperty({
        localityId,
        propertyType,
        addressLine: addressLine.trim(),
        customIdentifier: customIdentifier.trim() || undefined,
      });

      setSuccessMessage('Property registered successfully! Linked to your citizen account.');
      setIsModalOpen(false);
      setAddressLine('');
      setCustomIdentifier('');
      fetchPropertiesAndLocalities();
    } catch (err: any) {
      setModalError(err.message || 'Property registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>🏠 My Registered Properties</h2>
          <p style={{ fontSize: '0.9rem' }}>
            Service premises linked to your account for solid waste pickup and municipal fee assessment
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setModalError(null);
            setIsModalOpen(true);
          }}
        >
          + Register New Property
        </button>
      </div>

      {successMessage && (
        <div className="alert alert-success" role="status">
          <span>✓</span>
          <div>{successMessage}</div>
        </div>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {isLoading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <div>Loading your properties...</div>
        </div>
      )}

      {!isLoading && properties.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-state-icon">🏠</div>
          <div className="empty-state-title">No Registered Properties Found</div>
          <div className="empty-state-desc">
            You do not currently have any properties linked to your account in this municipality. Register your residence or commercial establishment to view collection schedules and track assigned trucks.
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            Register First Property
          </button>
        </div>
      )}

      {!isLoading && properties.length > 0 && (
        <div className="grid-cols-2">
          {properties.map((p) => (
            <div key={p.id} className="card">
              <div className="card-header">
                <div>
                  <span className="badge badge-partially-paid" style={{ marginBottom: '0.35rem' }}>
                    {p.property_type}
                  </span>
                  <h3 style={{ fontSize: '1.1rem' }}>{p.custom_identifier || 'Service Account'}</h3>
                </div>
                <span className="badge badge-paid">Active</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Address: </span>
                  <strong>{p.address_line}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Locality: </span>
                  {p.locality_name || 'Designated Locality'}
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Ward: </span>
                  {p.ward_number ? `${p.ward_number} (${p.ward_name || ''})` : 'Assigned Ward'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Property UUID: <span className="mono">{p.id}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Property Registration Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Register New Property Service Account">
        {modalError && (
          <div className="alert alert-danger" role="alert">
            <span>⚠️</span>
            <div>{modalError}</div>
          </div>
        )}

        <form onSubmit={handleRegisterProperty}>
          <div className="form-group">
            <label htmlFor="modal-locality" className="form-label">
              Locality / Neighborhood <span style={{ color: 'var(--status-danger-text)' }}>*</span>
            </label>
            <select
              id="modal-locality"
              className="form-control"
              value={localityId}
              onChange={(e) => setLocalityId(e.target.value)}
              required
            >
              {localities.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.locality_name} {loc.ward_number ? `(${loc.ward_number})` : ''}
                </option>
              ))}
            </select>
            <div className="form-hint">Vehicle tracking is granted for vehicles active in your locality.</div>
          </div>

          <div className="form-group">
            <label htmlFor="modal-prop-type" className="form-label">
              Property Classification <span style={{ color: 'var(--status-danger-text)' }}>*</span>
            </label>
            <select
              id="modal-prop-type"
              className="form-control"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              required
            >
              <option value="RESIDENTIAL">Residential Household (Flat / Individual House)</option>
              <option value="COMMERCIAL">Commercial (Shop / Restaurant / Office)</option>
              <option value="INSTITUTIONAL">Institutional (School / Clinic / Public Office)</option>
              <option value="INDUSTRIAL">Industrial (Workshop / Warehouse)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="modal-address" className="form-label">
              Premises Address <span style={{ color: 'var(--status-danger-text)' }}>*</span>
            </label>
            <textarea
              id="modal-address"
              className="form-control"
              rows={3}
              placeholder="e.g. Flat 302, Palm Heights, Main Cross Road"
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="modal-custom-id" className="form-label">
              Custom Property Identifier / PIN (Optional)
            </label>
            <input
              id="modal-custom-id"
              type="text"
              className="form-control"
              placeholder="e.g. VH-PROP-2026-089"
              value={customIdentifier}
              onChange={(e) => setCustomIdentifier(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Registering...' : 'Confirm Registration'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
