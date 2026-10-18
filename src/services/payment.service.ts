import crypto from 'crypto';
import { runtimePool, withTenantTransaction } from '../db/pool';
import { config } from '../config';
import { AccountingService } from './accounting.service';
import { IPaymentGatewayAdapter, MockPaymentGatewayAdapter } from './payment-gateway.adapter';
import {
  BillRecord,
  CreatePaymentOrderInput,
  GatewayOrderResult,
  PaymentTransactionRecord,
} from '../types/payment.types';

export class PaymentService {
  private static defaultAdapter: IPaymentGatewayAdapter = new MockPaymentGatewayAdapter();

  /**
   * Inject or override the gateway adapter (for tests and different providers).
   */
  public static setGatewayAdapter(adapter: IPaymentGatewayAdapter): void {
    this.defaultAdapter = adapter;
  }

  public static getGatewayAdapter(): IPaymentGatewayAdapter {
    return this.defaultAdapter;
  }

  /**
   * Initiates a payment order for a citizen.
   */
  public static async createPaymentOrder(
    citizenUserId: string,
    tenantId: string,
    input: CreatePaymentOrderInput
  ): Promise<{ paymentTransaction: PaymentTransactionRecord; gatewayOrder: GatewayOrderResult }> {
    // 1. Enforce strict doorstep cash deactivation guard
    if ((input.paymentMethod as string) === 'DOORSTEP_CASH' || !config.policies.doorstepCashEnabled) {
      if ((input.paymentMethod as string) === 'DOORSTEP_CASH') {
        throw new Error('DOORSTEP_CASH_DISABLED: Doorstep cash collection is strictly deactivated for the municipal pilot.');
      }
    }

    if (input.paymentMethod !== 'ONLINE_GATEWAY') {
      throw new Error(`UNSUPPORTED_PAYMENT_METHOD: Payment method ${input.paymentMethod} is not enabled.`);
    }

    const amountMinor = BigInt(input.amountMinorUnits);
    if (amountMinor <= BigInt(0)) {
      throw new Error('INVALID_AMOUNT: Payment amount must be strictly greater than zero.');
    }

    const currency = input.currency || 'INR';

    return withTenantTransaction(tenantId, async (client) => {
      // 2. Check idempotency key if supplied
      if (input.idempotencyKey) {
        const { rows: existingRows } = await client.query(
          `SELECT * FROM payment_transactions WHERE tenant_id = $1 AND idempotency_key = $2`,
          [tenantId, input.idempotencyKey]
        );
        if (existingRows.length > 0) {
          const existing = existingRows[0];
          return {
            paymentTransaction: existing,
            gatewayOrder: {
              gatewayOrderId: existing.gateway_order_id,
              gatewayProvider: existing.gateway_provider,
              amountMinorUnits: existing.amount_minor_units.toString(),
              currency: existing.currency,
              status: 'CREATED',
            },
          };
        }
      }

      // 3. Bill & Property Verification if billId is provided
      let propertyId: string | null = input.propertyId || null;
      if (input.billId) {
        const { rows: billRows } = await client.query(
          `SELECT b.*, p.citizen_user_id AS property_owner_id 
           FROM bills b
           JOIN properties p ON b.property_id = p.id
           WHERE b.id = $1 AND b.tenant_id = $2`,
          [input.billId, tenantId]
        );

        if (billRows.length === 0) {
          throw new Error('BILL_NOT_FOUND: Requested bill does not exist within this municipality.');
        }

        const bill = billRows[0];
        propertyId = bill.property_id;

        // Verify citizen authorization: citizen must own the bill or the linked property
        if (bill.citizen_user_id !== citizenUserId && bill.property_owner_id !== citizenUserId) {
          throw new Error('AUTH_FORBIDDEN_BILL_ACCESS: You are not authorized to pay this bill.');
        }

        if (bill.status === 'PAID') {
          throw new Error('BILL_ALREADY_PAID: This bill has already been fully settled.');
        }

        if (bill.status === 'CANCELLED') {
          throw new Error('BILL_CANCELLED: This bill has been cancelled and cannot accept payments.');
        }

        const outstanding = BigInt(bill.amount_due_minor_units) - BigInt(bill.amount_paid_minor_units);
        if (amountMinor > outstanding) {
          throw new Error(`OVERPAYMENT_NOT_PERMITTED: Amount (${amountMinor} paise) exceeds outstanding balance (${outstanding} paise).`);
        }
      }

      // 4. Generate formal tenant-scoped receipt reference
      const { rows: tenantRows } = await client.query(`SELECT slug FROM tenants WHERE id = $1`, [tenantId]);
      const tenantSlug = tenantRows[0]?.slug?.toUpperCase().slice(0, 4) || 'MUNI';
      const year = new Date().getFullYear();
      const randomReceiptId = crypto.randomBytes(4).toString('hex').toUpperCase();
      const receiptNumber = `REC-${tenantSlug}-${year}-${randomReceiptId}`;

      // 5. Call Gateway Adapter to create order
      const gatewayOrder = await this.defaultAdapter.createOrder({
        amountMinorUnits: amountMinor.toString(),
        currency,
        receiptNumber,
        notes: {
          billId: input.billId || '',
          citizenUserId,
        },
      });

      // 6. Insert payment_transactions record in PENDING status
      const { rows: txRows } = await client.query(
        `INSERT INTO payment_transactions (
          tenant_id, bill_id, property_id, citizen_user_id, payment_method, 
          amount_minor_units, currency, status, gateway_provider, gateway_order_id, 
          receipt_number, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9, $10, $11)
        RETURNING *`,
        [
          tenantId,
          input.billId || null,
          propertyId,
          citizenUserId,
          input.paymentMethod,
          amountMinor.toString(),
          currency,
          gatewayOrder.gatewayProvider,
          gatewayOrder.gatewayOrderId,
          receiptNumber,
          input.idempotencyKey || null,
        ]
      );

      return {
        paymentTransaction: txRows[0],
        gatewayOrder,
      };
    });
  }

