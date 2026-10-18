# Smart Municipal Waste Management Platform

A multi-tenant, secure, minimalistic, and scalable web platform designed to streamline municipal solid waste collection, live collection vehicle tracking, citizen service requests, and transparent fee reconciliation across multiple municipalities.

---

## Project Status

- **Phase 1: Requirements Definition & Project Scope:** **Completed (v1.2.0)**
- **Phase 2: Architecture, Data Model, API Contracts & UI/UX Design:** **Completed & Formally Audited (v1.2.0)**
- **Phase 3: Data Architecture, Double-Entry Accounting & Synthetic Demo Data:** **Completed Specifications (v1.1.0)**
- **Phase 4: Core Multi-Tenant Backend & Master Data Implementation:** **Completed Implementation (v1.0.0)**
- **Phase 5: Secure Vehicle Tracking & Telemetry Ingestion:** **Completed Implementation & PostgreSQL Verified (v1.0.0)**
  - *Implemented Architecture & Security Controls:*
    1. **Relational Vehicle Tracking Schema:** Migration `005_vehicle_tracking.sql` creating 5 tables (`vehicles`, `tracking_devices`, `vehicle_shifts`, `vehicle_telemetry_logs`, `latest_vehicle_positions`), RLS policies with tenant isolation, un-tenanted device lookup security, and tenant demo inheritance triggers.
    2. **Cryptographic Device Ingestion Security:** SHA-256 token hashing (`<prefix>_<secret>`), constant-time hash comparison (`timingSafeEqual`), rotation with dual-token transition windows, instant revocation, and server-side vehicle/tenant binding (anti-spoofing).
    3. **Authoritative Position & Replay Protection:** Transactional telemetry ingestion under row-level locking (`SELECT ... FOR UPDATE` on `latest_vehicle_positions`), enforcing strict monotonic timestamps to reject out-of-order and replayed GPS breadcrumbs.
    4. **Rigorous Telemetry Ingress Validation:** Bounded coordinates (`-90..90`, `-180..180`), contextual rejection of unacquired GPS fix `(0.0, 0.0)`, ISO-8601 parsing, 30s future clock drift limit, speed bounds (`0..140 km/h`), heading bounds (`0..359.99°`), and 2 KB payload cap.
    5. **Location Freshness & Shift Lifecycle:** Precise server-side age calculation: `CURRENT` ($\le 60$s), `STALE` ($61-300$s), `UNAVAILABLE` ($>300$s). Shift-ended vehicles (`COMPLETED`, `CANCELLED`, `PLANNED`) immediately forced to `UNAVAILABLE` regardless of recorded timestamp.
    6. **Citizen Tracking Authorization Boundaries:** Authenticated citizen-only access (`GET /api/v1/citizen/tracking`) scoped strictly to active registered properties in municipal service areas. Internal hardware serials, token hashes, and driver PII are completely omitted from responses.
    7. **PostgreSQL Verification Gate:** 63 passing automated tests across 11 test suites executing against disposable PostgreSQL 18.4 under unprivileged `waste_app_user`.
- **Phase 6: Payments Foundation:** **Completed Implementation & PostgreSQL Verified (v1.0.0)**
  - *Implemented Architecture & Security Controls:*
    1. **Relational Payments Schema:** Migration `006_payments.sql` defining `bills`, `payment_transactions`, and `payment_events`, tenant isolation RLS policies, scoped webhook lookup policies, check constraints, and demo inheritance triggers.
    2. **Provider-Neutral Gateway Adapter:** `IPaymentGatewayAdapter` contract and `MockPaymentGatewayAdapter` sandbox simulating asynchronous order creation and webhook callbacks without connecting live financial institutions.
    3. **Cryptographic HMAC Signature Validation:** Server-side verification of incoming webhooks via constant-time SHA-256 comparison (`crypto.timingSafeEqual`) on the exact raw request body string. Client-supplied payment status is never trusted.
    4. **Dual-Layer Idempotency:** Client order creation deduplicated via `(tenant_id, idempotency_key)`; gateway events deduplicated via `(gateway_provider, gateway_event_id)` preventing duplicate charges, multiple bill credits, or repeated ledger postings.
    5. **Double-Entry General Ledger Integration:** State transitions automatically coordinate with the immutable accounting journal:
       - **Capture Settlement:** Debit `1030` (*Payment Gateway Clearing Account*), Credit `1040` (*Citizen Accounts Receivable*).
       - **Refund Reversal:** Debit `1040` (*Citizen Accounts Receivable*), Credit `1030` (*Payment Gateway Clearing Account*). Original posted journal entries remain strictly unchanged; compensating reversals are posted as discrete balanced entries.
    6. **Doorstep Cash Prohibition:** Doorstep cash collection strictly deactivated (`doorstepCashEnabled: false`, HTTP 403 `DOORSTEP_CASH_DISABLED`).
    7. **Out-of-Order & Anomaly Quarantine:** Late or unexpected webhook events for terminal states recorded as `ANOMALY_PENDING_REVIEW` without corrupting transaction states or general ledger entries.
    8. **Full Test Suite Gate:** 84 passing automated tests across 19 suites (21 payment-specific tests) executing against disposable PostgreSQL 18.4 under unprivileged `waste_app_user`.
