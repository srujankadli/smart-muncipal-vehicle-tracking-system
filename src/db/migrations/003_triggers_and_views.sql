-- Migration: 003_triggers_and_views.sql
-- Description: Integrity triggers for demo isolation, posted immutability, and production reporting views
-- Phase: 4 (Core Multi-Tenant Backend & Master Data)

-- 1. Demo Inheritance Trigger Function
CREATE OR REPLACE FUNCTION fn_enforce_tenant_demo_inheritance()
RETURNS TRIGGER AS $$
DECLARE
    v_tenant_is_demo BOOLEAN;
BEGIN
    SELECT is_demo INTO v_tenant_is_demo FROM tenants WHERE id = NEW.tenant_id;
    
    IF v_tenant_is_demo IS NULL THEN
        RAISE EXCEPTION 'INVALID_TENANT: Tenant % does not exist', NEW.tenant_id;
    END IF;

    IF v_tenant_is_demo = TRUE THEN
        NEW.is_demo := TRUE;
    ELSE
        -- Production tenant: strictly block demo records
        IF NEW.is_demo = TRUE THEN
            RAISE EXCEPTION 'DEMO_DATA_CONTAMINATION: Cannot insert demo records into production tenant %', NEW.tenant_id;
        END IF;
        NEW.is_demo := FALSE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach demo inheritance triggers to all tenant-scoped tables
DROP TRIGGER IF EXISTS trg_demo_inheritance_municipalities ON municipalities;
CREATE TRIGGER trg_demo_inheritance_municipalities
    BEFORE INSERT OR UPDATE ON municipalities
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_wards ON wards;
CREATE TRIGGER trg_demo_inheritance_wards
    BEFORE INSERT OR UPDATE ON wards
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_localities ON localities;
CREATE TRIGGER trg_demo_inheritance_localities
    BEFORE INSERT OR UPDATE ON localities
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_memberships ON user_tenant_memberships;
CREATE TRIGGER trg_demo_inheritance_memberships
    BEFORE INSERT OR UPDATE ON user_tenant_memberships
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_properties ON properties;
CREATE TRIGGER trg_demo_inheritance_properties
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_rates ON assessment_rates;
CREATE TRIGGER trg_demo_inheritance_rates
    BEFORE INSERT OR UPDATE ON assessment_rates
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_coa ON chart_of_accounts;
CREATE TRIGGER trg_demo_inheritance_coa
    BEFORE INSERT OR UPDATE ON chart_of_accounts
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_journals ON journal_entries;
CREATE TRIGGER trg_demo_inheritance_journals
    BEFORE INSERT OR UPDATE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_demo_inheritance_lines ON journal_entry_lines;
CREATE TRIGGER trg_demo_inheritance_lines
    BEFORE INSERT OR UPDATE ON journal_entry_lines
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();


-- 2. Posted Journal Invariant Enforcement & Header Immutability Trigger
CREATE OR REPLACE FUNCTION fn_prevent_posted_journal_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_line_count INTEGER;
    v_debit_count INTEGER;
    v_credit_count INTEGER;
    v_total_debits BIGINT;
    v_total_credits BIGINT;
    v_currency_mismatch_count INTEGER;
    v_invalid_account_count INTEGER;
    v_inactive_account_count INTEGER;
    v_orig_status VARCHAR(20);
    v_orig_tenant_id UUID;
