# Smart Municipal Waste Management Platform
## Phase 3: Field-Level Data Dictionary Specification

**Document Version:** 1.1.0 (Audited & Formally Hardened)  
**Phase:** 3 of 9 (Data Architecture, Double-Entry Accounting & Synthetic Demo Data)  
**Status:** Data Design & Planning Specification (Awaiting Stakeholder Review)  
**Workspace:** `D:\project`  
**Sources of Truth:**  
- [Phase 3 Data Architecture Specification](file:///d:/project/docs/phase-3-data-architecture.md) (v1.1.0)  
- [Phase 2 Data Model & Schema Design Specification](file:///d:/project/docs/phase-2-data-model.md) (v1.2.0)  
- [Phase 2 API Contracts Specification](file:///d:/project/docs/phase-2-api-contracts.md) (v1.2.0)  
- [README.md](file:///d:/project/README.md) (v1.2.0)  
**Author:** Senior Software Architect  

---

## 1. Specification Standards & Data Conventions

1. **Monetary Representation:** All monetary values are strictly specified as `BIGINT` integer minor units (paise in INR, where 100 paise = ₹1.00; cents in USD, etc.). Floating-point representations (`FLOAT`, `DOUBLE PRECISION`, `REAL`) are prohibited to eliminate rounding and precision loss.
2. **Currency Standardization:** Currency codes are strictly ISO 4217 three-letter strings (default: `'INR'`). Cross-currency mixing within a journal entry is forbidden.
3. **Data Sensitivity Classifications:**
   - **`Public`:** Non-sensitive catalog data (ward names, schedules, general notices).
   - **`Internal Operational`:** Fleet logs, shift assignments, internal codes.
   - **`Confidential PII`:** Personally identifiable citizen/employee information (names, phones, emails, addresses).
   - **`Restricted Financial`:** Bills, payments, account numbers, double-entry ledgers.
   - **`Cryptographic Secret`:** Password hashes, device token hashes, session tokens.
4. **Data Origin / Sources:**
   - `System-Generated`: Populated by database defaults (`gen_random_uuid()`, `clock_timestamp()`) or backend workers.
   - `User-Provided`: Input submitted by citizens, drivers, or administrators via authenticated forms.
   - `Externally Sourced`: Received from payment gateways, telemetry hardware, or external webhooks.
   - `Synthetic Seed`: Pre-generated deterministic records for pilot testing.
5. **Governance & Tax Treatment Notice:**
   - Tax liabilities (GST / cess) are **unconfirmed pending formal municipal finance and tax review**; zero tax is not an established requirement.
   - Retention periods across all entities are **provisional proposals pending municipal legal and data-governance validation**. Universal statutory minimums are not assumed without verified legal basis.

---

## 2. Tenancy & Identity Subsystem

### 2.1 Entity: `municipalities`
*System Root / Top-Level Tenant Container.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Immutable unique identifier for municipality tenant. | Public | System-Generated |
| `name` | `VARCHAR(128) NOT NULL` | None | Non-empty string | Official name of the Urban Local Body (ULB). | Public | User-Provided |
| `slug` | `VARCHAR(64) NOT NULL` | `UNIQUE` | Regex `^[a-z0-9-]+$` | URL-safe tenant identifier. | Public | User-Provided |
| `state_region` | `VARCHAR(64) NOT NULL` | None | Standard state name (e.g. Maharashtra, Goa) | Administrative state or territory. | Public | User-Provided |
| `contact_email` | `VARCHAR(128) NOT NULL` | None | Standard email format | Official administrative support email. | Public | User-Provided |
| `currency` | `VARCHAR(3) NOT NULL` | None | Default `'INR'`, ISO 4217 | Base operating currency for the municipality. | Public | User-Provided |
| `is_demo` | `BOOLEAN NOT NULL` | None | Default `FALSE` | Indicates whether tenant is a synthetic demo environment. | Public | User-Provided / System |
| `is_active` | `BOOLEAN NOT NULL` | None | Default `TRUE` | Tenant operational activation toggle. | Internal Operational | User-Provided |
| `settings` | `JSONB NOT NULL` | None | Valid JSON, default `'{}'` | Tenant-specific config (GPS thresholds, allowed methods). | Internal Operational | User-Provided |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Audit timestamp of tenant onboarding. | Internal Operational | System-Generated |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Audit timestamp of last configuration update. | Internal Operational | System-Generated |

---

### 2.2 Entity: `users`
*Global Identity Container.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Global user identity key across all tenants. | Internal Operational | System-Generated |
| `phone` | `VARCHAR(20) NOT NULL` | `UNIQUE` | E.164 format `^\+[1-9]\d{7,14}$` | Primary authentication identifier and SMS dispatch contact. | Confidential PII | User-Provided |
| `email` | `VARCHAR(128) NULL` | `UNIQUE` | Standard email format | Optional secondary contact and email receipt delivery. | Confidential PII | User-Provided |
| `password_hash` | `VARCHAR(255) NOT NULL` | None | Argon2id hash string | Cryptographic verification hash for password login. | Cryptographic Secret | System-Generated |
| `full_name` | `VARCHAR(128) NOT NULL` | None | Non-empty string | Citizen or staff legal/preferred display name. | Confidential PII | User-Provided |
| `is_active` | `BOOLEAN NOT NULL` | None | Default `TRUE` | Security lockout and account active toggle. | Internal Operational | System-Generated |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Registration timestamp. | Internal Operational | System-Generated |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Profile update timestamp. | Internal Operational | System-Generated |

---

### 2.3 Entity: `municipality_memberships`
*Tenant Authorization & Role Junction.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Membership assignment identifier. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Scopes membership to specific municipality. | Internal Operational | System-Generated |
| `user_id` | `UUID NOT NULL` | `FK -> users(id)` | `ON DELETE RESTRICT` | References global user account. | Internal Operational | System-Generated |
| `role` | `VARCHAR(32) NOT NULL` | None | `'CITIZEN'`, `'COLLECTOR'`, `'MUNICIPAL_ADMIN'`, `'PLATFORM_ADMIN'` | Role-based access control tier within this tenant. | Internal Operational | User-Provided |
| `badge_number` | `VARCHAR(32) NULL` | None | Alphanumeric employee badge ID | Official staff/driver identifier. | Internal Operational | User-Provided |
| `is_active` | `BOOLEAN NOT NULL` | None | Default `TRUE` | Active membership flag for access revocation. | Internal Operational | System-Generated |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Timestamp membership was granted. | Internal Operational | System-Generated |

---

## 3. Administrative Geography & Properties

### 3.1 Entity: `wards`
*Municipal Electoral & Sanitation Administrative Ward.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Ward record identifier. | Public | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `ward_number` | `VARCHAR(16) NOT NULL` | None | e.g. `'Ward-01'`, `'Ward-04'` | Official municipal administrative ward identifier. | Public | User-Provided |
| `name` | `VARCHAR(64) NOT NULL` | None | e.g. `'North Greens'`, `'Harbor Zone'` | Public name of the ward. | Public | User-Provided |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Ward creation audit timestamp. | Internal Operational | System-Generated |

---

### 3.2 Entity: `localities`
*Collection Beat / Neighborhood Sector.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Locality record identifier. | Public | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `ward_id` | `UUID NOT NULL` | `FK -> wards(id)` | `ON DELETE RESTRICT` | Parent administrative ward. | Public | User-Provided |
| `code` | `VARCHAR(32) NOT NULL` | None | e.g. `'VH-W04-L01'` | Unique operational code within tenant. | Public | User-Provided |
| `name` | `VARCHAR(128) NOT NULL` | None | e.g. `'Cedar Heights Sector 1'` | Public neighborhood / locality name. | Public | User-Provided |
| `center_latitude` | `NUMERIC(10, 7) NOT NULL` | None | Between `-90.0` and `90.0` | Default map viewport latitude. | Public | User-Provided |
| `center_longitude`| `NUMERIC(10, 7) NOT NULL` | None | Between `-180.0` and `180.0` | Default map viewport longitude. | Public | User-Provided |
| `boundary_geojson`| `JSONB NULL` | None | Valid GeoJSON Polygon / MultiPolygon | Geographical boundary for map overlay rendering. | Public | User-Provided |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Creation timestamp. | Internal Operational | System-Generated |

---

### 3.3 Entity: `service_locations`
*Physical Property Assessed for Sanitation Service.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Location record identifier. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `locality_id` | `UUID NOT NULL` | `FK -> localities(id)` | `ON DELETE RESTRICT` | Locality where property is situated. | Public | User-Provided |
| `property_identifier` | `VARCHAR(64) NOT NULL` | None | Unique within tenant (Property PIN) | Municipal tax/property index number. | Internal Operational | User-Provided |
| `address_line1` | `VARCHAR(255) NOT NULL` | None | Street address / Building name | Physical delivery address line 1. | Confidential PII | User-Provided |
| `address_line2` | `VARCHAR(255) NULL` | None | Apartment / Suite number | Physical delivery address line 2. | Confidential PII | User-Provided |
| `latitude` | `NUMERIC(10, 7) NULL` | None | Coordinate bounds | Geocoded property coordinate. | Confidential PII | User-Provided |
| `longitude` | `NUMERIC(10, 7) NULL` | None | Coordinate bounds | Geocoded property coordinate. | Confidential PII | User-Provided |
| `property_type` | `VARCHAR(32) NOT NULL` | None | `'RESIDENTIAL'`, `'COMMERCIAL'`, `'INSTITUTIONAL'` | Tariff classification for waste billing. | Public | User-Provided |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Creation timestamp. | Internal Operational | System-Generated |

---

### 3.4 Entity: `service_accounts`
*Citizen Utility Billing & Service Entity.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Service account unique key. | Restricted Financial | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `service_location_id` | `UUID NOT NULL` | `FK -> service_locations(id)` | `ON DELETE RESTRICT` | Associated physical premise. | Restricted Financial | System-Generated |
| `account_number` | `VARCHAR(32) NOT NULL` | None | e.g. `'VH-SA-00104'`, Unique per tenant | Customer billing identifier on invoices. | Restricted Financial | System-Generated |
| `status` | `VARCHAR(32) NOT NULL` | None | `'ACTIVE'`, `'SUSPENDED'`, `'CLOSED'` | Service account operational status. | Restricted Financial | System-Generated |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Enrollment timestamp. | Internal Operational | System-Generated |

---

### 3.5 Entity: `service_account_users`
*Citizen Access Grant to Service Account.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Link identifier. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `service_account_id` | `UUID NOT NULL` | `FK -> service_accounts(id)` | `ON DELETE CASCADE` | Target billing account. | Restricted Financial | System-Generated |
| `user_id` | `UUID NOT NULL` | `FK -> users(id)` | `ON DELETE RESTRICT` | Resident user profile. | Confidential PII | System-Generated |
| `relationship_type` | `VARCHAR(32) NOT NULL` | None | `'OWNER'`, `'TENANT'`, `'AUTHORIZED_FAMILY'` | Legal relationship to property. | Confidential PII | User-Provided |
| `is_primary_billing_contact` | `BOOLEAN NOT NULL` | None | Default `FALSE` | Recipient for SMS/Email invoice dispatch. | Confidential PII | User-Provided |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Linking timestamp. | Internal Operational | System-Generated |

---

## 4. Fleet, Telemetry & Shift Subsystem

### 4.1 Entity: `vehicles`
*Sanitation Fleet Asset.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Fleet vehicle identifier. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `registration_number`| `VARCHAR(32) NOT NULL`| None | Government vehicle license plate | Physical identification plate. | Public | User-Provided |
| `vehicle_label` | `VARCHAR(64) NOT NULL` | None | e.g. `'Tipper Truck #04'` | Citizen-friendly display title. | Public | User-Provided |
| `vehicle_type` | `VARCHAR(32) NOT NULL` | None | `'COMPACTOR'`, `'TIPPER'`, `'AUTO_TIPPER'`, `'TRACTOR'` | Physical waste collection mechanism. | Public | User-Provided |
| `capacity_metric_tonnes` | `NUMERIC(4, 2) NOT NULL`| None | Greater than `0.00` | Rated payload limit. | Internal Operational | User-Provided |
| `is_active` | `BOOLEAN NOT NULL` | None | Default `TRUE` | Fleet operational availability flag. | Internal Operational | User-Provided |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Registration timestamp. | Internal Operational | System-Generated |

---

### 4.2 Entity: `device_credentials`
*GPS Hardware / Driver Mobile Pre-Shared Authentication Secrets.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Credential record key. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `vehicle_id` | `UUID NOT NULL` | `FK -> vehicles(id)` | `ON DELETE CASCADE`, Unique | Cryptographically bound vehicle. | Internal Operational | User-Provided |
| `key_prefix` | `VARCHAR(16) NOT NULL` | None | e.g. `'dev_live_ab12'` | Public index prefix for fast token lookup. | Internal Operational | System-Generated |
| `token_hash` | `VARCHAR(255) NOT NULL`| None | Argon2id / Salted hash string | Hashed verification token. | Cryptographic Secret | System-Generated |
| `secondary_token_hash` | `VARCHAR(255) NULL`| None | Argon2id hash | Overlapping rotation secret hash. | Cryptographic Secret | System-Generated |
| `secondary_expires_at` | `TIMESTAMPTZ NULL` | None | Must be future timestamp if present | Grace expiration timestamp for rotation. | Internal Operational | System-Generated |
| `status` | `VARCHAR(16) NOT NULL` | None | `'ACTIVE'`, `'SUSPENDED'`, `'REVOKED'` | Ingestion authorization status. | Internal Operational | System-Generated |
| `last_used_at` | `TIMESTAMPTZ NULL` | None | Timestamp of last GPS ping | Telemetry heartbeat verification. | Internal Operational | System-Generated |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Issuance timestamp. | Internal Operational | System-Generated |

---

### 4.3 Entity: `driver_shifts`
*Operational Daily Dispatch Assignment.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Shift unique identifier. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `vehicle_id` | `UUID NOT NULL` | `FK -> vehicles(id)` | `ON DELETE RESTRICT` | Assigned operational vehicle. | Internal Operational | User-Provided |
| `driver_membership_id` | `UUID NOT NULL` | `FK -> municipality_memberships(id)` | `ON DELETE RESTRICT` | Assigned driver/collector. | Internal Operational | User-Provided |
| `route_id` | `UUID NOT NULL` | `FK -> routes(id)` | `ON DELETE RESTRICT` | Assigned waste collection route. | Internal Operational | User-Provided |
| `shift_date` | `DATE NOT NULL` | None | Operational shift date | Dispatch calendar date. | Internal Operational | User-Provided |
| `status` | `VARCHAR(32) NOT NULL` | None | `'PLANNED'`, `'ACTIVE'`, `'COMPLETED'`, `'CANCELLED'` | Current shift lifecycle state. | Internal Operational | System-Generated |
| `started_at` | `TIMESTAMPTZ NULL` | None | Shift departure timestamp | Field operation start audit. | Internal Operational | System-Generated |
| `ended_at` | `TIMESTAMPTZ NULL` | None | Shift completion timestamp | Field operation end audit. | Internal Operational | System-Generated |
| `total_cash_collected_minor_units` | `BIGINT NOT NULL` | None | Default `0`, `CHECK (= 0)` in pilot | Cash total (Prohibited & zero in pilot). | Restricted Financial | System-Generated |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Creation timestamp. | Internal Operational | System-Generated |

---

### 4.4 Entity: `latest_vehicle_positions`
*Authoritative 1-to-1 Vehicle Snapshot for Live Citizen Tracking.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `vehicle_id` | `UUID NOT NULL` | `PRIMARY KEY, FK -> vehicles(id)` | `ON DELETE CASCADE` | 1-to-1 bound fleet vehicle. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `shift_id` | `UUID NULL` | `FK -> driver_shifts(id)` | `ON DELETE SET NULL` | Currently active operating shift. | Internal Operational | System-Generated |
| `latitude` | `NUMERIC(10, 7) NOT NULL`| None | Between `-90.0` and `90.0` | Latest recorded latitude. | Internal Operational | Externally Sourced |
| `longitude` | `NUMERIC(10, 7) NOT NULL`| None | Between `-180.0` and `180.0` | Latest recorded longitude. | Internal Operational | Externally Sourced |
| `speed_kmh` | `NUMERIC(5, 2) NOT NULL`| None | `0.00` to `140.00` | Latest recorded ground speed. | Internal Operational | Externally Sourced |
| `heading_degrees` | `NUMERIC(5, 2) NOT NULL`| None | `0.00` to `359.99` | Compass direction of travel. | Internal Operational | Externally Sourced |
| `last_recorded_at`| `TIMESTAMPTZ NOT NULL`| None | Device hardware timestamp | Telemetry capture timestamp. | Internal Operational | Externally Sourced |
| `status` | `VARCHAR(16) NOT NULL` | None | `'CURRENT'`, `'STALE'`, `'UNAVAILABLE'` | Computed signal freshness classification. | Public (Auth Citizens) | System-Generated |
| `is_demo` | `BOOLEAN NOT NULL` | None | Default `FALSE` | Inherited demo isolation flag. | Internal Operational | System-Generated |

---

### 4.5 Entity: `vehicle_telemetry_logs`
*High-Frequency Append-Only Breadcrumb Store.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL NOT NULL` | `PRIMARY KEY` | Auto-incrementing integer | Breadcrumb record sequence. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `vehicle_id` | `UUID NOT NULL` | `FK -> vehicles(id)` | `ON DELETE CASCADE` | Reporting fleet vehicle. | Internal Operational | Externally Sourced |
| `shift_id` | `UUID NULL` | `FK -> driver_shifts(id)` | `ON DELETE SET NULL` | Bound operating shift. | Internal Operational | System-Generated |
| `latitude` | `NUMERIC(10, 7) NOT NULL`| None | Between `-90.0` and `90.0` | Measured latitude. | Internal Operational | Externally Sourced |
| `longitude` | `NUMERIC(10, 7) NOT NULL`| None | Between `-180.0` and `180.0` | Measured longitude. | Internal Operational | Externally Sourced |
| `speed_kmh` | `NUMERIC(5, 2) NOT NULL`| None | `0.00` to `140.00` | Measured speed. | Internal Operational | Externally Sourced |
| `heading_degrees` | `NUMERIC(5, 2) NOT NULL`| None | `0.00` to `359.99` | Measured heading. | Internal Operational | Externally Sourced |
| `recorded_at` | `TIMESTAMPTZ NOT NULL`| None | Hardware GPS fix timestamp | Time coordinate was measured. | Internal Operational | Externally Sourced |
| `ingested_at` | `TIMESTAMPTZ NOT NULL`| None | Default `clock_timestamp()` | Time server accepted packet. | Internal Operational | System-Generated |
| `is_simulated` | `BOOLEAN NOT NULL` | None | Default `FALSE` | Marks synthetic test pings. | Internal Operational | Externally Sourced |

---

## 5. Complaints & Citizen Feedback

### 5.1 Entity: `complaints`
*Citizen Service Grievance & SLA Tracking.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Complaint record key. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `ticket_number` | `VARCHAR(32) NOT NULL` | `UNIQUE` per tenant | e.g. `'VHMC-2026-CMP-00412'` | Public grievance reference number. | Public (Ticket holder) | System-Generated |
| `locality_id` | `UUID NOT NULL` | `FK -> localities(id)` | `ON DELETE RESTRICT` | Affected collection neighborhood. | Public | User-Provided |
| `service_account_id` | `UUID NULL` | `FK -> service_accounts(id)` | `ON DELETE SET NULL` | Linked property account (if household). | Confidential PII | User-Provided |
| `submitted_by_user_id`| `UUID NULL` | `FK -> users(id)` | `ON DELETE SET NULL` | Submitting citizen profile. | Confidential PII | System-Generated |
| `assigned_to_membership_id`| `UUID NULL` | `FK -> municipality_memberships(id)`| `ON DELETE SET NULL` | Assigned municipal inspector. | Internal Operational | User-Provided |
| `category` | `VARCHAR(32) NOT NULL` | None | `'MISSED_LOCALITY'`, `'MISSED_HOUSEHOLD'`, `'WASTE_SPILLAGE'`, `'COLLECTOR_BEHAVIOR'` | Grievance categorization. | Internal Operational | User-Provided |
| `description` | `TEXT NOT NULL` | None | Non-empty text | Citizen grievance explanation. | Confidential PII | User-Provided |
| `photo_url` | `VARCHAR(255) NULL` | None | Secure URL | Optional photographic evidence. | Confidential PII | User-Provided |
| `status` | `VARCHAR(32) NOT NULL` | None | `'OPEN'`, `'ASSIGNED'`, `'IN_INVESTIGATION'`, `'RESOLVED'`, `'CLOSED'` | Resolution lifecycle stage. | Public (Ticket holder) | System-Generated |
| `resolution_notes` | `TEXT NULL` | None | Free text | Staff explanation of resolution actions. | Public (Ticket holder) | User-Provided |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Submission timestamp. | Internal Operational | System-Generated |
| `resolved_at` | `TIMESTAMPTZ NULL` | None | Closure timestamp | SLA fulfillment timestamp. | Internal Operational | System-Generated |

---

## 6. Billing, Invoicing & Payment Operations

### 6.1 Entity: `bills`
*Assessed Municipal Sanitation Fee Invoice.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Bill unique identifier. | Restricted Financial | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `service_account_id` | `UUID NOT NULL` | `FK -> service_accounts(id)` | `ON DELETE RESTRICT` | Invoiced customer service account. | Restricted Financial | System-Generated |
| `invoice_number` | `VARCHAR(64) NOT NULL` | `UNIQUE` per tenant | e.g. `'INV-VHMC-2026-08101'` | Formal human-readable invoice reference. | Restricted Financial | System-Generated |
| `billing_period_start`| `DATE NOT NULL` | None | Start date of billing cycle | Service period begin date. | Restricted Financial | User-Provided |
| `billing_period_end` | `DATE NOT NULL` | None | End date of billing cycle | Service period end date. | Restricted Financial | User-Provided |
| `amount_due_minor_units`| `BIGINT NOT NULL` | None | Must be greater than `0` | Total sanitation charge in minor units. | Restricted Financial | User-Provided / System |
| `amount_paid_minor_units`| `BIGINT NOT NULL` | None | Default `0`, `0 <= paid <= due` | Cumulative settled payment amount. | Restricted Financial | System-Generated |
| `currency` | `VARCHAR(3) NOT NULL` | None | Default `'INR'`, ISO 4217 | Billing currency. | Restricted Financial | System-Generated |
| `status` | `VARCHAR(32) NOT NULL` | None | `'UNPAID'`, `'PARTIALLY_PAID'`, `'PAID'`, `'CANCELLED'` | Invoicing settlement state. | Restricted Financial | System-Generated |
| `due_date` | `DATE NOT NULL` | None | Payment deadline | Statutory due date before penalty. | Restricted Financial | User-Provided |
| `is_demo` | `BOOLEAN NOT NULL` | None | Default `FALSE` | Inherited demo isolation flag. | Internal Operational | System-Generated |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Invoice generation timestamp. | Internal Operational | System-Generated |

---

### 6.2 Entity: `payment_transactions`
*Operational Payment Attempt / Settlement Container.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Transaction identifier. | Restricted Financial | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `service_account_id` | `UUID NOT NULL` | `FK -> service_accounts(id)` | `ON DELETE RESTRICT` | Paying customer service account. | Restricted Financial | System-Generated |
| `bill_id` | `UUID NULL` | `FK -> bills(id)` | `ON DELETE RESTRICT` | Invoiced bill being settled (if any). | Restricted Financial | User-Provided |
| `payment_method` | `VARCHAR(32) NOT NULL` | None | `'ONLINE_GATEWAY'`, `'DOORSTEP_CASH'`, `'MUNICIPAL_COUNTER'` | Method used (Only Online in pilot). | Restricted Financial | User-Provided |
| `amount_minor_units` | `BIGINT NOT NULL` | None | Greater than `0` | Transaction value in integer minor units. | Restricted Financial | User-Provided |
| `currency` | `VARCHAR(3) NOT NULL` | None | Default `'INR'`, ISO 4217 | Payment currency. | Restricted Financial | System-Generated |
| `status` | `VARCHAR(32) NOT NULL` | None | `'ORDER_CREATED'`, `'CHECKOUT_INITIATED'`, `'PROVIDER_CONFIRMED'`, `'SETTLED'`, `'FAILED'`, `'REFUNDED'` | Operational gateway processing state. | Restricted Financial | System-Generated |
| `gateway_provider` | `VARCHAR(32) NULL` | None | e.g. `'RAZORPAY'`, `'SIMULATED_GATEWAY'` | Aggregator processing payment. | Restricted Financial | System-Generated |
| `gateway_order_id` | `VARCHAR(128) NULL` | None | Aggregator order identifier | External checkout session tracking. | Restricted Financial | Externally Sourced |
| `gateway_payment_id`| `VARCHAR(128) NULL` | None | Aggregator capture identifier | External payment authorization reference. | Restricted Financial | Externally Sourced |
| `receipt_number` | `VARCHAR(64) NOT NULL` | `UNIQUE` per tenant | e.g. `'REC-VHMC-2026-00918'` | Formal municipal payment receipt reference. | Restricted Financial | System-Generated |
| `is_demo` | `BOOLEAN NOT NULL` | None | Default `FALSE` | Inherited demo isolation flag. | Internal Operational | System-Generated |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Creation timestamp. | Internal Operational | System-Generated |

---

### 6.3 Entity: `payment_events`
*Append-Only Gateway Webhook Audit & Idempotency Store.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Event log unique key. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `payment_id` | `UUID NOT NULL` | `FK -> payment_transactions(id)` | `ON DELETE RESTRICT` | Target operational transaction. | Restricted Financial | System-Generated |
| `gateway_provider` | `VARCHAR(32) NOT NULL` | None | e.g. `'RAZORPAY'`, `'SIMULATED_GATEWAY'` | Gateway sending webhook event. | Internal Operational | Externally Sourced |
| `gateway_event_id` | `VARCHAR(128) NOT NULL`| None | Unique with `gateway_provider` | External event idempotency ID. | Internal Operational | Externally Sourced |
| `idempotency_key` | `VARCHAR(128) NULL` | None | Optional client idempotency key | Internal client deduplication key. | Internal Operational | User-Provided |
| `event_type` | `VARCHAR(64) NOT NULL` | None | `'ORDER_CREATED'`, `'PAYMENT_AUTHORIZED'`, `'PAYMENT_CAPTURED'`, `'PAYMENT_FAILED'`, `'REFUND_PROCESSED'`, `'DISPUTE_OPENED'` | Webhook business event type. | Restricted Financial | Externally Sourced |
| `processing_status` | `VARCHAR(32) NOT NULL` | None | `'PROCESSED'`, `'DUPLICATE_IGNORED'`, `'ANOMALY_PENDING_REVIEW'` | Ingestion and state machine result. | Internal Operational | System-Generated |
| `error_details` | `TEXT NULL` | None | Diagnostics if anomaly or failure | Forensic audit explanation. | Internal Operational | System-Generated |
| `event_payload` | `JSONB NOT NULL` | None | Raw webhook payload, default `'{}'` | Cryptographic / audit evidence storage. | Sensitive Compliance | Externally Sourced |
| `occurred_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Event arrival timestamp. | Internal Operational | System-Generated |

---

## 7. Double-Entry Accounting Subsystem

### 7.1 Entity: `accounts` (Chart of Accounts)
*Municipality-Owned Financial Accounts.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Unique account identifier. | Restricted Financial | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `account_code` | `VARCHAR(32) NOT NULL` | `UNIQUE` per tenant | e.g. `'1110-CASH-GATEWAY-CLEARING'` | Standardized general ledger account code. | Restricted Financial | User-Provided |
| `name` | `VARCHAR(128) NOT NULL` | None | e.g. `'Gateway In-Flight Clearing'` | Human-readable title of account. | Restricted Financial | User-Provided |
| `account_type` | `VARCHAR(32) NOT NULL` | None | `'ASSET'`, `'LIABILITY'`, `'EQUITY'`, `'REVENUE'`, `'EXPENSE'` | Major accounting category. | Restricted Financial | User-Provided |
| `currency` | `VARCHAR(3) NOT NULL` | None | Default `'INR'`, ISO 4217 | Denomination currency. | Restricted Financial | System-Generated |
| `is_active` | `BOOLEAN NOT NULL` | None | Default `TRUE` | Posting eligibility toggle. | Restricted Financial | User-Provided |
| `description` | `TEXT NULL` | None | Free text explanation | Accounting guidance notes. | Restricted Financial | User-Provided |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Creation timestamp. | Internal Operational | System-Generated |

---

### 7.2 Entity: `journal_entries` (General Ledger Header)
*Double-Entry Financial Header & Transaction Envelope.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Unique journal entry key. | Restricted Financial | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `entry_number` | `VARCHAR(64) NOT NULL` | `UNIQUE` per tenant | e.g. `'JE-VHMC-2026-00045'` | Human-readable audit journal reference. | Restricted Financial | System-Generated |
| `business_event_type`| `VARCHAR(64) NOT NULL` | None | `'BILL_ISSUANCE'`, `'PAYMENT_CAPTURED'`, `'GATEWAY_FEE_RECORDED'`, `'GATEWAY_SETTLEMENT'`, `'REFUND_ISSUED'`, `'COMPENSATING_REVERSAL'`, `'FEE_ADJUSTMENT'` | Categorizes business event triggering entry. | Restricted Financial | System-Generated |
| `business_event_id` | `VARCHAR(128) NOT NULL`| None | Unique with `(tenant_id, business_event_type)` | Idempotency foreign reference (Bill UUID, Payment UUID). | Restricted Financial | System-Generated |
| `effective_date` | `DATE NOT NULL` | None | Accounting recognition date | Financial posting accounting date. | Restricted Financial | System-Generated |
| `status` | `VARCHAR(16) NOT NULL` | None | `'DRAFT'`, `'POSTED'` | Entry lifecycle state. Immutable once `POSTED`; never updated to reversed state. | Restricted Financial | System-Generated |
| `reversal_of_entry_id`| `UUID NULL` | `FK -> journal_entries(id)` | `ON DELETE RESTRICT` | Populated on compensating reversal entries to link to unchanged original entry. | Restricted Financial | System-Generated |
| `description` | `TEXT NOT NULL` | None | Non-empty text | Audit summary of financial event. | Restricted Financial | System-Generated |
| `currency` | `VARCHAR(3) NOT NULL` | None | Default `'INR'`, ISO 4217 | Homogeneous currency across all lines. | Restricted Financial | System-Generated |
| `created_by_user_id` | `UUID NULL` | `FK -> users(id)` | `ON DELETE RESTRICT` | Staff or system user authoring entry. | Restricted Financial | System-Generated |
| `is_demo` | `BOOLEAN NOT NULL` | None | Default `FALSE` | Inherited demo isolation flag. | Internal Operational | System-Generated |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Creation audit timestamp. | Internal Operational | System-Generated |
| `posted_at` | `TIMESTAMPTZ NULL` | None | Lock timestamp | Timestamp entry transitioned to `POSTED`. | Restricted Financial | System-Generated |

---

### 7.3 Entity: `journal_entry_lines` (General Ledger Line Items)
*Balanced Debits & Credits in Integer Minor Units.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Unique line item key. | Restricted Financial | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `journal_entry_id` | `UUID NOT NULL` | `FK -> journal_entries(id)` | `ON DELETE CASCADE` | Parent journal entry envelope. | Restricted Financial | System-Generated |
| `account_id` | `UUID NOT NULL` | `FK -> accounts(id)` | `ON DELETE RESTRICT` | Referenced general ledger account. | Restricted Financial | System-Generated |
| `line_number` | `INT NOT NULL` | None | `1`-indexed, Unique per entry | Sequence index of line in journal entry. | Restricted Financial | System-Generated |
| `entry_type` | `VARCHAR(6) NOT NULL` | None | `'DEBIT'`, `'CREDIT'` | Side of double-entry equation. | Restricted Financial | System-Generated |
| `amount_minor_units`| `BIGINT NOT NULL` | None | Must be strictly greater than `0` | Monetary magnitude in integer minor units (paise). | Restricted Financial | System-Generated |
| `currency` | `VARCHAR(3) NOT NULL` | None | Default `'INR'`, ISO 4217 | Must match parent journal entry currency. | Restricted Financial | System-Generated |
| `memo` | `TEXT NULL` | None | Free text line note | Specific item or citizen invoice memo. | Restricted Financial | System-Generated |

---

### 7.4 Entity: `shift_reconciliations`
*Audited Shift Cash Reconciliation (Preserved Extensible; 0 in Pilot).*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Reconciliation record key. | Restricted Financial | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `shift_id` | `UUID NOT NULL` | `FK -> driver_shifts(id)` | `ON DELETE RESTRICT`, Unique | Reconciled operational shift. | Restricted Financial | System-Generated |
| `driver_membership_id`| `UUID NOT NULL`| `FK -> municipality_memberships(id)`| `ON DELETE RESTRICT` | Shift driver/collector. | Internal Operational | System-Generated |
| `reconciled_by_membership_id`| `UUID NOT NULL`| `FK -> municipality_memberships(id)`| `ON DELETE RESTRICT`| Supervisor verifying handover. | Internal Operational | User-Provided |
| `system_recorded_cash_minor_units`| `BIGINT NOT NULL`| None | Default `0`, `CHECK (= 0)` in pilot | System expectation (0 in pilot). | Restricted Financial | System-Generated |
| `physical_cash_deposited_minor_units`| `BIGINT NOT NULL`| None | Default `0`, `CHECK (= 0)` in pilot | Cash deposited (0 in pilot). | Restricted Financial | User-Provided |
| `variance_minor_units` | `BIGINT NOT NULL` | None | Computed: `deposited - recorded` | Financial cash handover variance. | Restricted Financial | System-Generated |
| `status` | `VARCHAR(32) NOT NULL` | None | `'BALANCED'`, `'DISCREPANCY_FLAGGED'` | Handover audit determination. | Restricted Financial | System-Generated |
| `supervisor_notes` | `TEXT NULL` | None | Free text explanation | Audit handover remarks. | Internal Operational | User-Provided |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Reconciliation execution timestamp. | Internal Operational | System-Generated |

---

## 8. Governance, Auditing & Communications Subsystem

### 8.1 Entity: `audit_logs`
*Tenant-Scoped Compliance & Security Event Log.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL NOT NULL` | `PRIMARY KEY` | Auto-incrementing identifier | Audit log sequence index. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `user_id` | `UUID NULL` | `FK -> users(id)` | `ON DELETE SET NULL` | Performing user profile (if authenticated). | Confidential PII | System-Generated |
| `action` | `VARCHAR(64) NOT NULL` | None | e.g. `'JOURNAL_ENTRY_POSTED'`, `'VEHICLE_DISPATCHED'` | Audited security or operational action. | Internal Operational | System-Generated |
| `entity_type` | `VARCHAR(64) NOT NULL` | None | e.g. `'journal_entries'`, `'complaints'` | Target database table or entity. | Internal Operational | System-Generated |
| `entity_id` | `VARCHAR(128) NOT NULL`| None | Target record primary key string | Target database record identifier. | Internal Operational | System-Generated |
| `ip_address` | `INET NULL` | None | Valid IPv4 / IPv6 network address | Source network IP address. | Confidential PII | System-Generated |
| `user_agent` | `VARCHAR(255) NULL` | None | Client browser/device agent | Calling software identifier. | Internal Operational | System-Generated |
| `changes` | `JSONB NOT NULL` | None | Before/after state snapshot, default `'{}'` | Forensic field-level mutation audit. | Internal Operational | System-Generated |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Immutable audit timestamp. | Internal Operational | System-Generated |

---

### 8.2 Entity: `notifications`
*Citizen In-App & SMS Alerts.*

| Field Name | Type & Nullability | Key / Reference | Constraints / Permitted Values | Business Purpose | Sensitivity | Origin / Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID NOT NULL` | `PRIMARY KEY` | Default `gen_random_uuid()` | Notification record identifier. | Internal Operational | System-Generated |
| `tenant_id` | `UUID NOT NULL` | `FK -> municipalities(id)` | `ON DELETE CASCADE` | Owning municipal tenant. | Internal Operational | System-Generated |
| `user_id` | `UUID NOT NULL` | `FK -> users(id)` | `ON DELETE CASCADE` | Recipient user profile. | Confidential PII | System-Generated |
| `channel` | `VARCHAR(16) NOT NULL` | None | `'IN_APP'`, `'SMS'`, `'EMAIL'` | Delivery transport mechanism. | Internal Operational | System-Generated |
| `title` | `VARCHAR(128) NOT NULL`| None | Notification headline | Short summary alert. | Public | System-Generated |
| `body` | `TEXT NOT NULL` | None | Detailed notification content | Message body delivered to citizen. | Confidential PII | System-Generated |
| `status` | `VARCHAR(16) NOT NULL` | None | `'QUEUED'`, `'SENT'`, `'FAILED'`, `'READ'` | Delivery and read tracking state. | Internal Operational | System-Generated |
| `sent_at` | `TIMESTAMPTZ NULL` | None | Dispatch timestamp | Time notification was transmitted. | Internal Operational | System-Generated |
| `created_at` | `TIMESTAMPTZ NOT NULL` | None | Default `clock_timestamp()` | Creation timestamp. | Internal Operational | System-Generated |
