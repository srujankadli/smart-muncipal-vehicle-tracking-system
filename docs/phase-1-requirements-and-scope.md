# Smart Municipal Waste Management Platform
## Phase 1: Requirements Definition & Project Scope Document

**Document Version:** 1.2.0 (Phase 1 Final Refinements — RLS Governance & Payment Workflows)  
**Status:** Approved for Phase 1 / Direct Source of Truth for Phase 2 Architectural & UX Design  
**Target Environment:** Multi-Tenant Web Platform  
**Author:** Senior Software Architect  
**Revision History:**
- v1.0.0: Initial architectural scope and requirements definition.
- v1.1.0: Added connection-pool safe RLS, 4-stage financial lifecycle, configurable GPS thresholds, and synthetic demo safeguards.
- v1.2.0: Explicitly added RLS bypass prevention (role separation, NOBYPASSRLS, table ownership, rollback safety), method-specific payment workflows (distinguishing provider confirmation vs settlement), and qualified zero-code onboarding to already-supported capabilities.  

---

## 1. Project Overview & Objectives

### 1.1 Executive Summary
The **Smart Municipal Waste Management Platform** is a multi-tenant, secure, minimalistic, and scalable web platform designed to digitize and streamline municipal solid waste collection operations. The platform bridges the information gap between urban citizens and municipal sanitation departments by providing transparent collection schedules, live vehicle tracking with telemetry freshness indicators, digital complaint redressal, and auditable billing and reconciliation workflows.

The system is architected from inception as a **single multi-tenant software-as-a-service (SaaS) web application** capable of serving multiple independent municipalities (e.g., city corporations, municipalities, and nagar panchayats) concurrently from a unified codebase, ensuring strict logical data isolation, tenant-specific configurations, and operational autonomy.

> [!IMPORTANT]
> All security, data isolation, and performance properties documented herein represent **formal engineering design requirements and acceptance criteria** to be implemented and empirically verified through automated test suites in subsequent phases. No security property is assumed to be verified until the corresponding automated tests have been executed and passed.

### 1.2 Core Objectives
- **Citizen Empowerment & Transparency:** Enable citizens to easily identify their municipality, ward, and locality; view waste collection timetables and waste-stream rules; track assigned collection vehicles on an interactive map; inspect telemetry freshness; submit missed-collection complaints; and view billing history.
- **Municipal Operational Efficiency:** Provide municipal sanitation supervisors and administrators with operational tools to manage wards, localities, routes, collection vehicles, drivers/collectors, complaint workflows, and fee reconciliation (both digital and doorstep cash).
- **Multi-Tenancy Without Code Duplication:** Support multiple municipalities within a unified infrastructure without deploying or maintaining separate application builds per municipality.
- **Resilient & Low-Friction Usability:** Maintain a lightweight, mobile-first, responsive interface accessible across varying citizen device capabilities and mobile network conditions (including 3G/4G).
- **Clean Architecture with Integration Readiness:** Deliver immediate operational value using structured synthetic demo data and sandbox simulators while decoupling external dependencies (GPS hardware, payment gateways, municipal identity registries) via a provider-agnostic adapter layer.

---

## 2. In-Scope & Out-of-Scope Features

To prevent scope creep and maintain architectural focus, strict boundaries are established for the platform.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PROJECT BOUNDARIES                            │
├───────────────────────────────────┬────────────────────────────────────┤
│         IN-SCOPE (CORE)           │       OUT-OF-SCOPE (EXCLUDED)      │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Multi-municipality hierarchy    │ • AI chatbots / LLM assistants     │
│ • Household / Service accounts    │ • Gamification, points, badges     │
│ • Routes & collection schedules   │ • Citizen social networking/forums │
│ • Fleet & driver management       │ • Predictive AI / ML route engines │
│ • Live GPS tracking & freshness   │ • Real financial transactions (dev)│
│ • Stop collection recording       │ • Direct gov database hooks (fake) │
│ • Payment integration readiness   │ • Physical IoT bin fill sensors    │
│ • Doorstep cash & counter ledger  │ • Automated vehicle dispatch / AI  │
│ • Demo & official receipt engine  │ • Biometric driver attendance      │
│ • Missed-collection complaints    │ • Separate native mobile apps      │
│ • Municipal operations dashboard  │ • Bulk commercial weighbridge sync │
│ • Core event notifications        │ • Landfill leachate / SCADA monitor│
│ • RBAC, tenant isolation, audits  │ • Real-time P2P citizen chat       │
└───────────────────────────────────┴────────────────────────────────────┘
```

### 2.1 In-Scope Features
1. **Administrative Boundary Management:** Master data management for municipalities, wards, and localities.
2. **Citizen Property / Service Account Management:** Registering and linking households/properties to localities for schedule and fee tracking.
3. **Route & Timetable Scheduling:** Defining waste collection schedules (days, time slots, waste categories: organic/wet, recyclable/dry, hazardous, bulk) and route paths.
4. **Fleet & Collector Operations:** Managing vehicle inventories, driver/collector rosters, shift assignments, and route dispatches.
5. **Vehicle GPS Tracking with Staleness State Engine:** Real-time/near-real-time map-based vehicle telemetry tracking with distinct states: `CURRENT`, `STALE`, and `UNAVAILABLE`, featuring configurable freshness thresholds (defaulting to 60s and 300s in demo mode).
6. **Collection Event Logging:** Enabling collectors to record stop-level service status (`Collected`, `Inaccessible`, `Skipped`, `Not Present`) with reason codes.
7. **Payment Processing Readiness:** A pluggable payment gateway adapter framework supporting simulated checkout in sandbox mode and production-ready contract hooks.
8. **Offline Cash Accounting & Ledger:** Doorstep cash collection recording by collectors, cash-in-hand tracking, and supervisor cash-handover reconciliation.
9. **Receipt Issuance & Ledger Reconciliation:** Generating digitally verifiable receipts (with demo watermarks in sandbox mode) and daily payment reconciliation reports across 4 distinct lifecycle stages.
10. **Complaint Redressal Lifecycle:** Submitting missed-collection complaints, assigning tracking ticket numbers, dispatching to field supervisors, recording resolution proof, and closure.
11. **Municipal Operational Dashboards:** Aggregated metrics covering route completion rates, active fleet counts, complaint resolution SLAs, and revenue collections.
12. **System Governance & Security:** Tenant-isolated Role-Based Access Control (RBAC), end-to-end audit logging, password/session controls, safe connection pooling, and PII protection.
13. **Seeded Data & Sandboxed Simulation:** Self-contained synthetic datasets and realistic GPS/payment simulators for validation and training.

### 2.2 Out-of-Scope Features (Rationale Documented)
- **AI Chatbots / Conversational Interfaces:** Waste collection and complaint tracking require deterministic, structured workflows. AI chatbots introduce nondeterminism, hallucination risks, and unnecessary infrastructure overhead.
- **Gamification, Citizen Badges, and Social Feeds:** Nonessential distractions that inflate frontend complexity without contributing to core operational sanitation goals.
- **Predictive AI / Dynamic Route Optimization:** Standard municipal waste collection follows predictable, pre-notified routes known to citizens. Dynamic algorithmic re-routing causes citizen confusion regarding vehicle arrival windows.
- **IoT Bin Sensor Hardware Telemetry:** Smart bin ultrasonic sensors and weighbridge integrations require specialized hardware procurement and calibration beyond the core scope of fleet and citizen management.
- **Direct Integration with Government Datasets without Documented APIs:** No speculative or reverse-engineered government hooks will be built. All integrations must strictly adhere to documented adapter interfaces.

---

## 3. User Roles & Permission Boundaries

Access control is enforced strictly at the **backend API, service layer, and database query level**. Client-side UI visibility toggles exist solely for user experience and are never relied upon for security enforcement.

```
                              ┌────────────────────────┐
                              │ Platform Administrator │
                              └───────────┬────────────┘
                                          │ Provisions & Governs
                                          ▼
                              ┌────────────────────────┐
                              │ Municipal Admin (ULB)  │
                              └───────────┬────────────┘
                                          │ Dispatches & Reconciles
                      ┌───────────────────┴───────────────────┐
                      ▼                                       ▼
          ┌───────────────────────┐               ┌───────────────────────┐
          │   Driver / Collector  │               │        Citizen        │
          └───────────────────────┘               └───────────────────────┘
