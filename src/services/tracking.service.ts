import crypto from 'crypto';
import { query, runtimePool, withTenantTransaction } from '../db/pool';
import { config } from '../config';
import {
  AuthenticatedDevice,
  CitizenTrackingSnapshot,
  FreshnessStatus,
  ShiftStatus,
  TelemetryIngestPayload,
} from '../types/tracking.types';

export class TrackingService {
  /**
   * Hashes a raw device token using SHA-256 for secure storage and comparison
   */
  public static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Generates a device credential pair: plaintext token (shown once) and hash for database storage
   */
  public static generateDeviceCredential(keyPrefix: string): { plaintextToken: string; tokenHash: string } {
    const randomSecret = crypto.randomBytes(24).toString('hex');
    const plaintextToken = `${keyPrefix}_${randomSecret}`;
    const tokenHash = this.hashToken(plaintextToken);
    return { plaintextToken, tokenHash };
  }

  /**
   * Authenticate an incoming telemetry device using the X-Device-Token header.
   * Derives tenant and vehicle identity from the authenticated database record.
   */
  public static async authenticateDevice(rawToken: string | undefined): Promise<AuthenticatedDevice> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new Error('AUTH_MISSING_DEVICE_TOKEN: Missing or invalid X-Device-Token header.');
    }

    const trimmed = rawToken.trim();
    // Parse key_prefix (convention: <prefix>_<secret>)
    const parts = trimmed.split('_');
    if (parts.length < 2) {
      throw new Error('AUTH_INVALID_TOKEN_FORMAT: Malformed X-Device-Token header.');
    }

    // Key prefix is everything up to the final secret segment
    const keyPrefix = parts.slice(0, -1).join('_');
    const computedHash = this.hashToken(trimmed);

    const sql = `
      SELECT 
        d.id,
        d.tenant_id,
        d.vehicle_id,
        d.device_serial,
        d.key_prefix,
        d.token_hash,
        d.secondary_token_hash,
        d.secondary_expires_at,
        d.status,
        d.is_demo,
        v.operational_status,
        v.is_active AS vehicle_active
      FROM tracking_devices d
      JOIN vehicles v ON v.id = d.vehicle_id
      WHERE d.key_prefix = $1
    `;

    const client = await runtimePool.connect();
    let rows: any[];
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.device_auth_lookup', 'true', true)");
      const res = await client.query(sql, [keyPrefix]);
      rows = res.rows;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    if (rows.length === 0) {
      throw new Error('AUTH_INVALID_DEVICE_CREDENTIALS: Unknown device credential prefix.');
    }

    const dev = rows[0];

    // Status checks
    if (dev.status === 'REVOKED') {
      throw new Error('AUTH_DEVICE_REVOKED: Device credential has been permanently revoked.');
    }

    if (dev.status === 'SUSPENDED') {
      throw new Error('AUTH_DEVICE_SUSPENDED: Device credential is temporarily suspended.');
    }

    if (!dev.vehicle_active || dev.operational_status === 'DECOMMISSIONED') {
      throw new Error('AUTH_VEHICLE_INACTIVE: Bound vehicle is decommissioned or inactive.');
    }

    // Hash comparison (primary or valid secondary transition token)
    let authenticated = crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(dev.token_hash, 'hex')
    );

    if (!authenticated && dev.secondary_token_hash && dev.secondary_expires_at) {
      const isExpired = new Date(dev.secondary_expires_at).getTime() < Date.now();
      if (!isExpired) {
        authenticated = crypto.timingSafeEqual(
          Buffer.from(computedHash, 'hex'),
          Buffer.from(dev.secondary_token_hash, 'hex')
        );
      }
    }

    if (!authenticated) {
      throw new Error('AUTH_INVALID_DEVICE_CREDENTIALS: Hash verification failed for device token.');
    }

    // Update last_used_at timestamp within tenant context
    try {
      await withTenantTransaction(dev.tenant_id, async (txClient) => {
        await txClient.query('UPDATE tracking_devices SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1', [dev.id]);
      });
    } catch {
      // Non-fatal if last_used_at update fails during authentication
    }

    return {
      id: dev.id,
      tenantId: dev.tenant_id,
      vehicleId: dev.vehicle_id,
      deviceSerial: dev.device_serial,
      keyPrefix: dev.key_prefix,
      status: dev.status,
      isDemo: Boolean(dev.is_demo),
    };
  }

  /**
   * Validates and ingests a single telemetry payload.
   * Strictly enforces:
   * 1. Tenant & vehicle derived from device, not payload.
   * 2. Anti-spoofing check if payload supplies vehicle_id.
   * 3. Coordinate bounds (-90..90, -180..180).
   * 4. Contextual (0,0) rejection.
   * 5. Future timestamp rejection (>30s drift).
   * 6. Replay & out-of-order rejection (event_timestamp <= last_recorded_at).
   * 7. Plausible speed limits.
   * 8. Atomic database transaction updating logs and latest_vehicle_positions.
   */
  public static async ingestTelemetry(
    device: AuthenticatedDevice,
    payload: TelemetryIngestPayload
  ): Promise<{ status: string; vehicle_id: string; freshness: FreshnessStatus; elapsed_seconds: number }> {
    // 1. Anti-Spoofing: If payload provides vehicle_id, ensure strict match
    if (payload.vehicle_id && payload.vehicle_id !== device.vehicleId) {
      throw new Error('AUTH_DEVICE_VEHICLE_MISMATCH: Device is not authorized to submit telemetry for the requested vehicle.');
    }

    // 2. Validate coordinates
    const lat = payload.latitude;
    const lon = payload.longitude;

    if (typeof lat !== 'number' || isNaN(lat) || lat < -90.0 || lat > 90.0) {
      throw new Error('VALIDATION_FAILED: Latitude must be a numeric value between -90.0 and 90.0 degrees.');
    }

    if (typeof lon !== 'number' || isNaN(lon) || lon < -180.0 || lon > 180.0) {
      throw new Error('VALIDATION_FAILED: Longitude must be a numeric value between -180.0 and 180.0 degrees.');
    }

    // Contextual (0.0, 0.0) check
    if (Math.abs(lat) < 0.0000001 && Math.abs(lon) < 0.0000001) {
      throw new Error('VALIDATION_FAILED: Coordinate (0.0, 0.0) rejected contextually as unacquired GPS fix outside municipal boundary.');
    }

    // 3. Validate timestamp
    if (!payload.recorded_at) {
      throw new Error('VALIDATION_FAILED: Missing required recorded_at timestamp.');
    }

    const eventDate = new Date(payload.recorded_at);
    if (isNaN(eventDate.getTime())) {
      throw new Error('VALIDATION_FAILED: Malformed recorded_at ISO-8601 timestamp.');
    }

    const eventTime = eventDate.getTime();
    const serverNow = Date.now();

    // Future clock drift limit (max 30 seconds ahead of server clock)
    if (eventTime - serverNow > config.tracking.futureDriftLimitSeconds * 1000) {
      throw new Error('VALIDATION_FAILED: Telemetry timestamp is in the future beyond allowable 30-second clock drift limit.');
    }

    // 4. Validate speed & heading
    const speed = payload.speed_kmh !== undefined ? Number(payload.speed_kmh) : 0.0;
    if (isNaN(speed) || speed < 0.0 || speed > config.tracking.maxSpeedKmh) {
      throw new Error(`VALIDATION_FAILED: Implausible vehicle speed (${speed} km/h). Must be between 0 and ${config.tracking.maxSpeedKmh} km/h.`);
    }

    const heading = payload.heading_degrees !== undefined ? Number(payload.heading_degrees) : 0.0;
    if (isNaN(heading) || heading < 0.0 || heading >= 360.0) {
      throw new Error('VALIDATION_FAILED: Heading must be between 0.0 and 359.99 degrees.');
    }

    // 5. Transaction-safe database write under tenant context
    return withTenantTransaction(device.tenantId, async (client) => {
      // Replay & sequence protection: Check latest position
      const { rows: latestRows } = await client.query(
        'SELECT last_recorded_at FROM latest_vehicle_positions WHERE vehicle_id = $1 FOR UPDATE',
        [device.vehicleId]
      );

      if (latestRows.length > 0) {
        const lastRecorded = new Date(latestRows[0].last_recorded_at).getTime();
        if (eventTime <= lastRecorded) {
          throw new Error('REPLAYED_OR_OUT_OF_ORDER_TELEMETRY: Telemetry timestamp is older than or identical to latest accepted position.');
        }
      }

      // Check current active shift for this vehicle
      const { rows: shiftRows } = await client.query(
        `SELECT id, shift_status 
         FROM vehicle_shifts 
         WHERE vehicle_id = $1 AND tenant_id = $2 AND shift_status = 'ACTIVE'
         ORDER BY created_at DESC LIMIT 1`,
        [device.vehicleId, device.tenantId]
      );

      const activeShiftId = shiftRows.length > 0 ? shiftRows[0].id : null;
      const isShiftActive = shiftRows.length > 0;

      // Determine initial freshness status
      const elapsedSeconds = Math.max(0, Math.floor((serverNow - eventTime) / 1000));
      let freshness: FreshnessStatus;

      if (!isShiftActive) {
        freshness = 'UNAVAILABLE';
      } else if (elapsedSeconds <= config.tracking.currentFreshnessSeconds) {
        freshness = 'CURRENT';
      } else if (elapsedSeconds <= config.tracking.staleFreshnessSeconds) {
        freshness = 'STALE';
      } else {
        freshness = 'UNAVAILABLE';
      }

      // Append to historical telemetry logs
      await client.query(
        `INSERT INTO vehicle_telemetry_logs (
          tenant_id, vehicle_id, device_id, shift_id, latitude, longitude, 
          speed_kmh, heading_degrees, event_timestamp, validation_status, is_demo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACCEPTED', $10)`,
        [
          device.tenantId,
          device.vehicleId,
          device.id,
          activeShiftId,
          lat,
          lon,
          speed,
          heading,
          eventDate.toISOString(),
          device.isDemo,
        ]
      );

      // Upsert authoritative latest position
      await client.query(
        `INSERT INTO latest_vehicle_positions (
          vehicle_id, tenant_id, device_id, shift_id, latitude, longitude, 
          speed_kmh, heading_degrees, last_recorded_at, freshness_status, is_demo, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
        ON CONFLICT (vehicle_id) DO UPDATE SET
          device_id = EXCLUDED.device_id,
          shift_id = EXCLUDED.shift_id,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          speed_kmh = EXCLUDED.speed_kmh,
          heading_degrees = EXCLUDED.heading_degrees,
          last_recorded_at = EXCLUDED.last_recorded_at,
          last_received_at = CURRENT_TIMESTAMP,
          freshness_status = EXCLUDED.freshness_status,
          updated_at = CURRENT_TIMESTAMP`,
        [
          device.vehicleId,
          device.tenantId,
          device.id,
          activeShiftId,
          lat,
          lon,
          speed,
          heading,
          eventDate.toISOString(),
          freshness,
          device.isDemo,
        ]
      );

      return {
        status: 'ACCEPTED',
        vehicle_id: device.vehicleId,
        freshness,
        elapsed_seconds: elapsedSeconds,
      };
    });
  }

  /**
   * Derive live location freshness based on server time and shift status.
   */
  public static calculateFreshness(lastRecordedAt: Date, shiftStatus: ShiftStatus): {
    freshness: FreshnessStatus;
    elapsedSeconds: number;
  } {
    const serverNow = Date.now();
    const eventTime = lastRecordedAt.getTime();
    const elapsedSeconds = Math.max(0, Math.floor((serverNow - eventTime) / 1000));

    // Shift Ended Rule: If shift is not ACTIVE, status becomes UNAVAILABLE immediately
    if (shiftStatus !== 'ACTIVE') {
      return { freshness: 'UNAVAILABLE', elapsedSeconds };
    }

    if (elapsedSeconds <= config.tracking.currentFreshnessSeconds) {
      return { freshness: 'CURRENT', elapsedSeconds };
    }
    if (elapsedSeconds <= config.tracking.staleFreshnessSeconds) {
      return { freshness: 'STALE', elapsedSeconds };
    }
    return { freshness: 'UNAVAILABLE', elapsedSeconds };
  }

  /**
   * Query authorized vehicle tracking for authenticated citizens.
   * Strictly enforces:
   * 1. Citizen must own/occupy properties in the municipality.
   * 2. Citizen can ONLY track vehicles on ACTIVE shifts assigned to their registered property localities.
   * 3. Sensitive device credentials, tokens, and precise driver PII are completely omitted.
   */
  public static async getCitizenTracking(
    citizenUserId: string,
    tenantId: string,
    requestedLocalityId?: string,
    requestedVehicleId?: string
  ): Promise<CitizenTrackingSnapshot[]> {
    return withTenantTransaction(tenantId, async (client) => {
      // 1. Fetch all localities where this citizen has registered active properties
      const { rows: propertyLocalities } = await client.query(
        `SELECT DISTINCT p.locality_id 
         FROM properties p 
         WHERE p.citizen_user_id = $1 AND p.tenant_id = $2 AND p.is_active = TRUE`,
        [citizenUserId, tenantId]
      );

      if (propertyLocalities.length === 0) {
        throw new Error('AUTH_NO_ELIGIBLE_SERVICE_AREAS: Citizen does not possess any active registered properties in this municipality.');
      }

      const eligibleLocalityIds = new Set(propertyLocalities.map((r) => r.locality_id));

      // 2. If specific locality requested, verify citizen property eligibility
      if (requestedLocalityId && !eligibleLocalityIds.has(requestedLocalityId)) {
        throw new Error('AUTH_INELIGIBLE_SERVICE_AREA: Citizen is not registered to properties within the requested locality.');
      }

      // 3. Query vehicles currently on shifts for the citizen's eligible localities
      let sql = `
        SELECT 
          v.id AS vehicle_id,
          v.vehicle_label,
          v.registration_number,
          s.id AS shift_id,
          s.shift_status,
          s.locality_id,
          l.locality_name,
          w.ward_number,
          pos.latitude,
          pos.longitude,
          pos.speed_kmh,
          pos.heading_degrees,
          pos.last_recorded_at,
          pos.is_demo
        FROM vehicles v
        JOIN vehicle_shifts s ON s.vehicle_id = v.id AND s.tenant_id = v.tenant_id
        JOIN localities l ON l.id = s.locality_id
        JOIN wards w ON w.id = l.ward_id
        LEFT JOIN latest_vehicle_positions pos ON pos.vehicle_id = v.id
        WHERE v.tenant_id = $1
          AND s.shift_status = 'ACTIVE'
          AND s.locality_id = ANY($2::uuid[])
      `;

      const targetLocalityIds = requestedLocalityId ? [requestedLocalityId] : Array.from(eligibleLocalityIds);
      const params: any[] = [tenantId, targetLocalityIds];

      if (requestedVehicleId) {
        sql += ' AND v.id = $3';
        params.push(requestedVehicleId);
      }

      sql += ' ORDER BY v.vehicle_label ASC';

      const { rows } = await client.query(sql, params);

      // If specific vehicle requested but not found or not assigned to citizen's localities
      if (requestedVehicleId && rows.length === 0) {
        throw new Error('AUTH_INELIGIBLE_VEHICLE: Citizen is not authorized to track this vehicle.');
      }

      return rows.map((r) => {
        const lastRecorded = r.last_recorded_at ? new Date(r.last_recorded_at) : new Date(0);
        const { freshness, elapsedSeconds } = this.calculateFreshness(lastRecorded, r.shift_status as ShiftStatus);

        return {
          vehicle_id: r.vehicle_id,
          vehicle_label: r.vehicle_label,
          registration_number: r.registration_number,
          locality_id: r.locality_id,
          locality_name: r.locality_name,
          ward_number: r.ward_number,
          latitude: r.latitude ? parseFloat(r.latitude) : 0.0,
          longitude: r.longitude ? parseFloat(r.longitude) : 0.0,
          speed_kmh: r.speed_kmh ? parseFloat(r.speed_kmh) : 0.0,
          heading_degrees: r.heading_degrees ? parseFloat(r.heading_degrees) : 0.0,
          freshness,
          elapsed_seconds: elapsedSeconds,
          last_recorded_at: r.last_recorded_at ? new Date(r.last_recorded_at).toISOString() : new Date(0).toISOString(),
          shift_status: r.shift_status as ShiftStatus,
          is_demo: Boolean(r.is_demo),
          simulation_notice: r.is_demo ? 'DEMONSTRATION MODE — SYNTHETIC TELEMETRY' : undefined,
        };
      });
    });
  }
}