- **Phase 7: Security, Testing & Integration Readiness:** **Completed Implementation & Evidence-Backed Audit (v1.0.0)**
  - *Implemented Architecture & Security Remediations:*
    1. **Accounting Route RBAC Hardening:** Added `requireAccountingRole` middleware in `src/api/v1/accounting.routes.ts` restricting financial operations strictly to municipal administrative roles (`MUNICIPAL_ADMIN`, `SUPERVISOR`, `ACCOUNTANT`).
    2. **Citizen Property Privacy Scoping:** Enforced object-level ownership filtering on `GET /api/v1/properties` and `POST /api/v1/properties`, preventing citizens from enumerating or creating properties for other citizens.
    3. **HTTP Security Headers & CORS Policy:** Injected defence-in-depth headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Content-Security-Policy: default-src 'none'`) and restricted CORS handling.
    4. **Adaptive Sliding-Window Rate Limiting:** Rate limiters applied to authentication (15/min), telemetry ingestion (150/min), and payment creation (30/min), returning standardized HTTP 429 `TOO_MANY_REQUESTS`.
    5. **Sanitized Error Handling:** Intercepts body-parser JSON syntax errors (HTTP 400 `MALFORMED_JSON`) and JWT verification failures (HTTP 401 `INVALID_TOKEN`) without leaking stack traces.
    6. **Production Configuration Fail-Safe:** Startup verification detects default development secrets, unapproved doorstep cash flags, and insecure DB credentials, halting execution in production mode.
    7. **PostgreSQL RLS & Tenant Isolation Verification:** Runtime role `waste_app_user` confirmed non-superuser and `NOBYPASSRLS`. DDL attempts rejected. No pooled connection context leakage.
    8. **Full Test Suite Gate:** 110 passing automated tests across 25 suites (26 security-specific tests) executing against disposable PostgreSQL 18.4 with 0 failures and 0 skipped.
- **Next Phase:** Phase 8: Pilot Preparation & Operational Deployment (Awaiting Review & Approval)

---

## Technical Documentation Index

### 1. Requirements & Project Scope
- **[Phase 1 Requirements & Project Scope Document](file:///d:/project/docs/phase-1-requirements-and-scope.md)** *(v1.2.0)*
  - Source of truth for functional scope, non-functional targets, role boundaries, RLS bypass prevention, and method-specific payment workflows.
- **[Phase 5 Vehicle Tracking Verification Report](file:///d:/project/docs/phase-5-vehicle-tracking-verification.md)** *(v1.0.0)*
  - Complete verification report for Phase 5 implementation covering schema, device credential lifecycle, telemetry validation, freshness rules, citizen authorization boundaries, and real PostgreSQL test results.
- **[Phase 6 Payments Foundation Verification Report](file:///d:/project/docs/phase-6-payment-foundation.md)** *(v1.0.0)*
  - Complete verification report for Phase 6 implementation covering schema, provider-neutral adapter, HMAC signatures, state machine, double-entry ledger integration, idempotency, and PostgreSQL RLS test results.
- **[Phase 7 Security, Testing & Integration Readiness Report](file:///d:/project/docs/phase-7-security-and-integration-readiness.md)** *(v1.0.0)*
  - Comprehensive audit report covering authentication, RLS, payment/webhook security, vehicle tracking security, dependency scan results, frontend status assessment, unresolved policy matrices, and conditional go recommendation.

### 2. System Architecture
- **[Phase 2 System Architecture Specification](file:///d:/project/docs/phase-2-system-architecture.md)** *(v1.2.0)*
  - Modular Monolith architecture, Mermaid diagrams, subsystem responsibilities, end-to-end request flow, proposed Node.js/PostgreSQL stack, safe connection-pool RLS mechanics (`set_config(..., true)`), tripartite role separation (`waste_app_user`, `waste_migration_user`, `waste_dba_admin`), authoritative position persistence, and direct SQL isolation test suites.

### 3. Data Design & Relational Schema
- **[Phase 2 Data Model & Schema Specification](file:///d:/project/docs/phase-2-data-model.md)** *(v1.2.0)*
  - Preliminary entity catalog, PostGIS evaluation (`NUMERIC(10, 7)` resolution vs physical accuracy), provider-scoped payment event idempotency, append-only ledger trigger defense, and tenant demo inheritance triggers.
- **[Phase 3 Data Architecture Specification](file:///d:/project/docs/phase-3-data-architecture.md)** *(v1.1.0)*
  - Authoritative logical data architecture, explicit tenant ownership categorization across 27 entities, relational integrity, primary/foreign key constraints, deletion policies (`ON DELETE RESTRICT`/`CASCADE`), indexing strategies, double-entry integration, posted journal immutability, multi-tier posting invariants, authenticated tracking, and provisional retention classifications.
- **[Phase 3 Field-Level Data Dictionary](file:///d:/project/docs/phase-3-data-dictionary.md)** *(v1.1.0)*
  - Complete field-level data dictionary for all 27 tables detailing data types, nullability, constraints, permitted values, integer minor currency units (`BIGINT` paise), data origin, unconfirmed GST status notes, provisional retention schedules, and sensitivity classifications (`Public`, `Internal Operational`, `Confidential PII`, `Restricted Financial`, `Cryptographic Secret`).

### 4. Accounting Subsystem
- **[Phase 3 Double-Entry Accounting Design Specification](file:///d:/project/docs/phase-3-accounting-design.md)** *(v1.1.0)*
  - Multi-tenant Chart of Accounts (`1000` Assets, `2000` Liabilities, `3000` Equity, `4000` Revenue, `5000` Expenses), journal headers, balanced journal lines in integer minor units, posted journal immutability, multi-tier posting invariant enforcement (all 6 invariant checks, row-level locking `SELECT ... FOR UPDATE`, header and line triggers), event idempotency, eight illustrative scenario walkthroughs (billing, capture, settlement, refunds, chargebacks, waivers, compensating reversals), unconfirmed GST tax status, and statutory accounting review disclaimers.

### 5. Synthetic Demo Data & Validation
- **[Phase 3 Synthetic Demo Dataset Specification](file:///d:/project/docs/phase-3-synthetic-data.md)** *(v1.1.0)*
  - Deterministic, internally consistent synthetic dataset for Verdant Hills Municipal Council and Oceanfront Nagar Panchayat. Clearly labeled fictional test fixtures (not operational vehicle positions or approved boundaries), users, shifts, telemetry fixtures, balanced double-entry journals, unconfirmed tax rate placeholders (`null`), non-functional credential placeholders, explicit anomaly test fixtures, and legal void watermark notices.
- **[Phase 3 Data Validation & Test Plan Specification](file:///d:/project/docs/phase-3-data-validation-and-test-plan.md)** *(v1.1.0)*
  - Explicit distinction between document inspection verification (Phase 3) and deferred execution testing (Phase 4). Exhaustive test specification matrix across 11 architectural domains (referential integrity, idempotency, balanced journal enforcement, posted record immutability, webhook anomalies, demo isolation, RLS isolation under `waste_app_user`, authenticated tracking authorization, device anti-spoofing, and GPS ingress validation).

### 6. Production Transition & API Contracts
- **[Phase 3 Real Data Transition & Migration Architecture](file:///d:/project/docs/phase-3-real-data-transition.md)** *(v1.1.0)*
  - Transition framework from synthetic to live municipal data: data owner authorization, source-to-target field mapping, quarantine architecture (`migration_quarantine_records`), PII protection, opening balance equity journal entries, provisional retention schedules, complaint photo privacy policy options, staging dry-run validation, and rollback protocols.
- **[Phase 2 API Contracts Specification](file:///d:/project/docs/phase-2-api-contracts.md)** *(v1.2.0)*
  - RESTful API contracts for discovery, authentication, citizen accounts, live tracking, telemetry ingest, and payment webhooks.
- **[Phase 2 UI/UX Specification & Wireframes](file:///d:/project/docs/phase-2-ui-ux-specification.md)** *(v1.2.0)*
  - Mobile-first, WCAG 2.1 AA accessible screen designs, text-based wireframes, multi-attribute telemetry freshness indicator (`CURRENT`, `STALE`, `UNAVAILABLE`), and comprehensive screen state matrix.

---

## Architectural & Security Core Principles

1. **PostgreSQL RLS Threat Model & Role Separation:**
   - In PostgreSQL, superusers and roles with the `BYPASSRLS` attribute bypass RLS unconditionally. `FORCE ROW LEVEL SECURITY` applies strictly to table owners, and **never constrains superusers or `BYPASSRLS` roles**.
   - **Tripartite Role Separation:**
     - `waste_app_user` (runtime): `NOSUPERUSER`, `NOBYPASSRLS`, DML only, owns zero tables, unconditionally constrained by RLS.
     - `waste_migration_user` (migration): Dedicated non-superuser role (`NOSUPERUSER`, `NOBYPASSRLS`) owning application schema/tables for DDL migrations in CI/CD. Superusers are prohibited from routine migrations.
     - `waste_dba_admin` (DBA): Out-of-band administration role for cluster setup, prohibited from routine application operations.
   - **Threat Model Limits:** Transaction-local tenant context (`set_config(..., true)`) is an internal defense-in-depth control against application bugs, ORM omissions, and missing tenant filter clauses. It does **not** protect against arbitrary SQL injection (which could reset session variables) or physical host compromise. Primary defense against SQL injection requires strict parameterized queries and input validation.
2. **Double-Entry General Ledger Invariants & Immutability:**
   - Every financial transaction balances: $\sum \text{Debits} = \sum \text{Credits} > 0$ within a single currency (`INR`).
   - All monetary amounts are stored strictly as `BIGINT` integer minor units (paise). Floating-point data types are prohibited.
   - **Posted Journal Immutability:** `journal_entries.status` is constrained to `('DRAFT', 'POSTED')`. Once an entry transitions to `POSTED`, its status is **never** mutated to 'REVERSED' or any other state. SQL `UPDATE` and `DELETE` operations on posted headers and posted lines are blocked unconditionally by database triggers. Compensating corrections are recorded as discrete, balanced journal entries (`status = 'POSTED'`, `business_event_type = 'COMPENSATING_REVERSAL'`, `reversal_of_entry_id = <original_id>`).
   - **Complete Posting Invariants & Multi-Tier Enforcement:** Posting transitions require atomic validation of all 6 posting invariants: (1) line count $\ge 2$, (2) at least one debit and one credit, (3) balanced debits and credits, (4) active, valid accounts, (5) single currency matching header, (6) non-null amounts. Enforced via application transaction isolation with row-level locking (`SELECT ... FOR UPDATE`), pre-commit aggregation verification, and database-level trigger defenses on both headers and lines.
   - Idempotency is enforced at the database level via `UNIQUE (tenant_id, business_event_type, business_event_id)`.
3. **Pilot Policy Constraints:**
   - **Doorstep Cash Collection:** Deactivated for the pilot. Tables maintain extensible columns (`total_cash_collected_minor_units`, `shift_reconciliations`), but are schema-constrained to zero. Cash chart-of-accounts entry (`1010`) is inactive.
   - **Live Vehicle Tracking:** Decommissioned unauthenticated public endpoints. Live tracking requires citizen authentication (`GET /api/v1/citizen/tracking/:localityId`), verifying tenant membership and locality linkage server-side.
4. **Tax Status & Statutory Retention Governance:**
   - **GST Tax Status:** Marked **UNCONFIRMED PENDING QUALIFIED TAX COUNSEL REVIEW**. No zero-tax, exemption, or specific rate is hardcoded as an established requirement. Schemas support configurable tax rates and explicit audit trail notes pending formal ruling.
   - **Data Retention Schedules:** All retention periods (financial, citizen PII, complaints, telemetry) are designated as **provisional design proposals** subject to formal sign-off by municipal legal, finance, and data-protection authorities. No retention period is asserted as a universal statutory minimum without qualified authority confirmation.
   - **Complaint Photo Privacy:** Redaction of faces and license plates is provided as a configurable compliance policy option, not asserted as a universal statutory mandate.
5. **GPS Precision, Distance Accuracy & Fictional Fixtures:**
   - `NUMERIC(10, 7)` provides $\approx 1.11\text{ cm}$ representation resolution ($0.0000001^\circ$), eliminating floating-point rounding errors. Physical vehicle GPS trackers deliver $\pm 3\text{--}15\text{m}$ sensor accuracy; spherical Haversine distance calculations introduce $\approx 0.3\%-0.5\%$ mathematical error. All tracking algorithms operate on probabilistic confidence circles.
   - **Fictional Test Fixtures:** All sample coordinates in synthetic datasets are fictional test fixtures for validation and must never be interpreted as real municipal vehicles or approved service boundaries.
   - Coordinate `(0.0, 0.0)` is contextually rejected because it lies outside municipal bounding polygons, not because it is an invalid coordinate on Earth.
   - **PostgreSQL `latest_vehicle_positions` is the Authoritative Store:** For the 10–20 vehicle pilot, direct indexed primary-key queries against PostgreSQL are simple, robust, and require zero additional caching infrastructure.
6. **Telemetry Ingestion Security & Device Anti-Spoofing:**
   - Ingestion requires a pre-shared token (`X-Device-Token`) cryptographically bound to a single authorized `vehicle_id` and `tenant_id` in `device_credentials`.
   - The server enforces strict vehicle binding: any payload attempting to report coordinates for a vehicle other than the token's bound vehicle is rejected with HTTP 403 Forbidden (`AUTH_DEVICE_VEHICLE_MISMATCH`).
   - Ingress validation enforces $\le 2\text{ KB}$ payload caps, strict data types, coordinate bounds, $<30\text{s}$ future clock drift checks, and speed jump filters ($>100\text{ km/h}$). Device credentials use salted hashes, overlapping rotation windows, and instant revocation.
7. **Payment Event Idempotency & Financial Evidence Retention:**
   - The unique constraint `UNIQUE (gateway_provider, gateway_event_id)` enforces provider-scoped event deduplication, preventing duplicate webhook replays while safely permitting legitimate repeated events of the same `event_type` (e.g. multiple distinct partial refunds).
   - **Zero Evidence Loss on Anomalies:** Invalid or out-of-order transitions are never silently discarded. They are preserved in `payment_events` with `processing_status = 'ANOMALY_PENDING_REVIEW'` and raw JSON payloads intact, without mutating transaction state or ledger balances, raising an immediate supervisor audit alert.
8. **Demo Data Isolation & Enforceable Production Reporting:**
   - Eliminates the silent `DEFAULT FALSE` vulnerability via a database `BEFORE INSERT OR UPDATE` trigger (`enforce_tenant_demo_inheritance`): records in demo tenants are forcibly set to `is_demo = TRUE`, while demo records are blocked from production tenants.
   - Production reporting queries execute exclusively against dedicated non-updatable views (`v_prod_*`) enforcing `WHERE record.is_demo = FALSE AND tenant.is_demo = FALSE`.
   - Demo receipts render immutable diagonal void watermarks. Physical table partitioning is rejected due to foreign-key complexity across child tables.

---

## Remaining Stakeholder Blockers & Deferred Decisions

### 1. Decisions Blocking Schema Freeze (Required before Phase 4 Implementation)
1. **GST Tax Status Determination:** Formal written ruling from Municipal Tax Counsel / Finance Department on whether pilot waste management user fees are GST-exempt (under Notification No. 12/2017-Central Tax (Rate) as a pure municipality service) or taxable (e.g., 18% GST for commercial/mixed assessments).  
   *Decision-Maker:* Municipal Chief Finance Officer / Tax Legal Counsel.
2. **Accounting Policy Approval:** Formal sign-off on Chart of Accounts codes, revenue recognition timing (accrual at billing vs cash at capture), and gateway fee treatment (operating expense vs citizen surcharge).  
   *Decision-Maker:* Municipal Chief Finance Officer / Statutory Auditor.
3. **Data Retention & Statutory Schedule Sign-Off:** Formal approval of provisional retention schedules (financial records, citizen PII, complaint audit logs, raw GPS telemetry) under the Digital Personal Data Protection Act (DPDP Act) and municipal archives acts.  
   *Decision-Maker:* Municipal Data Protection Officer / Legal Counsel.
4. **Property & Service Identifier Strategy:** Confirmation whether the platform will use existing Municipal Property Tax Assessment PINs, platform-generated identifiers, or a bidirectional translation mapping.  
   *Decision-Maker:* Municipal Revenue / Property Tax Department.
5. **Complaint Photo & Privacy Redaction Policy:** Confirmation whether complaint photos are excluded from pilot, optional, or mandatory, and whether face/license-plate blurring is adopted as an internal policy mandate.  
   *Decision-Maker:* Municipal Legal / Grievance Officer.
6. **Accounting & Payment Settlement Boundary:** Formal definition of which ledger accounts are reconciled within the platform versus exported to the municipal ERP/treasury system.  
   *Decision-Maker:* Municipal Treasury / IT Director.

### 2. Decisions Deferred Until Later Implementation Phases
- **GPS Hardware Vendor & Transmission Protocol:** Selection of specific hardware units (Teltonika, Queclink) and physical transport (HTTP REST vs MQTT vs TCP). Relational schema and device credentials remain identical.
- **Payment Gateway Aggregator Selection:** Final selection between Razorpay, PayU, or BillDesk. The provider-scoped idempotency model and accounting ledgers are provider-agnostic.
- **Transactional SMS / OTP Provider Selection:** Selection of SMS gateway (CDAC, Gupshup, Twilio). Handled via application infrastructure adapter in Phase 4.
- **Production Deployment & Cloud Infrastructure:** Kubernetes vs VM provisioning, container registry, and managed PostgreSQL selection.
- **Distributed Telemetry Cache (Redis):** Deferred until load testing of multi-instance deployments demonstrates database read saturation.
- **Citizen Service Request & Complaint Lifecycle Implementation:** Deferred to Phase 5.
- **Vehicle GPS Telemetry Ingest & Live Tracking:** Deferred to Phase 6.

---

## Local Setup & Backend Execution Guide (Phase 4)

### 1. Prerequisites
- **Node.js:** v20+ LTS or v24+
- **PostgreSQL:** 16+ (or managed PostgreSQL instance)
- **Package Manager:** `npm` (v10+)

### 2. Environment Configuration
Copy the template `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure database connection parameters match your local PostgreSQL cluster:
- `DB_HOST=localhost`
- `DB_PORT=5432`
- `DB_NAME=waste_management_dev`
- `DB_ADMIN_USER=waste_dba_admin`
- `DB_MIGRATION_USER=waste_migration_user`
- `DB_APP_USER=waste_app_user`