```

> [!CRITICAL]
> **Tenant Access Security Mandate:** A municipality URL parameter or route slug (e.g., `/m/verdant-hills`) must **never** independently authorize access to administrative functions, private citizen records, or tenant-scoped operations. Route slugs exist solely for public routing to unauthenticated, read-only municipal schedules. Access to tenant-scoped operations, administrative controls, and protected records is derived exclusively from cryptographically validated authentication tokens and verified municipal membership stored in the backend session.

### 3.1 Role Definitions & Permission Matrix

| Functional Module | Citizen (Public / Auth) | Authorized Driver / Collector | Municipal Administrator | Platform Administrator |
| :--- | :--- | :--- | :--- | :--- |
| **Locality / Schedule Lookup** | Read (Public) | Read (Assigned Ward) | Full Control (Tenant Only) | Read-Only (All Tenants) |
| **Live Vehicle Tracking** | Read (Active route in locality) | Read (Own vehicle & route) | Read (All tenant vehicles) | Read (System-wide diagnostics) |
| **Household / Property Records** | Read / Manage Own Property | Read stop addresses on route | Full Control (Tenant Only) | No Access to PII |
| **Route & Schedule Planning** | No Access | Read Assigned Route | Full Control (Tenant Only) | No Operational Access |
| **GPS Telemetry Ingestion** | No Access | Ingest Own Coordinates | No Access | View Telemetry Pipeline Status |
| **Stop Collection Logging** | No Access | Create Stop Status Logs | Read / Audit Collection Logs | No Operational Access |
| **Online Payment Checkout** | Execute (Own Account Only) | No Access | View Tenant Transactions | View Platform Settlement Status |
| **Offline Cash Collection** | Pay & Receive Receipt | Record Cash at Doorstep | Reconcile & Verify Cash | No Operational Access |
| **Receipts & Invoicing** | Read / Download Own Receipts | View Daily Cash Receipts | Full Control / Reconcile | View Aggregate Metrics |
| **Complaint Lifecycle** | Submit & View Own Tickets | View Assigned Complaints | Assign, Investigate, Resolve | No Operational Access |
| **Municipal Dashboards** | No Access | View Personal Shift Summary | Full Access (Tenant Only) | View Multi-Tenant Health |
| **Tenant User Provisioning** | Self-Registration | Authenticated by Admin | Manage Staff (Tenant Only) | Provision Tenant Admins |
| **Tenant Isolation & Master Setup**| No Access | No Access | Edit Tenant Settings | Full Multi-Tenant Control |

### 3.2 Granular Role Descriptions

#### 1. Citizen
- **Context:** Resident, property owner, or commercial tenant within a municipality.
- **Unauthenticated Access:** Can browse municipalities, wards, and localities; view published garbage pickup timetables; inspect general segregation rules; track public collection vehicles actively dispatched in their locality; and check complaint status by entering a valid ticket number.
- **Authenticated Access:** Secure login via phone/email with password or verified OTP; link one or more municipal Property Identification Numbers (PIN) / Consumer Service Accounts; view outstanding sanitation fees; perform simulated or online payments; access and download historical receipts; submit complaints pre-populated with property details; and receive notifications on ticket progress.
- **Boundaries:** Strictly barred from inspecting other citizens' personal, financial, or complaint records. Zero access to administrative fleet configurations or driver rosters.

#### 2. Authorized Driver / Collector
- **Context:** Sanitation truck driver, crew lead, or waste collection contractor operating in the field.
- **Access Profile:** Mobile-optimized, high-contrast web interface designed for outdoor, touch-first usage.
- **Permissions:** View daily route itinerary, assigned vehicle details, and sequence of locality stops; toggle shift status (`Start Shift`, `Pause/Break`, `End Shift`); stream location heartbeats from mobile GPS (or receive telemetry from installed vehicle hardware); log stop completion status (`Visited & Collected`, `House Closed`, `Road Blocked`, `Waste Not Segregated`); record doorstep cash collections against service accounts and issue instant digital/SMS receipt confirmations.
- **Boundaries:** Restricted strictly to assigned shift and route. Cannot edit fee structures, alter route plans, or access municipal financial summaries. Shift ends require mandatory cash-handover reconciliation.

#### 3. Municipal Administrator (Tenant Admin)
- **Context:** Urban Local Body (ULB) sanitation superintendent, health inspector, or municipal billing officer.
- **Access Profile:** Desktop and tablet-responsive administrative back-office portal.
- **Permissions:** Full control over municipality-specific master data (wards, localities, pickup schedules, collection rules); fleet management (vehicles, registration, maintenance flags, tracker associations); driver/collector accounts and daily route dispatching; real-time operational map monitoring all active vehicles; complaint triage, reassignment, resolution verification, and escalation tracking; offline payment reconciliation, verifying driver cash deposits, and validating digital settlement batches; exporting operational and financial audit reports.
- **Boundaries:** Confined exclusively to their authenticated `tenant_id`. Absolute architectural prohibition against viewing, modifying, or querying data from any other municipality.

#### 4. Platform Administrator (Super Admin)
- **Context:** Central technical operations team managing the software platform infrastructure.
- **Access Profile:** Administrative governance console with multi-factor authentication (MFA).
- **Permissions:** Provision and onboard new municipalities (tenant metadata, geographical bounding box, administrative contacts); configure tenant-specific feature flags and integration adapters (payment gateway keys, SMS/WhatsApp endpoints); monitor multi-tenant system health, API response latency, telemetry throughput, and security audit logs; trigger database backup/restore procedures and manage seeded demo data environments.
- **Boundaries:** Zero involvement in municipal operational decisions. Cannot resolve citizen complaints, manipulate citizen invoices, or tamper with collection status logs. Strict zero-knowledge/masked access to citizen personal identifiable information (PII).

---

## 4. Essential User Journeys

### Journey 1: Citizen Discovers Schedule & Tracks Vehicle Live
```
[Citizen Visits Web Portal]
         │
         ▼
[Selects Municipality] ──► [Selects Ward] ──► [Selects Locality]
                                                    │
         ┌──────────────────────────────────────────┴──────────────────────────┐
         ▼                                                                     ▼
[Views Collection Timetable]                                         [Opens Live Map View]
 - Days of week (Mon, Wed, Fri)                                                │
 - Pickup window (07:00 - 09:00)                                               ▼
 - Waste streams (Wet, Dry, Hazard)                                  [Vehicle Telemetry Engine]
                                                                               │
         ┌────────────────────────────────┬────────────────────────────────────┘
         ▼                                ▼                                    ▼
[State: CURRENT (Default < 60s)] [State: STALE (Default 60-300s)]   [State: UNAVAILABLE (> 300s / Off-Shift)]
  🟢 Green Pulse Badge            🟡 Amber Warning Badge              ⚪ Gray Stagnant Badge
  "Moving near Main St"           "Last seen 3 mins ago"              "Vehicle offline / Shift ended"
  Live position interpolated      Static pinned position              Last valid position pinned
```

### Journey 2: Citizen Submits & Tracks Missed-Collection Complaint
```
[Citizen Identifies Missed Pickup]
         │
         ▼
[Opens Complaint Form] ──► [Logs In / Enters Property ID]
         │
         ▼
[Enters Details]
 - Category: Missed Collection / Spillage / Irregular Time / Behavior
 - Description: "Truck did not visit North Lane"
 - Optional Evidence: Photographic upload (max 5MB, EXIF stripped)
         │
         ▼
[Submits Complaint]
         │
         ▼
[System Generates Unique Ticket: e.g., MC-VRD-2026-00429]
         │
         ▼
[Municipal Admin Dashboard: Ticket Assigned to Ward Supervisor]
         │
         ▼
[Supervisor Investigates Telemetry & Stop Logs for Locality]
         │
         ├───► [Log shows road was blocked] ──► [Dispatches Alternate / Resolves]
         │                                                      │
         ▼                                                      ▼
[Ticket Status: IN_PROGRESS] ──────────────────────────► [Ticket Status: RESOLVED]
                                                                │
                                                                ▼
                                                [Citizen Views Resolution & Closes]