  /**
   * Processes incoming webhook from payment gateway.
   */
  public static async handleWebhook(
    gatewayName: string,
    rawBody: string,
    headers: Record<string, string>,
    secretOverride?: string
  ): Promise<{ received: boolean; status: string; eventId: string; paymentStatus?: string; error?: string }> {
    const adapter = this.defaultAdapter;
    const webhookSecret = secretOverride || config.payments.mockWebhookSecret;

    // 1. Parse and verify signature
    const event = adapter.parseWebhookEvent(rawBody, headers, webhookSecret);
    if (!event.signatureValid) {
      throw new Error('AUTH_INVALID_WEBHOOK_SIGNATURE: Webhook signature verification failed.');
    }

    const client = await runtimePool.connect();
    let paymentTx: any = null;

    try {
      // 2. Provider-scoped deduplication check
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.payment_webhook_lookup', 'true', true)");

      const { rows: existingEvent } = await client.query(
        `SELECT id, processing_status FROM payment_events WHERE gateway_provider = $1 AND gateway_event_id = $2`,
        [event.gatewayProvider, event.gatewayEventId]
      );

      if (existingEvent.length > 0) {
        await client.query('COMMIT');
        return {
          received: true,
          status: 'DUPLICATE_IGNORED',
          eventId: event.gatewayEventId,
        };
      }

      // 3. Resolve matching payment transaction
      if (event.gatewayOrderId || event.gatewayPaymentId) {
        const { rows: matchedTx } = await client.query(
          `SELECT * FROM payment_transactions 
           WHERE gateway_provider = $1 AND (gateway_order_id = $2 OR gateway_payment_id = $3)
           LIMIT 1`,
          [event.gatewayProvider, event.gatewayOrderId || null, event.gatewayPaymentId || null]
        );
        if (matchedTx.length > 0) {
          paymentTx = matchedTx[0];
        }
      }

      // If no matching transaction found, record ANOMALY_PENDING_REVIEW without corrupting state
      if (!paymentTx) {
        // Query demo tenant fallback for unassigned events if needed
        const { rows: anyTenant } = await client.query(`SELECT id FROM tenants LIMIT 1`);
        const fallbackTenantId = anyTenant[0]?.id;

        if (fallbackTenantId) {
          await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [fallbackTenantId]);
          await client.query(
            `INSERT INTO payment_events (
              tenant_id, gateway_provider, gateway_event_id, event_type, processing_status, error_details, event_payload
            ) VALUES ($1, $2, $3, $4, 'ANOMALY_PENDING_REVIEW', 'No matching payment transaction found for gateway order/payment ID.', $5)`,
            [fallbackTenantId, event.gatewayProvider, event.gatewayEventId, event.eventType, JSON.stringify(event.rawPayload)]
          );
        }
        await client.query('COMMIT');
        return {
          received: true,
          status: 'ANOMALY_PENDING_REVIEW',
          eventId: event.gatewayEventId,
          error: 'No matching payment transaction found.',
        };
      }

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 4. Execute state transition and accounting coordination inside tenant context
    const tenantId = paymentTx.tenant_id;

    return withTenantTransaction(tenantId, async (txClient) => {
      // Row-level lock on payment transaction to prevent race conditions
      const { rows: lockedRows } = await txClient.query(
        `SELECT * FROM payment_transactions WHERE id = $1 FOR UPDATE`,
        [paymentTx.id]
      );
      const currentTx = lockedRows[0];

      // Handle PAYMENT_CAPTURED event
      if (event.eventType === 'PAYMENT_CAPTURED') {
        if (currentTx.status === 'SUCCESSFUL') {
          // Already successful, record event as duplicate
          await txClient.query(
            `INSERT INTO payment_events (
              tenant_id, payment_transaction_id, gateway_provider, gateway_event_id, event_type, processing_status, event_payload
            ) VALUES ($1, $2, $3, $4, $5, 'DUPLICATE_IGNORED', $6)`,
            [tenantId, currentTx.id, event.gatewayProvider, event.gatewayEventId, event.eventType, JSON.stringify(event.rawPayload)]
          );
          return { received: true, status: 'DUPLICATE_IGNORED', eventId: event.gatewayEventId };
        }

        if (currentTx.status === 'REFUNDED' || currentTx.status === 'FAILED') {
          // Anomaly: capture event received after transaction in terminal status
          await txClient.query(
            `INSERT INTO payment_events (
              tenant_id, payment_transaction_id, gateway_provider, gateway_event_id, event_type, processing_status, error_details, event_payload
            ) VALUES ($1, $2, $3, $4, $5, 'ANOMALY_PENDING_REVIEW', $6, $7)`,
            [
              tenantId,
              currentTx.id,
              event.gatewayProvider,
              event.gatewayEventId,
              event.eventType,
              `Received PAYMENT_CAPTURED for transaction already in terminal status ${currentTx.status}`,
              JSON.stringify(event.rawPayload),
            ]
          );
          return { received: true, status: 'ANOMALY_PENDING_REVIEW', eventId: event.gatewayEventId };
        }

        // Amount integrity check: payload amount must match recorded amount
        if (event.amountMinorUnits && event.amountMinorUnits !== BigInt(currentTx.amount_minor_units)) {
          await txClient.query(
            `INSERT INTO payment_events (
              tenant_id, payment_transaction_id, gateway_provider, gateway_event_id, event_type, processing_status, error_details, event_payload
            ) VALUES ($1, $2, $3, $4, $5, 'ANOMALY_PENDING_REVIEW', $6, $7)`,
            [
              tenantId,
              currentTx.id,
              event.gatewayProvider,
              event.gatewayEventId,
              event.eventType,
              `Amount mismatch: Webhook amount ${event.amountMinorUnits} does not equal transaction amount ${currentTx.amount_minor_units}`,
              JSON.stringify(event.rawPayload),
            ]
          );
          return { received: true, status: 'ANOMALY_PENDING_REVIEW', eventId: event.gatewayEventId };
        }

        // Update payment transaction status to SUCCESSFUL
        await txClient.query(
          `UPDATE payment_transactions 
           SET status = 'SUCCESSFUL', 
               gateway_payment_id = COALESCE($1, gateway_payment_id),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [event.gatewayPaymentId || null, currentTx.id]
        );

        // Update associated Bill if present
        if (currentTx.bill_id) {
          const { rows: billRows } = await txClient.query(
            `SELECT * FROM bills WHERE id = $1 FOR UPDATE`,
            [currentTx.bill_id]
          );
          if (billRows.length > 0) {
            const b = billRows[0];
            const newPaid = BigInt(b.amount_paid_minor_units) + BigInt(currentTx.amount_minor_units);
            const isFull = newPaid >= BigInt(b.amount_due_minor_units);
            await txClient.query(
              `UPDATE bills 
               SET amount_paid_minor_units = $1,
                   status = $2,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $3`,
              [newPaid.toString(), isFull ? 'PAID' : 'PARTIALLY_PAID', b.id]
            );
          }
        }

        // Coordinate with Double-Entry General Ledger: Post Balanced Journal Entry
        // Scenario 2: Debit 1030 (Gateway Clearing), Credit 1040 (Accounts Receivable)
        const { rows: coaRows } = await txClient.query(
          `SELECT id, account_code FROM chart_of_accounts WHERE tenant_id = $1 AND account_code IN ('1030', '1040') AND is_active = TRUE`,
          [tenantId]
        );
        const coaMap = new Map<string, string>();
        coaRows.forEach((r) => coaMap.set(r.account_code, r.id));

        const clearingAccountId = coaMap.get('1030');
        const arAccountId = coaMap.get('1040');

        if (clearingAccountId && arAccountId) {
          const draft = await AccountingService.createJournalDraft(tenantId, {
            postingDate: new Date().toISOString().split('T')[0],
            businessEventType: 'PAYMENT_GATEWAY_SETTLEMENT',
            businessEventId: currentTx.id,
            currency: currentTx.currency || 'INR',
            description: `Online payment capture for Receipt ${currentTx.receipt_number}`,
            lines: [
              {
                lineNumber: 1,
                accountId: clearingAccountId,
                entryType: 'DEBIT',
                amountMinorUnits: currentTx.amount_minor_units,
                currency: currentTx.currency || 'INR',
                memo: `Gateway captured funds for Receipt ${currentTx.receipt_number}`,
              },
              {
                lineNumber: 2,
                accountId: arAccountId,
                entryType: 'CREDIT',
                amountMinorUnits: currentTx.amount_minor_units,
                currency: currentTx.currency || 'INR',
                memo: `Extinguish citizen AR for Receipt ${currentTx.receipt_number}`,
              },
            ],
          });
          await AccountingService.postJournalEntry(tenantId, draft.id);
        }

        // Insert payment_events with PROCESSED status
        await txClient.query(
          `INSERT INTO payment_events (
            tenant_id, payment_transaction_id, gateway_provider, gateway_event_id, event_type, processing_status, event_payload
          ) VALUES ($1, $2, $3, $4, $5, 'PROCESSED', $6)`,
          [tenantId, currentTx.id, event.gatewayProvider, event.gatewayEventId, event.eventType, JSON.stringify(event.rawPayload)]
        );

        return { received: true, status: 'PROCESSED', eventId: event.gatewayEventId, paymentStatus: 'SUCCESSFUL' };
      }

      // Handle PAYMENT_FAILED event
      if (event.eventType === 'PAYMENT_FAILED') {
        if (currentTx.status === 'SUCCESSFUL' || currentTx.status === 'REFUNDED') {
          // Anomaly: Failure received for already settled transaction
          await txClient.query(
            `INSERT INTO payment_events (
              tenant_id, payment_transaction_id, gateway_provider, gateway_event_id, event_type, processing_status, error_details, event_payload
            ) VALUES ($1, $2, $3, $4, $5, 'ANOMALY_PENDING_REVIEW', $6, $7)`,
            [
              tenantId,
              currentTx.id,
              event.gatewayProvider,
              event.gatewayEventId,
              event.eventType,
              `Received PAYMENT_FAILED for transaction in status ${currentTx.status}`,
              JSON.stringify(event.rawPayload),
            ]
          );
          return { received: true, status: 'ANOMALY_PENDING_REVIEW', eventId: event.gatewayEventId };
        }

        await txClient.query(
          `UPDATE payment_transactions 
           SET status = 'FAILED', 
               failure_reason = $1, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [event.failureReason || 'Payment authorization failed at gateway.', currentTx.id]
        );

        await txClient.query(
          `INSERT INTO payment_events (
            tenant_id, payment_transaction_id, gateway_provider, gateway_event_id, event_type, processing_status, event_payload
          ) VALUES ($1, $2, $3, $4, $5, 'PROCESSED', $6)`,
          [tenantId, currentTx.id, event.gatewayProvider, event.gatewayEventId, event.eventType, JSON.stringify(event.rawPayload)]
        );

        return { received: true, status: 'PROCESSED', eventId: event.gatewayEventId, paymentStatus: 'FAILED' };
      }

      // Handle REFUND_PROCESSED event
      if (event.eventType === 'REFUND_PROCESSED') {
        if (currentTx.status !== 'SUCCESSFUL') {
          // Anomaly: Cannot refund non-successful payment
          await txClient.query(
            `INSERT INTO payment_events (
              tenant_id, payment_transaction_id, gateway_provider, gateway_event_id, event_type, processing_status, error_details, event_payload
            ) VALUES ($1, $2, $3, $4, $5, 'ANOMALY_PENDING_REVIEW', $6, $7)`,
            [
              tenantId,
              currentTx.id,
              event.gatewayProvider,
              event.gatewayEventId,
              event.eventType,
              `Received REFUND_PROCESSED for transaction in non-successful status ${currentTx.status}`,
              JSON.stringify(event.rawPayload),
            ]
          );
          return { received: true, status: 'ANOMALY_PENDING_REVIEW', eventId: event.gatewayEventId };
        }

        // Update transaction status to REFUNDED
        await txClient.query(
          `UPDATE payment_transactions 
           SET status = 'REFUNDED', 
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [currentTx.id]
        );

        // Reopen Bill balance if associated
        if (currentTx.bill_id) {
          const { rows: billRows } = await txClient.query(`SELECT * FROM bills WHERE id = $1 FOR UPDATE`, [currentTx.bill_id]);
          if (billRows.length > 0) {
            const b = billRows[0];
            const newPaid = Math.max(0, Number(BigInt(b.amount_paid_minor_units) - BigInt(currentTx.amount_minor_units)));
            await txClient.query(
              `UPDATE bills 
               SET amount_paid_minor_units = $1,
                   status = $2,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $3`,
              [newPaid.toString(), newPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID', b.id]
            );
          }
        }

        // Coordinate with Double-Entry Ledger: Compensating Entry
        // Scenario 4: Debit 1040 (AR), Credit 1030 (Gateway Clearing)
        const { rows: coaRows } = await txClient.query(
          `SELECT id, account_code FROM chart_of_accounts WHERE tenant_id = $1 AND account_code IN ('1030', '1040') AND is_active = TRUE`,
          [tenantId]
        );
        const coaMap = new Map<string, string>();
        coaRows.forEach((r) => coaMap.set(r.account_code, r.id));

        const clearingAccountId = coaMap.get('1030');
        const arAccountId = coaMap.get('1040');

        if (clearingAccountId && arAccountId) {
          const draft = await AccountingService.createJournalDraft(tenantId, {
            postingDate: new Date().toISOString().split('T')[0],
            businessEventType: 'PAYMENT_GATEWAY_REFUND',
            businessEventId: currentTx.id,
            currency: currentTx.currency || 'INR',
            description: `Compensating refund entry for Receipt ${currentTx.receipt_number}`,
            lines: [
              {
                lineNumber: 1,
                accountId: arAccountId,
                entryType: 'DEBIT',
                amountMinorUnits: currentTx.amount_minor_units,
                currency: currentTx.currency || 'INR',
                memo: `Reopen citizen AR for refund on Receipt ${currentTx.receipt_number}`,
              },
              {
                lineNumber: 2,
                accountId: clearingAccountId,
                entryType: 'CREDIT',
                amountMinorUnits: currentTx.amount_minor_units,
                currency: currentTx.currency || 'INR',
                memo: `Gateway refund remittance for Receipt ${currentTx.receipt_number}`,
              },
            ],
          });
          await AccountingService.postJournalEntry(tenantId, draft.id);
        }

        await txClient.query(
          `INSERT INTO payment_events (
            tenant_id, payment_transaction_id, gateway_provider, gateway_event_id, event_type, processing_status, event_payload
          ) VALUES ($1, $2, $3, $4, $5, 'PROCESSED', $6)`,
          [tenantId, currentTx.id, event.gatewayProvider, event.gatewayEventId, event.eventType, JSON.stringify(event.rawPayload)]
        );

        return { received: true, status: 'PROCESSED', eventId: event.gatewayEventId, paymentStatus: 'REFUNDED' };
      }

      // Default fallback for other event types (e.g. PAYMENT_AUTHORIZED)
      await txClient.query(
        `INSERT INTO payment_events (
          tenant_id, payment_transaction_id, gateway_provider, gateway_event_id, event_type, processing_status, event_payload
        ) VALUES ($1, $2, $3, $4, $5, 'PROCESSED', $6)`,
        [tenantId, currentTx.id, event.gatewayProvider, event.gatewayEventId, event.eventType, JSON.stringify(event.rawPayload)]
      );

      return { received: true, status: 'PROCESSED', eventId: event.gatewayEventId };
    });
  }

  /**
   * Retrieves a single payment transaction by ID with object-level authorization.
   */
  public static async getPayment(
    tenantId: string,
    paymentId: string,
    requestingUserId: string,
    requestingRole: string
  ): Promise<PaymentTransactionRecord> {
    return withTenantTransaction(tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM payment_transactions WHERE id = $1 AND tenant_id = $2`,
        [paymentId, tenantId]
      );

      if (rows.length === 0) {
        throw new Error('PAYMENT_NOT_FOUND: Payment transaction does not exist.');
      }

      const payment = rows[0];

      // Object-level authorization: Citizen can only view their own payment transactions
      if (requestingRole === 'CITIZEN' && payment.citizen_user_id !== requestingUserId) {
        throw new Error('AUTH_FORBIDDEN_OBJECT_ACCESS: You are not authorized to view this payment transaction.');
      }

      return payment;
    });
  }

  /**
   * Lists bills eligible for a citizen.
   */
  public static async listCitizenBills(
    tenantId: string,
    citizenUserId: string
  ): Promise<BillRecord[]> {
    return withTenantTransaction(tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT b.id, b.tenant_id, b.property_id, COALESCE(b.citizen_user_id, p.citizen_user_id) AS citizen_user_id,
                b.bill_number, b.billing_period_start, b.billing_period_end, b.amount_due_minor_units,
                b.amount_paid_minor_units, b.status, b.due_date, b.is_demo, b.created_at, b.updated_at
         FROM bills b
         JOIN properties p ON b.property_id = p.id
         WHERE b.tenant_id = $1 AND (b.citizen_user_id = $2 OR p.citizen_user_id = $2)
         ORDER BY b.due_date ASC`,
        [tenantId, citizenUserId]
      );
      return rows;
    });
  }

  /**
   * Lists payment transactions for a citizen.
   */
  public static async listCitizenPayments(
    tenantId: string,
    citizenUserId: string
  ): Promise<PaymentTransactionRecord[]> {
    return withTenantTransaction(tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM payment_transactions 
         WHERE tenant_id = $1 AND citizen_user_id = $2
         ORDER BY created_at DESC`,
        [tenantId, citizenUserId]
      );
      return rows;
    });
  }
}