### 3. Database Provisioning & Execution Sequence
The system enforces a strict 4-step provisioning and runtime lifecycle with tripartite role isolation:

#### Step 1: Out-of-Band Role & Schema Bootstrap (DBA Action)
Before application migrations can be applied, the database cluster administrator executes the bootstrap script to provision required roles and schema ownership:
```bash
npm run db:bootstrap
```
This executes `src/db/bootstrap.sql` as `waste_dba_admin` (or `postgres` superuser):
1. Creates `waste_dba_admin` with administrative powers for cluster maintenance.
2. Creates `waste_migration_user` (`NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`).
3. Creates `waste_app_user` (`NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`).
4. Transfers ownership of schema `public` to `waste_migration_user` and revokes public creation rights.
5. Grants database `CONNECT` privileges.

#### Step 2: Database Migration Execution (Schema Owner Action)
Connects as `waste_migration_user` to apply all 4 SQL schema, trigger, and RLS migrations in order:
```bash
npm run migrate
```
This executes:
1. `001_initial_schema.sql`: Core master data (`tenants`, `municipalities`, `wards`, `localities`, `users`, `user_roles`, `user_tenant_memberships`, `properties`, `assessment_rates`).
2. `002_accounting_ledger.sql`: Double-entry general ledger (`chart_of_accounts`, `journal_entries`, `journal_entry_lines`).
3. `003_triggers_and_views.sql`: Demo inheritance triggers, posted journal and line immutability triggers with complete database-boundary posting invariant checks, and non-updatable production reporting views (`v_prod_*`).
4. `004_roles_and_rls.sql`: Verifies bootstrap preconditions, enables and forces RLS on all tenant-owned tables, defines isolation policies (`tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID`), and grants least-privilege DML (`SELECT, INSERT, UPDATE, DELETE`) to `waste_app_user`.

