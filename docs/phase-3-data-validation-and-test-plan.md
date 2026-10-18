# Smart Municipal Waste Management Platform
## Phase 3: Data Validation & Comprehensive Test Plan Specification

**Document Version:** 1.1.0 (Audited & Formally Hardened)  
**Phase:** 3 of 9 (Data Architecture, Double-Entry Accounting & Synthetic Demo Data)  
**Status:** Test Planning & Validation Specification (Awaiting Stakeholder Review)  
**Workspace:** `D:\project`  
**Sources of Truth:**  
- [Phase 3 Data Architecture Specification](file:///d:/project/docs/phase-3-data-architecture.md) (v1.1.0)  
- [Phase 3 Field-Level Data Dictionary Specification](file:///d:/project/docs/phase-3-data-dictionary.md) (v1.1.0)  
- [Phase 3 Double-Entry Accounting Design Specification](file:///d:/project/docs/phase-3-accounting-design.md) (v1.1.0)  
- [Phase 3 Synthetic Demo Dataset Specification](file:///d:/project/docs/phase-3-synthetic-data.md) (v1.1.0)  
- [README.md](file:///d:/project/README.md) (v1.2.0)  
**Author:** Senior Software Architect  

---

## 1. Test Strategy & Validation Governance

> [!IMPORTANT]
> **SPECIFICATION-ONLY PHASE NOTICE:**  
> In accordance with Phase 3 constraints, **no executable test code, automated runners, live databases, or CI/CD pipelines are executed in this phase**. This document provides an exhaustive, reviewable test matrix defining exact setups, actions, assertions, and execution environments to be implemented during Phase 4 and Phase 5.

### 1.1 Phase 3 Validation Status: Document Inspection vs. Deferred Execution

To ensure complete transparency regarding what has been validated versus what is deferred to implementation:

| Validation Scope | Method in Phase 3 | Status | Scope / Deferred Components |
| :--- | :--- | :--- | :--- |
| **Relational Consistency** | Document Inspection | **Validated** | Cross-table foreign key alignments, entity schemas, and deletion policies verified by static inspection across all 27 entities. |
| **Double-Entry Balance** | Document Inspection | **Validated** | Synthetic journal entries verified by manual mathematical inspection to ensure $\sum \text{Debits} = \sum \text{Credits} > 0$. |
| **Deterministic References**| Document Inspection | **Validated** | Seed UUIDs, coordinates, and invoice references verified for internal consistency. |
| **PostgreSQL RLS Policies** | None (No Live DB) | **DEFERRED (Phase 4)** | Verification of RLS isolation using actual runtime role `waste_app_user` (`NOSUPERUSER`, `NOBYPASSRLS`) deferred to database implementation. |
| **Trigger Enforcement** | None (No Live DB) | **DEFERRED (Phase 4)** | Database trigger execution (`enforce_tenant_demo_inheritance`, immutability triggers, deferred posting balance triggers) deferred to Phase 4. |
| **Application Auth & Access**| None (No Live App)| **DEFERRED (Phase 4)** | Middleware session token validation, tenant derivation, object authorization, and route security deferred to backend build. |
| **GPS Ingress & Filtering** | None (No Live App)| **DEFERRED (Phase 4)** | Clock drift checks, supersonic speed filters, and device credential binding execution deferred to telemetry worker build. |
| **Webhook Idempotency** | None (No Live App)| **DEFERRED (Phase 4)** | Live gateway signature verification, concurrent duplicate delivery, and anomaly isolation deferred to gateway integration. |

> [!CAUTION]
> **Implementation Clarification:** Working Row-Level Security, database trigger defense, application authorization, and telemetry filtering are documented herein as **engineering specifications only**. They have **NOT** been executed against a live database or running application, and must not be represented as working operational systems until Phase 4 code implementation and automated test suites are complete.

The test plan specifies eleven critical architectural domains:
1. Referential Integrity & Required Fields
2. Unique Constraints & Business Idempotency
3. Double-Entry Balanced Posting & Unbalanced Rejection
4. Immutability of Posted Financial Records & Compensating Corrections
5. Payment Webhook Deduplication, Repeated Events & Anomaly Evidence Preservation
6. Demo vs. Production Data Isolation & Reporting Boundaries
7. PostgreSQL Row-Level Security (RLS) under Runtime Role `waste_app_user`
8. Authenticated Citizen Vehicle Tracking & Cross-Tenant Rejection
9. Vehicle-to-Device Credential Binding & Anti-Spoofing
10. GPS Ingress Validation: Freshness, Clock Drift & Speed Anomalies
11. Synthetic Seed Data Determinism & Cross-Table Integrity

---

## 2. Test Case Specifications

### 2.1 Referential Integrity & Required Fields

#### Test Case `TC-RI-01`: Orphan Foreign Key Insertion Rejection
- **Purpose:** Verify that inserting child records referencing non-existent parent records is rejected by PostgreSQL foreign key constraints.
- **Execution Requirement:** PostgreSQL Database Engine (DDL & constraints loaded).
- **Setup:** A clean database session with `municipalities` table initialized.
- **Action:** Attempt to insert a record into `wards` with `tenant_id = '00000000-0000-0000-0000-000000000000'` (non-existent UUID).
- **Expected Outcome:** Transaction aborts with SQLSTATE `23503` (`foreign_key_violation`), referencing constraint `fk_wards_tenant`.

#### Test Case `TC-RI-02`: Restricted Deletion of Account with Journal Lines
- **Purpose:** Verify that accounts cannot be deleted if journal entry lines reference them (`ON DELETE RESTRICT`).
- **Execution Requirement:** PostgreSQL Database Engine.
- **Setup:** Account `1210 AR-CITIZEN-FEES` exists and has at least one associated `journal_entry_lines` record.
- **Action:** Execute `DELETE FROM accounts WHERE account_code = '1210';`.
- **Expected Outcome:** Database aborts with SQLSTATE `23503` (`foreign_key_violation`). Account remains intact.

---

### 2.2 Unique Constraints & Business Idempotency

#### Test Case `TC-UC-01`: Provider-Scoped Payment Event Deduplication
- **Purpose:** Ensure that retrying identical payment gateway webhooks does not create duplicate audit events.
- **Execution Requirement:** PostgreSQL Database Engine & Application Ingest Handler.
- **Setup:** Table `payment_events` contains a record with `gateway_provider = 'RAZORPAY'` and `gateway_event_id = 'evt_pay_001'`.
- **Action:** Ingest an identical webhook payload containing `gateway_provider = 'RAZORPAY'` and `gateway_event_id = 'evt_pay_001'`.
- **Expected Outcome:** Database rejects duplicate insert via unique constraint `UNIQUE (gateway_provider, gateway_event_id)` (SQLSTATE `23505`). Application catches conflict, logs `processing_status = 'DUPLICATE_IGNORED'`, and returns HTTP 200 to gateway without updating transaction balances.

#### Test Case `TC-UC-02`: Financial Event Posting Idempotency
- **Purpose:** Verify that the general ledger cannot post two journal entries for the same operational business event.
- **Execution Requirement:** PostgreSQL Database Engine.
- **Setup:** Journal entry `JE-VHMC-2026-00101` is posted for `business_event_type = 'BILL_ISSUANCE'` and `business_event_id = 'INV-VHMC-2026-08101'` under Verdant Hills tenant.
- **Action:** Attempt to insert another journal entry with identical `tenant_id`, `business_event_type = 'BILL_ISSUANCE'`, and `business_event_id = 'INV-VHMC-2026-08101'`.
- **Expected Outcome:** Database aborts insert with unique constraint violation on `(tenant_id, business_event_type, business_event_id)`.

---

### 2.3 Double-Entry Balanced Posting & Unbalanced Rejection

#### Test Case `TC-DE-01`: Unbalanced Journal Entry Posting Rejection
- **Purpose:** Verify that an entry where total debits do not equal total credits cannot transition to `POSTED`.
- **Execution Requirement:** PostgreSQL Database Engine & Posting Service.
- **Setup:** Create a draft journal entry header `JE-TEST-UNBALANCED` with two lines:
  - Line 1: `DEBIT` `30000` paise (₹300.00) to Account `1210`.
  - Line 2: `CREDIT` `20000` paise (₹200.00) to Account `4110`.
  - Net Imbalance: `10000` paise (₹100.00).
- **Action:** Invoke the journal posting routine to transition `status = 'POSTED'`.
- **Expected Outcome:** Validation check fails ($\Delta \ne 0$). Transaction rolls back. Entry remains `DRAFT` or raises `ERR_UNBALANCED_JOURNAL_ENTRY`. Zero updates to general ledger balances.

#### Test Case `TC-DE-02`: Multi-Currency Journal Entry Rejection
- **Purpose:** Verify that lines with differing currencies cannot be combined into a single journal entry.
- **Execution Requirement:** Posting Service & Database Check.
- **Setup:** Create a draft entry header with `currency = 'INR'`. Line 1 has `currency = 'INR'`, Line 2 has `currency = 'USD'`.
- **Action:** Attempt to insert Line 2 or post entry.
- **Expected Outcome:** Rejected with currency mismatch validation error (`ERR_CURRENCY_MISMATCH`).

---

### 2.4 Immutability of Posted Records & Compensating Corrections

#### Test Case `TC-IM-01`: Direct SQL Update Rejection on Posted Journal Entry
- **Purpose:** Ensure that `waste_app_user` cannot modify posted accounting lines.
- **Execution Requirement:** PostgreSQL Database Engine under `waste_app_user` role.
- **Setup:** Journal entry `je-vh-01` is in `status = 'POSTED'`.
- **Action:** Execute:
  ```sql
  UPDATE journal_entry_lines SET amount_minor_units = 50000 WHERE journal_entry_id = 'je-vh-01';
  ```
- **Expected Outcome:** Aborted with SQL permission denied (`42501`) or trigger exception (`prevent_journal_modification`). Line amounts remain strictly unmodified.

#### Test Case `TC-IM-02`: Compensating Reversal Linkage & Original Entry Immutability
- **Purpose:** Verify that correcting an erroneous entry creates a separate, balanced reversal entry linked to the original, while keeping the original posted entry completely unchanged.
- **Execution Requirement:** Accounting Service & Database Engine.
- **Setup:** Journal entry `je-orig` exists with status `POSTED`.
- **Action:** Execute compensating reversal workflow, creating `je-rev` with reversed debit/credit lines, `status = 'POSTED'`, `business_event_type = 'COMPENSATING_REVERSAL'`, and `reversal_of_entry_id = je-orig.id`.
- **Expected Outcome:** 
  - `je-rev` is inserted with `status = 'POSTED'` and points to `je-orig.id`.
  - `je-orig` remains `status = 'POSTED'` and is **strictly unmodified**. No SQL updates or deletes occur on `je-orig`.
  - Net account balance computed across both entries sums to zero. Full historical evidence is preserved without tampering.

---

### 2.5 Webhook Anomalies & Financial Evidence Retention

#### Test Case `TC-AN-01`: Out-of-Order Webhook Anomaly Logging
- **Purpose:** Verify that invalid or out-of-order gateway callbacks are preserved as evidence without corrupting financial records.
- **Execution Requirement:** Webhook Ingestion Service & Database Engine.
- **Setup:** Payment transaction `pt-01` is already in status `CANCELLED`.
- **Action:** Deliver an external gateway webhook `payment.captured` for `pt-01`.
- **Expected Outcome:**
  - Raw webhook is inserted into `payment_events` with `processing_status = 'ANOMALY_PENDING_REVIEW'` and diagnostic details.
  - Operational transaction `pt-01` remains `CANCELLED`.
  - Zero journal entries are created in `journal_entries`.
  - Supervisor audit queue flags an urgent alert.

---

### 2.6 Demo vs. Production Separation & Reporting Exclusion

#### Test Case `TC-DM-01`: Tenant Demo Flag Inheritance Enforcement
- **Purpose:** Verify that inserting a record into a demo tenant forcibly sets `is_demo = TRUE`.
- **Execution Requirement:** PostgreSQL Database Engine (Triggers enabled).
- **Setup:** Tenant `Verdant Hills` has `is_demo = TRUE`.
- **Action:** Insert a bill omitting `is_demo` or explicitly passing `is_demo = FALSE`.
- **Expected Outcome:** Trigger `enforce_tenant_demo_inheritance` overrides value to `is_demo = TRUE`. Record is securely marked synthetic.

#### Test Case `TC-DM-02`: Exclusion of Demo Records from Production Reporting Views
- **Purpose:** Ensure demo transactions never pollute production financial summaries.
- **Execution Requirement:** PostgreSQL Database Engine & Production Reporting Views.
- **Setup:** Database contains ₹10,000 in demo billings under Verdant Hills (`is_demo = TRUE`) and ₹50,000 in real billings under Production City (`is_demo = FALSE`).
- **Action:** Execute query against `v_prod_financial_summary`.
- **Expected Outcome:** Query returns strictly ₹50,000. Demo records are completely excluded.

---

### 2.7 Row-Level Security (RLS) & Runtime Role Boundaries

#### Test Case `TC-RLS-01`: Direct SQL Cross-Tenant Read Rejection under `waste_app_user`
- **Purpose:** Verify that a database connection set to Tenant A cannot read records belonging to Tenant B.
- **Execution Requirement:** PostgreSQL Database Engine under `waste_app_user` role (`NOSUPERUSER`, `NOBYPASSRLS`).
- **Setup:** Set transaction session variable to Verdant Hills:
  ```sql
  SELECT set_config('app.current_tenant_id', 'c1f7b022-7f28-4e92-b430-891dc457d101', true);
  ```
- **Action:** Execute `SELECT * FROM complaints WHERE tenant_id = 'c2a8d114-6e19-4f81-a320-780cb346e202';` (Oceanfront tenant).
- **Expected Outcome:** Query returns `0 rows`. RLS policy silently and strictly filters foreign tenant records.

#### Test Case `TC-RLS-02`: Cross-Tenant Write Rejection under `waste_app_user`
- **Purpose:** Verify that an insert attempting to supply a foreign `tenant_id` is aborted.
- **Execution Requirement:** PostgreSQL Database Engine under `waste_app_user`.
- **Setup:** Session variable is set to Verdant Hills (`c1f7b022-...-d101`).
- **Action:** Attempt to insert a bill with `tenant_id = 'c2a8d114-...-e202'` (Oceanfront).
- **Expected Outcome:** Insert fails with RLS check violation (`WITH CHECK` option fails, SQLSTATE `44000`).

---

### 2.8 Authenticated Citizen Tracking Authorization

#### Test Case `TC-TRK-01`: Unauthenticated Request to Live Tracking Rejection
- **Purpose:** Confirm that unauthenticated public requests to live vehicle tracking are rejected.
- **Execution Requirement:** API Gateway / Application HTTP Routing.
- **Setup:** Vehicle `veh-vh-01` is actively broadcasting live coordinates for locality `loc-vh-01-01`.
- **Action:** Send unauthenticated HTTP request: `GET /api/v1/citizen/tracking/loc-vh-01-01`.
- **Expected Outcome:** Server responds with HTTP `401 Unauthorized` (`AUTH_MISSING_CREDENTIALS`). No tracking coordinates returned.

#### Test Case `TC-TRK-02`: Cross-Tenant Citizen Tracking Authorization Rejection
- **Purpose:** Verify that an authenticated citizen from Municipality B cannot query vehicle tracking for Municipality A.
- **Execution Requirement:** Application Authentication & Authorization Layer.
- **Setup:** User `u-0007-citizen-of` (Oceanfront resident) is authenticated with a valid session cookie.
- **Action:** Send HTTP request: `GET /api/v1/citizen/tracking/loc-vh-01-01` (Verdant Hills locality).
- **Expected Outcome:** Server derives `tenant_id` from session, detects locality belongs to foreign tenant, and responds with HTTP `403 Forbidden` (`AUTH_FORBIDDEN_OBJECT_ACCESS`). Zero telemetry data leaked.

#### Test Case `TC-TRK-03`: Authorized Citizen Live Tracking Success
- **Purpose:** Verify that an authenticated citizen belonging to the correct tenant receives live tracking with appropriate freshness indicator.
- **Execution Requirement:** Application Authentication & Telemetry Query Service.
- **Setup:** User `u-0003-citizen-vh` (Verdant Hills resident) is authenticated and linked to `loc-vh-01-01`. Vehicle `veh-vh-01` sent a ping 15 seconds ago.
- **Action:** Send HTTP request: `GET /api/v1/citizen/tracking/loc-vh-01-01`.
- **Expected Outcome:** HTTP `200 OK` with payload containing vehicle label, coordinates, `status: "CURRENT"`, and `elapsed_seconds: 15`.

---

### 2.9 Telemetry Device Anti-Spoofing & Credential Binding

#### Test Case `TC-DEV-01`: Device-Vehicle Mismatch Rejection (`AUTH_DEVICE_VEHICLE_MISMATCH`)
- **Purpose:** Ensure a compromised or misconfigured hardware tracker cannot report coordinates for another vehicle.
- **Execution Requirement:** Telemetry Ingestion Service.
- **Setup:** Tracker `cred-vh-01` is cryptographically bound to vehicle `veh-vh-01`.
- **Action:** Ingestion request presents `X-Device-Token` for `cred-vh-01`, but payload contains `vehicle_id: "veh-of-01"`.
- **Expected Outcome:** Request rejected with HTTP `403 Forbidden` and error code `AUTH_DEVICE_VEHICLE_MISMATCH`. Telemetry discarded; security audit log emitted.

---

### 2.10 GPS Ingress Validation: Freshness, Clock Drift & Speed Anomalies

#### Test Case `TC-GPS-01`: Future Timestamp Clock Drift Rejection
- **Purpose:** Verify rejection of telemetry pings claiming timestamps significantly in the future.
- **Execution Requirement:** Ingestion Validation Pipeline.
- **Setup:** Current server time is `2026-11-02 08:00:00Z`.
- **Action:** Tracker submits telemetry packet with `recorded_at = 2026-11-02 08:05:00Z` (+300 seconds future).
- **Expected Outcome:** Packet rejected with HTTP `400 Bad Request` (`VALIDATION_FUTURE_TIMESTAMP`). Coordinates not written to snapshot.

#### Test Case `TC-GPS-02`: Supersonic Speed Jump Anomaly Filter
- **Purpose:** Detect and flag impossible physical movements (GPS multipath glitch or spoofing).
- **Execution Requirement:** Telemetry Processing Worker.
- **Setup:** Vehicle was recorded at Point A at `08:00:00Z`.
- **Action:** Packet arrives at `08:00:10Z` (+10 seconds) locating vehicle 50 km away (implied speed: 18,000 km/h).
- **Expected Outcome:** Packet marked `is_anomaly = TRUE` and logged to audit table; `latest_vehicle_positions` snapshot is NOT updated with erroneous coordinate.

---

### 2.11 Synthetic Seed Data Determinism & Cross-Table Integrity

#### Test Case `TC-SD-01`: Deterministic Seed Verification
- **Purpose:** Ensure that re-running synthetic data generation produces bit-for-bit identical IDs and hashes.
- **Execution Requirement:** Test Runner / Static Inspection.
- **Setup:** Synthetic data dictionary and fixture files in `docs/phase-3-synthetic-data.md`.
- **Action:** Calculate SHA-256 hashes of deterministic fixture tables across independent runs.
- **Expected Outcome:** Hashes match identically. Zero pseudo-random drift in UUIDs, timestamps, or balances.
