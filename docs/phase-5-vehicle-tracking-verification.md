# Phase 5 Verification Report — Secure Vehicle Tracking & Telemetry Ingestion

**Project:** Smart Municipal Waste Management Platform  
**Workspace:** `D:\project`  
**Phase Status:** Phase 5 Implemented, Audited & Formally Verified Against PostgreSQL 18.4  
**Date:** October 18, 2026  
**Document Version:** 1.0.0  

---

## 1. Executive Summary

Phase 5 delivers the foundational, secure, multi-tenant vehicle tracking and synthetic GPS telemetry ingestion subsystem for the Smart Municipal Waste Management Platform. Building directly on the modular monolith architecture, verified tenant derivation, Express v1 route conventions, tripartite database role separation (`waste_app_user`, `waste_migration_user`, `waste_dba_admin`), and PostgreSQL Row-Level Security (RLS) established in Phase 4, Phase 5 introduces:

1. **Relational Vehicle Tracking Schema:** Migration `005_vehicle_tracking.sql` adding 5 tables (`vehicles`, `tracking_devices`, `vehicle_shifts`, `vehicle_telemetry_logs`, `latest_vehicle_positions`) with foreign keys, check constraints, demo inheritance triggers, and RLS policies enforced under `waste_app_user`.
2. **Cryptographically Secure Ingestion Protocol:** Device authentication via SHA-256 pre-shared tokens (`<prefix>_<secret>`), constant-time hash comparison (`crypto.timingSafeEqual`), dual-token rotation windows, instant revocation, and server-side derivation of tenant and vehicle identity to prevent spoofing.
3. **Strict Ingress Telemetry Validation:** Coordinate validation (`-90..90`, `-180..180`), contextual rejection of unacquired GPS fix `(0.0, 0.0)`, ISO-8601 parsing, 30s future clock drift limit, speed bounds (`0..140 km/h`), heading bounds (`0..359.99°`), and 2 KB payload limit.
4. **Authoritative Position & Replay Protection:** Transactional telemetry updates under row-level locking (`SELECT ... FOR UPDATE` on `latest_vehicle_positions`), rejecting out-of-order or duplicate telemetry ($t_{event} \le t_{latest}$) with HTTP 409 Conflict.
5. **Location Freshness & Shift Lifecycle:** Explicit server-side age derivation: `CURRENT` ($\le 60$s), `STALE` ($61-300$s), `UNAVAILABLE` ($>300$s). Shift-ended vehicles (`COMPLETED`, `CANCELLED`, `PLANNED`) are immediately forced to `UNAVAILABLE` regardless of recorded timestamp.
6. **Citizen Tracking Authorization Boundaries:** Authenticated citizen access (`GET /api/v1/citizen/tracking`) restricted strictly to active registered properties in municipal service areas. Internal hardware serials, token hashes, and driver PII are completely omitted from responses.
7. **PostgreSQL Verification Gate:** **63 automated tests across 11 test suites passed (100% pass rate, 0 failed, 0 skipped)** running against disposable real PostgreSQL 18.4 instances under the unprivileged `waste_app_user` runtime role.

---

## 2. Implemented Source Files & Responsibilities