#### Step 3: Synthetic Demo Data Seeding (Runtime Action)
Populates the database with deterministic fictional fixtures for Verdant Hills Municipal Council and Oceanfront Nagar Panchayat:
```bash
npm run seed
```
Demo accounts created with fictional credentials (`DemoPass@2026!`):
- Municipal Admin: `+919876543210` (`Aarav Sharma`)
- Field Supervisor: `+919876543211` (`Vikram Singh`)
- Collection Staff: `+919876543212` (`Ramesh Kumar`)
- Citizen: `+919876543213` (`Sunita Patel`)

#### Step 4: Starting the Backend Server (Runtime Action)
Development mode (with auto-reload):
```bash
npm run dev
```
Production build and execution:
```bash
npm run build
npm start
```
The server will be reachable at `http://localhost:3000`.

### 4. Running Automated Tests
Run the comprehensive unit and integration test suite (118 tests across 31 test suites):
```bash
npm test
```
Run live end-to-end verification against the active system:
```bash
npm run test:e2e
```
*PostgreSQL Verification Gate (Verified & Passed):* The test harness features an integrated, disposable PostgreSQL 16+ test environment (`tests/helpers/postgres-test-server.ts` running PostgreSQL 18.4) that automatically provisions local test clusters on isolated ports. It provisions the isolated tripartite roles (`waste_dba_admin`, `waste_migration_user`, `waste_app_user`), executes migrations `001`–`007` under `waste_migration_user`, seeds synthetic demo datasets, and executes all database integration tests directly under the unprivileged `waste_app_user` role. All 118 tests across all 31 test suites execute and pass with 0 skips and 0 failures.

