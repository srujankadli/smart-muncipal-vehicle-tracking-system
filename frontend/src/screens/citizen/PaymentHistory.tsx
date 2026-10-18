import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import type { PaymentTransaction } from '../../types/api.types';
import { formatPaise, formatDateTime } from '../../utils/formatters';
import { Modal } from '../../components/Modal';

export const PaymentHistory: React.FC = () => {
  const { activeTenant, user } = useAuth();
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedReceipt, setSelectedReceipt] = useState<PaymentTransaction | null>(null);

  const fetchPayments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.listPaymentHistory();
      setPayments(res.data.payments);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment transaction history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [activeTenant]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>📄 Payment Receipts & Transaction Log</h2>
          <p style={{ fontSize: '0.9rem' }}>
            Official digital settlement receipts for municipal solid waste collection charges
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={fetchPayments}>
          🔄 Refresh Log
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {isLoading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <div>Loading transaction receipts...</div>
        </div>
      )}

      {!isLoading && payments.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-state-icon">🧾</div>
          <div className="empty-state-title">No Transactions Recorded</div>
          <div className="empty-state-desc">
            You have not made any digital payments yet. Settle an outstanding bill in the Bills & Pay tab to generate official payment receipts.
          </div>
        </div>
      )}

      {!isLoading && payments.length > 0 && (
        <div className="table-container">
          <table className="table" aria-label="Payment transaction history table">
            <thead>
              <tr>
                <th>Receipt Number</th>
                <th>Transaction Date</th>
                <th>Payment Method</th>
                <th>Amount Paid</th>
                <th>Gateway Reference</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong className="mono">{p.receipt_number || 'REC-PENDING'}</strong>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{formatDateTime(p.created_at)}</td>
                  <td>
                    <span className="badge badge-partially-paid">{p.payment_method}</span>
                  </td>
                  <td>
                    <strong style={{ color: 'var(--brand-primary)' }}>{formatPaise(p.amount_minor_units)}</strong>
                  </td>
                  <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {p.gateway_payment_id || p.gateway_order_id || '—'}
                  </td>
                  <td>
                    <span className={`badge ${p.status === 'SUCCESSFUL' ? 'badge-paid' : 'badge-stale'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedReceipt(p)}
                    >
                      View Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Official Municipal Receipt Modal */}
      <Modal
        isOpen={Boolean(selectedReceipt)}
        onClose={() => setSelectedReceipt(null)}
        title="🏛️ Municipal Solid Waste Fee Receipt"
      >
        {selectedReceipt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div
              style={{
                border: '2px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '1.5rem',
                background: 'var(--bg-surface-elevated)',
                position: 'relative',
              }}
            >
              {/* Receipt Header */}
              <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🏛️</div>
                <h3 style={{ fontSize: '1.15rem', margin: 0 }}>{activeTenant?.tenantName}</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Department of Solid Waste Management & Sanitation
                </div>
                <div className="badge badge-paid" style={{ marginTop: '0.5rem' }}>
                  ✓ Official Payment Receipt
                </div>
              </div>

              {/* Receipt Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Receipt Number:</span>
                  <strong className="mono">{selectedReceipt.receipt_number || 'REC-PENDING'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Date & Time:</span>
                  <span>{formatDateTime(selectedReceipt.created_at)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Payer Citizen:</span>
                  <span>{user?.fullName} ({user?.mobileNumber})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Payment Channel:</span>
                  <span>{selectedReceipt.payment_method}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Gateway Order ID:</span>
                  <span className="mono" style={{ fontSize: '0.8rem' }}>{selectedReceipt.gateway_order_id || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>Amount Settled:</span>
                  <span style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--brand-primary)' }}>
                    {formatPaise(selectedReceipt.amount_minor_units)}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1.5rem', borderTop: '1px dashed var(--border-default)', paddingTop: '0.75rem' }}>
                This is a digitally generated municipal receipt in simulation mode. No signature required.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.print()}
              >
                🖨️ Print Receipt
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setSelectedReceipt(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