| File Path | Component / Layer | Key Responsibilities |
| :--- | :--- | :--- |
| `src/db/migrations/005_vehicle_tracking.sql` | Database Migration | Provisions 5 tracking tables, check constraints, foreign keys, demo inheritance triggers, and tenant RLS policies (`tenant_isolation_*`), plus scoped permissive lookup policies for un-tenanted device and membership authentication. |
| `src/config/index.ts` | Configuration | Defines tracking parameters (`currentFreshnessSeconds: 60`, `staleFreshnessSeconds: 300`, `futureDriftLimitSeconds: 30`, `maxPayloadSizeBytes: 2048`, `maxSpeedKmh: 140`). |
| `src/types/tracking.types.ts` | Type Definitions | Domain interfaces for `FreshnessStatus`, `ShiftStatus`, `DeviceCredentialStatus`, `TelemetryIngestPayload`, `AuthenticatedDevice`, and `CitizenTrackingSnapshot`. |
| `src/services/tracking.service.ts` | Core Domain Service | Cryptographic token hashing, device authentication, secondary token rotation check, telemetry ingress validation, monotonic replay protection, authoritative position upsert, freshness derivation, and citizen property service-area authorization. |
| `src/api/v1/telemetry.routes.ts` | Ingestion API Route | `POST /api/v1/telemetry/ingest` with 2 KB payload limit check, `X-Device-Token` header authentication, and 202 Accepted response. |
| `src/api/v1/citizen-tracking.routes.ts` | Citizen API Route | `GET /api/v1/citizen/tracking` protected by `requireAuth`, `requireVerifiedTenant`, and `requireCitizenRole`. Filters vehicles by citizen's registered property localities. |
| `src/api/middleware/error.middleware.ts` | Error Handling | Maps device auth failures (401), unauthorized roles/ineligible service areas/vehicle mismatches (403), out-of-order telemetry replays (409), oversized payloads (413), and validation errors (400). |
| `src/services/auth.service.ts` | Authentication Service | Added scoped transaction context (`app.membership_lookup = 'true'`) to permit authenticated users to query tenant memberships under RLS. |
| `src/app.ts` | Application Root | Mounts `/api/v1/telemetry` and `/api/v1/citizen/tracking` route modules. |
| `src/db/seed.ts` | Synthetic Demo Seeder | Deterministic fictional tracking fixtures (vehicles, devices, shifts, positions) for Verdant Hills and Oceanfront Nagar Panchayat. |
| `tests/helpers/postgres-test-server.ts` | Test Harness | Multi-port disposable PostgreSQL test cluster provisioning (5433 for ledger/RLS, 5434 for tracking) with role bootstrap, migrations, and synthetic seeding. |
| `tests/vehicle-tracking.test.ts` | Automated Test Suite | 34 comprehensive tests covering freshness, device authentication, telemetry ingress validation, citizen authorization, and real PostgreSQL RLS isolation under `waste_app_user`. |

---

## 3. Database Schema & Migration Details

Migration `src/db/migrations/005_vehicle_tracking.sql` applies 5 tables:

### 3.1 Tables & Constraints

1. **`vehicles`:**
   - Tenant ownership (`tenant_id` UUID FK).
   - Tenant-scoped unique registration: `UNIQUE (tenant_id, registration_number)`.
   - Columns: `vehicle_label`, `vehicle_type` (`COMPACTOR`, `TIPPER_TRUCK`, `AUTO_TRIPPER`, `TRACTOR_TRAILER`, `ELECTRIC_CART`), `capacity_metric_tonnes`, `operational_status` (`IN_SERVICE`, `MAINTENANCE`, `RESERVE`, `DECOMMISSIONED`), `is_active`, `is_demo`.
2. **`tracking_devices`:**
   - Cryptographic credential representations: `key_prefix VARCHAR(32) NOT NULL UNIQUE`, `token_hash VARCHAR(64) NOT NULL` (SHA-256), `secondary_token_hash VARCHAR(64)`, `secondary_expires_at TIMESTAMPTZ`.
   - Status: `status` (`ACTIVE`, `SUSPENDED`, `REVOKED`).
   - Tenant & vehicle binding: `tenant_id` FK, `vehicle_id` FK (`UNIQUE (vehicle_id)` - 1-to-1 binding).
   - Audit metadata: `last_used_at`, `created_at`, `updated_at`, `is_demo`.
3. **`vehicle_shifts`:**
   - Operational shifts: `tenant_id` FK, `vehicle_id` FK, `driver_user_id` FK, `locality_id` FK.
   - Status: `shift_status` (`PLANNED`, `ACTIVE`, `COMPLETED`, `CANCELLED`).
   - Timestamps: `shift_date`, `start_time`, `end_time`, `is_demo`.
