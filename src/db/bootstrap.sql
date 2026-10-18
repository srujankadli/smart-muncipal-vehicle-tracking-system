-- ==============================================================================
-- DATABASE BOOTSTRAP SCRIPT (OUT-OF-BAND CLUSTER ADMINISTRATOR EXECUTION)
-- ==============================================================================
-- File: src/db/bootstrap.sql
-- Role: Must be executed by cluster administrator (e.g. postgres or cloud DBA)
-- Purpose: Safely provisions isolated database roles and schema ownership BEFORE
--          ordinary application migrations are executed.
--
-- PRIVILEGE MODEL:
-- 1. waste_dba_admin: Out-of-band administration role for database setup.
-- 2. waste_migration_user: Dedicated schema owner (NOSUPERUSER, NOBYPASSRLS).
--    Owns the application schema and tables; executes DDL migrations.
-- 3. waste_app_user: Unprivileged runtime application role (NOSUPERUSER, NOBYPASSRLS).
--    Restricted to DML operations on tenant tables and strictly constrained by RLS.
-- ==============================================================================

-- 1. Create Dedicated Roles with Safe, Idempotent Checks
DO $$
BEGIN
    -- 1.1 Out-of-band DBA Administrator
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'waste_dba_admin') THEN
        CREATE ROLE waste_dba_admin WITH 
            LOGIN 
            SUPERUSER 
            CREATEDB 
            CREATEROLE 
            REPLICATION 
            PASSWORD 'dba_local_dev_secret_only';
    END IF;

    -- 1.2 Migration Role: Non-superuser, No BypassRLS, Owns schema/tables for DDL
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'waste_migration_user') THEN
        CREATE ROLE waste_migration_user WITH 
            LOGIN 
            NOSUPERUSER 
            NOBYPASSRLS 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION 
            PASSWORD 'migration_local_dev_secret_only';
    ELSE
        ALTER ROLE waste_migration_user WITH NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;

    -- 1.3 Runtime Role: Non-superuser, No BypassRLS, DML only, constrained by RLS
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'waste_app_user') THEN
        CREATE ROLE waste_app_user WITH 
            LOGIN 
            NOSUPERUSER 
            NOBYPASSRLS 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION 
            PASSWORD 'app_local_dev_secret_only';
    ELSE
        ALTER ROLE waste_app_user WITH NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

-- 2. Required Core Extensions (Executed as cluster administrator)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 3. Schema Ownership and Permissions Setup
-- Assign schema public ownership or table creation rights to waste_migration_user
GRANT ALL ON SCHEMA public TO waste_migration_user;
ALTER SCHEMA public OWNER TO waste_migration_user;

-- Revoke default public schema creation permissions from untrusted users
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 4. Database Connection Grants
-- Execute dynamic grant for current database context
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO waste_migration_user, waste_app_user', current_database());
END
$$;

-- 4. Verification Assertion Query
-- Output role attributes to verify privilege boundaries
SELECT 
    rolname, 
    rolsuper, 
    rolinherit, 
    rolcreaterole, 
    rolcreatedb, 
    rolcanlogin, 
    rolbypassrls 
FROM pg_roles 
WHERE rolname IN ('waste_dba_admin', 'waste_migration_user', 'waste_app_user')
ORDER BY rolname;
