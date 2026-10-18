-- Migration: 005_vehicle_tracking.sql
-- Description: Vehicle tracking schema, device credentials, shifts, telemetry logs, and latest positions
-- Phase: 5 (Secure Vehicle Tracking)

-- 1. Vehicles (Fleet master data owned by tenant)
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    registration_number VARCHAR(32) NOT NULL,
    vehicle_label VARCHAR(64) NOT NULL,
    vehicle_type VARCHAR(32) NOT NULL DEFAULT 'TIPPER',
    capacity_metric_tonnes NUMERIC(4, 2) NOT NULL DEFAULT 2.50,
    operational_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_vehicle_type CHECK (vehicle_type IN ('COMPACTOR', 'TIPPER', 'AUTO_TIPPER', 'TRACTOR', 'OTHER')),
    CONSTRAINT chk_vehicle_operational_status CHECK (operational_status IN ('ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED')),
    CONSTRAINT uq_tenant_vehicle_registration UNIQUE (tenant_id, registration_number)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant_id ON vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_operational_status ON vehicles(tenant_id, operational_status);

-- 2. Tracking Devices (Cryptographic credential binding per vehicle)
CREATE TABLE IF NOT EXISTS tracking_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    device_serial VARCHAR(64) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    secondary_token_hash VARCHAR(255),
    secondary_expires_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    last_used_at TIMESTAMPTZ,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_device_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
    CONSTRAINT uq_tenant_vehicle_device UNIQUE (tenant_id, vehicle_id),
    CONSTRAINT uq_tenant_device_serial UNIQUE (tenant_id, device_serial),
    CONSTRAINT uq_device_key_prefix UNIQUE (key_prefix)
);

CREATE INDEX IF NOT EXISTS idx_tracking_devices_tenant_id ON tracking_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tracking_devices_lookup ON tracking_devices(key_prefix, status);

-- 3. Vehicle Shifts (Scheduled & operational shifts binding vehicles to service areas)
CREATE TABLE IF NOT EXISTS vehicle_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    driver_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    locality_id UUID REFERENCES localities(id) ON DELETE RESTRICT,
    shift_date DATE NOT NULL,
    shift_status VARCHAR(32) NOT NULL DEFAULT 'PLANNED',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_shift_status CHECK (shift_status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_shifts_tenant_id ON vehicle_shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_shifts_vehicle_status ON vehicle_shifts(tenant_id, vehicle_id, shift_status);
CREATE INDEX IF NOT EXISTS idx_vehicle_shifts_locality ON vehicle_shifts(tenant_id, locality_id, shift_status);

-- 4. Vehicle Telemetry Logs (Historical GPS breadcrumbs)
CREATE TABLE IF NOT EXISTS vehicle_telemetry_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    device_id UUID NOT NULL REFERENCES tracking_devices(id) ON DELETE RESTRICT,
    shift_id UUID REFERENCES vehicle_shifts(id) ON DELETE SET NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    speed_kmh NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    heading_degrees NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    event_timestamp TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    validation_status VARCHAR(32) NOT NULL DEFAULT 'ACCEPTED',
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_telemetry_lat CHECK (latitude BETWEEN -90.0000000 AND 90.0000000),
    CONSTRAINT chk_telemetry_lon CHECK (longitude BETWEEN -180.0000000 AND 180.0000000),
    CONSTRAINT chk_telemetry_speed CHECK (speed_kmh >= 0.00 AND speed_kmh <= 140.00),
    CONSTRAINT chk_telemetry_heading CHECK (heading_degrees >= 0.00 AND heading_degrees < 360.00),
    CONSTRAINT chk_telemetry_status CHECK (validation_status IN ('ACCEPTED', 'REJECTED_OUT_OF_BOUNDS', 'REJECTED_FUTURE_TIMESTAMP', 'REJECTED_OUT_OF_ORDER', 'REJECTED_SPEED_SPIKE'))
);

CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_vehicle ON vehicle_telemetry_logs(tenant_id, vehicle_id, event_timestamp DESC);