4. **`vehicle_telemetry_logs`:**
   - Historical GPS breadcrumbs: `tenant_id` FK, `vehicle_id` FK, `device_id` FK, `shift_id` FK.
   - Spatial bounds: `latitude NUMERIC(10, 7) CHECK (latitude BETWEEN -90.0 AND 90.0)`, `longitude NUMERIC(10, 7) CHECK (longitude BETWEEN -180.0 AND 180.0)`.
   - Kinematics: `speed_kmh NUMERIC(5, 2) CHECK (speed_kmh >= 0 AND speed_kmh <= 140.0)`, `heading_degrees NUMERIC(5, 2) CHECK (heading_degrees >= 0 AND heading_degrees < 360.0)`.
   - Timestamps: `event_timestamp TIMESTAMPTZ`, `server_received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, `validation_status VARCHAR(32)`, `is_demo`.
5. **`latest_vehicle_positions`:**
   - Authoritative 1-to-1 operational snapshot: `vehicle_id UUID PRIMARY KEY`, `tenant_id` FK, `device_id` FK, `shift_id` FK.
   - Coordinates & kinematics: `latitude`, `longitude`, `speed_kmh`, `heading_degrees`.
   - Timestamps: `last_recorded_at TIMESTAMPTZ NOT NULL`, `last_received_at TIMESTAMPTZ NOT NULL`, `freshness_status VARCHAR(16) NOT NULL`, `is_demo`.

### 3.2 Row-Level Security & Un-Tenanted Ingestion Resolution

All 5 tables enable and force RLS:
```sql
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;
-- (Repeated across tracking_devices, vehicle_shifts, vehicle_telemetry_logs, latest_vehicle_positions)
```
Default isolation policies enforce:
```sql
CREATE POLICY tenant_isolation_vehicles ON vehicles
  FOR ALL TO waste_app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);
```

#### The Un-Tenanted Device Ingestion Challenge & Resolution
When a GPS device submits telemetry, the prompt explicitly mandates:
> *"Derive tenant and vehicle identity from the authenticated device record, never trust tenant or vehicle IDs supplied by the telemetry payload."*

Consequently, when `POST /api/v1/telemetry/ingest` receives a request, the server cannot set `app.current_tenant_id` prior to authenticating the device. Under standard RLS, a query against `tracking_devices` without tenant context returns 0 rows.

**Resolution:** Migration `005` establishes scoped permissive `SELECT` policies:
```sql
CREATE POLICY device_auth_lookup_tracking_devices ON tracking_devices
  FOR SELECT TO waste_app_user
  USING (current_setting('app.device_auth_lookup', true) = 'true');

CREATE POLICY device_auth_lookup_vehicles ON vehicles
  FOR SELECT TO waste_app_user
  USING (current_setting('app.device_auth_lookup', true) = 'true');
