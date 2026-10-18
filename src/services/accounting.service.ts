import { withTenantTransaction } from '../db/pool';
import { config } from '../config';

export interface JournalLineInput {
  lineNumber: number;
  accountId: string;
  entryType: 'DEBIT' | 'CREDIT';
  amountMinorUnits: bigint | string | number; // Integer minor units (paise)
  currency?: string;
  memo?: string;
}

export interface CreateJournalEntryInput {
  postingDate: string; // YYYY-MM-DD
  businessEventType: string;
  businessEventId: string;
  currency?: string;
  description: string;
  lines: JournalLineInput[];
}

export interface JournalValidationResult {
  isValid: boolean;
  errors: string[];
  totalDebitsMinorUnits: bigint;
  totalCreditsMinorUnits: bigint;
}

export class AccountingService {
  /**
   * Validate all 6 double-entry journal posting invariants
   */
  public static validatePostingInvariants(
    headerCurrency: string,
    lines: JournalLineInput[],
    activeAccountMap: Map<string, { id: string; isActive: boolean }>
  ): JournalValidationResult {
    const errors: string[] = [];
    let totalDebits = BigInt(0);
    let totalCredits = BigInt(0);
    let debitCount = 0;
    let creditCount = 0;

    // Invariant 1: Line count must be at least 2
    if (!lines || lines.length < 2) {
      errors.push('INSUFFICIENT_LINES: A journal entry must contain at least two lines.');
    }

    const seenLineNumbers = new Set<number>();

    for (const line of lines) {
      // Invariant 5: Required fields completeness
      if (!line.accountId) {
        errors.push(`MISSING_ACCOUNT: Line ${line.lineNumber} is missing account_id.`);
      }
      if (line.lineNumber === undefined || line.lineNumber === null) {
        errors.push('MISSING_LINE_NUMBER: A line number is required for all journal lines.');
      } else {
        if (seenLineNumbers.has(line.lineNumber)) {
          errors.push(`DUPLICATE_LINE_NUMBER: Line number ${line.lineNumber} appears multiple times.`);
        }
        seenLineNumbers.add(line.lineNumber);
      }

      // Invariant 6: Positive amount in integer minor units
      let amount: bigint;
      try {
        amount = BigInt(line.amountMinorUnits);
        if (amount <= BigInt(0)) {
          errors.push(`NON_POSITIVE_AMOUNT: Line ${line.lineNumber} amount must be strictly greater than zero.`);
        }
      } catch {
        errors.push(`INVALID_AMOUNT: Line ${line.lineNumber} has an invalid integer minor unit amount.`);
        amount = BigInt(0);
      }

      // Invariant 4: Currency consistency
      const lineCurrency = line.currency || 'INR';
      if (lineCurrency !== headerCurrency) {
        errors.push(`CURRENCY_MISMATCH: Line ${line.lineNumber} currency ${lineCurrency} does not match header ${headerCurrency}.`);
      }

      // Invariant 3: Active account existence
      const acct = activeAccountMap.get(line.accountId);
      if (!acct) {
        errors.push(`ACCOUNT_NOT_FOUND: Line ${line.lineNumber} references unknown account ${line.accountId}.`);
      } else if (!acct.isActive) {
        errors.push(`INACTIVE_ACCOUNT: Line ${line.lineNumber} references inactive account ${line.accountId}.`);
      }

      // Summation
      if (line.entryType === 'DEBIT') {
        totalDebits += amount;
        debitCount++;
      } else if (line.entryType === 'CREDIT') {
        totalCredits += amount;
        creditCount++;
      } else {
        errors.push(`INVALID_ENTRY_TYPE: Line ${line.lineNumber} entry_type must be DEBIT or CREDIT.`);
      }
    }

    // Invariant 2: At least one debit and at least one credit
    if (debitCount === 0 || creditCount === 0) {
      errors.push('MISSING_TWO_SIDED_PARTICIPATION: Journal entry must contain at least one DEBIT and at least one CREDIT.');
    }

    // Invariant 1: Mathematical balance
    if (totalDebits !== totalCredits) {
      errors.push(
        `UNBALANCED_JOURNAL: Total debits (${totalDebits} paise) must equal total credits (${totalCredits} paise). Difference: ${totalDebits - totalCredits} paise.`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      totalDebitsMinorUnits: totalDebits,
      totalCreditsMinorUnits: totalCredits,
    };
  }

  /**
   * Create a DRAFT journal entry with lines
   */
  public static async createJournalDraft(
    tenantId: string,
    input: CreateJournalEntryInput,
    userId?: string
  ): Promise<any> {
    const currency = input.currency || 'INR';
    const year = new Date().getFullYear();
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const entryNumber = `JE-${year}-${randomSuffix}`;

    return withTenantTransaction(tenantId, async (client) => {
      // 1. Insert header in DRAFT status
      const insertHeaderSql = `
        INSERT INTO journal_entries (
          tenant_id,
          entry_number,
          posting_date,
          status,
          business_event_type,
          business_event_id,
          currency,
          description,
          created_by_user_id
        ) VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7, $8)
        RETURNING id, tenant_id, entry_number, posting_date, status, business_event_type, business_event_id, currency, description, created_at
      `;

      let header;
      try {
        const { rows } = await client.query(insertHeaderSql, [
          tenantId,
          entryNumber,
          input.postingDate,
          input.businessEventType,
          input.businessEventId,
          currency,
          input.description,
          userId || null,
        ]);
        header = rows[0];
      } catch (err: any) {
        if (err.code === '23505') {
          throw new Error(`DUPLICATE_BUSINESS_EVENT: A journal entry already exists for event ${input.businessEventType}:${input.businessEventId}`);
        }
        throw err;
      }

      // 2. Insert lines
      const insertedLines = [];
      for (const line of input.lines) {
        const amount = BigInt(line.amountMinorUnits).toString();
        const insertLineSql = `
          INSERT INTO journal_entry_lines (
            journal_entry_id,
            tenant_id,
            line_number,
            account_id,
            entry_type,
            amount_minor_units,
            currency,
            memo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, line_number, account_id, entry_type, amount_minor_units, currency, memo
        `;
        const { rows: lineRows } = await client.query(insertLineSql, [
          header.id,
          tenantId,
          line.lineNumber,
          line.accountId,
          line.entryType,
          amount,
          line.currency || currency,
          line.memo || null,
        ]);
        insertedLines.push({
          ...lineRows[0],
          amount_minor_units: lineRows[0].amount_minor_units.toString(),
        });
      }

      return {
        ...header,
        lines: insertedLines,
      };
    });
  }

  /**
   * Post a journal entry atomically with row-level locking and invariant validation.
   */
  public static async postJournalEntry(
    tenantId: string,
    journalEntryId: string,
    userId?: string
  ): Promise<any> {
    return withTenantTransaction(tenantId, async (client) => {
      // Step 1: Acquire row-level lock on journal header
      const { rows: headerRows } = await client.query(
        `SELECT id, tenant_id, entry_number, posting_date, status, currency, description 
         FROM journal_entries 
         WHERE id = $1 AND tenant_id = $2 
         FOR UPDATE`,
        [journalEntryId, tenantId]
      );

      if (headerRows.length === 0) {
        throw new Error(`NOT_FOUND: Journal entry ${journalEntryId} not found in this municipality.`);
      }

      const header = headerRows[0];

      if (header.status === 'POSTED') {
        throw new Error(`ALREADY_POSTED: Journal entry ${header.entry_number} is already posted and immutable.`);
      }

      // Step 2: Fetch lines with row-level lock
      const { rows: lines } = await client.query(
        `SELECT id, line_number, account_id, entry_type, amount_minor_units, currency, memo 
         FROM journal_entry_lines 
         WHERE journal_entry_id = $1 AND tenant_id = $2 
         ORDER BY line_number ASC`,
        [journalEntryId, tenantId]
      );

      // Step 3: Fetch active accounts for validation
      const accountIds = Array.from(new Set(lines.map((l) => l.account_id)));
      let accountMap = new Map<string, { id: string; isActive: boolean }>();

      if (accountIds.length > 0) {
        const { rows: accounts } = await client.query(
          `SELECT id, is_active FROM chart_of_accounts WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
          [accountIds, tenantId]
        );
        for (const acct of accounts) {
          accountMap.set(acct.id, { id: acct.id, isActive: Boolean(acct.is_active) });
        }
      }

      // Step 4: Validate all 6 invariants
      const lineInputs: JournalLineInput[] = lines.map((l) => ({
        lineNumber: l.line_number,
        accountId: l.account_id,
        entryType: l.entry_type,
        amountMinorUnits: l.amount_minor_units,
        currency: l.currency,
        memo: l.memo,
      }));

      const validation = this.validatePostingInvariants(header.currency, lineInputs, accountMap);

      if (!validation.isValid) {
        throw new Error(`POSTING_VALIDATION_FAILED: ${validation.errors.join(' | ')}`);
      }

      // Step 5: Transition state from DRAFT to POSTED
      const { rows: updatedRows } = await client.query(
        `UPDATE journal_entries 
         SET status = 'POSTED', posted_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING id, entry_number, posting_date, status, posted_at, currency, description`,
        [journalEntryId]
      );

      return {
        ...updatedRows[0],
        totalMinorUnits: validation.totalDebitsMinorUnits.toString(),
        lines: lines.map((l) => ({
          ...l,
          amount_minor_units: l.amount_minor_units.toString(),
        })),
      };
    });
  }

  /**
   * Create a separate, linked compensating reversal journal entry.
   * STRICT IMMUTABILITY RULE: The original entry's status is NEVER changed to REVERSED.
   * It remains POSTED. The reversal is an independent entry with reversal_of_entry_id pointing to it.
   */
  public static async createCompensatingReversal(
    tenantId: string,
    originalEntryId: string,
    userId?: string,
    reversalReason: string = 'Correction of erroneous transaction'
  ): Promise<any> {
    return withTenantTransaction(tenantId, async (client) => {
      // 1. Lock and fetch original entry
      const { rows: originalRows } = await client.query(
        `SELECT id, tenant_id, entry_number, posting_date, status, currency, description 
         FROM journal_entries 
         WHERE id = $1 AND tenant_id = $2 
         FOR UPDATE`,
        [originalEntryId, tenantId]
      );

      if (originalRows.length === 0) {
        throw new Error(`NOT_FOUND: Original journal entry ${originalEntryId} not found.`);
      }

      const original = originalRows[0];

      if (original.status !== 'POSTED') {
        throw new Error(`CANNOT_REVERSE_DRAFT: Only POSTED journal entries can be reversed. Current status: ${original.status}`);
      }

      // 2. Check if already reversed
      const { rows: existingReversals } = await client.query(
        `SELECT id, entry_number FROM journal_entries WHERE reversal_of_entry_id = $1 AND tenant_id = $2`,
        [originalEntryId, tenantId]
      );

      if (existingReversals.length > 0) {
        throw new Error(`ALREADY_REVERSED: Journal entry ${original.entry_number} was already reversed by ${existingReversals[0].entry_number}.`);
      }

      // 3. Fetch original lines
      const { rows: originalLines } = await client.query(
        `SELECT line_number, account_id, entry_type, amount_minor_units, currency, memo 
         FROM journal_entry_lines 
         WHERE journal_entry_id = $1 AND tenant_id = $2 
         ORDER BY line_number ASC`,
        [originalEntryId, tenantId]
      );

      // 4. Generate reversal header in DRAFT status first
      const year = new Date().getFullYear();
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const reversalEntryNumber = `JE-REV-${year}-${randomSuffix}`;
      const today = new Date().toISOString().split('T')[0];
      const reversalBusinessEventId = `REV-${original.entry_number}-${Date.now()}`;

      const { rows: reversalHeaderRows } = await client.query(
        `INSERT INTO journal_entries (
          tenant_id,
          entry_number,
          posting_date,
          status,
          business_event_type,
          business_event_id,
          currency,
          reversal_of_entry_id,
          description,
          created_by_user_id
        ) VALUES ($1, $2, $3, 'DRAFT', 'COMPENSATING_REVERSAL', $4, $5, $6, $7, $8)
        RETURNING id, entry_number, posting_date, status, business_event_type, business_event_id, currency, reversal_of_entry_id, description, created_at`,
        [
          tenantId,
          reversalEntryNumber,
          today,
          reversalBusinessEventId,
          original.currency,
          original.id,
          `Compensating reversal of ${original.entry_number}: ${reversalReason}`,
          userId || null,
        ]
      );

      const reversalHeader = reversalHeaderRows[0];

      // 5. Invert debits and credits while header is in DRAFT
      const reversalLines = [];
      for (const line of originalLines) {
        const invertedType = line.entry_type === 'DEBIT' ? 'CREDIT' : 'DEBIT';
        const { rows: revLineRows } = await client.query(
          `INSERT INTO journal_entry_lines (
            journal_entry_id,
            tenant_id,
            line_number,
            account_id,
            entry_type,
            amount_minor_units,
            currency,
            memo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, line_number, account_id, entry_type, amount_minor_units, currency, memo`,
          [
            reversalHeader.id,
            tenantId,
            line.line_number,
            line.account_id,
            invertedType,
            line.amount_minor_units,
            line.currency,
            `Reversal of line ${line.line_number}: ${line.memo || ''}`,
          ]
        );
        reversalLines.push({
          ...revLineRows[0],
          amount_minor_units: revLineRows[0].amount_minor_units.toString(),
        });
      }

      // 6. Transition reversal header from DRAFT to POSTED (invokes database trigger verification)
      const { rows: postedReversalRows } = await client.query(
        `UPDATE journal_entries 
         SET status = 'POSTED', posted_at = CURRENT_TIMESTAMP 
         WHERE id = $1 
         RETURNING id, entry_number, posting_date, status, business_event_type, business_event_id, currency, reversal_of_entry_id, description, posted_at`,
        [reversalHeader.id]
      );

      return {
        originalEntry: {
          id: original.id,
          entryNumber: original.entry_number,
          status: original.status, // Strictly remains 'POSTED'!
        },
        reversalEntry: {
          ...postedReversalRows[0],
          lines: reversalLines,
        },
      };
    });
  }

  /**
   * List chart of accounts for tenant
   */
  public static async getChartOfAccounts(tenantId: string): Promise<any[]> {
    return withTenantTransaction(tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, account_code, account_name, account_type, normal_balance, is_active, is_demo 
         FROM chart_of_accounts 
         WHERE tenant_id = $1 
         ORDER BY account_code ASC`,
        [tenantId]
      );
      return rows;
    });
  }

  /**
   * List journal entries with their lines for tenant
   */
  public static async getJournalEntries(tenantId: string, limit: number = 50): Promise<any[]> {
    return withTenantTransaction(tenantId, async (client) => {
      const { rows: headers } = await client.query(
        `SELECT id, entry_number, posting_date, status, business_event_type, business_event_id, currency, reversal_of_entry_id, description, is_demo, created_at, posted_at 
         FROM journal_entries 
         WHERE tenant_id = $1 
         ORDER BY posting_date DESC, created_at DESC 
         LIMIT $2`,
        [tenantId, limit]
      );

      if (headers.length === 0) return [];

      const headerIds = headers.map((h) => h.id);
      const { rows: lines } = await client.query(
        `SELECT l.id, l.journal_entry_id, l.line_number, l.account_id, a.account_code, a.account_name, l.entry_type, l.amount_minor_units, l.currency, l.memo 
         FROM journal_entry_lines l
         JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE l.journal_entry_id = ANY($1::uuid[]) AND l.tenant_id = $2 
         ORDER BY l.journal_entry_id, l.line_number ASC`,
        [headerIds, tenantId]
      );

      const linesByHeader = new Map<string, any[]>();
      for (const line of lines) {
        if (!linesByHeader.has(line.journal_entry_id)) {
          linesByHeader.set(line.journal_entry_id, []);
        }
        linesByHeader.get(line.journal_entry_id)!.push({
          ...line,
          amount_minor_units: line.amount_minor_units.toString(),
        });
      }

      return headers.map((h) => ({
        ...h,
        lines: linesByHeader.get(h.id) || [],
      }));
    });
  }

  /**
   * Guard for policy-dependent revenue recognition timing.
   * Throws if accounting policy has not been formally confirmed by the CFO.
   */
  public static getEffectiveRevenueRecognitionTiming(): 'ACCRUAL_AT_BILLING' | 'CASH_AT_CAPTURE' {
    if (!config.policies.accountingPolicyConfirmed || !config.policies.revenueRecognitionTiming) {
      throw new Error(
        'UNCONFIRMED_ACCOUNTING_POLICY: Automatic revenue recognition posting is blocked pending CFO accounting policy confirmation.'
      );
    }
    return config.policies.revenueRecognitionTiming;
  }

  /**
   * Guard for policy-dependent payment gateway fee allocation.
   * Throws if fee treatment has not been formally confirmed by the CFO.
   */
  public static getEffectiveGatewayFeeTreatment(): 'OPERATING_EXPENSE' | 'CITIZEN_SURCHARGE' {
    if (!config.policies.accountingPolicyConfirmed || !config.policies.gatewayFeeTreatment) {
      throw new Error(
        'UNCONFIRMED_ACCOUNTING_POLICY: Automatic gateway fee allocation posting is blocked pending CFO accounting policy confirmation.'
      );
    }
    return config.policies.gatewayFeeTreatment;
  }

  /**
   * Guard for policy-dependent tax rate calculation.
   * Throws if tax policy has not been formally confirmed by qualified municipal tax counsel.
   */
  public static getEffectiveTaxRateBasisPoints(): number {
    if (!config.policies.taxPolicyConfirmed || config.policies.taxDefaultRateBps === null) {
      throw new Error(
        'UNCONFIRMED_TAX_POLICY: Tax calculation is blocked pending qualified municipal tax counsel review.'
      );
    }
    return config.policies.taxDefaultRateBps;
  }
}
