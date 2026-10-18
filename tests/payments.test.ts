import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../src/app';
import { config } from '../src/config';
import { runtimePool, withTenantTransaction } from '../src/db/pool';
import { AuthService } from '../src/services/auth.service';
import { PaymentService } from '../src/services/payment.service';
import { MockPaymentGatewayAdapter } from '../src/services/payment-gateway.adapter';
import { startPostgresTestServer, stopPostgresTestServer } from './helpers/postgres-test-server';

describe('Phase 6: Payments Foundation & Ledger Integration Tests', () => {
  before(async () => {
    await startPostgresTestServer(5435);
  });

  after(async () => {
    await stopPostgresTestServer();
  });

  describe('1. Gateway Adapter & HMAC Signature Verification', () => {
    const adapter = new MockPaymentGatewayAdapter();
    const secret = config.payments.mockWebhookSecret;

    it('generates mock payment order with correct amount, currency, and provider', async () => {
      const order = await adapter.createOrder({
        tenantId: 'test-tenant-1',
        paymentTransactionId: 'tx-1',
        amountMinorUnits: '15000',
        currency: 'INR',
        receiptNumber: 'REC-TEST-001',
      });

      assert.ok(order.gatewayOrderId.startsWith('order_mock_'));
      assert.equal(order.amountMinorUnits, '15000');
      assert.equal(order.currency, 'INR');
      assert.equal(order.status, 'CREATED');
    });

    it('validates authentic webhook payload and signature with HMAC SHA-256', () => {
      const payloadString = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_test_001',
        timestamp: new Date().toISOString(),
      });
      const validSignature = crypto.createHmac('sha256', secret).update(payloadString, 'utf8').digest('hex');

      const isValid = adapter.verifyWebhookSignature(payloadString, validSignature);
      assert.equal(isValid, true, 'Authentic HMAC signature must verify successfully');
    });

    it('rejects tampered webhook signature', () => {
      const payloadString = JSON.stringify({ event: 'payment.captured', id: 'evt_test_001' });
      const tamperedSignature = 'a'.repeat(64);

      const isValid = adapter.verifyWebhookSignature(payloadString, tamperedSignature);
      assert.equal(isValid, false, 'Tampered signature must be rejected');
    });

    it('rejects tampered payload content with valid original signature', () => {
      const originalPayload = JSON.stringify({ event: 'payment.captured', amount: 15000 });
      const signature = crypto.createHmac('sha256', secret).update(originalPayload, 'utf8').digest('hex');

      const tamperedPayload = JSON.stringify({ event: 'payment.captured', amount: 50000 });
      const isValid = adapter.verifyWebhookSignature(tamperedPayload, signature);
      assert.equal(isValid, false, 'Tampered payload body must fail signature check');
    });

    it('rejects missing or empty signature', () => {
      const payload = JSON.stringify({ event: 'payment.captured' });
      assert.equal(adapter.verifyWebhookSignature(payload, ''), false);
    });
  });

  describe('2. Strict Doorstep Cash Prohibition', () => {
    let citizenToken: string;
    let vhmcTenantId: string;
    let vhmcBillId: string;

    before(async () => {
      const client = await runtimePool.connect();
      try {
        const { rows: tRows } = await client.query("SELECT id FROM tenants WHERE slug = 'verdant-hills'");
        vhmcTenantId = tRows[0].id;

        const { rows: uRows } = await client.query("SELECT id, mobile_number FROM users WHERE mobile_number = '+919876543213'");
        citizenToken = AuthService.generateToken({
          userId: uRows[0].id,
          mobileNumber: uRows[0].mobile_number,
        });

        await withTenantTransaction(vhmcTenantId, async (txClient) => {
          const { rows: bRows } = await txClient.query(
            "SELECT id FROM bills WHERE tenant_id = $1 AND bill_number = 'BILL-VHMC-2026-03'",
            [vhmcTenantId]
          );
          vhmcBillId = bRows[0].id;
        });
      } finally {
        client.release();
      }
    });

    it('strictly rejects DOORSTEP_CASH paymentMethod via API with HTTP 403', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('X-Tenant-Id', vhmcTenantId)
        .send({
          billId: vhmcBillId,
          paymentMethod: 'DOORSTEP_CASH',
          amountMinorUnits: '15000',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'DOORSTEP_CASH_DISABLED');
      assert.match(res.body.error.message, /Doorstep cash collection is strictly deactivated/);
    });

    it('strictly rejects DOORSTEP_CASH directly via PaymentService', async () => {
      await assert.rejects(
        async () => {
          await PaymentService.createPaymentOrder('user-id', vhmcTenantId, {
            billId: vhmcBillId,
            paymentMethod: 'DOORSTEP_CASH' as any,
            amountMinorUnits: '15000',
          });
        },
        /DOORSTEP_CASH_DISABLED/
      );
    });
  });

  describe('3. Payment Order Creation & Client Idempotency', () => {
    let citizenToken: string;
    let vhmcTenantId: string;
    let vhmcBillId: string;
    let citizenUserId: string;

    before(async () => {
      const client = await runtimePool.connect();
      try {
        const { rows: tRows } = await client.query("SELECT id FROM tenants WHERE slug = 'verdant-hills'");
        vhmcTenantId = tRows[0].id;

        const { rows: uRows } = await client.query("SELECT id, mobile_number FROM users WHERE mobile_number = '+919876543213'");
        citizenUserId = uRows[0].id;
        citizenToken = AuthService.generateToken({
          userId: citizenUserId,
          mobileNumber: uRows[0].mobile_number,
        });

        await withTenantTransaction(vhmcTenantId, async (txClient) => {
          const { rows: bRows } = await txClient.query(
            "SELECT id FROM bills WHERE tenant_id = $1 AND bill_number = 'BILL-VHMC-2026-03'",
            [vhmcTenantId]
          );
          vhmcBillId = bRows[0].id;
        });
      } finally {
        client.release();
      }
    });

    it('rejects zero or negative payment amounts with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('X-Tenant-Id', vhmcTenantId)
        .send({
          billId: vhmcBillId,
          paymentMethod: 'ONLINE_GATEWAY',
          amountMinorUnits: '0',
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_AMOUNT');
    });

    it('rejects overpayment exceeding bill outstanding balance with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('X-Tenant-Id', vhmcTenantId)
        .send({
          billId: vhmcBillId,
          paymentMethod: 'ONLINE_GATEWAY',
          amountMinorUnits: '99999999', // Exceeds 15000 paise bill
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'OVERPAYMENT_NOT_PERMITTED');
    });

    it('successfully creates a PENDING payment order for citizen', async () => {
      const idempotencyKey = `test-order-create-${Date.now()}`;
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('X-Tenant-Id', vhmcTenantId)
        .send({
          billId: vhmcBillId,
          paymentMethod: 'ONLINE_GATEWAY',
          amountMinorUnits: '15000',
          idempotencyKey,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.status, 'SUCCESS');
      assert.equal(res.body.data.payment.status, 'PENDING');
      assert.equal(res.body.data.payment.amount_minor_units, '15000');
      assert.equal(res.body.data.payment.currency, 'INR');
      assert.ok(res.body.data.order.gatewayOrderId.startsWith('order_mock_'));
    });

    it('returns identical payment order upon resubmission with same idempotency key (idempotency guarantee)', async () => {
      const idempotencyKey = `idemp-key-test-${Date.now()}`;
      const payload = {
        billId: vhmcBillId,
        paymentMethod: 'ONLINE_GATEWAY',
        amountMinorUnits: '15000',
        idempotencyKey,
      };

      const res1 = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('X-Tenant-Id', vhmcTenantId)
        .send(payload);

      assert.equal(res1.status, 201);
      const txId1 = res1.body.data.payment.id;
      const orderId1 = res1.body.data.order.gatewayOrderId;

      // Resubmit identical request
      const res2 = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('X-Tenant-Id', vhmcTenantId)
        .send(payload);

      assert.equal(res2.status, 201);
      assert.equal(res2.body.data.payment.id, txId1, 'Must return same payment transaction ID');
      assert.equal(res2.body.data.order.gatewayOrderId, orderId1, 'Must return same gateway order ID');

      // Verify in DB that only 1 record exists with this idempotency key
      await withTenantTransaction(vhmcTenantId, async (txClient) => {
        const { rows } = await txClient.query(
          'SELECT count(*) FROM payment_transactions WHERE tenant_id = $1 AND idempotency_key = $2',
          [vhmcTenantId, idempotencyKey]
        );
        assert.equal(parseInt(rows[0].count, 10), 1, 'Only exactly 1 row must exist for idempotency key');
      });
    });
  });

  describe('4. Webhook Ingestion, Signature Enforcement & State Transitions', () => {
    let vhmcTenantId: string;
    let citizenUserId: string;
    let vhmcBillId: string;
    let paymentTxId: string;
    let gatewayOrderId: string;
    const secret = config.payments.mockWebhookSecret;

    before(async () => {
      const client = await runtimePool.connect();
      try {
        const { rows: tRows } = await client.query("SELECT id FROM tenants WHERE slug = 'verdant-hills'");
        vhmcTenantId = tRows[0].id;

        const { rows: uRows } = await client.query("SELECT id FROM users WHERE mobile_number = '+919876543213'");
        citizenUserId = uRows[0].id;

        // Create a dedicated bill and payment for webhook testing
        await withTenantTransaction(vhmcTenantId, async (txClient) => {
          const { rows: pRows } = await txClient.query(
            "SELECT id FROM properties WHERE tenant_id = $1 AND citizen_user_id = $2 LIMIT 1",
            [vhmcTenantId, citizenUserId]
          );
          const propertyId = pRows[0].id;

          const { rows: bRows } = await txClient.query(
            `INSERT INTO bills (
              tenant_id, property_id, citizen_user_id, bill_number, billing_period_start, billing_period_end,
              amount_due_minor_units, amount_paid_minor_units, status, due_date, is_demo
             ) VALUES ($1, $2, $3, 'BILL-VHMC-HOOK-01', '2026-04-01', '2026-04-30', 20000, 0, 'UNPAID', '2026-05-15', TRUE)
             RETURNING id`,
            [vhmcTenantId, propertyId, citizenUserId]
          );
          vhmcBillId = bRows[0].id;

          const { rows: txRows } = await txClient.query(
            `INSERT INTO payment_transactions (
              tenant_id, bill_id, property_id, citizen_user_id, payment_method, amount_minor_units,
              currency, status, gateway_provider, gateway_order_id, receipt_number, idempotency_key, is_demo
             ) VALUES (
              $1, $2, $3, $4, 'ONLINE_GATEWAY', 20000, 'INR', 'PENDING', 'MOCK_GATEWAY',
              'order_mock_webhook_test_001', 'REC-VHMC-2026-HOOK1', 'idemp-hook-test-001', TRUE
             ) RETURNING id, gateway_order_id`,
            [vhmcTenantId, vhmcBillId, propertyId, citizenUserId]
          );
          paymentTxId = txRows[0].id;
          gatewayOrderId = txRows[0].gateway_order_id;
        });
      } finally {
        client.release();
      }
    });

    it('rejects webhook request without signature with HTTP 401', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/payments/MOCK_GATEWAY')
        .send({
          event: 'payment.captured',
          payload: { order_id: gatewayOrderId },
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_WEBHOOK_SIGNATURE');
    });

    it('rejects webhook request with invalid/tampered signature with HTTP 401', async () => {
      const body = {
        event: 'payment.captured',
        payload: { order_id: gatewayOrderId },
      };

      const res = await request(app)
        .post('/api/v1/webhooks/payments/MOCK_GATEWAY')
        .set('x-mock-signature', 'badsignaturedeadbeef1234567890abcdef')
        .send(body);

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_WEBHOOK_SIGNATURE');
    });

    it('processes authentic PAYMENT_CAPTURED webhook and coordinates state transition and accounting journal', async () => {
      const eventId = `evt_capture_${Date.now()}`;
      const payloadObj = {
        event: 'payment.captured',
        id: eventId,
        created_at: new Date().toISOString(),
        payload: {
          payment: {
            id: `pay_${Date.now()}`,
            order_id: gatewayOrderId,
            amount: 20000,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
          },
        },
      };

      const rawBody = JSON.stringify(payloadObj);
      const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

      const res = await request(app)
        .post('/api/v1/webhooks/payments/MOCK_GATEWAY')
        .set('Content-Type', 'application/json')
        .set('x-mock-signature', signature)
        .send(rawBody);

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'SUCCESS');
      assert.equal(res.body.data.processingStatus, 'PROCESSED');
      assert.equal(res.body.data.paymentStatus, 'SUCCESSFUL');

      // Verify database state under tenant context
      await withTenantTransaction(vhmcTenantId, async (txClient) => {
        // 1. Payment Transaction transitioned to SUCCESSFUL with receipt
        const { rows: txRows } = await txClient.query(
          'SELECT status, receipt_number, gateway_payment_id FROM payment_transactions WHERE id = $1',
          [paymentTxId]
        );
        assert.equal(txRows[0].status, 'SUCCESSFUL');
        assert.ok(txRows[0].receipt_number.startsWith('REC-VHMC-'));
        assert.equal(txRows[0].gateway_payment_id, payloadObj.payload.payment.id);

        // 2. Bill amount_paid updated and status marked PAID
        const { rows: billRows } = await txClient.query(
          'SELECT amount_due_minor_units, amount_paid_minor_units, status FROM bills WHERE id = $1',
          [vhmcBillId]
        );
        assert.equal(billRows[0].amount_paid_minor_units, '20000');
        assert.equal(billRows[0].status, 'PAID');

        // 3. Double-entry Journal Entry posted (Debit 1030, Credit 1040)
        const { rows: jeRows } = await txClient.query(
          `SELECT id, entry_number, status, business_event_type, business_event_id
           FROM journal_entries 
           WHERE tenant_id = $1 AND business_event_id = $2`,
          [vhmcTenantId, paymentTxId]
        );
        assert.equal(jeRows.length, 1, 'Exactly one journal entry must be posted for payment settlement');
        assert.equal(jeRows[0].status, 'POSTED', 'Journal entry must be posted');
        assert.equal(jeRows[0].business_event_type, 'PAYMENT_GATEWAY_SETTLEMENT');

        const { rows: lines } = await txClient.query(
          `SELECT l.line_number, l.entry_type, l.amount_minor_units, c.account_code
           FROM journal_entry_lines l
           JOIN chart_of_accounts c ON l.account_id = c.id
           WHERE l.journal_entry_id = $1
           ORDER BY l.line_number ASC`,
          [jeRows[0].id]
        );
        assert.equal(lines.length, 2, 'Journal entry must have 2 lines');

        // Line 1: Debit 1030 (Payment Gateway Clearing)
        assert.equal(lines[0].entry_type, 'DEBIT');
        assert.equal(lines[0].account_code, '1030');
        assert.equal(lines[0].amount_minor_units, '20000');

        // Line 2: Credit 1040 (Citizen Accounts Receivable)
        assert.equal(lines[1].entry_type, 'CREDIT');
        assert.equal(lines[1].account_code, '1040');
        assert.equal(lines[1].amount_minor_units, '20000');

        // 4. Payment event recorded in append-only audit trail
        const { rows: evRows } = await txClient.query(
          'SELECT gateway_event_id, processing_status, event_type FROM payment_events WHERE gateway_event_id = $1',
          [eventId]
        );
        assert.equal(evRows.length, 1);
        assert.equal(evRows[0].processing_status, 'PROCESSED');
        assert.equal(evRows[0].event_type, 'PAYMENT_CAPTURED');
      });
    });

    it('deduplicates duplicate webhook event safely without re-crediting or re-posting (Idempotent)', async () => {
      // Re-send the EXACT same event as above
      const existingEvents = await withTenantTransaction(vhmcTenantId, async (txClient) => {
        const { rows } = await txClient.query(
          "SELECT gateway_event_id, event_payload FROM payment_events WHERE payment_transaction_id = $1 LIMIT 1",
          [paymentTxId]
        );
        return rows[0];
      });

      const rawBody = JSON.stringify(existingEvents.event_payload);
      const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

      const res = await request(app)
        .post('/api/v1/webhooks/payments/MOCK_GATEWAY')
        .set('Content-Type', 'application/json')
        .set('x-mock-signature', signature)
        .send(rawBody);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.processingStatus, 'DUPLICATE_IGNORED');

      // Verify that NO second journal entry was created
      await withTenantTransaction(vhmcTenantId, async (txClient) => {
        const { rows: jeRows } = await txClient.query(
          `SELECT count(*) FROM journal_entries WHERE tenant_id = $1 AND business_event_id = $2`,
          [vhmcTenantId, paymentTxId]
        );
        assert.equal(parseInt(jeRows[0].count, 10), 1, 'Must still have exactly 1 journal entry');
      });
    });
  });

  describe('5. Out-of-Order & Anomalous Event Handling', () => {
    let vhmcTenantId: string;
    let paymentTxId: string;
    let gatewayOrderId: string;
    const secret = config.payments.mockWebhookSecret;

    before(async () => {
      const client = await runtimePool.connect();
      try {
        const { rows: tRows } = await client.query("SELECT id FROM tenants WHERE slug = 'verdant-hills'");
        vhmcTenantId = tRows[0].id;

        const { rows: uRows } = await client.query("SELECT id FROM users WHERE mobile_number = '+919876543213'");
        const citizenUserId = uRows[0].id;

        // Create a transaction that is already FAILED
        await withTenantTransaction(vhmcTenantId, async (txClient) => {
          const { rows: pRows } = await txClient.query("SELECT id FROM properties WHERE tenant_id = $1 LIMIT 1", [vhmcTenantId]);
          const { rows: bRows } = await txClient.query(
            `INSERT INTO bills (
              tenant_id, property_id, citizen_user_id, bill_number, billing_period_start, billing_period_end,
              amount_due_minor_units, amount_paid_minor_units, status, due_date, is_demo
             ) VALUES ($1, $2, $3, 'BILL-VHMC-ANOMALY-01', '2026-04-01', '2026-04-30', 10000, 0, 'UNPAID', '2026-05-15', TRUE)
             RETURNING id`,
            [vhmcTenantId, pRows[0].id, citizenUserId]
          );

          const { rows: txRows } = await txClient.query(
            `INSERT INTO payment_transactions (
              tenant_id, bill_id, property_id, citizen_user_id, payment_method, amount_minor_units,
              currency, status, gateway_provider, gateway_order_id, receipt_number, idempotency_key, is_demo
             ) VALUES (
              $1, $2, $3, $4, 'ONLINE_GATEWAY', 10000, 'INR', 'FAILED', 'MOCK_GATEWAY',
              'order_mock_anomaly_test_001', 'REC-VHMC-2026-ANOM1', 'idemp-anomaly-test-001', TRUE
             ) RETURNING id, gateway_order_id`,
            [vhmcTenantId, bRows[0].id, pRows[0].id, citizenUserId]
          );
          paymentTxId = txRows[0].id;
          gatewayOrderId = txRows[0].gateway_order_id;
        });
      } finally {
        client.release();
      }
    });

    it('records out-of-order capture on terminal FAILED transaction as ANOMALY_PENDING_REVIEW without corrupting ledger', async () => {
      const anomalyEventId = `evt_anomaly_${Date.now()}`;
      const payloadObj = {
        event: 'payment.captured',
        id: anomalyEventId,
        created_at: new Date().toISOString(),
        payload: {
          payment: {
            id: `pay_anomaly_${Date.now()}`,
            order_id: gatewayOrderId,
            amount: 10000,
            currency: 'INR',
            status: 'captured',
          },
        },
      };

      const rawBody = JSON.stringify(payloadObj);
      const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

      const res = await request(app)
        .post('/api/v1/webhooks/payments/MOCK_GATEWAY')
        .set('Content-Type', 'application/json')
        .set('x-mock-signature', signature)
        .send(rawBody);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.processingStatus, 'ANOMALY_PENDING_REVIEW');

      // Verify that transaction remains FAILED and NO journal entry was posted
      await withTenantTransaction(vhmcTenantId, async (txClient) => {
        const { rows: txRows } = await txClient.query(
          'SELECT status FROM payment_transactions WHERE id = $1',
          [paymentTxId]
        );
        assert.equal(txRows[0].status, 'FAILED', 'Terminal FAILED status must NOT be mutated by late capture');

        const { rows: jeRows } = await txClient.query(
          'SELECT count(*) FROM journal_entries WHERE tenant_id = $1 AND business_event_id = $2',
          [vhmcTenantId, paymentTxId]
        );
        assert.equal(parseInt(jeRows[0].count, 10), 0, 'No journal entry must be posted for anomalous event');

        // Audit log must reflect ANOMALY_PENDING_REVIEW
        const { rows: evRows } = await txClient.query(
          'SELECT processing_status FROM payment_events WHERE gateway_event_id = $1',
          [anomalyEventId]
        );
        assert.equal(evRows[0].processing_status, 'ANOMALY_PENDING_REVIEW');
      });
    });
  });

  describe('6. Refund Processing & Compensating Reversal Journal', () => {
    let vhmcTenantId: string;
    let paymentTxId: string;
    let gatewayOrderId: string;
    let vhmcBillId: string;
    let originalJeId: string;
    const secret = config.payments.mockWebhookSecret;

    before(async () => {
      const client = await runtimePool.connect();
      try {
        const { rows: tRows } = await client.query("SELECT id FROM tenants WHERE slug = 'verdant-hills'");
        vhmcTenantId = tRows[0].id;

        const { rows: uRows } = await client.query("SELECT id FROM users WHERE mobile_number = '+919876543213'");
        const citizenUserId = uRows[0].id;

        // Set up a SUCCESSFUL payment with posted journal entry
        await withTenantTransaction(vhmcTenantId, async (txClient) => {
          const { rows: pRows } = await txClient.query("SELECT id FROM properties WHERE tenant_id = $1 LIMIT 1", [vhmcTenantId]);
          const { rows: bRows } = await txClient.query(
            `INSERT INTO bills (
              tenant_id, property_id, citizen_user_id, bill_number, billing_period_start, billing_period_end,
              amount_due_minor_units, amount_paid_minor_units, status, due_date, is_demo
             ) VALUES ($1, $2, $3, 'BILL-VHMC-REFUND-01', '2026-04-01', '2026-04-30', 18000, 18000, 'PAID', '2026-05-15', TRUE)
             RETURNING id`,
            [vhmcTenantId, pRows[0].id, citizenUserId]
          );
          vhmcBillId = bRows[0].id;

          const { rows: txRows } = await txClient.query(
            `INSERT INTO payment_transactions (
              tenant_id, bill_id, property_id, citizen_user_id, payment_method, amount_minor_units,
              currency, status, gateway_provider, gateway_order_id, gateway_payment_id, receipt_number, idempotency_key, is_demo
             ) VALUES (
              $1, $2, $3, $4, 'ONLINE_GATEWAY', 18000, 'INR', 'SUCCESSFUL', 'MOCK_GATEWAY',
              'order_mock_refund_test_001', 'pay_refund_src_001', 'REC-VHMC-2026-REF1', 'idemp-refund-test-001', TRUE
             ) RETURNING id, gateway_order_id`,
            [vhmcTenantId, vhmcBillId, pRows[0].id, citizenUserId]
          );
          paymentTxId = txRows[0].id;
          gatewayOrderId = txRows[0].gateway_order_id;

          // Post original settlement journal
          const { rows: coaRows } = await txClient.query(
            "SELECT id, account_code FROM chart_of_accounts WHERE tenant_id = $1 AND account_code IN ('1030', '1040')",
            [vhmcTenantId]
          );
          const coa1030 = coaRows.find((r) => r.account_code === '1030')!.id;
          const coa1040 = coaRows.find((r) => r.account_code === '1040')!.id;

          const { rows: jeRows } = await txClient.query(
            `INSERT INTO journal_entries (
              tenant_id, entry_number, posting_date, status, business_event_type, business_event_id,
              currency, description, is_demo
             ) VALUES ($1, 'JE-VHMC-PAY-TEST-001', CURRENT_DATE, 'DRAFT', 'PAYMENT_GATEWAY_SETTLEMENT', $2, 'INR', 'Settlement', TRUE)
             RETURNING id`,
            [vhmcTenantId, paymentTxId]
          );
          originalJeId = jeRows[0].id;

          await txClient.query(
            `INSERT INTO journal_entry_lines (journal_entry_id, tenant_id, line_number, account_id, entry_type, amount_minor_units, currency, is_demo)
             VALUES ($1, $2, 1, $3, 'DEBIT', 18000, 'INR', TRUE), ($1, $2, 2, $4, 'CREDIT', 18000, 'INR', TRUE)`,
            [originalJeId, vhmcTenantId, coa1030, coa1040]
          );

          await txClient.query(
            "UPDATE journal_entries SET status = 'POSTED', posted_at = CURRENT_TIMESTAMP WHERE id = $1",
            [originalJeId]
          );
        });
      } finally {
        client.release();
      }
    });

    it('processes REFUND_PROCESSED webhook, transitions status to REFUNDED, and posts compensating reversal entry', async () => {
      const refundEventId = `evt_refund_${Date.now()}`;
      const payloadObj = {
        event: 'refund.processed',
        id: refundEventId,
        created_at: new Date().toISOString(),
        payload: {
          refund: {
            id: `rfnd_${Date.now()}`,
            payment_id: 'pay_refund_src_001',
            amount: 18000,
            currency: 'INR',
            status: 'processed',
          },
        },
      };

      const rawBody = JSON.stringify(payloadObj);
      const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

      const res = await request(app)
        .post('/api/v1/webhooks/payments/MOCK_GATEWAY')
        .set('Content-Type', 'application/json')
        .set('x-mock-signature', signature)
        .send(rawBody);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.processingStatus, 'PROCESSED');
      assert.equal(res.body.data.paymentStatus, 'REFUNDED');

      // Verify DB updates
      await withTenantTransaction(vhmcTenantId, async (txClient) => {
        // 1. Payment status is REFUNDED
        const { rows: txRows } = await txClient.query(
          'SELECT status FROM payment_transactions WHERE id = $1',
          [paymentTxId]
        );
        assert.equal(txRows[0].status, 'REFUNDED');

        // 2. Bill amount_paid reduced back to 0
        const { rows: billRows } = await txClient.query(
          'SELECT amount_paid_minor_units, status FROM bills WHERE id = $1',
          [vhmcBillId]
        );
        assert.equal(billRows[0].amount_paid_minor_units, '0');
        assert.equal(billRows[0].status, 'UNPAID');

        // 3. Original journal entry is UNTOUCHED and still POSTED (immutability preserved)
        const { rows: origJe } = await txClient.query(
          'SELECT status FROM journal_entries WHERE id = $1',
          [originalJeId]
        );
        assert.equal(origJe[0].status, 'POSTED', 'Original journal entry must remain POSTED and immutable');

        // 4. A separate compensating reversal journal entry is posted (Debit 1040, Credit 1030)
        const { rows: revJe } = await txClient.query(
          `SELECT id, status, business_event_type 
           FROM journal_entries 
           WHERE tenant_id = $1 AND business_event_type = 'PAYMENT_GATEWAY_REFUND' AND business_event_id = $2`,
          [vhmcTenantId, paymentTxId]
        );
        assert.equal(revJe.length, 1, 'Compensating reversal journal entry must be posted');
        assert.equal(revJe[0].status, 'POSTED');

        const { rows: revLines } = await txClient.query(
          `SELECT l.entry_type, l.amount_minor_units, c.account_code
           FROM journal_entry_lines l
           JOIN chart_of_accounts c ON l.account_id = c.id
           WHERE l.journal_entry_id = $1
           ORDER BY l.line_number ASC`,
          [revJe[0].id]
        );
        assert.equal(revLines.length, 2);

        // Reversal Line 1: Debit 1040 (Accounts Receivable reinstated)
        assert.equal(revLines[0].entry_type, 'DEBIT');
        assert.equal(revLines[0].account_code, '1040');
        assert.equal(revLines[0].amount_minor_units, '18000');

        // Reversal Line 2: Credit 1030 (Clearing account credited)
        assert.equal(revLines[1].entry_type, 'CREDIT');
        assert.equal(revLines[1].account_code, '1030');
        assert.equal(revLines[1].amount_minor_units, '18000');
      });
    });
  });

  describe('7. Citizen Payment API, Object-Level Authorization & Cross-Tenant Boundaries', () => {
    let citizen1Token: string;
    let citizen2Token: string;
    let vhmcTenantId: string;
    let onpTenantId: string;
    let vhmcCitizenUserId: string;
    let onpCitizenUserId: string;
    let vhmcBillId: string;
    let onpBillId: string;

    before(async () => {
      const client = await runtimePool.connect();
      try {
        const { rows: tRows } = await client.query("SELECT id, slug FROM tenants ORDER BY slug ASC");
        vhmcTenantId = tRows.find((r) => r.slug === 'verdant-hills')!.id;
        onpTenantId = tRows.find((r) => r.slug === 'oceanfront-np')!.id;

        const { rows: uRows } = await client.query(
          "SELECT id, mobile_number FROM users WHERE mobile_number IN ('+919876543213', '+919876543214')"
        );
        const u1 = uRows.find((r) => r.mobile_number === '+919876543213')!;
        const u2 = uRows.find((r) => r.mobile_number === '+919876543214')!;

        vhmcCitizenUserId = u1.id;
        onpCitizenUserId = u2.id;

        citizen1Token = AuthService.generateToken({ userId: u1.id, mobileNumber: u1.mobile_number });
        citizen2Token = AuthService.generateToken({ userId: u2.id, mobileNumber: u2.mobile_number });

        await withTenantTransaction(vhmcTenantId, async (txClient) => {
          const { rows } = await txClient.query(
            "SELECT id FROM bills WHERE tenant_id = $1 AND citizen_user_id = $2 LIMIT 1",
            [vhmcTenantId, vhmcCitizenUserId]
          );
          vhmcBillId = rows[0]?.id;
        });

        await withTenantTransaction(onpTenantId, async (txClient) => {
          const { rows } = await txClient.query(
            "SELECT id FROM bills WHERE tenant_id = $1 AND citizen_user_id = $2 LIMIT 1",
            [onpTenantId, onpCitizenUserId]
          );
          onpBillId = rows[0]?.id;
        });
      } finally {
        client.release();
      }
    });

    it('lists bills strictly belonging to authenticated citizen', async () => {
      const res = await request(app)
        .get('/api/v1/payments/bills')
        .set('Authorization', `Bearer ${citizen1Token}`)
        .set('X-Tenant-Id', vhmcTenantId);

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'SUCCESS');
      assert.ok(Array.isArray(res.body.data.bills));
      for (const bill of res.body.data.bills) {
        assert.equal(bill.citizen_user_id, vhmcCitizenUserId, 'Returned bills must belong to authenticated citizen');
      }
    });

    it('rejects cross-tenant bill payment: Citizen 2 (ONP) cannot pay Citizen 1 (VHMC) bill', async () => {
      // Citizen 2 authenticated in ONP attempting to pay VHMC bill
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${citizen2Token}`)
        .set('X-Tenant-Id', onpTenantId)
        .send({
          billId: vhmcBillId,
          paymentMethod: 'ONLINE_GATEWAY',
          amountMinorUnits: '15000',
        });

      // Bill does not exist in ONP tenant or belong to Citizen 2 -> HTTP 404 or 403
      assert.ok(res.status === 404 || res.status === 403);
    });

    it('rejects cross-tenant context forgery: Citizen 1 (VHMC) attempting to request ONP tenant header', async () => {
      const res = await request(app)
        .get('/api/v1/payments/bills')
        .set('Authorization', `Bearer ${citizen1Token}`)
        .set('X-Tenant-Id', onpTenantId); // Citizen 1 has NO membership in ONP

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN_TENANT_ACCESS');
    });

    it('verifies PostgreSQL RLS directly on payments tables under runtime role waste_app_user', async () => {
      const client = await runtimePool.connect();
      try {
        // Verify current role is waste_app_user
        const { rows: uRows } = await client.query('SELECT current_user');
        assert.equal(uRows[0].current_user, 'waste_app_user');

        // 1. Without tenant context set, queries must return 0 rows
        await client.query("SELECT set_config('app.current_tenant_id', '', true)");
        const { rows: noContextBills } = await client.query('SELECT * FROM bills');
        const { rows: noContextTx } = await client.query('SELECT * FROM payment_transactions');
        const { rows: noContextEv } = await client.query('SELECT * FROM payment_events');

        assert.equal(noContextBills.length, 0, 'Un-tenanted query to bills must return 0 rows under RLS');
        assert.equal(noContextTx.length, 0, 'Un-tenanted query to payment_transactions must return 0 rows under RLS');
        assert.equal(noContextEv.length, 0, 'Un-tenanted query to payment_events must return 0 rows under RLS');

        // 2. With Tenant 1 context, Tenant 2 records are completely invisible
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [vhmcTenantId]);
        const { rows: t1Bills } = await client.query('SELECT * FROM bills WHERE tenant_id = $1', [onpTenantId]);
        assert.equal(t1Bills.length, 0, 'Tenant 1 context must see 0 rows belonging to Tenant 2');

        // 3. Direct cross-tenant insert attempt fails under RLS
        await assert.rejects(
          async () => {
            await client.query(
              `INSERT INTO bills (
                tenant_id, property_id, bill_number, billing_period_start, billing_period_end,
                amount_due_minor_units, amount_paid_minor_units, status, due_date
               ) VALUES ($1, '00000000-0000-0000-0000-000000000000', 'ROGUE-BILL-01', CURRENT_DATE, CURRENT_DATE, 1000, 0, 'UNPAID', CURRENT_DATE)`,
              [onpTenantId] // Attempting to insert into ONP while tenant context is VHMC
            );
          },
          /row-level security policy/,
          'RLS must block cross-tenant insert'
        );
      } finally {
        await client.query("SELECT set_config('app.current_tenant_id', '', true)");
        client.release();
      }
    });
  });
});