---

## Phase 8 — Citizen Portal & Municipal Admin Dashboard

Phase 8 introduces the user-facing web platform located in `frontend/`. Built with **React 19**, **TypeScript**, and **Vite**, it connects directly to the existing backend API without altering backend authorization contracts or inventing unsupported endpoints.

### 1. Frontend Architecture & Tech Stack

- **Framework & Language:** React 19 + TypeScript (enforcing `verbatimModuleSyntax`).
- **Build System:** Vite 8.3 (`frontend/vite.config.ts`), configured to proxy `/api` and `/health` requests to `http://localhost:3000`.
- **Design System:** Custom Vanilla CSS Civic Design System (`frontend/src/index.css`) featuring:
  - Semantic municipal color tokens (Emerald, Slate, Indigo).
  - High-contrast, WCAG 2.1 AA compliant themes (Light and Dark mode toggles).
  - Typography powered by Google Fonts (`Plus Jakarta Sans` for body, `JetBrains Mono` for currency/code).
  - Animated pulsing status indicators for live vehicle tracking (`CURRENT`, `STALE`, `UNAVAILABLE`).
  - Mobile-responsive navigation and touch targets ($\ge 48\text{px}$).
- **State Management & Authentication:** Lightweight React Context (`AuthContext`) managing JWT tokens, session persistence via browser `sessionStorage`, and instant tenant switching.
- **Centralized API Client:** Type-safe HTTP client (`frontend/src/api/client.ts`) with automatic Bearer token and `X-Tenant-Id` header injection, 401 interception, and structured error extraction.

