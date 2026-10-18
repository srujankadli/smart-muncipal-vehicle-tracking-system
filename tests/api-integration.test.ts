import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app';
import { AuthService } from '../src/services/auth.service';

describe('API Integration & Authorization Endpoints', () => {
  it('GET /health returns 200 and unconfirmed policy statuses', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'UP');
    assert.equal(res.body.policies.doorstepCashEnabled, false);
    assert.equal(res.body.policies.taxPolicyConfirmed, false);
    assert.equal(res.body.policies.accountingPolicyConfirmed, false);
  });

  it('GET /api/v1/auth/me rejects requests without bearer token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    assert.ok(res.body.error.message);
  });

  it('GET /api/v1/auth/me rejects requests with invalid bearer token with 401', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid.token.payload');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
  });

  it('POST /api/v1/auth/login rejects empty payload with 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS_PAYLOAD');
  });

  it('GET /api/v1/tenants/current rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/tenants/current');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  });

  it('GET /api/v1/tenants/current rejects authenticated user without verified tenant membership with 403', async () => {
    // Generate valid JWT for a user ID that does not exist in the database or has no membership
    const unassignedUserToken = AuthService.generateToken({
      userId: '99999999-9999-9999-9999-999999999999',
      mobileNumber: '+919999999999',
    });

    const res = await request(app)
      .get('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${unassignedUserToken}`)
      .set('X-Tenant-Id', '11111111-1111-1111-1111-111111111111');

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN_TENANT_ACCESS');
  });

  it('POST /api/v1/accounting/journals rejects unauthenticated journal creation with 401', async () => {
    const res = await request(app).post('/api/v1/accounting/journals').send({
      postingDate: '2026-03-01',
      businessEventType: 'TEST',
      businessEventId: '123',
      description: 'Test',
      lines: [],
    });
    assert.equal(res.status, 401);
  });
});
