-- Migration: 004_roles_and_rls.sql
-- Description: Tripartite role definition, Row Level Security (RLS) enablement, and tenant isolation policies
-- Phase: 4 (Core Multi-Tenant Backend & Master Data)

-- 1. Verify Dedicated Roles Provisioned by Bootstrap
-- Roles must be provisioned out-of-band by the cluster administrator using src/db/bootstrap.sql
-- waste_migration_user is a non-superuser role executing this migration.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'waste_app_user') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Role waste_app_user must be provisioned via src/db/bootstrap.sql before running migrations.';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'waste_migration_user') THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Role waste_migration_user must be provisioned via src/db/bootstrap.sql before running migrations.';
    END IF;
END
$$;

-- 2. Enable and Force Row Level Security (RLS) on all tenant-owned tables
-- FORCE ROW LEVEL SECURITY ensures the table owner is also constrained by RLS
ALTER TABLE municipalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE municipalities FORCE ROW LEVEL SECURITY;

ALTER TABLE wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE wards FORCE ROW LEVEL SECURITY;

ALTER TABLE localities ENABLE ROW LEVEL SECURITY;
ALTER TABLE localities FORCE ROW LEVEL SECURITY;

ALTER TABLE user_tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenant_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties FORCE ROW LEVEL SECURITY;

ALTER TABLE assessment_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_rates FORCE ROW LEVEL SECURITY;

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines FORCE ROW LEVEL SECURITY;

-- 3. Define Standard Tenant Isolation Policies
-- Policy restricts access to rows matching transaction-local session variable app.current_tenant_id
DROP POLICY IF EXISTS tenant_isolation_municipalities ON municipalities;
CREATE POLICY tenant_isolation_municipalities ON municipalities
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_wards ON wards;
CREATE POLICY tenant_isolation_wards ON wards
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_localities ON localities;
CREATE POLICY tenant_isolation_localities ON localities
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_memberships ON user_tenant_memberships;
CREATE POLICY tenant_isolation_memberships ON user_tenant_memberships
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_properties ON properties;
CREATE POLICY tenant_isolation_properties ON properties
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_rates ON assessment_rates;
CREATE POLICY tenant_isolation_rates ON assessment_rates
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_coa ON chart_of_accounts;
CREATE POLICY tenant_isolation_coa ON chart_of_accounts
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_journals ON journal_entries;
CREATE POLICY tenant_isolation_journals ON journal_entries
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_lines ON journal_entry_lines;
CREATE POLICY tenant_isolation_lines ON journal_entry_lines
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

-- 4. Grant Least-Privilege DML Permissions to waste_app_user
GRANT USAGE ON SCHEMA public TO waste_app_user;

-- Public reference tables (read-only for app user)
GRANT SELECT ON tenants, user_roles TO waste_app_user;

-- User accounts (selective DML)
GRANT SELECT, INSERT, UPDATE ON users TO waste_app_user;

-- Tenant-owned operational tables (DML permitted under RLS constraint)
GRANT SELECT, INSERT, UPDATE, DELETE ON 
    municipalities, 
    wards, 
    localities, 
    user_tenant_memberships, 
    properties, 
    assessment_rates, 
    chart_of_accounts, 
    journal_entries, 
    journal_entry_lines
TO waste_app_user;

-- Production reporting views
GRANT SELECT ON 
    v_prod_journal_entries, 
    v_prod_properties, 
    v_prod_assessment_rates 
TO waste_app_user;

-- Sequence permissions for auto-increment IDs
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO waste_app_user;