```

### Journey 3: Citizen Views Sanitation Fee & Executes Simulated Payment
```
[Citizen Logs In] ──► [Navigates to "Bills & Payments"]
                               │
                               ▼
            [Views Ledger: Outstanding Balance ₹300]
                               │
                               ▼
            [Clicks "Proceed to Pay (Sandbox)"]
                               │
                               ▼
      ┌─────────────────────────────────────────────────┐
      │  ⚠️ SANDBOX SIMULATOR MODAL                     │
      │  "Test Mode - No real funds are processed"      │
      │  [ Select: Simulate SUCCESS / Simulate FAIL ]   │
      └────────────────────────┬────────────────────────┘
                               │
         ┌─────────────────────┴───────────────────────┐
         ▼                                             ▼
[Simulate FAILURE]                             [Simulate SUCCESS]
 - Error code returned                          - Webhook received & signature verified
 - Balance remains unchanged                    - Ledger credited: State = PAYMENT_VERIFIED
 - Helpful retry prompt                         - Digital receipt issued immediately
                                                - Watermarked: "DEMO RECEIPT - VOID"
                                                - Isolated in demo financial partition
```

### Journey 4: Driver / Collector Conducts Daily Shift & Stop Logging
```
[Driver Logs In at Depot via Mobile Web]
         │
         ▼
[Selects Assigned Vehicle & Shift Route] ──► [Clicks "Start Shift"]
                                                     │
                                                     ▼
                                          [GPS Ingestion Begins]
                                          (Device heartbeat every 10-15s)
                                                     │
         ┌───────────────────────────────────────────┴─────────────────────────┐
         ▼                                                                     ▼
[Arrives at Locality Stop]                                          [Citizen Offers Cash at Door]
 - Checks address list                                               - Driver enters Property PIN
 - Marks status:                                                     - Enters Cash Amount (₹100)
   • 🟢 Visited & Collected                                          - Clicks "Record Cash"
   • 🟡 Inaccessible / Blocked                                       - Instant digital/SMS receipt issued
   • 🔴 Skipped (Not Segregated)                                     - State = PAYMENT_RECORDED
         │                                                           - Driver cash-in-hand counter increments
         └───────────────────────────────────────────┬─────────────────────────┘
                                                     ▼
                                            [Completes All Stops]
                                                     │
                                                     ▼
                                             [Clicks "End Shift"]
                                                     │
                                                     ▼
                                   [Telemetry Switches to UNAVAILABLE]
                                   [Presents Cash Summary to Supervisor]
```

### Journey 5: Municipal Admin Reconciles Cash & Daily Performance
```
[Admin Opens "Reconciliation Console"]
         │
         ▼
[Selects Date & Driver: "Rajesh Kumar (Truck #04)"]
         │
         ├── System Recorded Doorstep Cash: ₹1,400 (14 households) [PAYMENT_RECORDED]
         ├── Physical Cash Handed In:       ₹1,400 [CASH_DEPOSITED]
         └── Variance:                      ₹0
         │
         ▼
[Clicks "Approve & Reconcile Shift Deposit"]
         │
         ▼
