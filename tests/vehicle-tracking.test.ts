import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app';
import { runtimePool, withTenantTransaction } from '../src/db/pool';
import { TrackingService } from '../src/services/tracking.service';
import { AuthService } from '../src/services/auth.service';
import { startPostgresTestServer, stopPostgresTestServer } from './helpers/postgres-test-server';

describe('Phase 5: Secure Vehicle Tracking & Telemetry Ingestion Tests', () => {
  before(async () => {
    await startPostgresTestServer(5434);
  });

  after(async () => {
    await stopPostgresTestServer();
  });

  describe('1. Location Freshness & Shift Lifecycle Invariants', () => {
    it('evaluates current freshness for position recorded <= 60 seconds ago on ACTIVE shift', () => {
      const recordedAt = new Date(Date.now() - 30 * 1000); // 30s ago
      const { freshness, elapsedSeconds } = TrackingService.calculateFreshness(recordedAt, 'ACTIVE');
      assert.equal(freshness, 'CURRENT');
      assert.ok(elapsedSeconds >= 29 && elapsedSeconds <= 31);
    });

    it('evaluates stale freshness for position recorded between 61 and 300 seconds ago on ACTIVE shift', () => {
      const recordedAt = new Date(Date.now() - 150 * 1000); // 150s ago
      const { freshness, elapsedSeconds } = TrackingService.calculateFreshness(recordedAt, 'ACTIVE');
      assert.equal(freshness, 'STALE');
      assert.ok(elapsedSeconds >= 149 && elapsedSeconds <= 151);
    });

    it('evaluates unavailable freshness for position recorded > 300 seconds ago on ACTIVE shift', () => {
      const recordedAt = new Date(Date.now() - 350 * 1000); // 350s ago
      const { freshness, elapsedSeconds } = TrackingService.calculateFreshness(recordedAt, 'ACTIVE');
      assert.equal(freshness, 'UNAVAILABLE');
      assert.ok(elapsedSeconds >= 349);
    });

    it('immediately forces freshness to UNAVAILABLE when shift status is COMPLETED, regardless of elapsed time', () => {
      const recordedAt = new Date(Date.now() - 5 * 1000); // 5s ago (would be CURRENT if active)
      const { freshness } = TrackingService.calculateFreshness(recordedAt, 'COMPLETED');
      assert.equal(freshness, 'UNAVAILABLE', 'Ended shift must immediately force location freshness to UNAVAILABLE');
    });

    it('immediately forces freshness to UNAVAILABLE when shift status is CANCELLED or PLANNED', () => {
      const recordedAt = new Date(Date.now() - 10 * 1000);
      assert.equal(TrackingService.calculateFreshness(recordedAt, 'CANCELLED').freshness, 'UNAVAILABLE');
      assert.equal(TrackingService.calculateFreshness(recordedAt, 'PLANNED').freshness, 'UNAVAILABLE');
    });

    it('handles negative elapsed time (clock skew within allowable drift) safely as CURRENT', () => {
      const futureRecordedAt = new Date(Date.now() + 5 * 1000); // 5s ahead
      const { freshness, elapsedSeconds } = TrackingService.calculateFreshness(futureRecordedAt, 'ACTIVE');
      assert.equal(freshness, 'CURRENT');
      assert.equal(elapsedSeconds, 0);
    });
  });

  describe('2. Device Authentication & Credential Lifecycle', () => {
    it('authenticates valid device credential and derives tenant and vehicle identity', async () => {
      const validToken = 'dev_vhmc01_s3cr3tvhmc01token';
      const device = await TrackingService.authenticateDevice(validToken);

      assert.ok(device.id);
      assert.ok(device.tenantId);
      assert.ok(device.vehicleId);
      assert.equal(device.keyPrefix, 'dev_vhmc01');
      assert.equal(device.status, 'ACTIVE');
      assert.equal(device.isDemo, true);
    });

    it('rejects missing or undefined device token header with 401', async () => {
      await assert.rejects(
        async () => TrackingService.authenticateDevice(undefined),
        /AUTH_MISSING_DEVICE_TOKEN/
      );
    });

    it('rejects malformed token format missing prefix separator with 401', async () => {
      await assert.rejects(
        async () => TrackingService.authenticateDevice('invalidnoprefixformat'),
        /AUTH_INVALID_TOKEN_FORMAT/
      );
    });

    it('rejects unknown device prefix with 401', async () => {
      await assert.rejects(
        async () => TrackingService.authenticateDevice('dev_unknown_s3cr3t_does_not_exist'),
        /AUTH_INVALID_DEVICE_CREDENTIALS/
      );
    });

    it('rejects valid prefix with invalid secret token hash mismatch with 401', async () => {
      await assert.rejects(
        async () => TrackingService.authenticateDevice('dev_vhmc01_wrong_secret_tampered'),
        /AUTH_INVALID_DEVICE_CREDENTIALS/
      );
    });

    it('rejects revoked device credentials with 401 AUTH_DEVICE_REVOKED', async () => {
      const revokedToken = 'dev_vhmc03_rev_s3cr3trevokedtoken';
      await assert.rejects(
        async () => TrackingService.authenticateDevice(revokedToken),
        /AUTH_DEVICE_REVOKED/
      );
    });

    it('supports seamless credential rotation via secondary token with expiry', async () => {
      const client = await runtimePool.connect();
      try {
        const { rows: tRows } = await client.query("SELECT id FROM tenants WHERE slug = 'verdant-hills'");
        const tenantId = tRows[0].id;

        const devRows = await withTenantTransaction(tenantId, async (txClient) => {
          const { rows } = await txClient.query(
            "SELECT id FROM tracking_devices WHERE key_prefix = 'dev_vhmc01'"
          );
          return rows;
        });
        assert.ok(devRows.length > 0);
        const devId = devRows[0].id;

        // Provision secondary token with future expiry
        const secondaryToken = 'dev_vhmc01_newrot4teds3cr3ttok3n';
        const secondaryHash = TrackingService.hashToken(secondaryToken);

        await withTenantTransaction(tenantId, async (txClient) => {
          await txClient.query(
            `UPDATE tracking_devices 
             SET secondary_token_hash = $1, 
                 secondary_expires_at = CURRENT_TIMESTAMP + INTERVAL '1 hour'
             WHERE id = $2`,
            [secondaryHash, devId]
          );
        });

        // Device should now authenticate with secondary token
        const authWithSecondary = await TrackingService.authenticateDevice(secondaryToken);
        assert.equal(authWithSecondary.id, devId);

        // Original primary token still works during transition period
        const authWithPrimary = await TrackingService.authenticateDevice('dev_vhmc01_s3cr3tvhmc01token');
        assert.equal(authWithPrimary.id, devId);

        // Expire secondary token
        await withTenantTransaction(tenantId, async (txClient) => {
          await txClient.query(
            `UPDATE tracking_devices 
             SET secondary_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
             WHERE id = $1`,
            [devId]
          );
        });

        // Secondary token now rejected after expiry
        await assert.rejects(
          async () => TrackingService.authenticateDevice(secondaryToken),
          /AUTH_INVALID_DEVICE_CREDENTIALS/
        );
      } finally {
        client.release();
      }
    });
  });

  describe('3. Secure Telemetry Ingestion API (POST /api/v1/telemetry/ingest)', () => {
    it('accepts valid GPS telemetry and derives tenant/vehicle identity from device', async () => {
      const validToken = 'dev_vhmc01_s3cr3tvhmc01token';
      const eventTime = new Date().toISOString();

      const res = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', validToken)
        .send({
          latitude: 18.5220,
          longitude: 73.8580,
          speed_kmh: 15.5,
          heading_degrees: 95.0,
          recorded_at: eventTime,
        });

      assert.equal(res.status, 202);
      assert.equal(res.body.status, 'ACCEPTED');
      assert.ok(res.body.vehicle_id);
      assert.equal(res.body.freshness, 'CURRENT');
    });

    it('rejects anti-spoofing vehicle ID mismatch between payload and device binding with 403', async () => {
      const validToken = 'dev_vhmc01_s3cr3tvhmc01token';
      const fakeVehicleId = '00000000-0000-0000-0000-000000000000';

      const res = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', validToken)
        .send({
          vehicle_id: fakeVehicleId, // Mismatch against bound vehicle
          latitude: 18.5220,
          longitude: 73.8580,
          speed_kmh: 10,
          recorded_at: new Date().toISOString(),
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN_ACCESS');
      assert.ok(res.body.error.message.includes('AUTH_DEVICE_VEHICLE_MISMATCH'));
    });

    it('rejects out-of-bounds latitude > 90 with 400', async () => {
      const res = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', 'dev_vhmc01_s3cr3tvhmc01token')
        .send({
          latitude: 91.5,
          longitude: 73.8580,
          recorded_at: new Date().toISOString(),
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'BAD_REQUEST');
      assert.ok(res.body.error.message.includes('Latitude'));
    });

    it('rejects out-of-bounds longitude < -180 with 400', async () => {
      const res = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', 'dev_vhmc01_s3cr3tvhmc01token')
        .send({
          latitude: 18.5220,
          longitude: -185.0,
          recorded_at: new Date().toISOString(),
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'BAD_REQUEST');
      assert.ok(res.body.error.message.includes('Longitude'));
    });

    it('rejects coordinate (0.0, 0.0) as unacquired GPS fix outside municipal boundary with 400', async () => {
      const res = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', 'dev_vhmc01_s3cr3tvhmc01token')
        .send({
          latitude: 0.0,
          longitude: 0.0,
          recorded_at: new Date().toISOString(),
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'BAD_REQUEST');
      assert.ok(res.body.error.message.includes('0.0, 0.0'));
    });

    it('rejects malformed recorded_at timestamp with 400', async () => {
      const res = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', 'dev_vhmc01_s3cr3tvhmc01token')
        .send({
          latitude: 18.5220,
          longitude: 73.8580,
          recorded_at: 'not-a-valid-iso-date',
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'BAD_REQUEST');
      assert.ok(res.body.error.message.includes('recorded_at'));
    });

    it('rejects future timestamps exceeding 30-second clock drift limit with 400', async () => {
      const futureDate = new Date(Date.now() + 120 * 1000).toISOString(); // 2 minutes in future
      const res = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', 'dev_vhmc01_s3cr3tvhmc01token')
        .send({
          latitude: 18.5220,
          longitude: 73.8580,
          recorded_at: futureDate,
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'BAD_REQUEST');
      assert.ok(res.body.error.message.includes('future'));
    });

    it('rejects implausible speed exceeding 140 km/h with 400', async () => {
      const res = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', 'dev_vhmc01_s3cr3tvhmc01token')
        .send({
          latitude: 18.5220,
          longitude: 73.8580,
          speed_kmh: 185.0,
          recorded_at: new Date().toISOString(),
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'BAD_REQUEST');
      assert.ok(res.body.error.message.includes('Implausible vehicle speed'));
    });

    it('rejects replayed or out-of-order telemetry older than latest accepted position with 409', async () => {
      const validToken = 'dev_vhmc01_s3cr3tvhmc01token';
      const eventTime = new Date().toISOString();

      // 1. Accept first telemetry event
      const res1 = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', validToken)
        .send({
          latitude: 18.5221,
          longitude: 73.8581,
          speed_kmh: 10.0,
          heading_degrees: 90.0,
          recorded_at: eventTime,
        });
      assert.equal(res1.status, 202);

      // 2. Attempt to ingest same timestamp again (Replay attack)
      const res2 = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', validToken)
        .send({
          latitude: 18.5225,
          longitude: 73.8585,
          speed_kmh: 12.0,
          heading_degrees: 95.0,
          recorded_at: eventTime,
        });
      assert.equal(res2.status, 409);
      assert.equal(res2.body.error.code, 'REPLAYED_OR_OUT_OF_ORDER_TELEMETRY');

      // 3. Attempt to ingest older timestamp (Out of order)
      const pastTime = new Date(new Date(eventTime).getTime() - 10000).toISOString();
      const res3 = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', validToken)
        .send({
          latitude: 18.5220,
          longitude: 73.8580,
          speed_kmh: 10.0,
          recorded_at: pastTime,
        });
      assert.equal(res3.status, 409);
      assert.equal(res3.body.error.code, 'REPLAYED_OR_OUT_OF_ORDER_TELEMETRY');
    });

    it('rejects oversized telemetry payload exceeding 2 KB with 413', async () => {
      const validToken = 'dev_vhmc01_s3cr3tvhmc01token';
      const largeNote = 'A'.repeat(3000); // Exceeds 2 KB

      const res = await request(app)
        .post('/api/v1/telemetry/ingest')
        .set('X-Device-Token', validToken)
        .send({
          latitude: 18.5220,
          longitude: 73.8580,
          recorded_at: new Date().toISOString(),
          extra_junk: largeNote,
        });

      assert.equal(res.status, 413);
      assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
    });
  });

  describe('4. Citizen Tracking API & Authorization Boundaries (GET /api/v1/citizen/tracking)', () => {
    let citizenToken: string;
    let municipalAdminToken: string;
    let vhmcTenantId: string;
    let onpTenantId: string;
    let pineGroveLocalityId: string;
    let cedarHeightsLocalityId: string;
    let vhmcTruck1Id: string;
    let vhmcTruck2Id: string;

    before(async () => {
      const client = await runtimePool.connect();
      try {
        const { rows: tRows } = await client.query("SELECT id, slug FROM tenants ORDER BY slug ASC");
        vhmcTenantId = tRows.find((r) => r.slug === 'verdant-hills')!.id;
        onpTenantId = tRows.find((r) => r.slug === 'oceanfront-np')!.id;

        const { rows: uRows } = await client.query(
          "SELECT id, mobile_number FROM users WHERE mobile_number IN ('+919876543213', '+919876543210')"
        );
        const citizenUser = uRows.find((r) => r.mobile_number === '+919876543213')!;
        const adminUser = uRows.find((r) => r.mobile_number === '+919876543210')!;

        citizenToken = AuthService.generateToken({
          userId: citizenUser.id,
          mobileNumber: citizenUser.mobile_number,
        });

        municipalAdminToken = AuthService.generateToken({
          userId: adminUser.id,
          mobileNumber: adminUser.mobile_number,
        });

        await withTenantTransaction(vhmcTenantId, async (txClient) => {
          const { rows: locRows } = await txClient.query("SELECT id, locality_name FROM localities WHERE tenant_id = $1", [vhmcTenantId]);
          pineGroveLocalityId = locRows.find((r) => r.locality_name.includes('Pine Grove'))!.id;
          cedarHeightsLocalityId = locRows.find((r) => r.locality_name.includes('Cedar Heights'))!.id;

          const { rows: vRows } = await txClient.query("SELECT id, registration_number FROM vehicles WHERE tenant_id = $1", [vhmcTenantId]);
          vhmcTruck1Id = vRows.find((r) => r.registration_number === 'MH-12-VH-2026-01')!.id;
          vhmcTruck2Id = vRows.find((r) => r.registration_number === 'MH-12-VH-2026-02')!.id;
        });
      } finally {
        client.release();
      }
    });

    it('rejects unauthenticated citizen tracking requests with 401', async () => {
      const res = await request(app).get('/api/v1/citizen/tracking');
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    });

    it('rejects non-citizen roles (MUNICIPAL_ADMIN) accessing citizen tracking endpoint with 403', async () => {
      const res = await request(app)
        .get('/api/v1/citizen/tracking')
        .set('Authorization', `Bearer ${municipalAdminToken}`)
        .set('X-Tenant-Id', vhmcTenantId);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'AUTH_CITIZEN_ONLY_ENDPOINT');
      assert.ok(res.body.error.message.includes('restricted to authenticated citizens'));
    });

    it('rejects citizen attempting to track vehicles in a tenant where they have no membership with 403', async () => {
      // Sunita is member of VHMC, not ONP
      const res = await request(app)
        .get('/api/v1/citizen/tracking')
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('X-Tenant-Id', onpTenantId);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN_TENANT_ACCESS');
    });

    it('allows authenticated citizen to view vehicles active in their registered property localities', async () => {
      const res = await request(app)
        .get('/api/v1/citizen/tracking')
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('X-Tenant-Id', vhmcTenantId);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);

      const truck1 = res.body.data.find((v: any) => v.vehicle_id === vhmcTruck1Id);
      assert.ok(truck1, 'Citizen must be able to view vehicle assigned to their property locality');
      assert.equal(truck1.registration_number, 'MH-12-VH-2026-01');
      assert.equal(truck1.locality_id, pineGroveLocalityId);
      assert.equal(truck1.is_demo, true);
      assert.equal(truck1.simulation_notice, 'DEMONSTRATION MODE — SYNTHETIC TELEMETRY');
      assert.ok(truck1.freshness === 'CURRENT' || truck1.freshness === 'STALE');

      // Verify complete omission of sensitive internal data
      assert.equal(truck1.token_hash, undefined);
      assert.equal(truck1.device_serial, undefined);
      assert.equal(truck1.key_prefix, undefined);
      assert.equal(truck1.driver_user_id, undefined);
      assert.equal(truck1.driver_phone, undefined);

      // Verify vehicle with ended/completed shift (Truck 2) is NOT in live tracking snapshots
      const truck2 = res.body.data.find((v: any) => v.vehicle_id === vhmcTruck2Id);
      assert.equal(truck2, undefined, 'Vehicle with ended shift must not be included in active tracking snapshots');
    });

    it('rejects citizen requesting tracking for a locality where they have no properties with 403', async () => {
      // Sunita has property in Pine Grove, not Cedar Heights
      const res = await request(app)
        .get(`/api/v1/citizen/tracking?localityId=${cedarHeightsLocalityId}`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('X-Tenant-Id', vhmcTenantId);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN_ACCESS');
      assert.ok(res.body.error.message.includes('AUTH_INELIGIBLE_SERVICE_AREA'));
    });

    it('rejects citizen requesting tracking for an ineligible vehicle with 403', async () => {
      // Truck 2 has completed shift; requesting specifically by ID must be rejected as ineligible
      const res = await request(app)
        .get(`/api/v1/citizen/tracking?vehicleId=${vhmcTruck2Id}`)
        .set('Authorization', `Bearer ${citizenToken}`)
        .set('X-Tenant-Id', vhmcTenantId);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN_ACCESS');
      assert.ok(res.body.error.message.includes('AUTH_INELIGIBLE_VEHICLE'));
    });

    it('rejects citizen who has no active registered properties in the municipality with 403', async () => {
      const client = await runtimePool.connect();
      try {
        // Create a temporary citizen user with tenant membership but NO registered properties
        const tempCitizen = await client.query(
          "INSERT INTO users (mobile_number, full_name, password_hash) VALUES ('+919876543299', 'Propertyless Citizen', 'hash') RETURNING id"
        );
        const tempUserId = tempCitizen.rows[0].id;

        const { rows: roleRows } = await client.query("SELECT id FROM user_roles WHERE role_name = 'CITIZEN'");
        await withTenantTransaction(vhmcTenantId, async (txClient) => {
          await txClient.query(
            "INSERT INTO user_tenant_memberships (user_id, tenant_id, role_id, is_active, is_demo) VALUES ($1, $2, $3, TRUE, TRUE)",
            [tempUserId, vhmcTenantId, roleRows[0].id]
          );
        });

        const tempToken = AuthService.generateToken({
          userId: tempUserId,
          mobileNumber: '+919876543299',
        });

        const res = await request(app)
          .get('/api/v1/citizen/tracking')
          .set('Authorization', `Bearer ${tempToken}`)
          .set('X-Tenant-Id', vhmcTenantId);

        assert.equal(res.status, 403);
        assert.equal(res.body.error.code, 'FORBIDDEN_ACCESS');
        assert.ok(res.body.error.message.includes('AUTH_NO_ELIGIBLE_SERVICE_AREAS'));
      } finally {
        client.release();
      }
    });
  });

  describe('5. Real PostgreSQL RLS & Database Role Isolation (under unprivileged waste_app_user)', () => {
    it('enforces zero visibility when querying tracking tables without tenant context', async () => {
      const client = await runtimePool.connect();
      try {
        await client.query('BEGIN');
        // app.current_tenant_id is NOT set
        const { rows: vRows } = await client.query('SELECT count(*) FROM vehicles');
        const { rows: dRows } = await client.query('SELECT count(*) FROM tracking_devices');
        const { rows: sRows } = await client.query('SELECT count(*) FROM vehicle_shifts');
        const { rows: lRows } = await client.query('SELECT count(*) FROM vehicle_telemetry_logs');
        const { rows: pRows } = await client.query('SELECT count(*) FROM latest_vehicle_positions');

        assert.equal(parseInt(vRows[0].count, 10), 0, 'Vehicles must return 0 rows without tenant context');
        assert.equal(parseInt(dRows[0].count, 10), 0, 'Tracking devices must return 0 rows without tenant context');
        assert.equal(parseInt(sRows[0].count, 10), 0, 'Vehicle shifts must return 0 rows without tenant context');
        assert.equal(parseInt(lRows[0].count, 10), 0, 'Telemetry logs must return 0 rows without tenant context');
        assert.equal(parseInt(pRows[0].count, 10), 0, 'Latest positions must return 0 rows without tenant context');
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('enforces strict cross-tenant SELECT and INSERT isolation on tracking tables under RLS', async () => {
      const client = await runtimePool.connect();
      try {
        const { rows: tenants } = await client.query('SELECT id, slug FROM tenants ORDER BY slug ASC LIMIT 2');
        const tenant1Id = tenants[0].id;
        const tenant2Id = tenants[1].id;

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenant1Id]);

        // Can read Tenant 1 vehicles
        const { rows: t1Vehicles } = await client.query('SELECT id FROM vehicles');
        assert.ok(t1Vehicles.length > 0, 'Should read vehicles for Tenant 1');

        // Cannot read Tenant 2 vehicles under Tenant 1 context
        const { rows: crossVehicles } = await client.query('SELECT id FROM vehicles WHERE tenant_id = $1', [tenant2Id]);
        assert.equal(crossVehicles.length, 0, 'RLS must block reading Tenant 2 vehicles under Tenant 1 context');

        // Attempt cross-tenant INSERT into vehicle_telemetry_logs
        let insertBlocked = false;
        await client.query('SAVEPOINT rls_telemetry_sp');
        try {
          await client.query(
            `INSERT INTO vehicle_telemetry_logs (
              tenant_id, vehicle_id, device_id, latitude, longitude, event_timestamp, is_demo
            ) VALUES ($1, $2, $3, 18.5200, 73.8500, CURRENT_TIMESTAMP, TRUE)`,
            [tenant2Id, t1Vehicles[0].id, t1Vehicles[0].id]
          );
        } catch (err: any) {
          insertBlocked = true;
          await client.query('ROLLBACK TO SAVEPOINT rls_telemetry_sp');
          assert.ok(
            err.message.includes('violates row-level security policy') ||
            err.code === '42501' ||
            err.message.includes('check constraint')
          );
        }
        assert.equal(insertBlocked, true, 'RLS must block inserting telemetry for Tenant 2 under Tenant 1 context');

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('enforces demo inheritance trigger across vehicles and tracking devices', async () => {
      const client = await runtimePool.connect();
      try {
        const { rows: tenants } = await client.query("SELECT id FROM tenants WHERE is_demo = TRUE LIMIT 1");
        const tenantId = tenants[0].id;

        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

        // Insert vehicle with is_demo = FALSE under demo tenant
        const { rows: vRows } = await client.query(
          `INSERT INTO vehicles (tenant_id, registration_number, vehicle_label, is_demo)
           VALUES ($1, 'TEST-DEMO-INHERIT-01', 'Test Vehicle', FALSE)
           RETURNING is_demo`,
          [tenantId]
        );
        assert.equal(vRows[0].is_demo, true, 'Vehicle must inherit is_demo = true from demo tenant');

        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    });

    it('guarantees transaction-local tenant context isolation across pooled connections', async () => {
      const { rows: tenants } = await runtimePool.query("SELECT id FROM tenants WHERE is_demo = TRUE ORDER BY slug ASC LIMIT 2");
      const tenant1Id = tenants[0].id;
      const tenant2Id = tenants[1].id;

      // Run Tenant 1 transaction
      await withTenantTransaction(tenant1Id, async (client) => {
        const { rows } = await client.query("SELECT current_setting('app.current_tenant_id', true) AS ctx");
        assert.equal(rows[0].ctx, tenant1Id);
      });

      // Run Tenant 2 transaction
      await withTenantTransaction(tenant2Id, async (client) => {
        const { rows } = await client.query("SELECT current_setting('app.current_tenant_id', true) AS ctx");
        assert.equal(rows[0].ctx, tenant2Id);
      });

      // Verify connection returned to pool has no lingering tenant context
      const client = await runtimePool.connect();
      try {
        const { rows } = await client.query("SELECT current_setting('app.current_tenant_id', true) AS ctx");
        assert.ok(!rows[0].ctx || rows[0].ctx === '', 'Returned pooled connection must have no lingering tenant context');
      } finally {
        client.release();
      }
    });
  });
});
