-- Migration: 006_payments.sql
-- Description: Phase 6 Payments Foundation Schema, Bills, Payment Transactions, Webhook Audit Events, and RLS
-- Phase: 6 (Payments Foundation)

-- 1. Bills (Municipal Assessment Invoices)
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    citizen_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    bill_number VARCHAR(64) NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    amount_due_minor_units BIGINT NOT NULL,
    amount_paid_minor_units BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'UNPAID',
    due_date DATE NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_bill_status CHECK (status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
    CONSTRAINT chk_bill_amounts CHECK (
        amount_due_minor_units > 0 AND 
        amount_paid_minor_units >= 0 AND 
        amount_paid_minor_units <= amount_due_minor_units
    ),
    CONSTRAINT uq_tenant_bill_number UNIQUE (tenant_id, bill_number)
);

CREATE INDEX IF NOT EXISTS idx_bills_tenant_id ON bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bills_tenant_property ON bills(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_bills_tenant_citizen ON bills(tenant_id, citizen_user_id);
CREATE INDEX IF NOT EXISTS idx_bills_tenant_status ON bills(tenant_id, status);

-- 2. Payment Transactions (Operational Payment Attempt / Settlement Container)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bill_id UUID REFERENCES bills(id) ON DELETE RESTRICT,
    property_id UUID REFERENCES properties(id) ON DELETE RESTRICT,
    citizen_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    payment_method VARCHAR(32) NOT NULL,
    amount_minor_units BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    gateway_provider VARCHAR(32),
    gateway_order_id VARCHAR(128),
    gateway_payment_id VARCHAR(128),
    receipt_number VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128),
    failure_reason TEXT,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_method CHECK (payment_method IN ('ONLINE_GATEWAY', 'DOORSTEP_CASH', 'MUNICIPAL_COUNTER')),
    CONSTRAINT chk_payment_status CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED')),
    CONSTRAINT chk_payment_amount_positive CHECK (amount_minor_units > 0),
    CONSTRAINT uq_tenant_receipt_number UNIQUE (tenant_id, receipt_number),
    CONSTRAINT uq_tenant_payment_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_pay_tx_tenant_id ON payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pay_tx_tenant_bill ON payment_transactions(tenant_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_pay_tx_tenant_citizen ON payment_transactions(tenant_id, citizen_user_id);
CREATE INDEX IF NOT EXISTS idx_pay_tx_gateway_order ON payment_transactions(gateway_provider, gateway_order_id);
CREATE INDEX IF NOT EXISTS idx_pay_tx_gateway_payment ON payment_transactions(gateway_provider, gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_pay_tx_receipt_number ON payment_transactions(tenant_id, receipt_number);

-- 3. Payment Events (Append-only Audit Trail & Webhook Idempotency Store)
CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payment_transaction_id UUID REFERENCES payment_transactions(id) ON DELETE RESTRICT,
    gateway_provider VARCHAR(32) NOT NULL,
    gateway_event_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    processing_status VARCHAR(32) NOT NULL DEFAULT 'PROCESSED',
    error_details TEXT,
    event_payload JSONB NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_event_processing_status CHECK (processing_status IN ('PROCESSED', 'DUPLICATE_IGNORED', 'ANOMALY_PENDING_REVIEW')),
    CONSTRAINT uq_gateway_event UNIQUE (gateway_provider, gateway_event_id)
);

CREATE INDEX IF NOT EXISTS idx_pay_events_tenant_id ON payment_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pay_events_tx_id ON payment_events(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_pay_events_gateway_event ON payment_events(gateway_provider, gateway_event_id);
CREATE INDEX IF NOT EXISTS idx_pay_events_processing_status ON payment_events(tenant_id, processing_status);

-- 4. Demo Inheritance Triggers
DROP TRIGGER IF EXISTS trg_enforce_tenant_demo_bills ON bills;
CREATE TRIGGER trg_enforce_tenant_demo_bills
    BEFORE INSERT OR UPDATE ON bills
    FOR EACH ROW
    EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_enforce_tenant_demo_payment_tx ON payment_transactions;
CREATE TRIGGER trg_enforce_tenant_demo_payment_tx
    BEFORE INSERT OR UPDATE ON payment_transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

DROP TRIGGER IF EXISTS trg_enforce_tenant_demo_payment_events ON payment_events;
CREATE TRIGGER trg_enforce_tenant_demo_payment_events
    BEFORE INSERT OR UPDATE ON payment_events
    FOR EACH ROW
    EXECUTE FUNCTION fn_enforce_tenant_demo_inheritance();

-- 5. Row-Level Security (RLS) Enablement & Enforcement
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills FORCE ROW LEVEL SECURITY;

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events FORCE ROW LEVEL SECURITY;

-- Default tenant isolation policies
DROP POLICY IF EXISTS tenant_isolation_bills ON bills;
CREATE POLICY tenant_isolation_bills ON bills
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_payment_transactions ON payment_transactions;
CREATE POLICY tenant_isolation_payment_transactions ON payment_transactions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

DROP POLICY IF EXISTS tenant_isolation_payment_events ON payment_events;
CREATE POLICY tenant_isolation_payment_events ON payment_events
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);

-- Scoped permissive lookup policies for asynchronous payment webhooks
-- When external gateways deliver webhooks, the tenant ID must be resolved from the order/payment ID
-- before tenant context can be set. This policy allows strictly read-only lookup within that transaction.
DROP POLICY IF EXISTS payment_webhook_lookup_transactions ON payment_transactions;
CREATE POLICY payment_webhook_lookup_transactions ON payment_transactions
    FOR SELECT
    USING (current_setting('app.payment_webhook_lookup', true) = 'true');

DROP POLICY IF EXISTS payment_webhook_lookup_events ON payment_events;
CREATE POLICY payment_webhook_lookup_events ON payment_events
    FOR SELECT
    USING (current_setting('app.payment_webhook_lookup', true) = 'true');

-- 6. Grant Privileges to unprivileged runtime role (waste_app_user)
GRANT SELECT, INSERT, UPDATE, DELETE ON bills TO waste_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_transactions TO waste_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_events TO waste_app_user;
