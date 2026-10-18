# Smart Municipal Waste Management Platform
## Phase 2: API Contracts Specification (Proposed MVP)

**Document Version:** 1.2.0 (Audited & Formally Hardened)  
**Phase:** 2 (System Architecture, Data Design, API Contracts & UI/UX)  
**Status:** Proposed Contract Specification (Not Yet Implemented)  
**Source of Truth:** [docs/phase-1-requirements-and-scope.md](file:///d:/project/docs/phase-1-requirements-and-scope.md)  
**Author:** Senior Software Architect  

---

## 1. Global API Conventions & Security Standards

### 1.1 Base URL & Versioning
All endpoints adhere to URI path versioning: `/api/v1/`.

### 1.2 Authentication & Authorization Security Invariants
1. **Never Trust Client-Supplied Authorization Parameters:**
   - The server **never** trusts client-provided `tenant_id`, user roles, municipality slugs, invoice amounts, or payment status flags as proof of authorization or truth.
   - For all authenticated routes, the active `tenant_id` and authorized `role` are derived strictly from cryptographically signed session tokens or `HttpOnly` session cookies backed by verified database membership.
2. **Object-Level Authorization Enforcement:**
   - Querying a service account, bill, or complaint requires verifying that the record belongs to the authenticated user's linked accounts (`service_account_users.user_id = authenticated_user.id`) or that the user possesses administrative permissions for that tenant.
3. **Public Catalog Boundary:**
   - Slugs in public endpoints (e.g., `/api/v1/public/municipalities/:slug/schedules`) serve solely to filter public, non-sensitive catalog records. They grant zero administrative permissions, zero access to citizen PII, and zero write access.
4. **Error Responses (RFC 7807 Problem Details):**
   - All error responses return standard `application/problem+json` bodies without leaking stack traces or internal schema details:
     ```json
     {
       "type": "https://errors.smartwaste.local/errors/forbidden",
       "title": "Forbidden Resource",
       "status": 403,
       "detail": "You do not have access to this service account.",
       "code": "AUTH_FORBIDDEN_OBJECT_ACCESS",
       "correlation_id": "req-98f2b740-42ab-4e31-89d1-729910a56112",
       "timestamp": "2026-10-18T11:22:00Z"
     }
     ```

---

## 2. Public & Discovery Endpoints (Unauthenticated)

### 2.1 `GET /api/v1/public/municipalities`
- **Purpose:** Lists all active municipalities available on the platform for citizen onboarding and selection.
- **Auth:** None (Public).
- **Rate Limit:** 60 requests/min per IP.
- **Environment Behavior:** Production returns registered live municipalities; Demo mode includes synthetic tenants (e.g., *Verdant Hills Municipal Corporation*).
- **Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "c1f7b022-7f28-4e92-b430-891dc457d101",
        "name": "Verdant Hills Municipal Corporation",
        "slug": "verdant-hills",
        "state_region": "Maharashtra",
        "is_demo": true
      }
    ]
  }
  ```

### 2.2 `GET /api/v1/public/municipalities/:slug/localities`
- **Purpose:** Public locality and ward search with autocomplete for citizens looking up their neighborhood.
- **Auth:** None (Public).
- **Query Parameters:** `q` (string, optional, search term), `ward_id` (UUID, optional).
- **Validation:** `slug` must match `^[a-z0-9-]+$`.
- **Response (200 OK):**
  ```json
  {
    "municipality": {
      "name": "Verdant Hills Municipal Corporation",
      "slug": "verdant-hills"
    },
    "localities": [
      {
        "id": "e8a1d200-5c3b-410a-8a10-234b678c9011",
        "ward_number": "Ward-04",
        "ward_name": "North Greens",
        "code": "VH-W04-L01",
        "name": "Cedar Heights Sector 1",
        "center_latitude": 18.9220100,
        "center_longitude": 72.8340200
      }
    ]
  }
  ```

### 2.3 `GET /api/v1/public/municipalities/:slug/schedules`
- **Purpose:** Public collection timetables, pickup windows, and waste segregation guidelines for a locality.
- **Auth:** None (Public).
- **Query Parameters:** `locality_id` (UUID, required).
- **Response (200 OK):**
  ```json
  {
    "locality_id": "e8a1d200-5c3b-410a-8a10-234b678c9011",
    "locality_name": "Cedar Heights Sector 1",
    "schedules": [
      {
        "day_of_week": 1,
        "day_name": "Monday",
        "waste_stream": "WET_BIODEGRADABLE",
        "window_start": "07:00:00",
        "window_end": "09:30:00",
        "instructions": "Place segregated green bins outside before 07:00 AM."
      },
      {
        "day_of_week": 2,
        "day_name": "Tuesday",
        "waste_stream": "DRY_RECYCLABLE",
        "window_start": "07:00:00",
        "window_end": "09:30:00",
        "instructions": "Clean dry plastic, paper, and metal in blue bins."
      }
    ]
  }
  ```

### 2.4 `GET /api/v1/public/municipalities/:slug/tracking/:localityId`
- **Purpose:** Returns the live tracking status of the vehicle currently dispatched to the citizen's locality.
- **Auth:** None (Public).
- **Privacy & Safety Control:** Coordinates are exposed **only** if the assigned vehicle is currently on an active public route shift. Off-shift coordinates and driver private information are strictly excluded.
- **Response (200 OK):**
  ```json
  {
    "locality_id": "e8a1d200-5c3b-410a-8a10-234b678c9011",
    "vehicle": {
      "assigned": true,
      "vehicle_label": "Truck #04 (Wet Waste Compactor)",
      "route_code": "ROUTE-W04-MORNING-A",
      "status": "CURRENT",
      "status_label": "Live — Moving on Route",
      "latitude": 18.9224500,
      "longitude": 72.8341200,
      "speed_kmh": 14.5,
      "heading_degrees": 85.0,
      "last_updated_at": "2026-10-18T11:23:45Z",
      "elapsed_seconds": 15,
      "is_simulated": true,
      "simulation_notice": "DEMONSTRATION MODE — SYNTHETIC TELEMETRY"
    }
  }
  ```
- **Response (Stale Example):**
  ```json
  {
    "locality_id": "e8a1d200-5c3b-410a-8a10-234b678c9011",
    "vehicle": {
      "assigned": true,
      "vehicle_label": "Truck #04 (Wet Waste Compactor)",
      "status": "STALE",
      "status_label": "Signal Delayed",
      "latitude": 18.9211000,
      "longitude": 72.8335000,
      "last_updated_at": "2026-10-18T11:20:10Z",
      "elapsed_seconds": 230,
      "notice": "Vehicle telemetry delayed (last seen 3 minutes ago). Displaying last known location."
    }
  }
  ```

### 2.5 `GET /api/v1/public/complaints/:ticketNumber`
- **Purpose:** Public complaint status lookup by tracking ticket number.
- **Auth:** None (Public).
- **Response (200 OK):**
  ```json
  {
    "ticket_number": "VHMC-2026-CMP-00412",
    "category": "MISSED_LOCALITY",
    "status": "RESOLVED",
    "locality_name": "Cedar Heights Sector 1",
    "created_at": "2026-10-18T08:15:00Z",
    "resolved_at": "2026-10-18T10:45:00Z",
    "resolution_notes": "Alternate tipper truck dispatched; waste cleared at 10:30 AM."
  }
  ```

---

## 3. Authentication & Tenant Session Endpoints

### 3.1 `POST /api/v1/auth/login`
- **Purpose:** Authenticate user with mobile/email and password; issues an `HttpOnly`, `SameSite=Strict`, `Secure` session cookie.
- **Auth:** None.
- **Rate Limit:** 10 attempts/min per IP.
- **Request Body:**
  ```json
  {
    "identifier": "+919876500001",
    "password": "CorrectHorseBatteryStaple!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": "b1a2c3d4-0000-1111-2222-333344445555",
      "full_name": "Rajesh Kumar",
      "phone": "+919876500001"
    },
    "memberships": [
      {
        "tenant_id": "c1f7b022-7f28-4e92-b430-891dc457d101",
        "municipality_name": "Verdant Hills Municipal Corporation",
        "municipality_slug": "verdant-hills",
        "role": "COLLECTOR"
      }
    ],
    "active_tenant_id": "c1f7b022-7f28-4e92-b430-891dc457d101"
  }
  ```

### 3.2 `POST /api/v1/auth/logout`
- **Purpose:** Clears session cookie and invalidates session token in cache/database.
- **Auth:** Authenticated.
- **Response (200 OK):** `{"message": "Logged out successfully"}`

---

## 4. Citizen Service Accounts, Billing & Payments (Authenticated)

### 4.1 `GET /api/v1/citizen/service-accounts`
- **Purpose:** Lists all verified service accounts linked to the authenticated citizen.
- **Auth:** Authenticated (Role: `CITIZEN`).
- **Response (200 OK):**
  ```json
  {
    "accounts": [
      {
        "service_account_id": "a001-account-uuid",
        "account_number": "VH-CON-00104",
        "address": "Flat 402, Sea Breeze Apts, Cedar Heights Sector 1",
        "property_type": "RESIDENTIAL",
        "current_balance_cents": 30000,
        "currency": "INR",
        "formatted_balance": "₹300.00"
      }
    ]
  }
  ```

### 4.2 `POST /api/v1/citizen/service-accounts/link`
- **Purpose:** Links a municipal property PIN to the citizen's profile.
- **Auth:** Authenticated (Role: `CITIZEN`).
- **Request Body:**
  ```json
  {
    "property_identifier": "PROP-VH-W04-0982",
    "relationship_type": "OWNER"
  }
  ```
- **Response (200 OK / 201 Created):**
  ```json
  {
    "message": "Service account linked successfully after verification.",
    "account_number": "VH-CON-00104"
  }
  ```

### 4.3 `POST /api/v1/citizen/payments/online/initiate`
- **Purpose:** Initiates an online payment order for an outstanding sanitation bill.
- **Auth:** Authenticated (Role: `CITIZEN`).
- **Security Check:** Server looks up bill amount directly from database; client cannot tamper with payment amount.
- **Request Body:**
  ```json
  {
    "bill_id": "b101-bill-uuid",
    "idempotency_key": "idem-773a90-881c-4b10-82a0"
  }
  ```
- **Response (200 OK in Demo Mode):**
  ```json
  {
    "payment_id": "pay-uuid-001",
    "order_id": "DEMO_ORD_9812401",
    "amount_cents": 30000,
    "currency": "INR",
    "status": "ORDER_CREATED",
    "gateway_provider": "SIMULATED_GATEWAY",
    "is_demo": true,
    "simulator_url": "/sandbox/checkout/pay-uuid-001"
  }
  ```

### 4.4 `GET /api/v1/citizen/payments/:paymentId/status`
- **Purpose:** Verifies payment transaction status after returning from gateway redirect or for frontend polling.
- **Auth:** Authenticated (Role: `CITIZEN`, owner of record).
- **Payment Lifecycle States:**
  - `ORDER_CREATED`: Municipal server initiated order; waiting for citizen checkout.
  - `CHECKOUT_INITIATED`: Gateway opened payment session.
  - `PROVIDER_CONFIRMED`: Gateway verified funds capture via cryptographic webhook or status check.
  - `SETTLED_TO_MUNICIPALITY`: Funds transferred to municipal treasury bank account (via batch settlement).
  - Terminal failure states: `FAILED`, `CANCELLED`, `REFUNDED`, `DISPUTED`.
- **Response (200 OK):**
  ```json
  {
    "payment_id": "pay-uuid-001",
    "status": "PROVIDER_CONFIRMED",
    "status_description": "Payment captured and verified by gateway.",
    "amount_cents": 30000,
    "formatted_amount": "₹300.00",
    "gateway_payment_id": "pay_test_8812901",
    "receipt_id": "rec-uuid-00918",
    "confirmed_at": "2026-10-18T11:25:00Z"
  }
  ```

### 4.5 `GET /api/v1/citizen/receipts/:id`
- **Purpose:** Generates structured receipt data for viewing or PDF export.
- **Auth:** Authenticated (Role: `CITIZEN`, owner of record).
- **Response (200 OK):**
  ```json
  {
    "receipt_number": "DEMO-REC-VHMC-2026-00918",
    "is_demo": true,
    "watermark_text": "DEMO RECEIPT - VOID - NOT A VALID TAX INVOICE - NO REAL MONEY MOVED",
    "municipality_name": "Verdant Hills Municipal Corporation",
    "service_account_number": "VH-CON-00104",
    "citizen_name": "Srujan Doe",
    "payment_date": "2026-10-18T11:25:00Z",
    "payment_method": "ONLINE_GATEWAY",
    "amount_paid": "₹300.00",
    "transaction_reference": "TXN-SIM-8840192",
    "status": "PROVIDER_CONFIRMED"
  }
  ```

### 4.6 `POST /api/v1/citizen/complaints`
- **Purpose:** Lodges a missed-collection complaint.
- **Auth:** Authenticated (Role: `CITIZEN`).
- **Request Body:**
  ```json
  {
    "locality_id": "e8a1d200-5c3b-410a-8a10-234b678c9011",
    "service_account_id": "a001-account-uuid",
    "category": "MISSED_HOUSEHOLD",
    "description": "Garbage van passed by at 07:15 AM without stopping at building gate."
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "ticket_number": "VHMC-2026-CMP-00413",
    "status": "OPEN",
    "created_at": "2026-10-18T11:26:00Z",
    "tracking_url": "/complaints/VHMC-2026-CMP-00413"
  }
  ```

---

## 5. Field Collector & Driver Endpoints (Authenticated)

### 5.1 `GET /api/v1/collector/shifts/active`
- **Purpose:** Returns the logged-in collector's assigned shift, vehicle, and stop itinerary.
- **Auth:** Authenticated (Role: `COLLECTOR`).
- **Response (200 OK):**
  ```json
  {
    "shift_id": "shift-uuid-991",
    "status": "ACTIVE",
    "vehicle_label": "Truck #04",
    "registration_number": "MH-04-AB-1234",
    "route_name": "North Greens Ward 04 Morning",
    "total_stops": 12,
    "completed_stops": 5,
    "cash_collected_cents": 50000,
    "formatted_cash": "₹500.00"
  }
  ```

### 5.2 `POST /api/v1/collector/stops/status`
- **Purpose:** Logs stop completion or skipping from field driver device.
- **Auth:** Authenticated (Role: `COLLECTOR`).
- **Request Body:**
  ```json
  {
    "shift_id": "shift-uuid-991",
    "route_stop_id": "stop-uuid-03",
    "status": "VISITED_COLLECTED",
    "driver_latitude": 18.9221000,
    "driver_longitude": 72.8340500,
    "reason_notes": null
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "event_id": "evt-uuid-1204",
    "status": "VISITED_COLLECTED",
    "recorded_at": "2026-10-18T11:27:10Z"
  }
  ```

### 5.3 `POST /api/v1/collector/payments/cash`
- **Purpose:** Records physical cash collected at doorstep.
- **Auth:** Authenticated (Role: `COLLECTOR`).
- **Request Body:**
  ```json
  {
    "shift_id": "shift-uuid-991",
    "service_account_number": "VH-CON-00104",
    "amount_cents": 10000,
    "idempotency_key": "cash-coll-00918-vhmc"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "receipt_number": "REC-VHMC-2026-00920",
    "amount_recorded": "₹100.00",
    "status": "COLLECTED_AT_DOORSTEP",
    "collector_cash_in_hand_cents": 60000,
    "formatted_cash_in_hand": "₹600.00",
    "citizen_sms_queued": true
  }
  ```

---

## 6. Municipal Administration & Reconciliation Endpoints (Authenticated)

### 6.1 `GET /api/v1/admin/dashboard/summary`
- **Purpose:** Real-time operational summary widgets for municipal supervisors.
- **Auth:** Authenticated (Role: `MUNICIPAL_ADMIN`, scoped to tenant).
- **Response (200 OK):**
  ```json
  {
    "date": "2026-10-18",
    "active_vehicles": 5,
    "total_vehicles": 6,
    "route_completion_percentage": 78.5,
    "complaints": {
      "open": 3,
      "in_investigation": 2,
      "resolved_today": 8
    },
    "financials": {
      "online_verified_today_cents": 120000,
      "cash_collected_today_cents": 140000,
      "cash_reconciled_today_cents": 100000,
      "pending_cash_reconciliation_cents": 40000
    }
  }
  ```

### 6.2 `GET /api/v1/admin/reconciliations/pending`
- **Purpose:** Lists completed driver shifts awaiting physical cash deposit verification.
- **Auth:** Authenticated (Role: `MUNICIPAL_ADMIN`).
- **Response (200 OK):**
  ```json
  {
    "pending_shifts": [
      {
        "shift_id": "shift-uuid-991",
        "driver_name": "Rajesh Kumar",
        "driver_badge": "DRV-04",
        "vehicle_reg": "MH-04-AB-1234",
        "shift_ended_at": "2026-10-18T10:30:00Z",
        "system_recorded_cash_cents": 140000,
        "formatted_recorded_cash": "₹1,400.00",
        "status": "AWAITING_SUPERVISOR_DEPOSIT"
      }
    ]
  }
  ```

### 6.3 `POST /api/v1/admin/reconciliations/approve`
- **Purpose:** Supervisor records physical cash deposited, checks variance, and locks shift accounting.
- **Auth:** Authenticated (Role: `MUNICIPAL_ADMIN`).
- **Request Body:**
  ```json
  {
    "shift_id": "shift-uuid-991",
    "physical_cash_deposited_cents": 140000,
    "supervisor_notes": "Cash counted and verified in treasury safe."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "reconciliation_id": "recon-uuid-881",
    "status": "RECONCILIATION_COMPLETED",
    "system_recorded_cents": 140000,
    "physical_deposited_cents": 140000,
    "variance_cents": 0,
    "reconciled_at": "2026-10-18T11:28:00Z"
  }
  ```

### 6.4 `POST /api/v1/admin/reconciliations/gateway-batch`
- **Purpose:** Ingests daily payment gateway settlement MIS batch file to reconcile gateway bank transfers against confirmed online transactions.
- **Auth:** Authenticated (Role: `MUNICIPAL_ADMIN`).
- **Idempotency:** Settlement batch ID checked against historical settlement records. Duplicate batch uploads return HTTP 409 Conflict.
- **Request Body:**
  ```json
  {
    "settlement_batch_id": "SETTLE-RZP-20261018-001",
    "gateway_provider": "SIMULATED_GATEWAY",
    "settlement_date": "2026-10-18",
    "gross_amount_cents": 120000,
    "gateway_fee_cents": 2400,
    "net_settled_cents": 117600,
    "utr_number": "UTR99882211004",
    "transaction_ids": ["pay-uuid-001", "pay-uuid-002", "pay-uuid-003"]
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "BATCH_RECONCILED",
    "settlement_batch_id": "SETTLE-RZP-20261018-001",
    "matched_count": 3,
    "unmatched_count": 0,
    "discrepancies": [],
    "reconciled_at": "2026-10-18T11:30:00Z"
  }
  ```

---

## 7. Ingestion & Webhook Endpoints

### 7.1 `POST /api/v1/ingest/telemetry`
- **Purpose:** Ingests high-frequency GPS telemetry packets from mobile tracking devices or vehicle hardware.
- **Device Authentication & Binding (Anti-Spoofing):**
  - Authenticated via pre-shared Device API Key submitted in the `X-Device-Token` header.
  - The server verifies the token against `device_credentials`, resolving the bound `vehicle_id` and `tenant_id`.
  - **Cross-Vehicle Spoofing Prevention:** The server enforces that the request body `vehicle_id` strictly matches the token's bound `vehicle_id`. If there is any mismatch, the request is rejected immediately with HTTP 403 Forbidden (`AUTH_DEVICE_VEHICLE_MISMATCH`) and an alert is recorded in `audit_logs`. A device can never submit readings for any vehicle other than its authorized assigned vehicle.
- **Ingress Validation Rules:**
  - *Payload Size Limit:* Request body is strictly capped at $2\text{ KB}$. Oversized payloads return HTTP 413 Payload Too Large.
  - *Strict Data Types:* Latitude and longitude must be decimal numbers; `recorded_at` must be a valid ISO-8601 UTC timestamp; `speed_kmh` and `heading_degrees` must be non-negative numbers.
  - *Range Limits:* Latitude $[-90.0000000, 90.0000000]$, Longitude $[-180.0000000, 180.0000000]$.
  - *Context-Dependent `(0.0, 0.0)` Filtering:* Readings at `(0.0, 0.0)` ("Null Island") are rejected **contextually because they fall outside the registered municipal bounding polygon**, not because `(0.0, 0.0)` is an invalid coordinate on Earth. Hardware GPS receivers commonly default to `(0.0, 0.0)` prior to satellite lock.
- **Replay, Duplicate, and Out-of-Order Safeguards:**
  - *Timestamp Drift:* Device timestamp cannot exceed server UTC clock by $> 30\text{ seconds}$.
  - *Sequence Enforcement:* Readings with `recorded_at <= last_recorded_at` for that vehicle are silently dropped to eliminate network replay and out-of-order delivery.
  - *Implausible Speed Spike Filtering:* Successive readings implying speeds $> 100\text{ km/h}$ for municipal sanitation trucks are flagged as sensor spikes and excluded from live map interpolation.
- **Credential Storage, Rotation & Revocation:**
  - *Storage:* Device tokens are stored as salted hashes (Argon2id or SHA-256) in `device_credentials`. Plaintext tokens are displayed only once upon generation.
  - *Rotation:* Supports dual active credentials (`token_hash` and `secondary_token_hash` with a transition window) for zero-downtime field device re-keying.
  - *Revocation:* Decommissioned or compromised devices can be instantly disabled by setting `status = 'REVOKED'`.
  - *Audit Logging:* Failed authentication attempts, vehicle mismatch attempts, and credential lifecycle actions are recorded in `audit_logs`.
- **State Processing & Persistence Authority:**
  - PostgreSQL's `latest_vehicle_positions` table is the **authoritative persistent store** for latest vehicle state.
  - Updates write atomically to `latest_vehicle_positions` and synchronously refresh the optional application in-process memory map (`latestPositions.set(vehicleId, snapshot)`).
  - On application restart, the in-process cache is warmed directly from `latest_vehicle_positions`. Freshness states (`CURRENT`, `STALE`, `UNAVAILABLE`) are evaluated dynamically based on elapsed time since `last_recorded_at`.
- **Hardware & Protocol Agnosticism:**
  - This contract defines standard HTTP REST ingestion. Hardware vendor selection and physical transmission protocol (HTTP REST vs. MQTT vs. TCP broker) remain an open decision pending hardware procurement; no proprietary vendor or existing hardware integration is assumed.
- **Request Body:**
  ```json
  {
    "vehicle_id": "veh-uuid-04",
    "latitude": 18.9224500,
    "longitude": 72.8341200,
    "speed_kmh": 14.5,
    "heading_degrees": 85.0,
    "recorded_at": "2026-10-18T11:29:00Z"
  }
  ```
- **Response (202 Accepted):** `{"status": "ACCEPTED"}`

### 7.2 `POST /api/v1/webhooks/payments/:gateway`
- **Purpose:** Asynchronous payment gateway callback handler for payment confirmation, capture, refunds, and chargebacks.
- **Auth:** Cryptographic signature verification via webhook headers (`X-Signature` / HMAC SHA-256) using tenant-specific gateway webhook secrets.
- **Authoritative State Transitions & Non-Linear Event Matrix:**
  - *Payment Events Handled:*
    - `payment.authorized` -> Transitions to `CHECKOUT_INITIATED`
    - `payment.captured` -> Transitions to `PROVIDER_CONFIRMED` (authoritative gateway confirmation; triggers receipt generation and ledger credit)
    - `payment.failed` -> Transitions to `FAILED`
    - `refund.processed` -> Transitions to `REFUNDED` (triggers compensating ledger debit `REVERSAL_COMPENSATION`)
    - `dispute.opened` -> Transitions to `DISPUTED`
- **Idempotency & Provider-Scoped Event Deduplication:**
  - The webhook delivery ID (`gateway_event_id`) is checked against `payment_events` under a unique constraint: `UNIQUE (gateway_provider, gateway_event_id)`.
  - *Duplicate Delivery of Same Event:* If `(gateway_provider, gateway_event_id)` has already been recorded, returns HTTP 200 `{"received": true, "status": "ALREADY_PROCESSED"}` without modifying balances or creating duplicate ledger entries.
  - *Legitimate Repeated Events of Same Type:* Distinct events carrying the same `event_type` (e.g., multiple partial refunds, each with its own `gateway_event_id`) are accepted, correctly logged, and processed.
- **Out-of-Order Events & Financial Evidence Retention:**
  - If an incoming provider event violates valid state transitions (e.g., `payment.captured` arriving after a transaction was already marked terminal `CANCELLED`, `REFUNDED`, or `FAILED`; or a refund event received for an unconfirmed order; or an amount mismatch between webhook payload and recorded bill):
    - **Financial evidence is NEVER silently discarded.**
    - The raw event payload and headers are inserted into `payment_events` with `processing_status = 'ANOMALY_PENDING_REVIEW'` and diagnostic `error_details`.
    - The parent `payment_transactions` record is NOT mutated, and no balance changes are applied to `financial_ledger_entries`.
    - A high-priority anomaly alert is dispatched to municipal finance supervisors for manual investigation.
- **Append-Only Ledger Policy:**
  - All balance adjustments resulting from confirmed events or investigated disputes append new entries to `financial_ledger_entries` (`PAYMENT_CREDIT`, `REVERSAL_COMPENSATION`, or `FEE_ADJUSTMENT`), preserving the unbroken audit trail.
- **Request Headers:**
  - `X-Gateway-Event-Id`: `evt_gateway_981240`
  - `X-Signature`: `sha256=d5b3c4...`
- **Response (200 OK):** `{"received": true}`

---

## 8. Platform Governance Endpoints (Super Admin)

### 8.1 `POST /api/v1/platform/municipalities`
- **Purpose:** Onboard a new municipality tenant.
- **Auth:** Authenticated (Role: `PLATFORM_ADMIN`).
- **Request Body:**
  ```json
  {
    "name": "Oceanfront Nagar Panchayat",
    "slug": "oceanfront",
    "state_region": "Goa",
    "contact_email": "admin@oceanfront.gov.in",
    "settings": {
      "fresh_seconds": 60,
      "stale_seconds": 300,
      "allow_doorstep_cash": true
    }
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "tenant_id": "tenant-uuid-oceanfront",
    "slug": "oceanfront",
    "status": "PROVISIONED"
  }
  ```

---
*End of Phase 2 API Contracts Specification.*