[Transactions Marked: RECONCILIATION_COMPLETED]
[Immutable Audit Entry Created with Supervisor ID and Timestamp]
```

---

## 5. Functional Scope & Requirements

### FR-1: Municipality, Ward & Locality Management
- **FR-1.1:** System shall maintain a 3-tier geographical hierarchy: `Municipality (Tenant)` -> `Ward` -> `Locality`.
- **FR-1.2:** Municipal administrators shall create, update, deactivate, and search wards and localities within their assigned municipality.
- **FR-1.3:** Each locality record shall support metadata: unique locality code, friendly name, bounding polygon coordinates (GeoJSON polygon or center lat/long with radius), and assigned ward ID.
- **FR-1.4:** Citizens shall search and filter localities via autocomplete without requiring prior registration.
- **FR-1.5:** Route path slugs (e.g., `/m/:municipalitySlug`) shall serve solely as navigational locators for public catalog data and shall not grant administrative or authenticated permissions.

### FR-2: Household & Service-Account Records
- **FR-2.1:** System shall maintain service accounts uniquely indexed by `(tenant_id, property_service_number)`.
- **FR-2.2:** Service account records shall capture: property category (Residential, Commercial, Industrial, Institutional), billing address, locality ID, primary contact name, masked mobile number, and active service status.
- **FR-2.3:** System shall allow authenticated citizens to link one or more verified service accounts to their user profile upon verifying ownership (e.g., via SMS OTP to the registered mobile number or billing reference code).
- **FR-2.4:** Bulk import utility (CSV template) shall be available for municipal administrators to seed or batch-upload service accounts with validation error reporting.

### FR-3: Vehicle Fleet & Driver Management
- **FR-3.1:** System shall record vehicle assets with: vehicle registration number, chassis/make model, vehicle capacity (metric tons / cubic meters), waste stream capability (Dual wet/dry, Compactor, Tipper, E-Rickshaw), active operational status (`Active`, `Maintenance`, `Decommissioned`), and associated GPS tracker identifier.
- **FR-3.2:** System shall record driver/collector profiles: full name, badge/employee ID, mobile number, license verification reference, and active employment status.
- **FR-3.3:** Municipal administrators shall associate drivers to vehicles and routes for designated shifts with start/end validity dates.

### FR-4: Route & Collection Schedule Management
- **FR-4.1:** System shall support defining collection routes composed of an ordered sequence of localities and designated waypoints.
- **FR-4.2:** System shall support recurring collection schedules (e.g., Weekly on Mon/Wed/Fri; Daily morning; Alternate days) with designated collection time windows (e.g., 06:30 - 09:30).
- **FR-4.3:** System shall tag each schedule with the waste stream collected during that run (e.g., "Wet / Biodegradable only", "Dry / Recyclable", "Hazardous / Sanitary", "Mixed").
- **FR-4.4:** Schedule changes or emergency cancellations shall be flaggable by municipal admins and immediately reflected on the citizen portal with notification alerts.

### FR-5: GPS Vehicle Tracking & Telemetry Engine
- **FR-5.1:** System shall provide an ingestion endpoint accepting vehicle telemetry: `vehicle_id`, `latitude`, `longitude`, `speed_kmh`, `heading_deg`, `device_timestamp (UTC)`, and `ingested_at (UTC server timestamp)`.
- **FR-5.2 (Validation & Invalid GPS Filtering):** Ingestion pipeline shall validate coordinate ranges (`lat: [-90, 90]`, `lon: [-180, 180]`), sanitize inputs, and reject corrupt or invalid records:
  - Coordinate spikes at `(0.0, 0.0)` or unphysical jumps indicating GPS sensor errors or spoofing.
  - Timestamps deviating into the future by $> 30\text{ seconds}$ relative to server time.
  - Device timestamps older than the most recently accepted reading for that vehicle (out-of-sequence rejection).
- **FR-5.3 (Telemetry Freshness State Machine):** Telemetry freshness shall be evaluated on every query using configurable thresholds (with demo defaults specified below):
  - **`CURRENT` (Fresh):** Telemetry `device_timestamp` is within the configured freshness window (demo default: $\le 60\text{ seconds}$ from system time). Displayed with active green indicator and live heading.
  - **`STALE` (Lagging / Disconnected):** Telemetry `device_timestamp` is between the freshness window and offline threshold (demo default: $61\text{ to }300\text{ seconds}$ old). Displayed with amber indicator, last-known location pinned, and explicit notice: *"Signal delayed — last seen X minutes ago"*.
  - **`UNAVAILABLE` (Offline / Shift Ended):** Telemetry is older than the offline threshold (demo default: $> 300\text{ seconds}$ old) or the assigned shift has been marked ended by the driver/supervisor. Displayed with gray indicator, last-known depot/stop position, and notice: *"Vehicle currently offline / Shift completed"*.
- **FR-5.4 (Last-Known Location Retention):** When a vehicle enters `STALE` or `UNAVAILABLE` state, the system shall retain and display its last verified valid GPS coordinate, clearly accompanied by an elapsed-time indicator and timestamp.
- **FR-5.5 (Hardware-Agnostic Support):** System shall support telemetry feeds from both future approved hardwired GPS hardware (e.g., AIS-140 standard devices) and driver-device mobile browser tracking via pluggable adapters, without assuming either hardware or specific tracking infrastructure is currently available.

### FR-6: Collection Status Recording
- **FR-6.1:** Drivers/collectors shall access a touch-first stop-list interface displaying all scheduled localities and street checkpoints along their assigned route.
- **FR-6.2:** Drivers shall record stop status with a single tap:
  - `VISITED_COLLECTED`: Waste collected successfully.
  - `VISITED_NO_WASTE`: Locality visited, no bins placed outside.
  - `SKIPPED_INACCESSIBLE`: Road blocked, construction, or vehicle impassable.
  - `SKIPPED_NON_COMPLIANT`: Citizen waste unsegregated or hazardous.
- **FR-6.3:** Every status record shall capture: driver user ID, vehicle ID, stop ID, GPS timestamp, and device GPS coordinate at moment of submission to verify physical presence.
- **FR-6.4 (Offline Caching & Sync):** In areas of poor cellular coverage, driver status entries and cash records shall be cached locally in browser storage (IndexedDB) and synchronized automatically with the backend when network connectivity is restored.

### FR-7: Online Payment Integration Readiness
- **FR-7.1:** System shall define an abstract, vendor-agnostic payment gateway adapter contract covering order creation, signature verification, status polling, and refund handling.
- **FR-7.2:** System shall implement a **Simulated Gateway Adapter** for demonstration and sandbox environments that simulates network latency and configurable success/failure outcomes without contacting banking rails or handling real money.
- **FR-7.3:** All payment transactions shall employ idempotency keys to prevent duplicate billing.
- **FR-7.4:** Webhook handlers shall enforce cryptographic signature verification, replay attack prevention, and idempotent state transitions.

### FR-8: Offline Payment Recording (Doorstep Cash & Municipal Counter)
- **FR-8.1:** Authorized drivers/collectors shall have permission to record cash collections received directly from citizens during collection rounds.
- **FR-8.2:** Municipal counter operators shall record cash, check, or demand draft payments received at municipal collection centers.
- **FR-8.3:** Every offline cash entry shall immediately issue a receipt confirmation, increment the collector's tracked cash-in-hand balance, and progress through defined financial lifecycle stages.
- **FR-8.4:** Financial transaction records shall be protected against silent modification or deletion. Erroneous entries shall be corrected exclusively through audited compensating reversal transactions.

### FR-9: Financial Lifecycle, Receipts & Reconciliation
- **FR-9.1 (Method-Specific Financial Workflows):** Payments shall not be forced through an artificial universal linear lifecycle. The system shall maintain separate, method-appropriate state workflows:
  - **Online Payment Workflow:**
    $$\text{ORDER\_CREATED} \longrightarrow \text{CHECKOUT\_INITIATED} \longrightarrow \text{PROVIDER\_CONFIRMED} \longrightarrow \text{SETTLED\_TO\_MUNICIPALITY}$$
    *(Branch states: `FAILED`, `ABANDONED`, `REFUNDED`, `CHARGEBACK_DISPUTED`). Importantly, provider confirmation indicates payment authorization/capture by the gateway, whereas settlement indicates actual electronic funds disbursement into the municipality's designated bank account.*
  - **Offline Cash Collection Workflow:**
    $$\text{COLLECTED\_AT\_DOORSTEP} \longrightarrow \text{RECEIPT\_ISSUED} \longrightarrow \text{DEPOSITED\_AT\_TREASURY} \longrightarrow \text{RECONCILIATION\_COMPLETED}$$
    *(Branch states: `DISCREPANCY_FLAGGED`, `REVERSED_COMPENSATION`). A doorstep cash payment moves through immediate receipt issuance and collector liability assignment, physical handover at shift end, and formal supervisory sign-off.*
- **FR-9.2 (Accounting Model):** Financial records shall maintain complete auditability and traceability against silent modification. While a full double-entry accounting ledger is a proposed option under architectural consideration, the core system shall minimally enforce an append-only transaction ledger with immutable audit trails and compensating adjustment entries.
- **FR-9.3 (Receipt Generation):** System shall generate verifiable digital receipts containing unique receipt number, municipal seal, service account PIN, citizen name, amount paid, payment mode, collecting officer ID, and timestamp.
- **FR-9.4 (Demo Safeguards):** In demonstration and sandbox environments, all receipts shall bear an unremovable diagonal watermark: **`DEMO RECEIPT - VOID - NO REAL MONEY MOVED`** and distinct sequence numbering (`DEMO-REC-XXXX`), preventing confusion with official municipal receipts.
- **FR-9.5 (Reconciliation & Discrepancy Handling):** Supervisors shall review daily shift reconciliation reports. If physical cash deposited does not match recorded cash, the system shall record an explicit discrepancy record with supervisor explanation, preventing silent ledger balance adjustments.

### FR-10: Complaint Submission, Tracking & Resolution
- **FR-10.1:** Citizens shall lodge missed-collection complaints by specifying locality, property PIN, category (`Missed Whole Locality`, `Missed Individual Bin`, `Waste Spillage`, `Rude Collector Behavior`), narrative description, and optional photo attachment.
- **FR-10.2:** System shall issue a trackable, human-readable ticket ID (e.g., `MUM-2026-CMP-00104`).
- **FR-10.3:** Complaints shall progress through an audited state machine:
  $$\text{OPEN} \longrightarrow \text{ASSIGNED} \longrightarrow \text{IN\_INVESTIGATION} \longrightarrow \text{RESOLVED} \longrightarrow \text{CLOSED}$$
- **FR-10.4:** When investigating a missed-collection complaint, the admin portal shall automatically cross-reference the vehicle GPS trail and collector stop-status logs for that specific locality during the complaint date.
- **FR-10.5:** Resolving a complaint shall require the supervisor to input resolution notes and optional photographic proof of cleared waste.

### FR-11: Municipal Dashboards & Operational Reports
- **FR-11.1:** Real-time operational summary widgets: Active vehicles on road, Percentage of daily route completion, Open vs. resolved complaints today, Total cash collected today vs. reconciled.
- **FR-11.2:** Tabular reports with filtering by date range, ward, and driver:
  - Daily Route Completion Log.
  - Vehicle Telemetry Uptime & Staleness Audit.
  - Cash Handover & Ledger Discrepancy Report.
  - Complaint SLA Breach Report (tickets open > 24 hours).
- **FR-11.3:** All report tables shall support CSV export.

### FR-12: Event Notifications System
- **FR-12.1:** System shall maintain an internal event bus emitting standardized notifications for key lifecycle events:
  - `SCHEDULE_UPDATED`: Ward schedule altered or pickup delayed.
  - `VEHICLE_NEARBY`: Vehicle enters locality geofence (simulated hook).
  - `COMPLAINT_STATUS_CHANGED`: Complaint updated from open to resolved.
  - `PAYMENT_CONFIRMED`: Online or offline receipt generated.
- **FR-12.2:** In-app notification center for logged-in citizens and administrators.
- **FR-12.3:** Abstract `INotificationProvider` interface to support future external SMS/Email/WhatsApp dispatch without modifying core application code.

### FR-13: Authentication, Authorization & Audit Logging
- **FR-13.1:** Authentication via secure credentials: phone/email with password and session/JWT tokens stored securely in `HttpOnly`, `SameSite=Strict`, `Secure` cookies.
- **FR-13.2:** Passwords hashed using industry-standard algorithms (Argon2id or bcrypt with appropriate work factor).
- **FR-13.3:** Mandatory immutable audit log capturing every state-changing HTTP request:
  `timestamp`, `tenant_id`, `user_id`, `user_role`, `ip_address`, `action_type`, `resource_name`, `resource_id`, `before_state_hash`, `after_state_hash`.
- **FR-13.4:** Audit logs shall be append-only with strict prohibition against administrative deletion or updates.

---

## 6. Nonfunctional Requirements (NFR)

```
┌────────────────────────────────────────────────────────────────────────┐
│                      NONFUNCTIONAL SYSTEM PILLARS                      │
├──────────────────┬──────────────────┬──────────────────┬───────────────┤
│  1. USABILITY &  │ 2. PERFORMANCE & │   3. SECURITY &  │ 4. INTEGRITY  │
│  ACCESSIBILITY   │   RELIABILITY    │  DATA ISOLATION  │  & RESILIENCE │
├──────────────────┼──────────────────┼──────────────────┼───────────────┤
│ • Mobile-first   │ • Sub-1.5s load  │ • Strict Tenant  │ • Append-only │
│ • WCAG 2.1 AA    │ • Low-bandwidth  │   Row Security   │   cash ledger │
│ • Bi-lingual     │ • Dynamic stale  │ • Safe pool RLS  │ • Immutable   │
│   (EN + Local)   │   GPS engine     │ • OWASP Top 10   │   audit log   │
│ • Minimalist UI  │ • Zero-polling   │ • Encrypted PII  │ • Automated   │
│ • No heavy libs  │   caching        │ • Strict CSP     │   backup spec │
└──────────────────┴──────────────────┴──────────────────┴───────────────┘
```

### NFR-1: Minimalistic, Responsive & Mobile-First Design
- **NFR-1.1:** Web client shall be engineered mobile-first, ensuring 100% feature parity across viewports from 320px (compact budget smartphones) up to 4K desktop screens.
- **NFR-1.2:** UI shall prioritize clean typography, high visual hierarchy, minimalistic layout, and eliminate unnecessary animations, heavy client-side bundles, or intrusive popups.
- **NFR-1.3:** Bundle size budget: Core initial JavaScript bundle $\le 150\text{ KB}$ gzipped to guarantee functional performance on 3G and throttled 4G mobile connections.

### NFR-2: Accessibility & Essential Language Support (Localization)
- **NFR-2.1:** Compliance with **WCAG 2.1 Level AA** design targets:
  - Contrast ratios $\ge 4.5:1$ for normal body text and $\ge 3:1$ for large headings and active UI controls.
  - Interactive touch targets $\ge 48 \times 48\text{ CSS pixels}$ with adequate tap padding for field workers wearing gloves.
  - Full keyboard navigability with visible focus indicators across all forms and maps.
  - ARIA live regions for live map telemetry updates and dynamic alert feeds.
- **NFR-2.2:** Multi-language internationalization (i18n) readiness: Complete separation of UI strings into structured dictionary keys supporting English plus at least one municipal regional language (e.g., Hindi, Marathi, Kannada, Tamil, or Spanish).

### NFR-3: Backend-Enforced Security, Multi-Tenant Isolation & Safe Connection Pooling
- **NFR-3.1:** Zero Trust client policy: Every API endpoint shall validate session validity, user role, and tenant authorization on the server.
- **NFR-3.2 (Safe Database Connection Pooling, RLS Governance & Bypass Prevention):**
  - PostgreSQL Row-Level Security (RLS) shall be implemented as a mandatory defense-in-depth barrier on all tenant-owned tables.
  - **RLS Bypass Prevention, Role Powers & Threat Model Boundaries:**
    - In PostgreSQL, superusers and roles with the `BYPASSRLS` attribute unconditionally bypass all RLS policies. `ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;` causes policies to apply to table owners, but **critically does NOT constrain superusers or roles with `BYPASSRLS`**.
    - **Tripartite Database Role Architecture:**
      1. **Runtime Role (`waste_app_user`):** Granted `NOSUPERUSER`, `NOBYPASSRLS`, and least-privilege DML (`SELECT, INSERT, UPDATE` on mutable tables; `SELECT, INSERT` only on append-only logs/ledger). Owns zero tables and cannot execute DDL. RLS is unconditionally active on all queries.
      2. **Migration Role (`waste_migration_user`):** Dedicated non-superuser role (`NOSUPERUSER`, `NOBYPASSRLS`) that owns application schemas and tables, executing DDL migrations in CI/CD pipelines. Never used for web requests.
      3. **Database Administration Role (`waste_dba_admin`):** Used exclusively out-of-band for role provisioning, cluster maintenance, and disaster recovery. Never used for routine application migrations or web traffic.
    - **Threat Model Limits:** Transaction-local RLS (`set_config(..., true)`) is an internal defense-in-depth control against application bugs, ORM omissions, and missing `WHERE` clauses. It does **not** protect against arbitrary SQL injection (which could reset session variables) or physical database compromise. Primary security against SQL injection requires strict parameterized queries and input validation.
    - Every tenant-owned table must be secured with `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;` and `ALTER TABLE <table_name> FORCE ROW LEVEL SECURITY;`.
  - **Connection-Pool Safeguard & Rollback Safety:**
    - Because database connections in connection pools (e.g., PgBouncer) are shared across requests, session-level variables (`SET app.current_tenant_id`) can leak across transactions if not properly scoped.
    - **Transaction-Scoped Mandate:** The application must set tenant context exclusively at transaction scope using `SELECT set_config('app.current_tenant_id', :tenant_id, true)` within an explicit transaction boundary (`BEGIN ... COMMIT`), ensuring the setting automatically reverts upon transaction completion.
    - **Rollback Safety:** If a transaction errors or aborts and triggers `ROLLBACK`, PostgreSQL automatically purges the transaction-local `set_config` setting, guaranteeing that an aborted transaction leaves zero residual tenant context on the pooled connection.
    - Connection pool checkout hooks shall verify and reset session state (`DISCARD ALL` or `RESET ALL` where appropriate) before returning connections to the pool.
- **NFR-3.3 (Automated Cross-Tenant Access Testing):**
  - CI/CD pipelines shall execute automated cross-tenant security test suites:
    - Attempting to read or mutate Tenant B resources using an authenticated token from Tenant A must return HTTP 403 Forbidden.
    - Attempting to manipulate route slugs or request headers (`X-Tenant-Slug`) while authenticated must not bypass tenant boundaries.
    - Database-level RLS policy tests must verify that direct queries executed under Tenant A context return 0 rows for Tenant B data.
- **NFR-3.4 (Protection against OWASP Top 10):**
  - Parameterized queries / ORM mapping to prevent SQL and NoSQL injections.
  - Context-aware HTML entity escaping to eliminate Cross-Site Scripting (XSS).
  - Anti-CSRF token verification on state-changing requests or strict SameSite cookie isolation.
  - Strict Content Security Policy (CSP) headers prohibiting inline script injection.
  - API rate limiting (e.g., 60 requests/minute for public lookup; 10 requests/minute for login and complaint creation) to prevent scraping and abuse.

### NFR-4: Data Protection, Privacy & PII Minimization
- **NFR-4.1:** Data in transit shall be encrypted using **TLS 1.3** (or TLS 1.2 minimum).
- **NFR-4.2:** Sensitive citizen PII (phone numbers, full property tax numbers) shall be masked on public displays (e.g., `+91-98****1234`).
- **NFR-4.3:** Telemetry Privacy: Citizen-facing tracking shall display vehicle coordinates solely when the vehicle is actively on a designated public shift route. Off-shift vehicle coordinates and driver private locations shall never be exposed.

### NFR-5: Telemetry Reliability, Freshness & Offline Handling
- **NFR-5.1:** Client tracking view shall continuously evaluate telemetry latency relative to current server time against the configured thresholds.
- **NFR-5.2:** Telemetry display shall never freeze or display stale coordinates as current. When latency exceeds the configured freshness window (demo default: 60s), the UI must immediately transition from green ("Live") to amber ("Delayed").
- **NFR-5.3:** When a vehicle's shift ends or no coordinates arrive within the offline threshold (demo default: 300s), the UI must transition to gray ("Unavailable / Offline"), retaining the last verified valid coordinate with an explicit elapsed-time notice.

### NFR-6: Financial Integrity, Traceability & Non-Repudiation
- **NFR-6.1:** Financial records shall maintain an append-only, tamper-evident audit history. Deletions on financial tables (`DELETE` queries) are architecturally prohibited.
- **NFR-6.2:** All financial corrections and adjustments shall require linked compensating reversal transactions referencing the original record ID, authorized supervisor ID, and mandatory audit justification.
- **NFR-6.3 (Isolation of Demo Transactions):** Fictional/demo transactions executed in sandbox mode shall be strictly isolated from production financial records (via separate demo storage partitions or dedicated tables), guaranteeing zero contamination of official municipal books.

### NFR-7: Operational Monitoring, Error Handling & Backups
- **NFR-7.1:** Structured error logging (JSON format) capturing trace ID, request URI, status code, and sanitized error context.
- **NFR-7.2:** Client error responses shall follow **RFC 7807 (Problem Details for HTTP APIs)**, exposing zero stack traces or internal server details to end users.
- **NFR-7.3:** Standardized health probes: `/healthz/live` (process health) and `/healthz/ready` (database and cache connectivity).
- **NFR-7.4:** Backup strategy specification: Daily automated full database snapshots with transaction-level write-ahead logging (WAL) enabling point-in-time recovery (PITR) up to 14 days.

### NFR-8: Performance, Concurrency & Scalability
- **NFR-8.1:** Public schedule and locality lookup requests shall achieve 95th percentile response times ($P_{95}$) under $250\text{ ms}$.
- **NFR-8.2:** Vehicle telemetry ingestion shall handle bursts of concurrent vehicle pings without database lock contention.
- **NFR-8.3:** Database indexes must be defined explicitly on all multi-tenant composite lookup keys: `(tenant_id, locality_id)`, `(tenant_id, recorded_at)`, `(tenant_id, complaint_status)`.

---

## 7. Seeded Data & Future Integration Requirements

### 7.1 Seeded Demo Data Specification & Demo Safeguards
Until authorized governmental integrations and live GPS hardware are provisioned, the platform shall operate exclusively in an isolated **Demonstration Sandbox Mode** using purely **synthetic demo data**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DEMO ENVIRONMENT FIXTURES                       │
├────────────────────────┬───────────────────────────────────────────────┤
│ ENTITY                 │ SYNTHETIC DEMO DATA DETAILS                   │
├────────────────────────┼───────────────────────────────────────────────┤
│ Municipality 1 (Demo)  │ "Verdant Hills Municipal Corporation" (VHMC)  │
│                        │ Coastal urban district; 3 Wards; 12 Localities│
│ Municipality 2 (Demo)  │ "Oceanfront Nagar Panchayat" (ONP)            │
│                        │ Small township; 2 Wards; 6 Localities         │
│ Synthetic Households   │ 150 fictional service accounts with synthetic │
│                        │ addresses, PINs, and historical fee balances  │
│ Synthetic Fleet        │ 6 demo vehicles (Tipper trucks, Compactors)   │
│ Synthetic Drivers      │ 6 fictional driver profiles with credentials  │
│ Collection Schedules   │ Mon/Wed/Fri Wet Waste; Tue/Thu Dry Waste      │
│ Active Shifts          │ Pre-configured shift routes with stops        │
└────────────────────────┴───────────────────────────────────────────────┘
```