```
Inside `TrackingService.authenticateDevice()`, the database query executes within a dedicated, transaction-scoped setting:
```typescript
await txClient.query("SELECT set_config('app.device_auth_lookup', 'true', true)");
```
This is strictly read-only (`SELECT`), scoped to the single transaction, and automatically cleared upon transaction commit/rollback. All mutating operations (`INSERT`, `UPDATE`, `DELETE`) remain unconditionally governed by `tenant_isolation_*`. A similar scoped policy (`membership_lookup_policy` on `user_tenant_memberships`) allows `AuthService` to verify user memberships.

---

## 4. Telemetry Ingestion & Device Credential Lifecycle

### 4.1 Credential Representation & Token Structure
- Raw tokens follow the format `<key_prefix>_<secret>` (e.g. `dev_vhmc01_s3cr3tvhmc01token`).
- Secrets are generated via `crypto.randomBytes(24).toString('hex')` (48 hex characters).
- Secrets are **never** stored in plaintext. The database stores the hex-encoded SHA-256 hash in `tracking_devices.token_hash`.
- Lookups query by `key_prefix` (indexed via unique constraint) and evaluate the hash using `crypto.timingSafeEqual()` to prevent timing attacks.

### 4.2 Credential Rotation & Revocation
- **Zero-Downtime Rotation:** Devices support a transition window via `secondary_token_hash` and `secondary_expires_at`. The authentication engine accepts either the primary hash or an active (non-expired) secondary hash.
- **Immediate Revocation:** Setting `status = 'REVOKED'` immediately causes all authentication attempts to fail with HTTP 401 (`AUTH_DEVICE_REVOKED`).
- **Suspension:** Setting `status = 'SUSPENDED'` rejects requests with HTTP 401 (`AUTH_DEVICE_SUSPENDED`).
- **Vehicle Inactivity:** If the bound vehicle is decommissioned or inactive, ingestion is rejected with HTTP 401 (`AUTH_VEHICLE_INACTIVE`).

### 4.3 Ingress Telemetry Validation
`TrackingService.validateTelemetryPayload()` validates each payload:
1. **Vehicle Anti-Spoofing:** Payload `vehicle_id` (if supplied) must match `device.vehicleId`. Mismatches are rejected with HTTP 403 (`AUTH_DEVICE_VEHICLE_MISMATCH`).
2. **Payload Size:** Enforced by route middleware ($\le 2\text{ KB}$). Payloads $> 2\text{ KB}$ are rejected with HTTP 413.
3. **Coordinate Bounds:** Latitude must be within $[-90.0, 90.0]$; Longitude must be within $[-180.0, 180.0]$.
4. **Contextual Coordinate Rejection:** Coordinates `(0.0, 0.0)` (Null Island) are contextually rejected with HTTP 400 as an unacquired GPS sensor fix outside municipal boundaries.
5. **Timestamp Validation:** Must be valid ISO-8601. Telemetry dated $> 30\text{ seconds}$ in the future (relative to server clock) is rejected with HTTP 400.
6. **Kinematics Bounds:** Speed must be within $[0, 140\text{ km/h}]$. Heading must be within $[0, 359.99^\circ]$.

### 4.4 Monotonic Ordering & Replay Protection
To prevent out-of-order telemetry or replayed breadcrumbs from regressing the authoritative position:
1. `TrackingService.ingestTelemetry()` opens a transaction with tenant context (`withTenantTransaction(device.tenantId)`).
2. It locks the authoritative record:
   ```sql
   SELECT last_recorded_at FROM latest_vehicle_positions WHERE vehicle_id = $1 FOR UPDATE
   ```
3. If an authoritative position exists and $t_{event} \le t_{latest}$, the transaction rejects the write with HTTP 409 Conflict (`REPLAYED_OR_OUT_OF_ORDER_TELEMETRY`).
4. Upon successful validation, it atomically logs the breadcrumb into `vehicle_telemetry_logs` and upserts `latest_vehicle_positions`.

---

## 5. Location Freshness Rules & Shift Lifecycle

Freshness is computed server-side from `serverNow - lastRecordedAt`:

| Elapsed Time ($\Delta t$) | Active Shift Status | Shift Ended (`COMPLETED`, `CANCELLED`, `PLANNED`) | Description |
| :--- | :--- | :--- | :--- |
| $\Delta t \le 60\text{ seconds}$ | `CURRENT` | `UNAVAILABLE` | Vehicle actively reporting in real-time. |
| $61\text{s} \le \Delta t \le 300\text{s}$ | `STALE` | `UNAVAILABLE` | Transient signal loss or delayed transmission. |
| $\Delta t > 300\text{ seconds}$ | `UNAVAILABLE` | `UNAVAILABLE` | Vehicle offline, tracker unpowered, or out of range. |
| Negative drift ($\Delta t < 0$, $\le 30$s) | `CURRENT` | `UNAVAILABLE` | Minor clock skew safely handled as current ($0$s elapsed). |

### Strict Shift-End Invariant
If a vehicle's scheduled collection shift transitions to `COMPLETED`, `CANCELLED`, or `PLANNED`, its position **immediately** becomes `UNAVAILABLE`, regardless of whether a GPS ping arrived 5 seconds prior. This ensures citizens are never misled into expecting waste collection from off-duty vehicles.

---

## 6. Citizen Access & Authorization Boundaries

### 6.1 Authentication & Role Boundaries
- `GET /api/v1/citizen/tracking` requires:
  1. Valid JWT Bearer token (`requireAuth`).
  2. Verified tenant membership (`requireVerifiedTenant`).
  3. Role restriction: `requireCitizenRole` permits only users with the `CITIZEN` role. Non-citizen roles (e.g., `MUNICIPAL_ADMIN`, `FIELD_SUPERVISOR`) attempting to access citizen tracking are rejected with HTTP 403 (`AUTH_CITIZEN_ROLE_REQUIRED`).

### 6.2 Service-Area Eligibility & Property Linkage
The system resolves citizen eligibility using actual existing schema:
1. Under tenant transaction context, queries the citizen's active registered properties:
   ```sql
   SELECT locality_id FROM properties WHERE citizen_user_id = $1 AND is_active = TRUE
   ```
2. If the citizen has zero active properties in the municipality, access is rejected with HTTP 403 (`AUTH_NO_ELIGIBLE_SERVICE_AREAS`).
3. If a citizen requests a specific locality (`?localityId=`) where they own no properties, access is rejected with HTTP 403 (`AUTH_INELIGIBLE_SERVICE_AREA`).
4. If a citizen requests a specific vehicle (`?vehicleId=`) that is not operating in their eligible localities, access is rejected with HTTP 403 (`AUTH_INELIGIBLE_VEHICLE`).

### 6.3 Response Sanitization & Privacy
The API response exposes strictly necessary operational data:
```json
{
  "status": "SUCCESS",
  "data": {
    "vehicles": [
      {
        "vehicle_id": "01940001-0000-7000-a000-000000000001",
        "registration_number": "MH-12-VH-2026-01",
        "vehicle_label": "Compactor 01 - Pine Grove",
        "vehicle_type": "COMPACTOR",
        "latitude": 18.52043,
        "longitude": 73.856743,
        "speed_kmh": 18.5,
        "heading_degrees": 85.0,
        "recorded_at": "2026-10-18T13:20:00.000Z",
        "freshness_status": "CURRENT",
        "shift_status": "ACTIVE",
        "locality_id": "01940001-0000-7000-8000-000000000001",
        "is_demo": true
      }
    ],
    "count": 1,
    "simulation_notice": "SYNTHETIC GPS TELEMETRY FIXTURE FOR TESTING AND DEMONSTRATION ONLY. NOT LIVE MUNICIPAL TRACKING DATA."
  }
}
```
**Omitted Fields:** Device serials, key prefixes, token hashes, driver PII (`driver_user_id`), internal database IDs, and telemetry breadcrumb history are strictly withheld from citizen responses.

---

## 7. Synthetic Demo Fixtures

The synthetic demo seeder (`src/db/seed.ts`) populates deterministic fixtures for Verdant Hills Municipal Council (`vhmc`) and Oceanfront Nagar Panchayat (`onp`):

| Municipality | Vehicle Registration | Device Prefix & Token | Shift Locality & Status | Freshness Scenario |
| :--- | :--- | :--- | :--- | :--- |
| Verdant Hills | `MH-12-VH-2026-01` | `dev_vhmc01` (`dev_vhmc01_s3cr3tvhmc01token`) | Pine Grove (`ACTIVE`) | `CURRENT` (Recorded 30s ago) |
| Verdant Hills | `MH-12-VH-2026-02` | `dev_vhmc02` (`dev_vhmc02_s3cr3tvhmc02token`) | Pine Grove (`COMPLETED`) | `UNAVAILABLE` (Ended shift override) |
| Verdant Hills | `MH-12-VH-2026-03` | `dev_vhmc03_rev` (Revoked status) | Cedar Valley (`PLANNED`) | `AUTH_DEVICE_REVOKED` test fixture |
| Oceanfront | `GA-01-ONP-2026-01` | `dev_onp01` (`dev_onp01_s3cr3tonp01token`) | Seaside Promenade (`ACTIVE`) | `STALE` (Recorded 120s ago) |

All demo records have `is_demo = TRUE` enforced by database triggers. All API responses include the explicit `simulation_notice` banner.

---

## 8. Verification Results & Test Execution Summary

### 8.1 Automated Test Execution Command
```bash
npm test
```
The test script executes `tsx --test --test-concurrency=1 tests/**/*.test.ts`, running 6 test suites across 63 tests.

### 8.2 Actual Test Results Summary

```
✔ Accounting Ledger & Posting Invariants (7 tests, 2.7ms)
✔ API Integration & Authorization Endpoints (7 tests, 55.4ms)
✔ Authentication & Membership Services (3 tests, 167.1ms)
✔ Configuration & Policy Foundations (10 tests, 48.1ms)
✔ PostgreSQL Database RLS Isolation & Direct SQL Integrity Tests (2 tests, 7074.8ms)
✔ Phase 5: Secure Vehicle Tracking & Telemetry Ingestion Tests (34 tests, 10554.6ms)