### 2. Implemented Screens

#### A. Public & Authentication
- **Public Municipality Directory & Collection Timetable (`/discovery`):** View operational municipalities, wards, and collection schedules without logging in.
- **Login & One-Click Demo Personas (`/login`):** Phone/password authentication with 4 preconfigured demo persona buttons for immediate evaluation:
  1. `Sunita Patel` (`+919876543213`) — Citizen (Verdant Hills)
  2. `Ananya Roy` (`+919876543214`) — Citizen (Oceanfront Nagar Panchayat)
  3. `Aarav Sharma` (`+919876543210`) — Municipal Admin (Verdant Hills)
  4. `Vikram Singh` (`+919876543211`) — Field Supervisor (Verdant Hills)
  *(Default Password for all: `DemoPass@2026!`)*

#### B. Citizen Portal (`ROLE: CITIZEN`)
- **Citizen Dashboard (`/citizen/dashboard`):** Real-time KPI summaries for linked properties, outstanding bill balances in ₹ INR, active collection vehicles, and settled receipts.
- **Property Management (`/citizen/properties`):** Property register and modal form for registering new properties (`POST /api/v1/properties`).
- **Bills & Sandbox Payments (`/citizen/bills`):** Invoices list, integer paise formatting, and interactive **Pay Online (Mock Sandbox)** checkout modal (`POST /api/v1/payments/create-order` + mock capture). Doorstep cash collection is explicitly disabled.
- **Payment History & Receipts (`/citizen/history`):** Complete transaction audit trail with an interactive, printable **Municipal Tax Receipt Modal**.
- **Live Vehicle Tracking (`/citizen/tracking`):** Live collection vehicle tracking with SLA freshness badges (`CURRENT`, `STALE`, `UNAVAILABLE`) and vector SVG neighborhood map visualizer.