#### Demo Safeguards
1. **Clearly Labelled Fictional GPS Data:**
   - Map tracking views displaying simulated vehicle movements shall feature a persistent, high-visibility UI indicator: **`SIMULATED TELEMETRY — DEMONSTRATION DATA`**.
   - All simulated telemetry records shall be marked with an internal flag `is_simulated: true`.
2. **Safe Simulated Payments:**
   - Client checkout launches a simulated gateway dialog clearly titled: **`SANDBOX PAYMENT SIMULATOR — NO REAL MONEY IS MOVED`**.
   - Provides instant buttons: `[Simulate Successful Payment]` or `[Simulate Payment Failure]`.
   - The simulator contains zero connections to banking networks, payment aggregators, or real credit/debit rails.
3. **Unmistakable Demo Receipts:**
   - Rendered with an unremovable diagonal watermark: **`DEMO RECEIPT - VOID - NOT A VALID TAX INVOICE - NO REAL MONEY MOVED`**.
   - Numbered with distinct demo prefixes: `DEMO-REC-VHMC-2026-XXXX`.
   - Cannot be submitted or mistaken for official municipal utility tax receipts.
4. **Complete Separation of Demo and Production Records:**
   - Simulated transactions shall be stored in isolated demo partitions or tables tagged with sandbox flags, ensuring they cannot contaminate official municipal reporting or production audit logs.

