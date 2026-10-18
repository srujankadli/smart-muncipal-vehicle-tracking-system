import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AccountingService, JournalLineInput } from '../src/services/accounting.service';

describe('Accounting Ledger & Posting Invariants', () => {
  const activeAccountMap = new Map<string, { id: string; isActive: boolean }>([
    ['acct-ar', { id: 'acct-ar', isActive: true }],
    ['acct-rev', { id: 'acct-rev', isActive: true }],
    ['acct-cash-inactive', { id: 'acct-cash-inactive', isActive: false }],
  ]);

  it('should accept balanced journal entry with valid active accounts', () => {
    const lines: JournalLineInput[] = [
      {
        lineNumber: 1,
        accountId: 'acct-ar',
        entryType: 'DEBIT',
        amountMinorUnits: 15000, // 150.00 INR
        currency: 'INR',
      },
      {
        lineNumber: 2,
        accountId: 'acct-rev',
        entryType: 'CREDIT',
        amountMinorUnits: 15000, // 150.00 INR
        currency: 'INR',
      },
    ];

    const result = AccountingService.validatePostingInvariants('INR', lines, activeAccountMap);
    assert.equal(result.isValid, true, 'Balanced entry with active accounts must be valid');
    assert.equal(result.errors.length, 0);
    assert.equal(result.totalDebitsMinorUnits, BigInt(15000));
    assert.equal(result.totalCreditsMinorUnits, BigInt(15000));
  });

  it('should reject unbalanced journal entry', () => {
    const lines: JournalLineInput[] = [
      {
        lineNumber: 1,
        accountId: 'acct-ar',
        entryType: 'DEBIT',
        amountMinorUnits: 15000,
        currency: 'INR',
      },
      {
        lineNumber: 2,
        accountId: 'acct-rev',
        entryType: 'CREDIT',
        amountMinorUnits: 10000, // Unbalanced by 5000 paise
        currency: 'INR',
      },
    ];

    const result = AccountingService.validatePostingInvariants('INR', lines, activeAccountMap);
    assert.equal(result.isValid, false, 'Unbalanced entry must be rejected');
    assert.ok(result.errors.some((e) => e.includes('UNBALANCED_JOURNAL')));
  });

  it('should reject journal with fewer than 2 lines', () => {
    const lines: JournalLineInput[] = [
      {
        lineNumber: 1,
        accountId: 'acct-ar',
        entryType: 'DEBIT',
        amountMinorUnits: 15000,
        currency: 'INR',
      },
    ];

    const result = AccountingService.validatePostingInvariants('INR', lines, activeAccountMap);
    assert.equal(result.isValid, false, 'Single line entry must be rejected');
    assert.ok(result.errors.some((e) => e.includes('INSUFFICIENT_LINES')));
  });

  it('should reject entry referencing an inactive account', () => {
    const lines: JournalLineInput[] = [
      {
        lineNumber: 1,
        accountId: 'acct-cash-inactive', // Inactive doorstep cash account
        entryType: 'DEBIT',
        amountMinorUnits: 15000,
        currency: 'INR',
      },
      {
        lineNumber: 2,
        accountId: 'acct-rev',
        entryType: 'CREDIT',
        amountMinorUnits: 15000,
        currency: 'INR',
      },
    ];

    const result = AccountingService.validatePostingInvariants('INR', lines, activeAccountMap);
    assert.equal(result.isValid, false, 'Entry referencing inactive account must be rejected');
    assert.ok(result.errors.some((e) => e.includes('INACTIVE_ACCOUNT')));
  });

  it('should reject currency mismatch between line and header', () => {
    const lines: JournalLineInput[] = [
      {
        lineNumber: 1,
        accountId: 'acct-ar',
        entryType: 'DEBIT',
        amountMinorUnits: 15000,
        currency: 'USD', // Mismatch against header INR
      },
      {
        lineNumber: 2,
        accountId: 'acct-rev',
        entryType: 'CREDIT',
        amountMinorUnits: 15000,
        currency: 'INR',
      },
    ];

    const result = AccountingService.validatePostingInvariants('INR', lines, activeAccountMap);
    assert.equal(result.isValid, false, 'Currency mismatch must be rejected');
    assert.ok(result.errors.some((e) => e.includes('CURRENCY_MISMATCH')));
  });

  it('should reject non-positive amounts or floating point values', () => {
    const lines: JournalLineInput[] = [
      {
        lineNumber: 1,
        accountId: 'acct-ar',
        entryType: 'DEBIT',
        amountMinorUnits: 0, // Zero amount
        currency: 'INR',
      },
      {
        lineNumber: 2,
        accountId: 'acct-rev',
        entryType: 'CREDIT',
        amountMinorUnits: 0,
        currency: 'INR',
      },
    ];

    const result = AccountingService.validatePostingInvariants('INR', lines, activeAccountMap);
    assert.equal(result.isValid, false, 'Zero amount must be rejected');
    assert.ok(result.errors.some((e) => e.includes('NON_POSITIVE_AMOUNT')));
  });

  it('should reject one-sided participation (all debits or all credits)', () => {
    const lines: JournalLineInput[] = [
      {
        lineNumber: 1,
        accountId: 'acct-ar',
        entryType: 'DEBIT',
        amountMinorUnits: 15000,
        currency: 'INR',
      },
      {
        lineNumber: 2,
        accountId: 'acct-rev',
        entryType: 'DEBIT', // Second DEBIT, no credit
        amountMinorUnits: 15000,
        currency: 'INR',
      },
    ];

    const result = AccountingService.validatePostingInvariants('INR', lines, activeAccountMap);
    assert.equal(result.isValid, false, 'Missing credit side must be rejected');
    assert.ok(result.errors.some((e) => e.includes('MISSING_TWO_SIDED_PARTICIPATION')));
  });
});