#### C. Municipal Admin Dashboard (`ROLE: MUNICIPAL_ADMIN`, `FIELD_SUPERVISOR`)
- **Operations Overview (`/admin/overview`):** Municipal overview, operational wards, chart of accounts status, and statutory policy status.
- **Property Register & Tariffs (`/admin/properties`):** Property register with classification filtering and active fee assessment tariffs (`GET /api/v1/properties/rates`).
- **General Ledger & Accounting (`/admin/accounting`):** Complete Chart of Accounts browser, double-entry journal history, and interactive **Draft Balanced Journal Modal** (`POST /api/v1/accounting/journals`) enforcing debit/credit balance before submission.
- **Administrative Master Data (`/admin/master-data`):** Municipal wards, localities, and service boundaries.

### 3. How to Run Frontend & Backend Locally

#### Option A: Running from Workspace Root
```bash
# Terminal 1: Start backend dev server
npm run dev
# (Listens at http://localhost:3000)

# Terminal 2: Start frontend dev server
npm run frontend:dev
# (Accessible at http://localhost:5173)
```

#### Option B: Running Frontend Directly
```bash
cd frontend
npm install
npm run dev
```

#### Building Frontend & Backend
```bash
# Build both simultaneously
npm run build:all

# Or build individually
npm run build              # Backend TypeScript build
npm run frontend:build     # Frontend Vite production bundle
```