BEGIN
    -- Case A: Deletion Defense
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'POSTED' THEN
            RAISE EXCEPTION 'IMMUTABLE_RECORD: Posted journal entry % cannot be deleted. Create a compensating reversal entry instead.', OLD.entry_number;
        END IF;
        RETURN OLD;
    END IF;

    -- Case B: Insertion Defense
    -- Direct insertion with status = POSTED is blocked because lines cannot exist before the header.
    -- All journal entries must be created in DRAFT, have lines inserted, and then transition to POSTED.
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'POSTED' THEN
            RAISE EXCEPTION 'INVALID_POSTING_WORKFLOW: Journal entry % cannot be directly created in POSTED status. Create in DRAFT, insert lines, and transition to POSTED.', NEW.entry_number;
        END IF;
        RETURN NEW;
    END IF;

    -- Case C: Update Defense & Posting Invariants Enforcement
    IF TG_OP = 'UPDATE' THEN
        -- If already POSTED, block ANY mutation (even to mark REVERSED)
        IF OLD.status = 'POSTED' THEN
            RAISE EXCEPTION 'IMMUTABLE_RECORD: Posted journal entry % cannot be modified. Status is immutable and cannot be changed or reversed in-place. Create a compensating reversal entry instead.', OLD.entry_number;
        END IF;

        -- Validate transition from DRAFT to POSTED
        IF OLD.status = 'DRAFT' AND NEW.status = 'POSTED' THEN
            -- Invariant 1: Line count, debit/credit count, and mathematical balance
            SELECT 
                COUNT(*),
                COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount_minor_units ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor_units ELSE 0 END), 0)
            INTO 
                v_line_count,
                v_debit_count,
                v_credit_count,
                v_total_debits,
                v_total_credits
            FROM journal_entry_lines
            WHERE journal_entry_id = NEW.id;

            IF v_line_count < 2 THEN
                RAISE EXCEPTION 'INSUFFICIENT_LINES: Cannot post journal entry %. At least two lines required, found %', NEW.entry_number, v_line_count;
            END IF;

            IF v_debit_count < 1 OR v_credit_count < 1 THEN
                RAISE EXCEPTION 'MISSING_TWO_SIDED_PARTICIPATION: Cannot post journal entry %. At least one DEBIT and at least one CREDIT required.', NEW.entry_number;
            END IF;

            IF v_total_debits != v_total_credits THEN
                RAISE EXCEPTION 'UNBALANCED_JOURNAL: Cannot post journal entry %. Total debits (% paise) do not equal total credits (% paise).', NEW.entry_number, v_total_debits, v_total_credits;
            END IF;

            IF v_total_debits <= 0 THEN
                RAISE EXCEPTION 'ZERO_AMOUNT_JOURNAL: Cannot post journal entry with zero or negative total amount.';
            END IF;

            -- Invariant 2: Currency consistency between header and all lines
            SELECT COUNT(*) INTO v_currency_mismatch_count
            FROM journal_entry_lines
            WHERE journal_entry_id = NEW.id AND currency != NEW.currency;

            IF v_currency_mismatch_count > 0 THEN
                RAISE EXCEPTION 'CURRENCY_MISMATCH: All lines must match journal header currency %.', NEW.currency;
            END IF;

            -- Invariant 3: Valid active accounts belonging to the correct tenant
            SELECT COUNT(*) INTO v_invalid_account_count
            FROM journal_entry_lines l
            LEFT JOIN chart_of_accounts a ON a.id = l.account_id AND a.tenant_id = NEW.tenant_id
            WHERE l.journal_entry_id = NEW.id AND a.id IS NULL;

            IF v_invalid_account_count > 0 THEN
                RAISE EXCEPTION 'INVALID_ACCOUNT: All lines must reference valid chart_of_accounts belonging to tenant %.', NEW.tenant_id;
            END IF;

            SELECT COUNT(*) INTO v_inactive_account_count
            FROM journal_entry_lines l
            JOIN chart_of_accounts a ON a.id = l.account_id
            WHERE l.journal_entry_id = NEW.id AND a.is_active = FALSE;

            IF v_inactive_account_count > 0 THEN
                RAISE EXCEPTION 'INACTIVE_ACCOUNT: Cannot post journal entry referencing inactive accounts.';
            END IF;

            -- Invariant 4: Compensating Reversal Integrity
            IF NEW.business_event_type = 'COMPENSATING_REVERSAL' THEN
                IF NEW.reversal_of_entry_id IS NULL THEN
                    RAISE EXCEPTION 'INVALID_REVERSAL: Compensating reversal entries must reference reversal_of_entry_id.';
                END IF;

                SELECT status, tenant_id INTO v_orig_status, v_orig_tenant_id
                FROM journal_entries WHERE id = NEW.reversal_of_entry_id;

                IF v_orig_status IS NULL OR v_orig_tenant_id != NEW.tenant_id THEN
                    RAISE EXCEPTION 'INVALID_REVERSAL: Target entry % does not exist within tenant %.', NEW.reversal_of_entry_id, NEW.tenant_id;
                END IF;

                IF v_orig_status != 'POSTED' THEN
                    RAISE EXCEPTION 'INVALID_REVERSAL: Can only reverse POSTED entries. Target entry % status is %.', NEW.reversal_of_entry_id, v_orig_status;
                END IF;

                -- Prevent multiple compensating reversals of the same original entry
                IF EXISTS (
                    SELECT 1 FROM journal_entries 
                    WHERE reversal_of_entry_id = NEW.reversal_of_entry_id 
                      AND id != NEW.id
                ) THEN
                    RAISE EXCEPTION 'ALREADY_REVERSED: Journal entry % has already been reversed by another entry.', NEW.reversal_of_entry_id;
                END IF;
            END IF;

            NEW.posted_at := COALESCE(NEW.posted_at, CURRENT_TIMESTAMP);
            RETURN NEW;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_posted_journal_mutation ON journal_entries;
