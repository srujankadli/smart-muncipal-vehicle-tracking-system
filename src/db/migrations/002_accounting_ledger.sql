-- Migration: 002_accounting_ledger.sql
-- Description: Double-entry general ledger schema, chart of accounts, and invariant constraints
-- Phase: 4 (Core Multi-Tenant Backend & Master Data)

-- 1. Chart of Accounts (Per-tenant account structure)
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    account_code VARCHAR(50) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    normal_balance VARCHAR(10) NOT NULL, -- DEBIT, CREDIT
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_account_type CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    CONSTRAINT chk_normal_balance CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
    CONSTRAINT uq_tenant_account_code UNIQUE (tenant_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_coa_tenant_id ON chart_of_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coa_account_code ON chart_of_accounts(tenant_id, account_code);

-- 2. Journal Entries (Headers representing discrete accounting events)
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entry_number VARCHAR(100) NOT NULL,
    posting_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    business_event_type VARCHAR(100) NOT NULL,
    business_event_id VARCHAR(100) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    reversal_of_entry_id UUID REFERENCES journal_entries(id),
    description TEXT NOT NULL,
    created_by_user_id UUID REFERENCES users(id),
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    posted_at TIMESTAMPTZ,
    -- Invariant: Status can only be DRAFT or POSTED. Never mutated to REVERSED.
    CONSTRAINT chk_journal_entry_status CHECK (status IN ('DRAFT', 'POSTED')),
    -- Invariant: Business event idempotency per tenant
    CONSTRAINT uq_tenant_business_event UNIQUE (tenant_id, business_event_type, business_event_id),
    -- Invariant: Entry number unique per tenant
    CONSTRAINT uq_tenant_entry_number UNIQUE (tenant_id, entry_number)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_id ON journal_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_posting_date ON journal_entries(tenant_id, posting_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reversal ON journal_entries(reversal_of_entry_id);

-- 3. Journal Entry Lines (Atomic debit and credit postings)
CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    line_number INTEGER NOT NULL,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    entry_type VARCHAR(10) NOT NULL, -- DEBIT, CREDIT
    amount_minor_units BIGINT NOT NULL, -- Integer minor units (paise)
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    memo TEXT,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_journal_entry_type CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    -- Invariant: Monetary amounts must be strictly positive integers
    CONSTRAINT chk_journal_amount_positive CHECK (amount_minor_units > 0),
    CONSTRAINT uq_journal_line_number UNIQUE (journal_entry_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal_entry_id ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_tenant_id ON journal_entry_lines(tenant_id);