### 4. Security & Guardrails
- **Zero Real Money:** Only sandbox payment orders are simulated. Doorstep cash collection is strictly disabled (`doorstepCashEnabled: false`, HTTP 403 `DOORSTEP_CASH_DISABLED`). No card/CVV data is collected.
- **Zero Real GPS Hardware:** Only synthetic coordinates are displayed; no paid mapping APIs or physical trackers are connected.
- **Explicit Demo Labeling:** High-contrast banners on all screens clearly state that the system operates in demo mode with synthetic data.
- **Client Security Disclaimer:** Client-side role and tenant guards are usability conveniences only; backend PostgreSQL RLS and Express middleware enforce all security boundaries.

### 5. Known Missing Backend APIs & Limitations
- **Citizen Self-Registration / Password Reset:** Backend lacks citizen registration and SMS OTP endpoints. Managed through demo credentials.
- **Grievance / Complaint Ticketing:** Citizen complaint filing service is pending municipal policy confirmation.
- **Administrative Payment Refunds:** Automated refund execution is unconfirmed by municipal policy; transactions display in read-only audit mode.


---

## Phase 4 & Phase 5 API Endpoint Catalog

| Method | Endpoint | Access / Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | System health check and current policy configuration flags. |
| `GET` | `/api/v1/municipalities` | Public | Public discovery of active municipalities, wards, and locality counts. |
| `POST` | `/api/v1/auth/login` | Public | Authenticate using mobile number and password; returns JWT and tenant memberships. |
| `GET` | `/api/v1/auth/me` | Bearer Token | Get authenticated user profile and all verified municipal memberships. |
| `GET` | `/api/v1/tenants/current` | Bearer Token + Verified Tenant | Returns verified tenant context and role of requesting user. Rejects spoofed tenant headers. |
| `GET` | `/api/v1/tenants/wards` | Bearer Token + Verified Tenant | Returns wards within verified municipality. |
| `GET` | `/api/v1/tenants/localities` | Bearer Token + Verified Tenant | Returns localities within verified municipality (optional `?wardId=`). |
| `POST` | `/api/v1/properties` | Bearer Token + Verified Tenant | Register new service property account with configurable identifier. |
| `GET` | `/api/v1/properties` | Bearer Token + Verified Tenant | List service properties in tenant (optional `?citizenUserId=`). |
| `GET` | `/api/v1/properties/rates` | Bearer Token + Verified Tenant | List active assessment fee tariffs with integer minor units (paise). |
| `GET` | `/api/v1/accounting/accounts` | Bearer Token + Verified Tenant | List Chart of Accounts for current verified tenant. |
| `POST` | `/api/v1/accounting/journals` | Bearer Token + Verified Tenant | Create a new DRAFT journal entry with balanced lines. |
| `POST` | `/api/v1/accounting/journals/:id/post` | Bearer Token + Verified Tenant | Post draft journal entry atomically with row locking and 6-point invariant validation. |
| `POST` | `/api/v1/accounting/journals/:id/reverse` | Bearer Token + Verified Tenant | Create compensating reversal entry. Original entry strictly remains in `POSTED` status. |
| `GET` | `/api/v1/accounting/journals` | Bearer Token + Verified Tenant | List journal entries with balanced lines for verified tenant. |
| `POST` | `/api/v1/telemetry/ingest` | `X-Device-Token` Header | Ingest GPS telemetry breadcrumb. Bound to vehicle/tenant, rejects out-of-order replays, validates coordinates & drift. |
| `GET` | `/api/v1/citizen/tracking` | Bearer Token + Verified Tenant + Citizen Role | Get sanitized live tracking snapshots for vehicles operating in citizen's registered property localities (optional `?localityId=`, `?vehicleId=`). |


