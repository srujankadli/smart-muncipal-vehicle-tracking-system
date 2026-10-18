import React, { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import type { ChartOfAccount } from '../../types/api.types';
import { Modal } from '../../components/Modal';

export const AdminAccounting: React.FC = () => {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Journal Drafting Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [postingDate, setPostingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [businessEventType, setBusinessEventType] = useState<string>('MANUAL_ADJUSTMENT');
  const [description, setDescription] = useState<string>('');
  const [debitAccountId, setDebitAccountId] = useState<string>('');
  const [creditAccountId, setCreditAccountId] = useState<string>('');
  const [amountRupees, setAmountRupees] = useState<string>('500');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchAccounts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.getChartOfAccounts();
      setAccounts(res.data);
      if (res.data.length >= 2) {
        setDebitAccountId(res.data[0].id);
        setCreditAccountId(res.data[1].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Chart of Accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCreateJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const amountNum = parseFloat(amountRupees);
    if (isNaN(amountNum) || amountNum <= 0) {
      setModalError('Please specify a positive journal amount.');
      return;
    }

    if (!debitAccountId || !creditAccountId) {
      setModalError('Please select both debit and credit ledger accounts.');
      return;
    }

    if (debitAccountId === creditAccountId) {
      setModalError('Debit and credit accounts must be distinct accounts.');
      return;
    }

    const minorUnits = Math.round(amountNum * 100);

    setIsSubmitting(true);
    try {
      await apiClient.createJournalDraft({
        postingDate,
        businessEventType,
        businessEventId: `be_manual_${Date.now()}`,
        description: description.trim() || 'Manual municipal fee adjustment',
        lines: [
          {
            lineNumber: 1,
            accountId: debitAccountId,
            entryType: 'DEBIT',
            amountMinorUnits: minorUnits,
            memo: 'Debit adjustment',
          },
          {
            lineNumber: 2,
            accountId: creditAccountId,
            entryType: 'CREDIT',
            amountMinorUnits: minorUnits,
            memo: 'Credit adjustment',
          },
        ],
      });

      setSuccessMessage('Draft journal entry created successfully and validated for balance!');
      setIsModalOpen(false);
      setDescription('');
    } catch (err: any) {
      setModalError(err.message || 'Failed to create draft journal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>📖 Municipal Double-Entry General Ledger</h2>
          <p style={{ fontSize: '0.9rem' }}>
            Chart of Accounts, debit/credit balance validation, and immutable posted journals
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
          + Draft Balanced Journal Entry
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

      {/* Accounting Invariants Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(2, 132, 199, 0.06))' }}>
        <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>
          ⚖️ Double-Entry System Invariants & Immutability Guarantee
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          All journal entries strictly require <strong>Total Debits = Total Credits</strong>. Once posted, records are rendered permanently immutable by database trigger <code className="mono">fn_prevent_posted_journal_mutation</code>. Corrections require compensating reversal entries.
        </p>
      </div>

      {isLoading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <div>Loading Chart of Accounts...</div>
        </div>
      )}

      {/* Chart of Accounts Table */}
      {!isLoading && accounts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Chart of Accounts ({accounts.length})</h3>
            <span className="badge badge-paid">Active Chart</span>
          </div>

          <div className="table-container">
            <table className="table" aria-label="Chart of accounts table">
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th>Classification</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td>
                      <strong className="mono" style={{ color: 'var(--brand-primary)', fontSize: '1rem' }}>
                        {acc.account_code}
                      </strong>
                    </td>
                    <td>
                      <strong>{acc.account_name}</strong>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          acc.account_type === 'ASSET'
                            ? 'badge-paid'
                            : acc.account_type === 'LIABILITY'
                            ? 'badge-stale'
                            : acc.account_type === 'REVENUE'
                            ? 'badge-current'
                            : 'badge-partially-paid'
                        }`}
                      >
                        {acc.account_type}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-paid">Active</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Draft Journal Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Draft Balanced Journal Entry">
        {modalError && (
          <div className="alert alert-danger" role="alert">
            <span>⚠️</span>
            <div>{modalError}</div>
          </div>
        )}

        <form onSubmit={handleCreateJournal}>
          <div className="form-group">
            <label htmlFor="journal-date" className="form-label">
              Posting Date
            </label>
            <input
              id="journal-date"
              type="date"
              className="form-control"
              value={postingDate}
              onChange={(e) => setPostingDate(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="journal-event-type" className="form-label">
              Business Event Type
            </label>
            <select
              id="journal-event-type"
              className="form-control"
              value={businessEventType}
              onChange={(e) => setBusinessEventType(e.target.value)}
            >
              <option value="MANUAL_ADJUSTMENT">Manual Accounting Adjustment</option>
              <option value="PAYMENT_GATEWAY_SETTLEMENT">Payment Gateway Settlement Reclassification</option>
              <option value="BILL_ISSUANCE">Bill Issuance Accrual</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="journal-desc" className="form-label">
              Description / Audit Memo
            </label>
            <input
              id="journal-desc"
              type="text"
              className="form-control"
              placeholder="e.g. Reclassification of clearing account balance"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="grid-cols-2">
            <div className="form-group">
              <label htmlFor="journal-debit-acc" className="form-label">
                Debit Account (Increase Asset / Expense)
              </label>
              <select
                id="journal-debit-acc"
                className="form-control"
                value={debitAccountId}
                onChange={(e) => setDebitAccountId(e.target.value)}
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_code} — {a.account_name} ({a.account_type})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="journal-credit-acc" className="form-label">
                Credit Account (Decrease Asset / Increase Rev)
              </label>
              <select
                id="journal-credit-acc"
                className="form-control"
                value={creditAccountId}
                onChange={(e) => setCreditAccountId(e.target.value)}
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_code} — {a.account_name} ({a.account_type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="journal-amount" className="form-label">
              Transaction Amount (INR)
            </label>
            <input
              id="journal-amount"
              type="number"
              min="1"
              step="0.01"
              className="form-control"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              required
            />
          </div>

          <div className="alert alert-success" style={{ fontSize: '0.85rem' }}>
            <span>✓</span>
            <div>
              <strong>Balanced Entry Enforced:</strong> Debit ₹{amountRupees || '0'} = Credit ₹{amountRupees || '0'}. Net Variance = ₹0.00.
            </div>
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
              {isSubmitting ? 'Creating Draft...' : 'Post Draft Journal'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