ℹ tests 63
ℹ suites 11
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 22760.2ms
```

### 8.3 TypeScript Compilation Verification
```bash
npm run build
```
Result: Exited cleanly with code 0 (zero compiler warnings, zero errors).

### 8.4 PostgreSQL Test Environment Details
- **Engine:** Real PostgreSQL 18.4 (`@embedded-postgres/windows-x64`) running locally on Windows.
- **Ports:** 5433 (RLS & Ledger Direct SQL suite) and 5434 (Vehicle Tracking & Telemetry suite).
- **Execution Role:** Unprivileged runtime role `waste_app_user` (`NOSUPERUSER`, `NOBYPASSRLS`).
- **Isolation:** Tests verified that missing tenant context fails closed, cross-tenant reads/writes are blocked by RLS, and tenant context does not leak across pooled database connections.

---

## 9. Security Issues Discovered & Resolved During Verification

1. **Un-Tenanted Device Lookup under RLS:**
   - *Issue:* Ingestion requests cannot know the `tenant_id` prior to device authentication. Standard RLS blocked `waste_app_user` from querying `tracking_devices`.
   - *Resolution:* Added scoped `SELECT` policies (`device_auth_lookup_tracking_devices` and `device_auth_lookup_vehicles`) that evaluate to true only when `app.device_auth_lookup = 'true'`. This setting is activated strictly within a read-only transaction during device authentication.
2. **Un-Tenanted User Membership Verification:**
   - *Issue:* When authenticating citizens and checking tenant memberships, `user_tenant_memberships` queries without tenant context returned empty results.
   - *Resolution:* Added `membership_lookup_policy` on `user_tenant_memberships` evaluating `app.membership_lookup = 'true'`, scoped strictly to membership lookup queries.
3. **Windows Temporary Directory Collision between Test Suites:**
   - *Issue:* When running `database-rls.test.ts` and `vehicle-tracking.test.ts` sequentially, tearing down port 5433 collided with immediate initialization of port 5433 on the Windows file system.
   - *Resolution:* Configured dedicated test ports (5433 for ledger RLS tests, 5434 for vehicle tracking tests), eliminating directory and port lock contention.
4. **Unawaited Background Database Queries:**
   - *Issue:* In `TrackingService.authenticateDevice()`, updating `last_used_at` asynchronously without `await` allowed background queries to execute against the connection pool after test teardown.
   - *Resolution:* Awaited the `last_used_at` update within a `try/catch` block before returning the authenticated device record.

---

## 10. Confirmation of Unconfirmed Policy Areas & Strict Constraints

The platform maintains the 6 unconfirmed municipal/legal/finance policy areas as explicitly unconfirmed:

1. **GST Tax Treatment:** Marked `taxPolicyConfirmed: false`. No tax rate or exemption is hardcoded.
2. **Accounting Revenue Recognition:** Marked `accountingPolicyConfirmed: false`. Automatic revenue recognition remains blocked.
3. **Statutory Data Retention:** Designated as provisional engineering proposals pending legal sign-off.
4. **Property Identifier Strategy:** Supports platform identifiers and configurable translation mappings without assuming municipal PIN adoption.
5. **Complaint Photo Privacy:** Face and license-plate redaction remains a configurable policy option.
6. **Doorstep Cash Collection:** Strictly deactivated (`doorstepCashEnabled: false`).

### Boundary Confirmations
- **No Phase 6 Work:** Citizen complaint lifecycle and service request ticketing have not been started.
- **No Payments or Integrations:** No payment gateways, doorstep cash workflows, ERP exports, or live GPS hardware integrations were implemented.
- **No Real Municipal Feeds:** All coordinates, vehicles, and devices are synthetic fixtures.

---

## 11. Completion Verification Gate

Phase 5 has met all objective criteria:
- [x] Secure vehicle and tracking device schema with tenant RLS.
- [x] Secure telemetry ingestion with rotatable, revocable credentials.
- [x] Authoritative latest vehicle position with replay protection.
- [x] Location freshness ($60$s, $300$s) and shift-end override invariants.
- [x] Citizen tracking restricted by property-based service area eligibility.
- [x] Deterministic synthetic demo fixtures clearly labeled.
- [x] 63 automated tests passing against real PostgreSQL 18.4 with 0 failures and 0 skips.
- [x] Clean TypeScript build (`npm run build`).

**Status:** Ready for stakeholder review before proceeding to Phase 6.