### 7.2 Future Integration Architecture (Engineering Requirements)
To ensure the transition from demo mode to real municipal deployments does not destabilize the core application, all external integrations are decoupled via a **Ports-and-Adapters (Hexagonal)** architecture.

> [!NOTE]
> **Engineering Reality:** Decoupling via adapter contracts prevents rewrites of the core domain logic and frontend user experience. However, connecting any real external system (GPS hardware, payment gateway, municipal tax registry) **will require deliberate integration engineering**, including concrete schema mapping, authentication configuration, resilient error handling, and end-to-end integration testing.

```
                  ┌────────────────────────────────────────┐
                  │          CORE DOMAIN LOGIC             │
                  │   (Schedules, Tracking, Reconciliation)│
                  └───────────────────┬────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
      [GPS Ingestion Port]                           [Payment Gateway Port]
      interface IGpsProvider                         interface IPaymentGateway
              │                                               │
      ┌───────┴───────┐                               ┌───────┴───────┐
      ▼               ▼                               ▼               ▼
┌───────────┐   ┌───────────┐                   ┌───────────┐   ┌───────────┐
│ Simulated │   │ Production│                   │ Simulated │   │ Production│
│ GPS Mock  │   │ Hardware  │                   │ Gateway   │   │ Gateway   │
│ Adapter   │   │ Adapter   │                   │ Adapter   │   │ Adapter   │
└───────────┘   └───────────┘                   └───────────┘   └───────────┘
```

#### Mandatory Adapter Engineering Specifications
Each future integration adapter must fulfill six strict architectural requirements:

1. **Formal Adapter Contract:** Pluggable interfaces defining normalized Input/Output Data Transfer Objects (DTOs), completely isolating vendor-specific parameter names from core domain models.
2. **Field Mapping & Schema Normalization:** Explicit data transformation layers converting external schemas (e.g., proprietary GPS NMEA strings or bank webhook JSON) into domain entities.
3. **Strict Ingress Validation:** Comprehensive schema validation and input sanitization on all incoming payloads before processing by domain services.
4. **Authentication & Credential Management:** Secure storage of vendor API keys, OAuth tokens, and mTLS certificates via environment secrets, with mandatory cryptographic signature verification on all incoming webhooks.
5. **Failure & Resilience Handling:** Robust failure management including circuit breakers, exponential backoff retries on transient network failures, dead-letter queues for unprocessable messages, and graceful degradation when external services are unreachable.
6. **Integration Contract Testing:** Staging test suites and mock contract tests (e.g., wiremock-style verification) validating adapter behavior against external provider specifications prior to production deployment.

---

## 8. Multi-Municipality Requirements & Data Isolation

### 8.1 Multi-Tenancy Architecture Model
The platform adopts a **Shared Application, Shared Database with Logical Tenant Isolation (Row-Level Security / Tenant Scoping)** model.

```
                           Incoming Web Request
                                     │
                                     ▼
                      ┌────────────────────────────┐
                      │    Tenant Resolver Middleware │
                      │  (Extracts & Validates Tenant)│
                      └──────────────┬─────────────┘
                                     │ Validates Auth & Sets Context
                                     ▼
                      ┌────────────────────────────┐
                      │    API Controller Layer    │
                      └──────────────┬─────────────┘
                                     │ Passes tenant_id to Services
                                     ▼
                      ┌────────────────────────────┐
                      │  Repository & Query Layer  │
                      │  WHERE tenant_id = :ctx    │
                      └──────────────┬─────────────┘
                                     │ Opens Explicit Transaction
                                     ▼
                      ┌────────────────────────────┐
                      │ PostgreSQL Engine with RLS │
                      │ SET LOCAL app.tenant_id    │
                      └────────────────────────────┘
```

### 8.2 Tenant Context Resolution Rules
1. **Authentication-Derived Tenant Authority:**
   - For all authenticated operations (Citizen service account actions, Driver operations, Municipal Admin portal, Platform Admin), tenant identity is derived strictly from verified cryptographic session tokens and validated municipal membership.
   - Route slugs or query parameters (e.g., `/m/verdant-hills`) serve solely as human-friendly locators for public read-only schedule lookups. **A route slug must never independently authorize access to administrative functions, private citizen data, or tenant-scoped operations.**
