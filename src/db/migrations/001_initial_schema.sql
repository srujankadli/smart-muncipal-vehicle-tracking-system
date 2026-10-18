-- Migration: 001_initial_schema.sql
-- Description: Core master data schema for multi-tenant municipal waste platform
-- Phase: 4 (Core Multi-Tenant Backend & Master Data)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration Tracking Table
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. Tenants (Municipal entities isolated at tenant boundary)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_is_demo ON tenants(is_demo);

-- 2. Municipalities (Tenant metadata & physical headquarters)
CREATE TABLE IF NOT EXISTS municipalities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE RESTRICT,
    official_name VARCHAR(255) NOT NULL,
    state_or_ut VARCHAR(100) NOT NULL,
    classification VARCHAR(50) NOT NULL, -- MUNICIPAL_CORPORATION, MUNICIPAL_COUNCIL, NAGAR_PANCHAYAT
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    center_latitude NUMERIC(10, 7) NOT NULL,
    center_longitude NUMERIC(10, 7) NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_municipalities_tenant_id ON municipalities(tenant_id);

-- 3. Wards (Subdivisions within a municipality)
CREATE TABLE IF NOT EXISTS wards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    ward_number VARCHAR(20) NOT NULL,
    ward_name VARCHAR(255) NOT NULL,
    center_latitude NUMERIC(10, 7) NOT NULL,
    center_longitude NUMERIC(10, 7) NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_ward_number UNIQUE (tenant_id, ward_number)
);

CREATE INDEX IF NOT EXISTS idx_wards_tenant_id ON wards(tenant_id);

-- 4. Localities (Micro-zones / neighborhoods within a ward)
CREATE TABLE IF NOT EXISTS localities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    ward_id UUID NOT NULL REFERENCES wards(id) ON DELETE RESTRICT,
    locality_name VARCHAR(255) NOT NULL,
    center_latitude NUMERIC(10, 7) NOT NULL,
    center_longitude NUMERIC(10, 7) NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ward_locality_name UNIQUE (ward_id, locality_name)
);

CREATE INDEX IF NOT EXISTS idx_localities_tenant_id ON localities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_localities_ward_id ON localities(ward_id);

-- 5. Users (Global platform accounts; tenant access requires explicit membership)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile_number VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_mobile_number ON users(mobile_number);

-- 6. User Roles (Standard platform authorization roles)
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

-- Seed standard roles
INSERT INTO user_roles (role_name, description) VALUES
    ('SUPER_ADMIN', 'Platform operator with cross-tenant diagnostic access'),
    ('MUNICIPAL_ADMIN', 'Chief municipal officer or sanitation superintendent'),
    ('FIELD_SUPERVISOR', 'Sanitation inspector managing routes and collection staff'),
    ('COLLECTION_STAFF', 'Vehicle driver or collection assistant'),
    ('CITIZEN', 'Resident or commercial property owner receiving service')
ON CONFLICT (role_name) DO NOTHING;

-- 7. User Tenant Memberships (Verified membership linking user to tenant with specific role)
CREATE TABLE IF NOT EXISTS user_tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    role_id UUID NOT NULL REFERENCES user_roles(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_tenant_membership UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON user_tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_id ON user_tenant_memberships(tenant_id);

-- 8. Properties / Service Accounts (Waste collection billing and service accounts)
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    locality_id UUID NOT NULL REFERENCES localities(id) ON DELETE RESTRICT,
    citizen_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    property_identifier VARCHAR(100) NOT NULL, -- Configurable strategy (Platform ID, Municipal PIN, or Mapping)
    property_type VARCHAR(50) NOT NULL, -- RESIDENTIAL, COMMERCIAL, INSTITUTIONAL
    address_line TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_property_identifier UNIQUE (tenant_id, property_identifier)
);

CREATE INDEX IF NOT EXISTS idx_properties_tenant_id ON properties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_properties_locality_id ON properties(locality_id);
CREATE INDEX IF NOT EXISTS idx_properties_citizen_user_id ON properties(citizen_user_id);

-- 9. Assessment Rates / Tariffs (Fee structure per property type in integer minor units)
CREATE TABLE IF NOT EXISTS assessment_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    property_type VARCHAR(50) NOT NULL,
    billing_frequency VARCHAR(50) NOT NULL DEFAULT 'MONTHLY',
    base_fee_minor_units BIGINT NOT NULL, -- In paise (integer minor units)
    tax_rate_basis_points INTEGER, -- Configurable/provisional; null means unconfirmed
    tax_status_note VARCHAR(255) NOT NULL DEFAULT 'UNCONFIRMED_PENDING_TAX_AUTHORITY_REVIEW',
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rates_tenant_property_type ON assessment_rates(tenant_id, property_type);
