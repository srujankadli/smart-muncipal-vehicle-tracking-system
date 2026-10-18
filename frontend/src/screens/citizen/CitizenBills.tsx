import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import type { Bill } from '../../types/api.types';
import { formatPaise, formatDate } from '../../utils/formatters';
import { Modal } from '../../components/Modal';

export const CitizenBills: React.FC = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Payment Modal State
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState<boolean>(false);
  const [paymentStep, setPaymentStep] = useState<'REVIEW' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>('REVIEW');
  const [paymentResult, setPaymentResult] = useState<{ receiptNumber?: string; orderId?: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchBills = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.listCitizenBills();
      setBills(res.data.bills);
    } catch (err: any) {
      setError(err.message || 'Failed to load assessment bills.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  const openPayModal = (bill: Bill) => {
    setSelectedBill(bill);
    setPaymentStep('REVIEW');
    setPaymentResult(null);
    setModalError(null);
    setIsPayModalOpen(true);
  };

  const handleSimulatePayment = async () => {
    if (!selectedBill) return;

    setPaymentStep('PROCESSING');
    setModalError(null);

    try {
      const amountDue = parseInt(selectedBill.amount_due_minor_units, 10);
      const amountPaid = parseInt(selectedBill.amount_paid_minor_units || '0', 10);
      const netPayable = Math.max(0, amountDue - amountPaid);

      // 1. Create order through backend API
      const orderRes = await apiClient.createPaymentOrder({
        billId: selectedBill.id,
        propertyId: selectedBill.property_id,
        paymentMethod: 'ONLINE_GATEWAY',
        amountMinorUnits: netPayable,
        idempotencyKey: `idem_ui_${selectedBill.id}_${Date.now()}`,
      });

      const orderId = orderRes.data.order.gatewayOrderId;
      const paymentTx = orderRes.data.payment;
      const receiptNumber = paymentTx.receipt_number || `REC-SIM-${Date.now().toString().slice(-6)}`;
      setPaymentResult({
        receiptNumber,
        orderId,
      });

      setPaymentStep('COMPLETED');
      fetchBills();
    } catch (err: any) {
      setModalError(err.message || 'Payment simulation failed.');
      setPaymentStep('FAILED');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>💳 Solid Waste Assessment Bills</h2>
          <p style={{ fontSize: '0.9rem' }}>
            Municipal user charge invoices, due dates, and sandbox digital checkout
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={fetchBills}>
          🔄 Refresh Invoices
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
          <div>Loading municipal bills...</div>
        </div>
      )}

      {!isLoading && bills.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <div className="empty-state-title">No Outstanding Invoices</div>
          <div className="empty-state-desc">
            You do not currently have any sanitation fee bills issued for your properties. Future monthly assessments will automatically appear here.
          </div>
        </div>
      )}

      {!isLoading && bills.length > 0 && (
        <div className="table-container">
          <table className="table" aria-label="Sanitation assessment bills table">
            <thead>
              <tr>
                <th>Bill Number</th>
                <th>Billing Period</th>
                <th>Property Premises</th>
                <th>Amount Due</th>
                <th>Amount Paid</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const isPaid = b.status === 'PAID';
                const duePaise = parseInt(b.amount_due_minor_units || '0', 10);
                const paidPaise = parseInt(b.amount_paid_minor_units || '0', 10);
                const balancePaise = Math.max(0, duePaise - paidPaise);

                return (
                  <tr key={b.id}>
                    <td>
                      <strong className="mono">{b.bill_number}</strong>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {formatDate(b.billing_period_start)} – {formatDate(b.billing_period_end)}
                    </td>
                    <td>{b.address_line || 'Registered Property'}</td>
                    <td>
                      <strong>{formatPaise(b.amount_due_minor_units)}</strong>
                    </td>
                    <td style={{ color: 'var(--brand-primary)' }}>{formatPaise(b.amount_paid_minor_units)}</td>
                    <td style={{ fontSize: '0.85rem' }}>{formatDate(b.due_date)}</td>
                    <td>
                      <span
                        className={`badge ${
                          isPaid ? 'badge-paid' : b.status === 'PARTIALLY_PAID' ? 'badge-partially-paid' : 'badge-unpaid'
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td>
                      {isPaid ? (
                        <span style={{ fontSize: '0.85rem', color: 'var(--brand-primary)', fontWeight: 600 }}>
                          ✓ Settled
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => openPayModal(b)}
                        >
                          Pay {formatPaise(balancePaise)}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sandbox Payment Simulator Modal */}
      <Modal isOpen={isPayModalOpen} onClose={() => setIsPayModalOpen(false)} title="💳 Municipal Fee Checkout (Sandbox)">
        {selectedBill && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="alert alert-warning" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
              <span>⚠️</span>
              <div>
                <strong>SIMULATOR ENVIRONMENT:</strong> No real money will be transferred or deducted. Physical doorstep cash collection is deactivated for this pilot.
              </div>
            </div>

            {modalError && (
              <div className="alert alert-danger" role="alert">
                <span>⚠️</span>
                <div>{modalError}</div>
              </div>
            )}

            {paymentStep === 'REVIEW' && (
              <>
                <div className="card" style={{ padding: '1rem', background: 'var(--bg-surface-elevated)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Invoice Number:</span>
                    <strong className="mono">{selectedBill.bill_number}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Billing Period:</span>
                    <span>{formatDate(selectedBill.billing_period_start)} – {formatDate(selectedBill.billing_period_end)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Assessed Fee:</span>
                    <span>{formatPaise(selectedBill.amount_due_minor_units)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Already Paid:</span>
                    <span style={{ color: 'var(--brand-primary)' }}>{formatPaise(selectedBill.amount_paid_minor_units)}</span>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700 }}>Total Payable:</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-primary)' }}>
                      {formatPaise(
                        Math.max(
                          0,
                          parseInt(selectedBill.amount_due_minor_units, 10) -
                            parseInt(selectedBill.amount_paid_minor_units || '0', 10)
                        )
                      )}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Payment Method: <strong>Online Gateway Simulator (UPI / NetBanking Sandbox)</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsPayModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSimulatePayment}>
                    Simulate Payment (Sandbox) →
                  </button>
                </div>
              </>
            )}

            {paymentStep === 'PROCESSING' && (
              <div className="loading-container" style={{ padding: '2rem 1rem' }}>
                <div className="spinner"></div>
                <h4>Processing Sandbox Gateway Order...</h4>
                <p style={{ fontSize: '0.85rem', textAlign: 'center' }}>
                  Creating idempotent payment transaction and posting double-entry clearing ledger...
                </p>
              </div>
            )}

            {paymentStep === 'COMPLETED' && (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📋</div>
                <h3 style={{ color: 'var(--brand-primary)', marginBottom: '0.5rem' }}>Sandbox Order Created</h3>
                <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                  Idempotent mock payment order registered with status <strong className="badge badge-stale">PENDING SETTLEMENT</strong>.
                </p>

                <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
                  <span>ℹ️</span>
                  <div>
                    <strong>Pilot Security Notice:</strong> Real monetary transfer is deactivated for this pilot. No money was debited from any bank account. The mock order reference has been recorded in the municipal transaction ledger.
                  </div>
                </div>

                <div className="card" style={{ padding: '1rem', textAlign: 'left', marginBottom: '1.5rem', background: 'var(--bg-surface-elevated)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Receipt Reference:</span>
                    <strong className="mono">{paymentResult?.receiptNumber}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Gateway Order ID:</span>
                    <span className="mono">{paymentResult?.orderId}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => setIsPayModalOpen(false)}
                >
                  Done & Close
                </button>
              </div>
            )}

            {paymentStep === 'FAILED' && (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>❌</div>
                <h3 style={{ color: 'var(--status-danger-text)', marginBottom: '0.5rem' }}>Transaction Interrupted</h3>
                <p style={{ fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                  {modalError || 'Unable to complete mock transaction.'}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => setPaymentStep('REVIEW')}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
