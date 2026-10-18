# Smart Municipal Waste Management Platform
## Phase 3: Synthetic Demo Dataset Specification

**Document Version:** 1.1.0 (Audited & Formally Hardened)  
**Phase:** 3 of 9 (Data Architecture, Double-Entry Accounting & Synthetic Demo Data)  
**Status:** Synthetic Data Design & Planning Specification (Awaiting Stakeholder Review)  
**Workspace:** `D:\project`  
**Sources of Truth:**  
- [Phase 3 Data Architecture Specification](file:///d:/project/docs/phase-3-data-architecture.md) (v1.1.0)  
- [Phase 3 Field-Level Data Dictionary Specification](file:///d:/project/docs/phase-3-data-dictionary.md) (v1.1.0)  
- [Phase 3 Double-Entry Accounting Design Specification](file:///d:/project/docs/phase-3-accounting-design.md) (v1.1.0)  
- [README.md](file:///d:/project/README.md) (v1.2.0)  
**Author:** Senior Software Architect  

---

## 1. Governance & Synthetic Data Rules

> [!CAUTION]
> **LEGAL, TAX & GPS FIXTURE NOTICE:**  
> - **100% Synthetic Records:** All records, entity identifiers, citizen names, addresses, phone numbers, vehicle registrations, invoice numbers, receipt numbers, and accounting journals documented in this specification are **100% FICTIONAL AND SYNTHETIC**.  
> - **Fictional GPS Test Fixtures:** All coordinates (`center_latitude`, `center_longitude`, vehicle coordinates, and breadcrumb logs) documented in this dataset are purely fictional test fixtures intended solely for schema, boundary, and UI layout validation. **They do NOT represent real operational vehicle locations, municipal boundaries, or approved service areas.**  
> - **Tax Treatment Unconfirmed:** Tax rate percentages are specified as `null` and flagged `UNCONFIRMED_PENDING_TAX_AUTHORITY_REVIEW`. Zero tax or tax exemption is NOT an established requirement.  
> - **Receipt Void Watermark:** **NO DEMONSTRATION RECEIPT, INVOICE, OR EXPORT FROM THIS DATASET IS VALID FOR PAYMENT, REIMBURSEMENT, TAX CREDIT, OR LEGAL PROOF.**  
> Every generated receipt and export automatically renders an indelible diagonal watermark:  
> `DEMONSTRATION RECORD — VOID — NOT A LEGAL OR TAX RECEIPT`.  
> - **Demo Data Containment:** All demo records are linked to tenants where `is_demo = TRUE`, ensuring strict exclusion from production reporting views.

### Principles of Synthetic Data Generation
1. **Zero Real-World PII / Credentials:** No real resident, municipal employee, vehicle plate, or payment credential is used. All phone numbers use fictional reservation ranges (e.g. `+919876500001` through `+919876500099`). All device secrets and passwords use safe static placeholder strings (e.g. `DEMO_ARGON2_PLACEHOLDER_HASH_01`).
2. **Strict Determinism:** All UUIDs, timestamps, coordinates, invoice numbers, and relational foreign keys are deterministic and hardcoded. Re-reading this specification always yields identical references.
3. **Multi-Tenant Representation:** The dataset models two distinct fictional municipalities:
   - **Municipality 1 (Verdant Hills Municipal Council):** Fictional Hill Station Urban Local Body with 2 wards, synthetic terrain routes, and online collection billing.
   - **Municipality 2 (Oceanfront Nagar Panchayat):** Fictional Coastal Port Urban Local Body with 1 ward, synthetic coastal routes, and online billing.
4. **Relational & Double-Entry Consistency:** Every foreign key references an existing primary key within the same tenant. Every posted double-entry journal entry balances exactly ($\sum \text{Debits} = \sum \text{Credits}$).
5. **No Executable Code:** This document provides static, reviewable Markdown tables and non-executable JSON specifications. It does not provide runnable SQL seed scripts, migrations, or application code.

---

## 2. Municipal Tenants & Configuration

### 2.1 Tenant 1: Verdant Hills Municipal Council
- **`id`:** `c1f7b022-7f28-4e92-b430-891dc457d101`
- **`name`:** `Verdant Hills Municipal Council`
- **`slug`:** `verdant-hills`
- **`state_region`:** `Maharashtra`
- **`contact_email`:** `admin@verdanthills.gov.local`
- **`currency`:** `INR`
- **`is_demo`:** `true`
- **`is_active`:** `true`
- **`settings`:**
  ```json
  {
    "gps_fresh_seconds": 60,
    "gps_stale_seconds": 180,
    "allowed_payment_methods": ["ONLINE_GATEWAY"],
    "doorstep_cash_enabled": false,
    "tax_rate_percentage": null,
    "tax_status_note": "UNCONFIRMED_PENDING_TAX_AUTHORITY_REVIEW",
    "timezone": "Asia/Kolkata"
  }
  ```

### 2.2 Tenant 2: Oceanfront Nagar Panchayat
- **`id`:** `c2a8d114-6e19-4f81-a320-780cb346e202`
- **`name`:** `Oceanfront Nagar Panchayat`
- **`slug`:** `oceanfront`
- **`state_region`:** `Goa`
- **`contact_email`:** `admin@oceanfront.gov.local`
- **`currency`:** `INR`
- **`is_demo`:** `true`
- **`is_active`:** `true`
- **`settings`:**
  ```json
  {
    "gps_fresh_seconds": 45,
    "gps_stale_seconds": 150,
    "allowed_payment_methods": ["ONLINE_GATEWAY"],
    "doorstep_cash_enabled": false,
    "tax_rate_percentage": null,
    "tax_status_note": "UNCONFIRMED_PENDING_TAX_AUTHORITY_REVIEW",
    "timezone": "Asia/Kolkata"
  }
  ```

---

## 3. Global Users & Tenant Memberships

### 3.1 Users Table (`users`)
All passwords use the non-functional testing hash placeholder: `DEMO_ARGON2_PLACEHOLDER_HASH_SECURE`.

| User ID | Phone (E.164) | Email | Full Name | Status |
| :--- | :--- | :--- | :--- | :--- |
| `u-0001-admin-vh` | `+919876500001` | `rajesh.patil@verdanthills.gov.local` | Rajesh Patil (Chief Officer) | `ACTIVE` |
| `u-0002-driver-vh` | `+919876500002` | `santosh.shinde@verdanthills.gov.local` | Santosh Shinde (Driver) | `ACTIVE` |
| `u-0003-citizen-vh`| `+919876500003` | `arun.deshmukh@example.local` | Arun Deshmukh (Resident) | `ACTIVE` |
| `u-0004-citizen-vh`| `+919876500004` | `priya.kulkarni@example.local` | Priya Kulkarni (Resident) | `ACTIVE` |
| `u-0005-admin-of` | `+919876500005` | `francis.dcosta@oceanfront.gov.local` | Francis D'Costa (Supervisor) | `ACTIVE` |
| `u-0006-driver-of` | `+919876500006` | `manohar.naik@oceanfront.gov.local` | Manohar Naik (Driver) | `ACTIVE` |
| `u-0007-citizen-of`| `+919876500007` | `anita.fernandes@example.local` | Anita Fernandes (Resident) | `ACTIVE` |

### 3.2 Municipality Memberships (`municipality_memberships`)

| Membership ID | Tenant ID | User ID | Role | Badge # | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `mem-01-vh-admin` | `c1f7b022-...-d101` (VH) | `u-0001-admin-vh` | `MUNICIPAL_ADMIN` | `VH-ADM-01` | `ACTIVE` |
| `mem-02-vh-driver`| `c1f7b022-...-d101` (VH) | `u-0002-driver-vh` | `COLLECTOR` | `VH-DRV-04` | `ACTIVE` |
| `mem-03-vh-cit01` | `c1f7b022-...-d101` (VH) | `u-0003-citizen-vh`| `CITIZEN` | `—` | `ACTIVE` |
| `mem-04-vh-cit02` | `c1f7b022-...-d101` (VH) | `u-0004-citizen-vh`| `CITIZEN` | `—` | `ACTIVE` |
| `mem-05-of-admin` | `c2a8d114-...-e202` (OF) | `u-0005-admin-of` | `MUNICIPAL_ADMIN` | `OF-ADM-01` | `ACTIVE` |
| `mem-06-of-driver`| `c2a8d114-...-e202` (OF) | `u-0006-driver-of` | `COLLECTOR` | `OF-DRV-02` | `ACTIVE` |
| `mem-07-of-cit01` | `c2a8d114-...-e202` (OF) | `u-0007-citizen-of`| `CITIZEN` | `—` | `ACTIVE` |

---

## 4. Administrative Geography & Properties

> [!NOTE]
> **Synthetic Geography Fixture Notice:** All ward names, locality boundaries, property PINs, and coordinates below are artificial test fixtures. They do NOT correspond to real cadastral survey numbers, real residences, or approved municipal tax boundaries.

### 4.1 Wards & Localities

#### Verdant Hills (VH)
- **Ward 01 (`w-vh-01`):** `Ward-01`, "Pine Ridge Sector"
  - **Locality (`loc-vh-01-01`):** Code: `VH-W01-L01`, Name: "Hilltop Avenue", Lat: `18.9220100`, Lon: `72.8340200`
  - **Locality (`loc-vh-01-02`):** Code: `VH-W01-L02`, Name: "Valley View Enclave", Lat: `18.9245000`, Lon: `72.8362000`
- **Ward 02 (`w-vh-02`):** `Ward-02`, "Market Square"
  - **Locality (`loc-vh-02-01`):** Code: `VH-W02-L01`, Name: "Commercial Bazaar", Lat: `18.9180000`, Lon: `72.8310000`

#### Oceanfront (OF)
- **Ward 01 (`w-of-01`):** `Ward-01`, "Harbor & Beach Front"
  - **Locality (`loc-of-01-01`):** Code: `OF-W01-L01`, Name: "Promenade Promenade", Lat: `15.4989000`, Lon: `73.8278000`

### 4.2 Properties, Accounts & Citizen Links

| Location ID | Tenant | Locality | Property PIN | Street Address | Account ID | Account # | Primary User |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `loc-vh-prop-01` | VH | `loc-vh-01-01` | `PROP-VH-W01-001` | Flat 402, Pinecrest, Hilltop Ave | `sa-vh-001` | `VH-SA-00101` | `u-0003-citizen-vh` |
| `loc-vh-prop-02` | VH | `loc-vh-01-02` | `PROP-VH-W01-002` | Bungalow 12, Valley View | `sa-vh-002` | `VH-SA-00102` | `u-0004-citizen-vh` |
| `loc-of-prop-01` | OF | `loc-of-01-01` | `PROP-OF-W01-001` | Villa 8, Seaside Lane, Harbor | `sa-of-001` | `OF-SA-00201` | `u-0007-citizen-of` |

---

## 5. Fleet, Telemetry & Shifts

> [!NOTE]
> **Synthetic Telemetry Fixture Notice:** Vehicle registrations, labels, GPS positions, and shift logs below are artificial fixtures created solely for system validation. They do NOT represent real municipal collection vehicles, real driver movements, or operational routes. Device credentials use safe, non-functional placeholder hashes. No real device secrets are exposed.

| Vehicle ID | Tenant | Registration # | Label | Type | Credential ID | Key Prefix | Token Hash Placeholder | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `veh-vh-01` | VH | `MH-14-TR-1004` | Tipper Truck #04 | `TIPPER` | `cred-vh-01` | `dev_vh04_` | `DEV_HASH_PLACEHOLDER_VH04` | `ACTIVE` |
| `veh-of-01` | OF | `GA-01-TR-2002` | Coastal Compactor #02 | `COMPACTOR` | `cred-of-01` | `dev_of02_` | `DEV_HASH_PLACEHOLDER_OF02` | `ACTIVE` |

### 5.2 Routes & Stops
- **Route VH-R01 (`rt-vh-01`):** "Morning Hilltop Route" (VH).
  - Stop 1: `loc-vh-01-01` (Stop Order: 1, Geofence: 50m)
  - Stop 2: `loc-vh-01-02` (Stop Order: 2, Geofence: 50m)
- **Route OF-R01 (`rt-of-01`):** "Coastal Morning Beat" (OF).
  - Stop 1: `loc-of-01-01` (Stop Order: 1, Geofence: 50m)

### 5.3 Driver Shifts
- **Shift 1 (`shift-vh-01`):** Date: `2026-11-02`, Vehicle: `veh-vh-01`, Driver: `mem-02-vh-driver`, Route: `rt-vh-01`, Status: `ACTIVE`, Started: `2026-11-02 07:00:00Z`, Total Cash: `0` (Pilot Cash Invariant).
- **Shift 2 (`shift-of-01`):** Date: `2026-11-02`, Vehicle: `veh-of-01`, Driver: `mem-06-of-driver`, Route: `rt-of-01`, Status: `ACTIVE`, Started: `2026-11-02 07:15:00Z`, Total Cash: `0` (Pilot Cash Invariant).

### 5.4 Authoritative Latest Vehicle Positions (`latest_vehicle_positions`)

```json
[
  {
    "vehicle_id": "veh-vh-01",
    "tenant_id": "c1f7b022-7f28-4e92-b430-891dc457d101",
    "shift_id": "shift-vh-01",
    "latitude": 18.9224500,
    "longitude": 72.8341200,
    "speed_kmh": 14.50,
    "heading_degrees": 85.00,
    "last_recorded_at": "2026-11-02T07:29:45Z",
    "status": "CURRENT",
    "is_demo": true
  },
  {
    "vehicle_id": "veh-of-01",
    "tenant_id": "c2a8d114-6e19-4f81-a320-780cb346e202",
    "shift_id": "shift-of-01",
    "latitude": 15.4989500,
    "longitude": 73.8278200,
    "speed_kmh": 0.00,
    "heading_degrees": 180.00,
    "last_recorded_at": "2026-11-02T07:14:00Z",
    "status": "STALE",
    "is_demo": true
  }
]
```

---

## 6. Complaints & Grievance History

| Complaint ID | Tenant | Ticket Number | Locality | Account | Category | Description | Status | Resolved At |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `cmp-vh-01` | VH | `VHMC-2026-CMP-00412` | `loc-vh-01-01` | `sa-vh-001` | `MISSED_HOUSEHOLD` | "Green bin not collected at Flat 402 during morning run." | `RESOLVED` | `2026-11-01 11:30:00Z` |
| `cmp-vh-02` | VH | `VHMC-2026-CMP-00413` | `loc-vh-01-02` | `sa-vh-002` | `WASTE_SPILLAGE` | "Litter spillage outside Valley View gate 2." | `OPEN` | `NULL` |

---

## 7. Billing, Invoicing & Operational Payments

### 7.1 Bills (`bills`)

| Bill ID | Tenant | Account ID | Invoice Number | Period | Due (Paise) | Paid (Paise) | Status | Due Date |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `bill-vh-01` | VH | `sa-vh-001` | `INV-VHMC-2026-08101` | 2026-11-01 to 2026-11-30 | `30000` (₹300) | `30000` | `PAID` | `2026-11-15` |
| `bill-vh-02` | VH | `sa-vh-002` | `INV-VHMC-2026-08102` | 2026-11-01 to 2026-11-30 | `30000` (₹300) | `0` | `UNPAID` | `2026-11-15` |
| `bill-of-01` | OF | `sa-of-001` | `INV-OFNP-2026-00401` | 2026-11-01 to 2026-11-30 | `25000` (₹250) | `25000` | `PAID` | `2026-11-15` |

### 7.2 Payment Transactions (`payment_transactions`)

| Payment ID | Tenant | Account ID | Bill ID | Method | Amount (Paise) | Status | Provider | Receipt Number |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `pt-vh-01` | VH | `sa-vh-001` | `bill-vh-01` | `ONLINE_GATEWAY` | `30000` | `PROVIDER_CONFIRMED` | `SIMULATED_RAZORPAY` | `REC-VHMC-2026-00918` |
| `pt-vh-02` | VH | `sa-vh-002` | `bill-vh-02` | `ONLINE_GATEWAY` | `30000` | `FAILED` | `SIMULATED_RAZORPAY` | `REC-VHMC-2026-00919` |
| `pt-of-01` | OF | `sa-of-001` | `bill-of-01` | `ONLINE_GATEWAY` | `25000` | `PROVIDER_CONFIRMED` | `SIMULATED_RAZORPAY` | `REC-OFNP-2026-00112` |

---

## 8. Double-Entry General Ledger Fixtures

### 8.1 Chart of Accounts Instances (Both Tenants)
Accounts `1010` through `5210` are instantiated for both `VH` and `OF`. Account `1010 CASH-IN-HAND-COLLECTORS` is marked `is_active = FALSE` for the pilot.

### 8.2 Balanced Double-Entry Journal Entries (`journal_entries` & `journal_entry_lines`)

#### Entry 1: Assessment of Bill INV-VHMC-2026-08101 (Verdant Hills)
- **Header:** `id`: `je-vh-01`, `tenant_id`: `VH`, `entry_number`: `JE-VHMC-2026-00101`, `business_event_type`: `BILL_ISSUANCE`, `business_event_id`: `INV-VHMC-2026-08101`, `effective_date`: `2026-11-01`, `status`: `POSTED`, `currency`: `INR`, `is_demo`: `true`.
- **Lines:**
  1. `account_code`: `1210` (`AR-CITIZEN-FEES`), `entry_type`: `DEBIT`, `amount_minor_units`: `30000` (₹300.00).
  2. `account_code`: `4110` (`REVENUE-SOLID-WASTE-FEE`), `entry_type`: `CREDIT`, `amount_minor_units`: `30000` (₹300.00).
  - *Invariant Check:* Debits: `30000`, Credits: `30000`. Net Imbalance: `0`.

#### Entry 2: Online Payment Capture for Receipt REC-VHMC-2026-00918 (Verdant Hills)
- **Header:** `id`: `je-vh-02`, `tenant_id`: `VH`, `entry_number`: `JE-VHMC-2026-00102`, `business_event_type`: `PAYMENT_CAPTURED`, `business_event_id`: `pt-vh-01`, `effective_date`: `2026-11-02`, `status`: `POSTED`, `currency`: `INR`, `is_demo`: `true`.
- **Lines:**
  1. `account_code`: `1110` (`CASH-GATEWAY-CLEARING`), `entry_type`: `DEBIT`, `amount_minor_units`: `30000` (₹300.00).
  2. `account_code`: `1210` (`AR-CITIZEN-FEES`), `entry_type`: `CREDIT`, `amount_minor_units`: `30000` (₹300.00).
  - *Invariant Check:* Debits: `30000`, Credits: `30000`. Net Imbalance: `0`.

#### Entry 3: Assessment of Bill INV-OFNP-2026-00401 (Oceanfront)
- **Header:** `id`: `je-of-01`, `tenant_id`: `OF`, `entry_number`: `JE-OFNP-2026-00001`, `business_event_type`: `BILL_ISSUANCE`, `business_event_id`: `INV-OFNP-2026-00401`, `effective_date`: `2026-11-01`, `status`: `POSTED`, `currency`: `INR`, `is_demo`: `true`.
- **Lines:**
  1. `account_code`: `1210` (`AR-CITIZEN-FEES`), `entry_type`: `DEBIT`, `amount_minor_units`: `25000` (₹250.00).
  2. `account_code`: `4110` (`REVENUE-SOLID-WASTE-FEE`), `entry_type`: `CREDIT`, `amount_minor_units`: `25000` (₹250.00).
  - *Invariant Check:* Debits: `25000`, Credits: `25000`. Net Imbalance: `0`.

#### Entry 4: Online Payment Capture for Receipt REC-OFNP-2026-00112 (Oceanfront)
- **Header:** `id`: `je-of-02`, `tenant_id`: `OF`, `entry_number`: `JE-OFNP-2026-00002`, `business_event_type`: `PAYMENT_CAPTURED`, `business_event_id`: `pt-of-01`, `effective_date`: `2026-11-02`, `status`: `POSTED`, `currency`: `INR`, `is_demo`: `true`.
- **Lines:**
  1. `account_code`: `1110` (`CASH-GATEWAY-CLEARING`), `entry_type`: `DEBIT`, `amount_minor_units`: `25000` (₹250.00).
  2. `account_code`: `1210` (`AR-CITIZEN-FEES`), `entry_type`: `CREDIT`, `amount_minor_units`: `25000` (₹250.00).
  - *Invariant Check:* Debits: `25000`, Credits: `25000`. Net Imbalance: `0`.

---

## 9. Deliberate Edge Cases & Test Fixtures

The synthetic dataset includes explicit fixtures representing real-world anomalies, marked clearly as test cases:

```json
{
  "edge_case_fixtures": [
    {
      "fixture_id": "FX-ANOMALY-01-DUP-WEBHOOK",
      "category": "GATEWAY_DUPLICATE_DELIVERY",
      "description": "Payment aggregator retries identical payment.captured webhook for pt-vh-01.",
      "record": {
        "gateway_provider": "SIMULATED_RAZORPAY",
        "gateway_event_id": "evt_test_captured_vh01",
        "expected_result": "Ignored via UNIQUE (gateway_provider, gateway_event_id); processing_status = 'DUPLICATE_IGNORED'; no second journal entry created."
      }
    },
    {
      "fixture_id": "FX-ANOMALY-02-FAILED-PAYMENT",
      "category": "OPERATIONAL_FAILURE_NO_FINANCIAL_EFFECT",
      "description": "Card declined for pt-vh-02.",
      "record": {
        "payment_id": "pt-vh-02",
        "status": "FAILED",
        "expected_result": "Bill remains UNPAID; zero journal entries posted to general ledger."
      }
    },
    {
      "fixture_id": "FX-ANOMALY-03-STALE-GPS",
      "category": "TELEMETRY_LATENCY",
      "description": "Vehicle veh-of-01 has had no GPS updates for 16 minutes.",
      "record": {
        "vehicle_id": "veh-of-01",
        "elapsed_seconds": 960,
        "expected_result": "Status computed as 'STALE'; UI displays yellow warning pill with last seen timestamp."
      }
    },
    {
      "fixture_id": "FX-ANOMALY-04-OUT-OF-ORDER-GPS",
      "category": "TELEMETRY_CLOCK_DRIFT",
      "description": "Telemetry ping arrived with recorded_at timestamp earlier than vehicle's current position.",
      "record": {
        "vehicle_id": "veh-vh-01",
        "attempted_recorded_at": "2026-11-02T07:20:00Z",
        "current_last_recorded_at": "2026-11-02T07:29:45Z",
        "expected_result": "Appended to vehicle_telemetry_logs for audit; discarded from latest_vehicle_positions snapshot."
      }
    },
    {
      "fixture_id": "FX-ANOMALY-05-CROSS-TENANT-REJECTION",
      "category": "TENANT_SECURITY_ISOLATION",
      "description": "Citizen u-0007-citizen-of (Oceanfront) attempts to query live tracking for loc-vh-01-01 (Verdant Hills).",
      "record": {
        "authenticated_user": "u-0007-citizen-of",
        "requested_locality": "loc-vh-01-01",
        "expected_result": "HTTP 403 Forbidden with code AUTH_FORBIDDEN_OBJECT_ACCESS; zero vehicle data leaked."
      }
    }
  ]
}
```
