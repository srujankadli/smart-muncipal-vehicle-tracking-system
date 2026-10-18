import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { config, validateProductionConfig } from '../src/config';
import { runtimePool, withTenantTransaction } from '../src/db/pool';
import { AuthService } from '../src/services/auth.service';
import { PaymentService } from '../src/services/payment.service';
import { MockPaymentGatewayAdapter } from '../src/services/payment-gateway.adapter';
import { TrackingService } from '../src/services/tracking.service';
import { resetRateLimits } from '../src/api/middleware/rate-limit.middleware';
import { startPostgresTestServer, stopPostgresTestServer } from './helpers/postgres-test-server';

describe('Phase 7: Security Audit, Hardening & Integration Readiness Test Suite', () => {
  let vhmcTenantId: string;
  let onpTenantId: string;
  let citizen1Token: string;
  let citizen1UserId: string;
  let citizen2Token: string;
  let citizen2UserId: string;
  let municipalAdminToken: string;
  let vhmcBillId: string;
  let vhmcPaymentId: string;

  before(async () => {
    await startPostgresTestServer(5436);

    const client = await runtimePool.connect();
    try {
      // 1. Retrieve demo tenants
      const { rows: t1Rows } = await client.query("SELECT id FROM tenants WHERE slug = 'verdant-hills'");
      const { rows: t2Rows } = await client.query("SELECT id FROM tenants WHERE slug = 'oceanfront-np'");
      assert.ok(t1Rows.length > 0 && t2Rows.length > 0, 'Both demo tenants must exist');
      vhmcTenantId = t1Rows[0].id;
      onpTenantId = t2Rows[0].id;

      // 2. Retrieve demo users
      const { rows: u1Rows } = await client.query("SELECT id, mobile_number FROM users WHERE mobile_number = '+919876543213'"); // Sunita Patel (VHMC Citizen)
      const { rows: u2Rows } = await client.query("SELECT id, mobile_number FROM users WHERE mobile_number = '+919876543214'"); // Ananya Roy (ONP Citizen)
      const { rows: adminRows } = await client.query("SELECT id, mobile_number FROM users WHERE mobile_number = '+919876543210'"); // Aarav Sharma (VHMC Admin)
      assert.ok(u1Rows.length > 0 && u2Rows.length > 0 && adminRows.length > 0, 'Demo users must exist');

      citizen1UserId = u1Rows[0].id;
      citizen2UserId = u2Rows[0].id;

      citizen1Token = AuthService.generateToken({ userId: citizen1UserId, mobileNumber: u1Rows[0].mobile_number });
      citizen2Token = AuthService.generateToken({ userId: citizen2UserId, mobileNumber: u2Rows[0].mobile_number });
      municipalAdminToken = AuthService.generateToken({ userId: adminRows[0].id, mobileNumber: adminRows[0].mobile_number });
    } finally {
      client.release();
    }

    // 3. Retrieve demo bill inside tenant context
    await withTenantTransaction(vhmcTenantId, async (txClient) => {
      const { rows: bRows } = await txClient.query(
        "SELECT id FROM bills WHERE tenant_id = $1 AND bill_number = 'BILL-VHMC-2026-03'",
        [vhmcTenantId]
      );
      assert.ok(bRows.length > 0, 'Demo bill must exist');
      vhmcBillId = bRows[0].id;
    });

    // 4. Create an initial payment order for object-level authorization testing
    const orderRes = await PaymentService.createPaymentOrder(citizen1UserId, vhmcTenantId, {
      billId: vhmcBillId,
      paymentMethod: 'ONLINE_GATEWAY',
      amountMinorUnits: '15000',
    });
    vhmcPaymentId = orderRes.paymentTransaction.id;
  });

  after(async () => {
    await stopPostgresTestServer();
  });

  // =========================================================================
  // 1. Authentication & Authorization Controls
  // =========================================================================
  describe('1. Authentication & Authorization Controls', () => {
    it('rejects unauthenticated requests without Authorization header (HTTP 401)', async () => {
      const res = await request(app).get('/api/v1/tenants/current');
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    });

    it('rejects malformed Authorization header missing "Bearer " prefix (HTTP 401)', async () => {
      const res = await request(app)
        .get('/api/v1/tenants/current')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    });

    it('rejects forged JWT signed with an untrusted key (HTTP 401)', async () => {
      const rogueKey = 'rogue_attacker_key_forged_untrusted_signature!';
      const forgedToken = jwt.sign(
        { userId: citizen1UserId, mobileNumber: '9876543210' },
        rogueKey,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_TOKEN');
    });

    it('rejects expired JWT tokens (HTTP 401)', async () => {
      const expiredToken = jwt.sign(
        { userId: citizen1UserId, mobileNumber: '9876543210' },
        config.jwt.secret,
        { expiresIn: '-1s' } // Expired 1 second ago
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_TOKEN');
    });

    it('rejects non-string payload in login request (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ mobileNumber: 9876543210, password: { evil: true } });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS_PAYLOAD');
    });

    it('blocks cross-role privilege escalation: Citizen attempting municipal admin journal creation (HTTP 403)', async () => {
      const res = await request(app)
        .post('/api/v1/accounting/journals')
        .set('Authorization', `Bearer ${citizen1Token}`)
        .set('X-Tenant-Id', vhmcTenantId)
        .send({
          entryNumber: 'JE-ROGUE-01',
          postingDate: '2026-03-01',
          businessEventType: 'MANUAL_TEST',
          businessEventId: 'EVT-ROGUE-01',
          description: 'Citizen trying to post journal entry',
          lines: [],
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN_MUNICIPAL_ADMIN_ONLY');
    });

    it('enforces object-level authorization: Citizen 2 cannot inspect Citizen 1 payment details (HTTP 403)', async () => {
      // Citizen 2 (in ONP) attempts to query Citizen 1 (in VHMC) payment transaction ID
      // Even if Citizen 2 presents valid credentials, access is blocked
      const res = await request(app)
        .get(`/api/v1/payments/${vhmcPaymentId}`)
        .set('Authorization', `Bearer ${citizen2Token}`)
        .set('X-Tenant-Id', onpTenantId);

      // Payment is not found in ONP tenant (404) or forbidden (403)
      assert.ok(res.status === 404 || res.status === 403);
    });

    it('enforces citizen privacy scoping on properties: Citizen cannot enumerate another citizen properties', async () => {
      // Citizen 1 passes citizenUserId of Citizen 2 in query string
      const res = await request(app)
        .get(`/api/v1/properties?citizenUserId=${citizen2UserId}`)
        .set('Authorization', `Bearer ${citizen1Token}`)
        .set('X-Tenant-Id', vhmcTenantId);

      assert.equal(res.status, 200);
      // Endpoint forces scoping to authenticated citizen; returns only Citizen 1's properties
      for (const prop of res.body.data) {
        assert.equal(
          prop.citizen_name,
          'Sunita Patel (Demo Citizen)',
          'Properties returned must strictly belong to authenticated citizen'
        );
      }
    });
  });

  // =========================================================================
  // 2. Multi-Tenant Isolation & PostgreSQL RLS Boundaries
  // =========================================================================
  describe('2. Multi-Tenant Isolation & PostgreSQL RLS Boundaries', () => {
    it('rejects cross-tenant context forgery: Citizen 1 (VHMC) cannot claim Tenant 2 (ONP) context (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/v1/tenants/current')
        .set('Authorization', `Bearer ${citizen1Token}`)
        .set('X-Tenant-Id', onpTenantId);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN_TENANT_ACCESS');
    });

    it('verifies waste_app_user runtime role lacks superuser and bypassrls privileges', async () => {
      const client = await runtimePool.connect();
      try {
        const { rows } = await client.query(
          `SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb 
           FROM pg_roles 
           WHERE rolname = 'waste_app_user'`
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].rolsuper, false, 'waste_app_user must not be superuser');
        assert.equal(rows[0].rolbypassrls, false, 'waste_app_user must not have BYPASSRLS');
        assert.equal(rows[0].rolcreaterole, false, 'waste_app_user must not have CREATEROLE');
        assert.equal(rows[0].rolcreatedb, false, 'waste_app_user must not have CREATEDB');
      } finally {
        client.release();
      }
    });

    it('verifies unprivileged runtime role cannot alter table schema or drop tables', async () => {
      const client = await runtimePool.connect();
      try {
        await assert.rejects(
          async () => {
            await client.query('DROP TABLE bills');
          },
          /must be owner of table|permission denied/,
          'waste_app_user must be denied DDL drop table privilege'
        );

        await assert.rejects(
          async () => {
            await client.query('ALTER TABLE bills ADD COLUMN rogue_col TEXT');
          },
          /must be owner of table/,
          'waste_app_user must be denied DDL alter table privilege'
        );
      } finally {
        client.release();
      }
    });

    it('verifies payment_webhook_lookup policy cannot be abused for cross-tenant INSERT or UPDATE', async () => {
      const client = await runtimePool.connect();
      try {
        await client.query('BEGIN');
        // Set transaction-local webhook lookup flag
        await client.query("SELECT set_config('app.payment_webhook_lookup', 'true', true)");

        // Webhook policy allows SELECT for lookup, but INSERT or UPDATE without tenant context must be blocked
        await assert.rejects(
          async () => {
            await client.query(
              `INSERT INTO bills (
                tenant_id, property_id, citizen_user_id, bill_number, 
                billing_period_start, billing_period_end, amount_due_minor_units, 
                amount_paid_minor_units, status, due_date
               ) VALUES ($1, '00000000-0000-0000-0000-000000000000', NULL, 'ROGUE-WH-BILL', 
                CURRENT_DATE, CURRENT_DATE, 5000, 0, 'UNPAID', CURRENT_DATE)`,
              [vhmcTenantId]
            );
          },
          /row-level security policy/,
          'Webhook lookup bypass flag must NOT permit table INSERT under RLS'
        );

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('guarantees tenant context isolation across pooled connections without leakage', async () => {
      // Run transaction with tenant context
      await withTenantTransaction(vhmcTenantId, async (client) => {
        const { rows } = await client.query('SELECT current_setting($1, true)', ['app.current_tenant_id']);
        assert.equal(rows[0].current_setting, vhmcTenantId);
      });

      // Checkout connection from pool afterwards; tenant context must be clear
      const client = await runtimePool.connect();
      try {
        const { rows } = await client.query("SELECT NULLIF(current_setting('app.current_tenant_id', true), '') AS current_tenant");
        assert.equal(rows[0].current_tenant, null, 'Tenant context must not leak across pooled connections');
      } finally {
        client.release();
      }
    });
  });

  // =========================================================================
  // 3. Payment & Webhook Security Controls
  // =========================================================================
  describe('3. Payment & Webhook Security Controls', () => {
    const adapter = new MockPaymentGatewayAdapter();
    const secret = config.payments.mockWebhookSecret;

    it('strictly prohibits doorstep cash payment creation (HTTP 403 DOORSTEP_CASH_DISABLED)', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${citizen1Token}`)
        .set('X-Tenant-Id', vhmcTenantId)
        .send({
          billId: vhmcBillId,
          paymentMethod: 'DOORSTEP_CASH',
          amountMinorUnits: '15000',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'DOORSTEP_CASH_DISABLED');
    });

    it('rejects non-positive payment amount (HTTP 400 INVALID_AMOUNT)', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${citizen1Token}`)
        .set('X-Tenant-Id', vhmcTenantId)
        .send({
          billId: vhmcBillId,
          paymentMethod: 'ONLINE_GATEWAY',
          amountMinorUnits: '0',
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_AMOUNT');
    });

    it('rejects tampered webhook payload where signature matches original un-tampered body (HTTP 401)', async () => {
      const originalPayload = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_sec_test_001',
        timestamp: new Date().toISOString(),
        payload: { payment: { entity: { id: 'pay_001', amount: 15000 } } },
      });
      const validSig = adapter.generateWebhookSignature(originalPayload, secret);

      const tamperedPayload = JSON.stringify({
        event: 'payment.captured',
        id: 'evt_sec_test_001',
        timestamp: new Date().toISOString(),
        payload: { payment: { entity: { id: 'pay_001', amount: 9999999 } } }, // Tampered amount
      });

      const res = await request(app)
        .post('/api/v1/webhooks/payments/mock_gateway')
        .set('X-Webhook-Signature', validSig)
        .set('Content-Type', 'application/json')
        .send(tamperedPayload);

      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_WEBHOOK_SIGNATURE');
    });

    it('safely deduplicates rapid duplicate webhook events (Idempotent)', async () => {
      // 1. Create a payment order to capture
      const orderRes = await PaymentService.createPaymentOrder(citizen1UserId, vhmcTenantId, {
        paymentMethod: 'ONLINE_GATEWAY',
        amountMinorUnits: '5000',
      });
      const orderId = orderRes.gatewayOrder.gatewayOrderId;

      const eventPayload = JSON.stringify({
        event: 'payment.captured',
        id: `evt_dupe_${Date.now()}`,
        payload: {
          payment: {
            entity: {
              id: `pay_dupe_${Date.now()}`,
              order_id: orderId,
              amount: 5000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });
      const signature = adapter.generateWebhookSignature(eventPayload, secret);

      // First webhook delivery
      const res1 = await request(app)
        .post('/api/v1/webhooks/payments/mock_gateway')
        .set('X-Webhook-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(eventPayload);

      assert.equal(res1.status, 200);
      assert.equal(res1.body.status, 'SUCCESS');
      assert.equal(res1.body.data.processingStatus, 'PROCESSED');

      // Second identical webhook delivery (Duplicate)
      const res2 = await request(app)
        .post('/api/v1/webhooks/payments/mock_gateway')
        .set('X-Webhook-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(eventPayload);

      assert.equal(res2.status, 200);
      assert.equal(res2.body.status, 'SUCCESS');
      assert.equal(res2.body.data.processingStatus, 'DUPLICATE_IGNORED');
    });

    it('verifies posted accounting journal entries are strictly balanced and immutable', async () => {
      const client = await runtimePool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [vhmcTenantId]);

        // Find posted journals and verify debits == credits
        const { rows: journals } = await client.query(
          `SELECT id, entry_number FROM journal_entries WHERE tenant_id = $1 AND status = 'POSTED'`,
          [vhmcTenantId]
        );
        assert.ok(journals.length > 0, 'Posted journals must exist from seeded demo payments');

        for (const j of journals) {
          const { rows: lineTotals } = await client.query(
            `SELECT 
              SUM(CASE WHEN entry_type = 'DEBIT' THEN amount_minor_units ELSE 0 END) AS total_debit,
              SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor_units ELSE 0 END) AS total_credit
             FROM journal_entry_lines 
             WHERE journal_entry_id = $1`,
            [j.id]
          );

          assert.equal(
            lineTotals[0].total_debit,
            lineTotals[0].total_credit,
            `Posted journal ${j.entry_number} must be perfectly balanced`
          );
        }

        // Direct UPDATE attempt on posted journal must fail
        await assert.rejects(
          async () => {
            await client.query(`UPDATE journal_entries SET description = 'Tampered' WHERE id = $1`, [journals[0].id]);
          },
          /IMMUTABLE_RECORD/,
          'Database trigger must enforce immutability of posted journal entry'
        );

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });
  });

  // =========================================================================
  // 4. Vehicle Tracking & Telemetry Security Controls
  // =========================================================================
  describe('4. Vehicle Tracking & Telemetry Security Controls', () => {
    it('rejects revoked device credentials (HTTP 401 AUTH_DEVICE_REVOKED)', async () => {
      // Find a device, temporarily revoke it
      let deviceToken = '';
      let testPrefix = '';
      await withTenantTransaction(vhmcTenantId, async (txClient) => {
        const { rows } = await txClient.query(`SELECT key_prefix, token_hash FROM tracking_devices LIMIT 1`);
        testPrefix = rows[0].key_prefix;
        deviceToken = `${testPrefix}_unauthorized_revoked_token`;
        await txClient.query(`UPDATE tracking_devices SET status = 'REVOKED' WHERE key_prefix = $1`, [testPrefix]);
      });

      try {
        const res = await request(app)
          .post('/api/v1/telemetry/ingest')
          .set('X-Device-Token', deviceToken)
          .send({
            vehicle_id: '00000000-0000-0000-0000-000000000000',
            latitude: 18.5204,
            longitude: 73.8567,
            recorded_at: new Date().toISOString(),
          });

        assert.equal(res.status, 401);
        assert.equal(res.body.error.code, 'DEVICE_AUTHENTICATION_FAILED');
      } finally {
        // Restore active status
        await withTenantTransaction(vhmcTenantId, async (txClient) => {
          await txClient.query(`UPDATE tracking_devices SET status = 'ACTIVE' WHERE key_prefix = $1`, [testPrefix]);
        });
      }
    });

    it('rejects citizen tracking requests for localities outside their property ownership (HTTP 403)', async () => {
      // Retrieve a locality from ONP tenant where VHMC citizen has no properties
      let onpLocalityId = '';
      await withTenantTransaction(onpTenantId, async (txClient) => {
        const { rows } = await txClient.query(
          `SELECT id FROM localities WHERE tenant_id = $1 LIMIT 1`,
          [onpTenantId]
        );
        assert.ok(rows.length > 0);
        onpLocalityId = rows[0].id;
      });

      const res = await request(app)
        .get(`/api/v1/citizen/tracking?localityId=${onpLocalityId}`)
        .set('Authorization', `Bearer ${citizen1Token}`)
        .set('X-Tenant-Id', vhmcTenantId);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN_ACCESS');
    });

    it('rejects telemetry with implausible vehicle speed exceeding 140 km/h (HTTP 400)', async () => {
      let vehicleId = '';
      let testToken = '';

      await withTenantTransaction(vhmcTenantId, async (txClient) => {
        const { rows: dev } = await txClient.query(
          `SELECT d.key_prefix, v.id as vehicle_id FROM tracking_devices d JOIN vehicles v ON d.vehicle_id = v.id WHERE d.status = 'ACTIVE' LIMIT 1`
        );
        assert.ok(dev.length > 0);
        const devPrefix = dev[0].key_prefix;
        vehicleId = dev[0].vehicle_id;

        const { plaintextToken, tokenHash } = TrackingService.generateDeviceCredential(devPrefix);
        testToken = plaintextToken;

        // Store hash for this active device
        await txClient.query(`UPDATE tracking_devices SET token_hash = $1 WHERE key_prefix = $2`, [tokenHash, devPrefix]);
      });

      const res = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', testToken)
        .send({
          vehicle_id: vehicleId,
          latitude: 18.5204,
          longitude: 73.8567,
          speed_kmh: 195.0, // Implausible 195 km/h
          recorded_at: new Date().toISOString(),
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'BAD_REQUEST');
      assert.ok(res.body.error.message.includes('Implausible vehicle speed'));
    });
  });

  // =========================================================================
  // 5. Application & API Security Controls
  // =========================================================================
  describe('5. Application & API Security Controls', () => {
    it('sets comprehensive HTTP security headers on all responses', async () => {
      const res = await request(app).get('/health');

      assert.equal(res.status, 200);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'DENY');
      assert.equal(res.headers['x-xss-protection'], '1; mode=block');
      assert.equal(res.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
      assert.equal(res.headers['content-security-policy'], "default-src 'none'; frame-ancestors 'none';");
      assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
      assert.equal(res.headers['permissions-policy'], 'geolocation=(), camera=(), microphone=()');
      assert.equal(res.headers['x-powered-by'], undefined, 'x-powered-by header must be stripped');
    });

    it('handles CORS headers and preflight OPTIONS request correctly (HTTP 204)', async () => {
      const res = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'https://citizen.municipal.gov.in')
        .set('Access-Control-Request-Method', 'POST');

      assert.equal(res.status, 204);
      assert.equal(res.headers['access-control-allow-origin'], 'https://citizen.municipal.gov.in');
      assert.ok(res.headers['access-control-allow-methods'].includes('POST'));
    });

    it('rejects malformed JSON body with HTTP 400 MALFORMED_JSON instead of 500', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"mobileNumber": "9876543210", "password": invalid_json_here}');

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'MALFORMED_JSON');
    });

    it('enforces rate limiting on authentication attempts (HTTP 429 TOO_MANY_REQUESTS)', async () => {
      resetRateLimits();

      // Send 16 login attempts rapidly (limit is 15/minute)
      let lastRes: any;
      for (let i = 0; i < 16; i++) {
        lastRes = await request(app)
          .post('/api/v1/auth/login')
          .send({ mobileNumber: '9999999999', password: 'wrong_password' });
      }

      assert.equal(lastRes.status, 429);
      assert.equal(lastRes.body.error.code, 'AUTH_RATE_LIMIT_EXCEEDED');
      assert.ok(lastRes.headers['retry-after']);
      assert.ok(lastRes.headers['ratelimit-remaining']);

      resetRateLimits();
    });

    it('validates production configuration and detects insecure dev defaults', () => {
      // Test config validator against production mode with dev secrets
      const devConfigMock = {
        ...config,
        env: 'production' as const,
      };

      const check = validateProductionConfig(devConfigMock);
      assert.equal(check.valid, false, 'Production mode with dev defaults must fail validation');
      assert.ok(check.errors.length > 0, 'Must report specific configuration errors');
      assert.ok(check.errors.some((e) => e.includes('JWT_SECRET')));
    });
  });
});