-- 5. Latest Vehicle Positions (Authoritative 1-to-1 operational snapshot)
CREATE TABLE IF NOT EXISTS latest_vehicle_positions (
    vehicle_id UUID PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    device_id UUID NOT NULL REFERENCES tracking_devices(id) ON DELETE RESTRICT,
    shift_id UUID REFERENCES vehicle_shifts(id) ON DELETE SET NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    speed_kmh NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    heading_degrees NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    last_recorded_at TIMESTAMPTZ NOT NULL,
    last_received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    freshness_status VARCHAR(16) NOT NULL DEFAULT 'UNAVAILABLE',
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_latest_freshness CHECK (freshness_status IN ('CURRENT', 'STALE', 'UNAVAILABLE')),
    CONSTRAINT chk_latest_lat CHECK (latitude BETWEEN -90.0000000 AND 90.0000000),
    CONSTRAINT chk_latest_lon CHECK (longitude BETWEEN -180.0000000 AND 180.0000000)
);

CREATE INDEX IF NOT EXISTS idx_latest_positions_tenant_id ON latest_vehicle_positions(tenant_id);

-- 6. Attach Demo Data Inheritance Triggers
DROP TRIGGER IF EXISTS trg_demo_inheritance_vehicles ON vehicles;
CREATE TRIGGER trg_demo_inheritance_vehicles
    BEFORE INSERT OR UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_tracking_devices ON tracking_devices;
CREATE TRIGGER trg_demo_inheritance_tracking_devices
    BEFORE INSERT OR UPDATE ON tracking_devices
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_vehicle_shifts ON vehicle_shifts;
CREATE TRIGGER trg_demo_inheritance_vehicle_shifts
    BEFORE INSERT OR UPDATE ON vehicle_shifts
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_telemetry_logs ON vehicle_telemetry_logs;
CREATE TRIGGER trg_demo_inheritance_telemetry_logs
    BEFORE INSERT OR UPDATE ON vehicle_telemetry_logs
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_latest_positions ON latest_vehicle_positions;
CREATE TRIGGER trg_demo_inheritance_latest_positions
    BEFORE INSERT OR UPDATE ON latest_vehicle_positions
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

-- 7. Enable and Force Row Level Security (RLS) on all tenant-owned tracking tables
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;

ALTER TABLE tracking_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_devices FORCE ROW LEVEL SECURITY;

ALTER TABLE vehicle_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_shifts FORCE ROW LEVEL SECURITY;

ALTER TABLE vehicle_telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_telemetry_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE latest_vehicle_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE latest_vehicle_positions FORCE ROW LEVEL SECURITY;

-- 8. Define Standard Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_isolation_vehicles ON vehicles;
CREATE POLICY tenant_isolation_vehicles ON vehicles
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_tracking_devices ON tracking_devices;
CREATE POLICY tenant_isolation_tracking_devices ON tracking_devices
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_vehicle_shifts ON vehicle_shifts;
CREATE POLICY tenant_isolation_vehicle_shifts ON vehicle_shifts
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_telemetry_logs ON vehicle_telemetry_logs;
CREATE POLICY tenant_isolation_telemetry_logs ON vehicle_telemetry_logs
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_latest_positions ON latest_vehicle_positions;
CREATE POLICY tenant_isolation_latest_positions ON latest_vehicle_positions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

-- Scoped permissive SELECT policy specifically for device authentication by key prefix
DROP POLICY IF EXISTS device_auth_lookup_tracking_devices ON tracking_devices;
CREATE POLICY device_auth_lookup_tracking_devices ON tracking_devices
    FOR SELECT
    USING (current_setting('app.device_auth_lookup', true) = 'true');

DROP POLICY IF EXISTS device_auth_lookup_vehicles ON vehicles;
CREATE POLICY device_auth_lookup_vehicles ON vehicles
    FOR SELECT
    USING (current_setting('app.device_auth_lookup', true) = 'true');

DROP POLICY IF EXISTS membership_lookup_policy ON user_tenant_memberships;
CREATE POLICY membership_lookup_policy ON user_tenant_memberships
    FOR SELECT
    USING (current_setting('app.membership_lookup', true) = 'true');

-- 9. Grant Least-Privilege DML Permissions to waste_app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON 
    vehicles, 
    tracking_devices, 
    vehicle_shifts, 
    vehicle_telemetry_logs, 
    latest_vehicle_positions
TO waste_app_user;