2. **Query Enforcement, Safe Connection Pooling & RLS Bypass Prevention:**
   - Every database table (except global platform administrator accounts and system configuration) must contain a mandatory column:
     `tenant_id UUID NOT NULL REFERENCES municipalities(id)`.
   - Every application query must explicitly parameterize `tenant_id` in its `WHERE` clause.
   - **PostgreSQL Row-Level Security (RLS) & Connection Pooling Safeguards:**
     - To prevent tenant context leakage across shared pooled database connections, tenant context must be set using transaction-scoped configuration:
       ```sql
       BEGIN;
       SELECT set_config('app.current_tenant_id', :tenant_id, true); -- true = local to transaction
       -- execute tenant-scoped queries
       COMMIT;
       ```
     - **Rollback Safety:** If an application transaction encounters an error and issues `ROLLBACK`, PostgreSQL automatically purges the transaction-local `set_config` variable, ensuring zero residual tenant state persists on the connection.
     - Connection pool cleanup hooks must execute `RESET ALL` or `DISCARD ALL` upon connection checkout/checkin to guarantee zero cross-request pollution.
   - **Database-Level RLS Bypass Prevention, Role Powers & Boundaries:**
     - In PostgreSQL, superusers and roles with the `BYPASSRLS` attribute bypass RLS policies unconditionally. `FORCE ROW LEVEL SECURITY` applies solely to table owners, and does **not** constrain superusers or `BYPASSRLS` roles.
     - **Role Separation:**
       - `waste_app_user` (runtime): `NOSUPERUSER`, `NOBYPASSRLS`, DML only, owns zero tables, subject unconditionally to RLS.
       - `waste_migration_user` (migration): dedicated non-superuser role owning schema/tables for DDL in CI/CD.
       - `waste_dba_admin` (DBA): out-of-band administrative role, strictly prohibited from routine app migrations or traffic.
     - **Threat Boundary:** RLS is an internal defense-in-depth barrier against application logic and ORM filtering errors. It does not protect against arbitrary SQL injection that manipulates session variables. Every tenant table has `FORCE ROW LEVEL SECURITY` enabled to ensure table-owning scripts are constrained during data queries.

### 8.3 Isolation Boundaries

| Resource Entity | Isolation Level | Cross-Tenant Visibility Rule |
| :--- | :--- | :--- |
| **Municipal Administrators** | Tenant-Scoped | Prohibited from viewing or modifying other municipalities. |
| **Drivers & Collectors** | Tenant-Scoped | Cannot be assigned to vehicles or routes belonging to other municipalities. |
| **Wards & Localities** | Tenant-Scoped | Uniquely bound to parent municipality. Slugs may repeat across different tenants. |
| **Fleet & Vehicles** | Tenant-Scoped | Telemetry streams are strictly isolated within the tenant scope. |
| **Fee Rules & Tariffs** | Tenant-Specific | Each municipality configures its own rate cards (flat, ward-tiered, or property-type). |
| **Ledger & Cash Accounts** | Tenant-Scoped | Municipal counter and driver cash handovers remain segregated in tenant ledger. |
| **Citizen Complaints** | Tenant-Scoped | Citizens can only lodge complaints against localities of that municipality. |

---

## 9. Key Risks, Assumptions, Dependencies & Unresolved Questions

### 9.1 Risk Matrix

| Risk ID | Risk Description | Severity | Likelihood | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | **Unreliable Mobile Connectivity in Field:** Drivers operating in narrow lanes experience cellular drops, causing tracking halts and sync failures. | High | High | Mobile driver interface must cache status marks and cash entries offline in IndexedDB and synchronize upon reconnection. Telemetry state engine must cleanly switch to `STALE` without crashing. |
| **RSK-02** | **Cash Leakage at Doorstep:** Inaccurate cash recording or disputes between citizens and collectors regarding cash handed over. | High | Medium | Immediate SMS/digital receipt confirmation sent to citizen upon driver cash entry. Strict daily reconciliation lock preventing driver dispatch without supervisor clearance. |
| **RSK-03** | **Citizen Alarm Over Stale GPS Pings:** Citizens waiting on streets if vehicle marker is frozen on screen. | Medium | High | Deterministic telemetry freshness state badge (`CURRENT`, `STALE`, `UNAVAILABLE`) with human-readable timestamp, preventing false reliance on lagging signals. |
| **RSK-04** | **Cross-Tenant Data Leakage:** Software bug exposing citizen or financial records of Municipality A to Municipality B staff. | Critical | Low | Backend-enforced tenant filtering, composite keys, Database Row-Level Security (RLS) with transaction-scoped variables, and automated tenant isolation test suites in CI/CD pipeline. |

### 9.2 Requirements Classification

```
┌────────────────────────────────────────────────────────────────────────┐
│                        REQUIREMENTS CLASSIFICATION                     │
├────────────────────────────────────────────────────────────────────────┤
│ 🔵 CONFIRMED REQUIREMENTS                                              │
│ • Single multi-tenant web application for multiple municipalities.     │
│ • Tenant access derived strictly from validated authentication.        │
│ • Core citizen journeys: lookup, live map tracking, complaints, bills. │
│ • Four roles: Citizen, Driver/Collector, Municipal Admin, Platform Admin.│
│ • Telemetry status engine: CURRENT, STALE, UNAVAILABLE with timestamps.│
│ • 4-stage financial lifecycle: RECORDED -> VERIFIED -> DEPOSITED ->    │
│   RECONCILIATION_COMPLETED.                                            │
│ • Complete absence of AI, gamification, and speculative integrations.  │
│ • Purely synthetic demo fixtures and sandbox simulator for Phase 1.   │
├────────────────────────────────────────────────────────────────────────┤
│ 🟡 WORKING ASSUMPTIONS (Subject to Municipality Validation)           │
│ • Drivers possess entry-level touchscreen smartphones with GPS.        │
│ • Collection occurs primarily on fixed recurring weekly timetables.    │
│ • Standard residential sanitation fees are billed monthly or flat-rate.│
│ • Citizens are willing to identify property via a simple Property ID. │
├────────────────────────────────────────────────────────────────────────┤
│ 🟢 ARCHITECTURAL RECOMMENDATIONS / PROPOSALS                           │
│ • Proposed Option: Double-entry bookkeeping ledger (pending accounting │
│   standard validation during financial requirements sign-off).         │
│ • Build mobile-first responsive web (PWA-ready) before native apps.    │
│ • Use PostgreSQL with RLS and PostGIS for spatial queries.             │
│ • Apply Hexagonal Architecture (Ports-and-Adapters) for gateways.      │
│ • Mandate physical cash balance clearance before starting next shift. │
└────────────────────────────────────────────────────────────────────────┘
```

### 9.3 External Dependencies
- **DEP-01: Tile Mapping Provider:** Reliance on open, non-proprietary map tiles (e.g., OpenStreetMap via Leaflet/MapLibre) to avoid proprietary licensing fees or API key lock-ins during development.
- **DEP-02: Device Geolocation API:** Reliance on standard HTML5 browser Geolocation API on drivers' mobile devices for shift tracking.
- **DEP-03: Future Government DLT / SMS Registration:** Formal SMS notification delivery requires telecommunication commercial registration (DLT headers in jurisdictions like India).

### 9.4 Unresolved Questions (Requiring Stakeholder Clarification in Phase 2)
1. **Driver Telemetry Source:** Will municipalities install dedicated in-vehicle hardware (e.g., AIS-140 GPS trackers wired to vehicle battery), or will drivers exclusively use personal/municipal mobile phones running the driver web app?
   - *Architectural Recommendation:* Support both via the `IGpsTelemetryProvider` adapter interface without assuming either is currently available.
2. **Doorstep Cash Authorization Policy:** Do all participating municipalities authorize sanitation workers to accept physical cash at the doorstep, or should cash payments be restricted to municipal citizen service centers?
   - *Architectural Recommendation:* Implement a tenant-level configuration flag: `allow_doorstep_cash_collection: boolean`.
3. **Financial Accounting Model Selection:** Should municipal accounts follow a complete double-entry bookkeeping ledger (chart of accounts, debit/credit legs), or is an append-only cash ledger with reconciliation checkpoints sufficient for municipal auditors?
   - *Architectural Recommendation:* Treat double-entry as a proposed option; finalize upon reviewing the municipality's statutory audit guidelines.