CREATE TRIGGER trg_prevent_posted_journal_mutation
    BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_posted_journal_mutation();


-- 3. Posted Journal Line Immutability Trigger
CREATE OR REPLACE FUNCTION fn_prevent_posted_line_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_parent_status VARCHAR(20);
    v_target_journal_id UUID;
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        v_target_journal_id := OLD.journal_entry_id;
    ELSE
        v_target_journal_id := NEW.journal_entry_id;
    END IF;

    SELECT status INTO v_parent_status FROM journal_entries WHERE id = v_target_journal_id;

    IF v_parent_status = 'POSTED' THEN
        RAISE EXCEPTION 'IMMUTABLE_RECORD: Journal lines cannot be added, modified, or deleted for posted journal entry %. Create a compensating reversal entry instead.', v_target_journal_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_posted_line_mutation ON journal_entry_lines;
CREATE TRIGGER trg_prevent_posted_line_mutation
    BEFORE INSERT OR UPDATE OR DELETE ON journal_entry_lines
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_posted_line_mutation();


-- 4. Production Reporting Views (Non-updatable views excluding demo data)
CREATE OR REPLACE VIEW v_prod_journal_entries AS
SELECT 
    je.id,
    je.tenant_id,
    t.name AS municipality_name,
    je.entry_number,
    je.posting_date,
    je.status,
    je.business_event_type,
    je.business_event_id,
    je.currency,
    je.reversal_of_entry_id,
    je.description,
    je.created_by_user_id,
    je.created_at,
    je.posted_at
FROM journal_entries je
JOIN tenants t ON t.id = je.tenant_id
WHERE je.is_demo = FALSE 
  AND t.is_demo = FALSE;

CREATE OR REPLACE VIEW v_prod_properties AS
SELECT 
    p.id,
    p.tenant_id,
    t.name AS municipality_name,
    p.locality_id,
    p.citizen_user_id,
    p.property_identifier,
    p.property_type,
    p.address_line,
    p.is_active,
    p.created_at,
    p.updated_at
FROM properties p
JOIN tenants t ON t.id = p.tenant_id
WHERE p.is_demo = FALSE 
  AND t.is_demo = FALSE;

CREATE OR REPLACE VIEW v_prod_assessment_rates AS
SELECT 
    ar.id,
    ar.tenant_id,
    t.name AS municipality_name,
    ar.property_type,
    ar.billing_frequency,
    ar.base_fee_minor_units,
    ar.tax_rate_basis_points,
    ar.tax_status_note,
    ar.effective_from,
    ar.effective_to,
    ar.is_active,
    ar.created_at,
    ar.updated_at
FROM assessment_rates ar
JOIN tenants t ON t.id = ar.tenant_id
WHERE ar.is_demo = FALSE 
  AND t.is_demo = FALSE;