4. **Property Identity Scheme:** Is there an existing national or state-level property tax identifier to standardize on, or must the platform generate its own internal Consumer Service Account numbering format?
   - *Architectural Recommendation:* Provide a flexible alphanumeric service account code with custom regex validation per municipality.
5. **Complaint Photographic Proof:** Should photographic attachments for missed collections and resolution proofs be mandatory or optional?
   - *Architectural Recommendation:* Keep photo uploads optional in Phase 1 to prevent friction in low-bandwidth rural or semi-urban localities.

---

## 10. Acceptance Criteria for Phase 1 & Testable Specifications

Phase 1 is complete and formally verified against the following criteria:

- [x] **AC-1.1:** Comprehensive requirements document produced and saved within the project repository under `docs/phase-1-requirements-and-scope.md`.
- [x] **AC-1.2:** Complete architectural boundaries established; all non-essential features (AI chatbots, gamification, predictive routing, social networking) explicitly classified as out-of-scope.
- [x] **AC-1.3:** Precise role definitions and backend-enforced permission boundaries specified for all four user roles (Citizen, Driver, Municipal Admin, Platform Admin).
- [x] **AC-1.4:** Five end-to-end user journeys documented with sequential workflow diagrams.
- [x] **AC-1.5:** Thirteen functional requirement areas (FR-1 through FR-13) detailed with unambiguous business rules.
- [x] **AC-1.6:** Nonfunctional requirements specified with quantitative thresholds for performance, accessibility (WCAG 2.1 AA design targets), telemetry staleness, security, and financial integrity.
- [x] **AC-1.7:** Seeded data fixtures and sandbox simulation requirements defined with explicit safeguards (demo watermarks, fake payment notices, simulated coordinate generators).
- [x] **AC-1.8:** Multi-municipality isolation model formalized using Row-Level Security principles, transaction-scoped connection pooling, and authentication-derived tenant context.
- [x] **AC-1.9:** Risks, assumptions, dependencies, and unresolved questions documented without fabricating nonexistent government integrations.
- [x] **AC-1.10:** Subsequent implementation roadmap structured across subsequent phases.
- [x] **AC-1.11:** **Zero application or website implementation code written during Phase 1.**

### 10.1 Explicit Acceptance Test Criteria for Subsequent Phases
To ensure seamless verification during development, the following explicit acceptance tests are mandated:

1. **Cross-Municipality Data Isolation Test:**
   - *Test:* Authenticate as a Municipal Administrator of Municipality A. Send API requests targeting resources (vehicles, routes, complaints, bills) of Municipality B.
   - *Criterion:* Every cross-tenant request must fail with HTTP 403 Forbidden; zero data from Municipality B may be returned; security event logged in audit trail.
2. **Citizen Service Record Access Test:**
   - *Test:* Authenticate as Citizen A. Attempt to view or query service account records, billing histories, or receipts belonging to Citizen B.
   - *Criterion:* Request must fail with HTTP 403 Forbidden or return an empty record set; citizens can strictly access only verified linked accounts.
3. **GPS Staleness & Disconnected Device Test:**
   - *Test:* Ingest telemetry for Vehicle V1. Cease sending telemetry pings. Query vehicle status after 61 seconds, and after 301 seconds.
   - *Criterion:* Status transitions cleanly from `CURRENT` to `STALE` at 61s (displaying amber indicator and elapsed timestamp), and to `UNAVAILABLE` at 301s (displaying gray indicator and pinned last-known coordinate).
4. **Offline Cash Receipt Generation & Synchronization Test:**
   - *Test:* Disconnect driver device network. Record a doorstep cash collection. Re-establish network connectivity.
   - *Criterion:* System must generate an immediate local receipt offline; upon reconnection, the entry must synchronize with the backend, transitioning to `PAYMENT_RECORDED` without record loss or duplicate creation.
5. **Cash Deposit Reconciliation & Discrepancy Test:**
   - *Test:* Driver records ₹1,500 in doorstep cash. At shift end, driver deposits ₹1,400 physical cash. Supervisor reconciles the shift.
   - *Criterion:* System flags an explicit ₹100 discrepancy; requires mandatory supervisor explanation note; blocks silent overwriting; transitions shift to `RECONCILIATION_COMPLETED` with variance record preserved.
6. **Isolation of Demo Transactions Test:**
   - *Test:* Execute simulated payment transactions in demo mode. Inspect production municipal financial reporting tables and audit ledgers.
   - *Criterion:* Production tables must contain zero demo records; demo transactions must be strictly confined to demo storage partitions.
7. **Configuration-Driven Municipality Onboarding Test (Within Supported Capabilities):**
   - *Test:* Platform administrator onboards a new municipality via the admin console, configuring supported standard options (name, boundary coordinates, standard wards, and existing tariff fee structures).
   - *Criterion:* The new municipality must become fully operational for schedule browsing and management without requiring any application rebuild, code change, or server restart.
   - *Boundary Qualification:* Note that onboarding requiring new external payment gateways, custom proprietary GPS hardware protocols, or bespoke legal billing engines requires deliberate engineering integration, security review, and testing, which is outside the scope of zero-code onboarding.

---

## 11. Proposed High-Level Implementation Roadmap

The project shall progress sequentially through six disciplined phases following this roadmap:

```
┌────────────────────────────────────────────────────────────────────────┐
│                       PROJECT IMPLEMENTATION ROADMAP                   │
├────────────────────────────────────────────────────────────────────────┤
│  PHASE 1: Requirements Definition & Project Scope        [COMPLETED]   │
│  • Define functional & nonfunctional scope                             │
│  • Role permissions, user journeys & data isolation model              │
│  • Deliverable: docs/phase-1-requirements-and-scope.md                 │
├────────────────────────────────────────────────────────────────────────┤
│  PHASE 2: System Architecture, Data Modeling & UI/UX Design            │
│  • Entity-Relationship Diagrams (ERD) with tenant scoping              │
│  • API contract specifications (OpenAPI / REST)                        │
│  • Mobile-first UI wireframes & WCAG-compliant design system tokens    │
│  • Telemetry state machine & adapter interface specifications          │
├────────────────────────────────────────────────────────────────────────┤
│  PHASE 3: Multi-Tenant Backend Core & Master Data Services             │
│  • Database schema migration scripts with Row-Level Security (RLS)     │
│  • Authentication service (JWT, HttpOnly cookies, RBAC middleware)     │
│  • Master data CRUD APIs (Municipalities, Wards, Localities, Accounts) │
│  • Connection pool safe RLS transaction scoping & audit logging        │
├────────────────────────────────────────────────────────────────────────┤
│  PHASE 4: Fleet Telemetry & Collector Mobile Web Portal                │
│  • GPS telemetry ingestion pipeline with configurable staleness engine │
│  • Touch-first driver portal (shift start/stop, stop-status logging)   │
│  • Offline caching & synchronization module for poor connectivity      │
│  • Background simulated GPS coordinate emitter for Verdant Hills       │
├────────────────────────────────────────────────────────────────────────┤
│  PHASE 5: Citizen Public Portal & Complaint Lifecycle                  │
│  • Public locality & schedule lookup interface                         │
│  • Interactive map component with dynamic vehicle freshness badge      │
│  • Complaint submission, tracking, and photo attachment workflows      │
│  • Supervisor complaint triage and resolution console                  │
├────────────────────────────────────────────────────────────────────────┤
│  PHASE 6: Payments, Ledger Reconciliation & Admin Reports              │
│  • Sandbox payment gateway simulator modal & webhook callback handler  │
│  • Watermarked demo receipt generation (HTML / PDF export)             │
│  • 4-stage financial lifecycle & cash handover reconciliation console  │
│  • Municipal operations dashboard & CSV export reports                 │
├────────────────────────────────────────────────────────────────────────┤
│  PHASE 7: Verification, Hardening & End-to-End Validation              │
│  • Multi-tenant cross-boundary security penetration testing            │
│  • Network throttling & offline resilience testing on 3G simulations   │
│  • Accessibility audit (Lighthouse / axe-core for WCAG 2.1 AA)         │
│  • Execution of Phase 1 acceptance test suites on seeded sandbox       │
└────────────────────────────────────────────────────────────────────────┘
```

---
*End of Phase 1 Requirements Definition Document.*
