# Smart Municipal Waste Management Platform
## Phase 2: UI/UX Specification & Screen Design

**Document Version:** 1.2.0 (Audited & Formally Hardened)  
**Phase:** 2 (System Architecture, Data Design, API Contracts & UI/UX)  
**Status:** UI/UX Design Specification (Not Yet Implemented)  
**Source of Truth:** [docs/phase-1-requirements-and-scope.md](file:///d:/project/docs/phase-1-requirements-and-scope.md)  
**Author:** Senior Software Architect  

---

## 1. UI/UX Principles & Accessibility Standards

### 1.1 Core Design Principles
1. **Minimalistic & Uncluttered:** Prioritize clarity, high information density, and rapid task completion over decorative visuals or gratuitous animations.
2. **Mobile-First Responsiveness:** Optimized for small viewports (320px minimum) up to desktop (4K), with fluid layouts and collapsible menus.
3. **Never Rely on Color Alone:** All operational indicators (GPS freshness, collection status, payment state) combine distinct geometric icons, high-contrast colors, and unambiguous human-readable text labels.
4. **Accessible to All (WCAG 2.1 Level AA):**
   - Minimum text contrast ratio of $4.5:1$ for body copy and $3.0:1$ for large titles and active buttons.
   - Generous touch targets ($\ge 48 \times 48\text{ CSS pixels}$) with adequate spacing for outdoor use by field workers wearing protective gloves.
   - Full keyboard navigability (`Tab`, `Shift+Tab`, `Enter`, `Escape`) with high-visibility outline focus rings (`2px solid #0056b3`).
   - Screen-reader friendly semantic HTML (`<main>`, `<nav>`, `<section>`, `<article>`, `<button>`) with descriptive ARIA live regions for dynamic map updates.
5. **No Speculative Bloat:** No AI chatbot floating widgets, no citizen reward point badges, and no social discussion feeds.

### 1.2 Telemetry Status Design System (Color + Icon + Text)

| Status | Color Token | Icon Symbol | Visual Presentation | Mandatory Human-Readable Text Label |
| :--- | :--- | :--- | :--- | :--- |
| **`CURRENT`** | Forest Green (`#1b5e20` on `#e8f5e9`) | 🟢 Pulse Dot `[●]` | Green border, animated pulse indicator | **"LIVE — Updated 12 seconds ago"** |
| **`STALE`** | Amber/Orange (`#e65100` on `#fff3e0`) | 🟡 Warning Triangle `[▲]` | Amber border, static marker | **"SIGNAL DELAYED — Last seen 4 minutes ago"** |
| **`UNAVAILABLE`** | Slate Gray (`#424242` on `#eeeeee`) | ⚪ Offline Circle `[○]` | Gray border, pinned last-known stop | **"OFFLINE — Vehicle off duty / Shift ended"** |

---

## 2. Screen Specifications & Wireframes

### Screen 1: Public Municipality & Schedule Lookup
- **URL Route:** `/m/:municipalitySlug/schedule`
- **Target Role:** Public / Unauthenticated Citizens.
- **Main Purpose:** Allows residents to select their municipality, ward, and locality to inspect collection days, waste categories, and pickup time windows.
- **Essential Information:**
  - Municipality header with municipal emblem.
  - Locality search box with auto-filtering dropdown.
  - Weekly schedule cards grouped by day of week (Mon, Tue, Wed...).
  - Waste stream badge (`WET BIODEGRADABLE`, `DRY RECYCLABLE`, `HAZARDOUS`).
  - Action link to view assigned collection truck live on map.

```
┌─────────────────────────────────────────────────────────────┐
│ 🏛️ Verdant Hills Municipal Corporation                      │
│ Solid Waste Collection Timetable                            │
├─────────────────────────────────────────────────────────────┤
│ Select Locality: [ Cedar Heights Sector 1                 ▼]│
│ Ward: Ward-04 (North Greens)                                │
├─────────────────────────────────────────────────────────────┤
│ 📅 WEEKLY COLLECTION TIMETABLE                              │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ MONDAY  •  07:00 AM – 09:30 AM                          │ │
│ │ 🟢 WET / BIODEGRADABLE ONLY                             │ │
│ │ Kitchen waste, vegetable peels, food scraps, leaves.    │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ TUESDAY •  07:00 AM – 09:30 AM                          │ │
│ │ 🔵 DRY / RECYCLABLE ONLY                                │ │
│ │ Paper, cardboard, clean plastic bottles, cans, glass.   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [ 🗺️ Track Collection Vehicle on Live Map ]                │
│ [ 📢 Report a Missed Collection Issue ]                     │
└─────────────────────────────────────────────────────────────┘
```

---

### Screen 2: Live Vehicle Tracking View
- **URL Route:** `/m/:municipalitySlug/tracking?locality=:localityId`
- **Target Role:** Public / Authenticated Citizens.
- **Main Purpose:** Displays real-time map location of the collection truck assigned to the selected locality.
- **Essential Information:**
  - Interactive map container (Leaflet with OpenStreetMap tiles).
  - Truck marker with directional arrow heading.
  - Prominent Telemetry Freshness Banner (Icon + Text + Elapsed time).
  - Assigned vehicle details (Truck ID, Waste stream, Driver badge).
  - In demo mode: High-visibility persistent badge: `SIMULATED TELEMETRY — DEMONSTRATION DATA`.

```
┌─────────────────────────────────────────────────────────────┐
│ ⬅ Back to Schedule       Locality: Cedar Heights Sector 1 │
├─────────────────────────────────────────────────────────────┤
│ ⚠️ SIMULATED TELEMETRY — DEMONSTRATION DATA (TEST MODE)     │
├─────────────────────────────────────────────────────────────┤
│ 🟢 [●] STATUS: LIVE — Location updated 14 seconds ago       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     [ - ] Zoom Out                [ + ] Zoom In             │
│                                                             │
│               Main Road                     North Lane      │
│     ══════════════════╦═════════════════════════════        │
│                       ║      🚛 [Truck #04 85°]             │
│                       ║      Speed: 14 km/h                 │
│                       ║                                     │
│                       ║  📍 Your Locality (Cedar Heights)   │
│                       ║                                     │
├─────────────────────────────────────────────────────────────┤
│ Assigned Vehicle: Truck #04 (Wet Waste Compactor)           │
│ Route: North Greens Ward 04 Morning (Stop 4 of 12)          │
│ Expected arrival window: 07:45 AM – 08:15 AM                │
└─────────────────────────────────────────────────────────────┘
```

---

### Screen 3: Citizen Dashboard & Service Accounts
- **URL Route:** `/portal/dashboard`
- **Target Role:** Authenticated Citizen (`Role: CITIZEN`).
- **Main Purpose:** Central hub for linked property accounts, outstanding sanitation fees, payment receipts, and complaint tickets.
- **Essential Information:**
  - List of linked property accounts (Account PIN, Address, Status).
  - Current outstanding balance with breakdown.
  - Quick action: "Pay Bill (Sandbox)", "Lodge Missed Pickup Complaint".
  - Recent receipt history with download link.
  - Active complaint tickets with live progress step indicators.

```
┌─────────────────────────────────────────────────────────────┐
│ 👤 Srujan Doe (Citizen Portal)            [ Log Out ]      │
├─────────────────────────────────────────────────────────────┤
│ 🏠 LINKED SERVICE ACCOUNTS                                  │
│ Account PIN: VH-CON-00104 (Residential)                     │
│ Address: Flat 402, Sea Breeze Apts, Cedar Heights Sector 1  │
│ Outstanding Sanitation Balance: ₹300.00                     │
│ [ 💳 Pay Outstanding Bill (Sandbox) ]                       │
├─────────────────────────────────────────────────────────────┤
│ 📢 ACTIVE SERVICE REQUESTS / COMPLAINTS                     │
│ Ticket: VHMC-2026-CMP-00412 (Missed Collection)             │
│ Status: 🟡 IN INVESTIGATION                                 │
│ [Open] ──► [Assigned] ──► [In Investigation] ──► [Resolved] │
│ Last update: Inspector assigned at 09:10 AM                 │
│ [ View Complaint Details ]                                  │
├─────────────────────────────────────────────────────────────┤
│ 📄 RECENT RECEIPTS                                          │
│ • 18-Oct-2026: ₹300.00 (Online)  [ Download Demo Receipt ]  │
│ • 15-Sep-2026: ₹300.00 (Cash)    [ Download Receipt ]       │
└─────────────────────────────────────────────────────────────┘
```

---

### Screen 4: Missed-Collection Complaint Submission
- **URL Route:** `/portal/complaints/new`
- **Target Role:** Citizens (Authenticated or Unauthenticated with verified phone).
- **Main Purpose:** Allows citizens to report missed pickups, uncollected bins, waste spillage, or driver misconduct.
- **Essential Information:**
  - Locality selector (pre-filled if linked to account).
  - Category dropdown (`Missed Whole Locality`, `Missed Individual House`, `Waste Spillage`, `Rude Collector Behavior`).
  - Detailed description text area (max 500 characters).
  - Optional photo upload (JPG/PNG, max 5MB, EXIF auto-stripped).
  - Submit button with instant ticket ID generation.

```
┌─────────────────────────────────────────────────────────────┐
│ 📢 Report a Solid Waste Collection Issue                    │
├─────────────────────────────────────────────────────────────┤
│ Locality:       [ Cedar Heights Sector 1                  ▼]│
│ Service PIN:    [ VH-CON-00104                             ]│
│ Issue Category: [ Missed Household Bin                    ▼]│
│                                                             │
│ Description:                                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Truck passed by North Lane without stopping at gate.    │ │
│ │ Bins were placed outside at 06:45 AM.                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Optional Photo Evidence (Max 5MB):                          │
│ [ Choose File: bin_photo.jpg ] (EXIF GPS auto-removed)      │
│                                                             │
│ [ 🚀 Submit Complaint ]            [ Cancel ]               │
└─────────────────────────────────────────────────────────────┘
```

---

### Screen 5: Billing & Sandbox Payment View
- **URL Route:** `/portal/bills/:id/pay`
- **Target Role:** Authenticated Citizen (`Role: CITIZEN`).
- **Main Purpose:** Displays invoice breakdown and initiates payment checkout (with sandbox simulation safeguards).
- **Essential Information:**
  - Invoice breakdown: Period, monthly base sanitation charge, arrears, total due.
  - Payment mode selector (Credit/Debit/UPI vs Doorstep Cash notice).
  - Prominent Sandbox Warning Banner: `TEST ENVIRONMENT — NO REAL MONEY WILL BE DEDUCTED`.
  - Simulator dialog offering instant `Simulate Success` or `Simulate Failure` triggers.

```
┌─────────────────────────────────────────────────────────────┐
│ 💳 Sanitation Fee Checkout                                  │
├─────────────────────────────────────────────────────────────┤
│ ⚠️ SANDBOX PAYMENT SIMULATOR — DEMONSTRATION MODE           │
│ No real banking credentials or funds will be processed.    │
├─────────────────────────────────────────────────────────────┤
│ Invoice Number: INV-VHMC-2026-08101                         │
│ Service Account: VH-CON-00104                               │
│ Billing Period: 01-Oct-2026 to 31-Oct-2026                  │
│                                                             │
│ Breakdown:                                                  │
│ • Monthly Solid Waste Management Fee:  ₹300.00              │
│ • Previous Arrears:                      ₹0.00              │
│ ─────────────────────────────────────────────────────────── │
│ Total Payable:                         ₹300.00              │
├─────────────────────────────────────────────────────────────┤
│ [ 🟢 Simulate Successful Payment ]                          │
│ [ 🔴 Simulate Insufficient Funds / Failure ]                │
│ [ Cancel & Return to Dashboard ]                            │
└─────────────────────────────────────────────────────────────┘
```

---

### Screen 6: Field Collector & Driver Mobile Web View
- **URL Route:** `/collector/shift`
- **Target Role:** Authenticated Driver / Collector (`Role: COLLECTOR`).
- **Main Purpose:** Outdoor, high-contrast, touch-optimized field screen for shift management, sequential stop completion, and doorstep cash entry.
- **Essential Information:**
  - Active shift status banner (`IN SHIFT`, `PAUSED`, `ENDED`).
  - GPS heartbeat streaming status indicator (Blinking green dot).
  - Offline sync badge (`All synced` or `3 marks pending sync`).
  - Sequential stop list with oversized tap buttons ($\ge 48\times 48\text{px}$).
  - Doorstep Cash Record modal button with running cash-in-hand total.

```
┌─────────────────────────────────────────────────────────────┐
│ 🚛 DRIVER: Rajesh Kumar (Truck #04)      GPS: 🟢 STREAMING  │
│ Shift: North Greens Morning Beat         Sync: 🟢 UP TO DATE │
├─────────────────────────────────────────────────────────────┤
│ Running Doorstep Cash in Hand: ₹500.00                      │
│ [ 💵 Record Doorstep Cash Collection ]                      │
├─────────────────────────────────────────────────────────────┤
│ STOP ITINERARY (Stop 4 of 12)                               │
│                                                             │
│ 📍 STOP 4: Cedar Heights Sector 1 (Main Gate)               │
│ Expected: 07:45 AM                                          │
│                                                             │
│ [ 🟢 VISITED & COLLECTED ]                                  │
│                                                             │
│ [ 🟡 INACCESSIBLE / BLOCKED ]                               │
│                                                             │
│ [ 🔴 SKIPPED (UNSEGREGATED WASTE) ]                         │
├─────────────────────────────────────────────────────────────┤
│ 📍 STOP 5: Sea Breeze Apartments (Upcoming)                 │
│ 📍 STOP 6: Green Valley School Beat (Upcoming)              │
├─────────────────────────────────────────────────────────────┤
│ [ 🛑 Complete Route & End Shift ]                           │
└─────────────────────────────────────────────────────────────┘
```

---

### Screen 7: Municipal Admin Operations Dashboard
- **URL Route:** `/admin/dashboard`
- **Target Role:** Municipal Administrator (`Role: MUNICIPAL_ADMIN`).
- **Main Purpose:** Operational command center for real-time fleet overview, complaint backlog triage, and financial status.
- **Essential Information:**
  - KPI tiles: Active Vehicles (5/6), Route Completion (78%), Open Complaints (3), Today's Cash Collected (₹1,400).
  - Interactive Fleet Map showing all active vehicles with their freshness status (Green/Amber/Gray).
  - Urgent alert table (unreconciled shifts, complaints breaching SLA $>24\text{ hours}$).

```
┌─────────────────────────────────────────────────────────────┐
│ 🏛️ VHMC Administration Portal              [ Admin: Dr. Rao ]│
├─────────────────────────────────────────────────────────────┤
│ [Fleet & Routes] [Complaints] [Cash Reconciliation] [Audits]│
├─────────────────────────────────────────────────────────────┤
│ TODAY'S OPERATIONAL SUMMARY (18-Oct-2026)                   │
│                                                             │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────┐ │
│ │ACTIVE TRUCKS │ │ROUTE COMPL.% │ │OPEN TICKETS  │ │CASH  │ │
│ │ 5 of 6 On Rd │ │    78.5%     │ │ 3 Open (1 SLA│ │₹1,400│ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────┘ │
├─────────────────────────────────────────────────────────────┤
│ 🗺️ ACTIVE FLEET MAP (All Wards)                             │
│ • Truck #01 (Ward 01): 🟢 LIVE (12s ago) — 82% Completed    │
│ • Truck #04 (Ward 04): 🟢 LIVE (15s ago) — 78% Completed    │
│ • Truck #05 (Ward 02): 🟡 STALE (4m ago) — Signal Delayed   │
│ • Truck #06 (Depot):   ⚪ UNAVAILABLE    — Maintenance      │
├─────────────────────────────────────────────────────────────┤
│ ⚠️ ACTION ITEMS REQUIRING ATTENTION:                        │
│ • Shift #991 (Rajesh Kumar): Shift ended, ₹1,400 cash       │
│   deposited awaiting supervisor reconciliation. [Review]    │
│ • Complaint #CMP-00409: Open for 26 hours in Ward 02.       │
└─────────────────────────────────────────────────────────────┘
```

---

### Screen 8: Cash Handover & Shift Reconciliation Console
- **URL Route:** `/admin/reconciliation`
- **Target Role:** Municipal Administrator / Billing Officer (`Role: MUNICIPAL_ADMIN`).
- **Main Purpose:** Reconciles physical cash handed over by field drivers at shift end against system-recorded doorstep cash entries.
- **Essential Information:**
  - Shift selector with completed driver shifts.
  - Driver summary: Badge, Vehicle, Total doorstep receipts issued, System-recorded cash.
  - Physical cash input field with instant variance computation ($0 variance = green balanced, non-zero = red flagged).
  - Mandatory supervisor notes input for discrepancies.
  - Action button: "Approve & Lock Shift Reconciliation".

```
┌─────────────────────────────────────────────────────────────┐
│ 🏛️ Cash Handover & Shift Reconciliation Console              │
├─────────────────────────────────────────────────────────────┤
│ Select Shift: [ Shift #991 — Rajesh Kumar (Truck #04)     ▼]│
│ Shift Date: 18-Oct-2026 (06:30 AM – 10:30 AM)               │
├─────────────────────────────────────────────────────────────┤
│ SYSTEM RECORDED DOORSTEP CASH:                              │
│ • Receipts Issued: 14 households                            │
│ • Total System Recorded: ₹1,400.00                          │
├─────────────────────────────────────────────────────────────┤
│ PHYSICAL CASH VERIFICATION:                                 │
│ Enter Physical Cash Counted: [ ₹1,400.00                  ] │
│                                                             │
│ Variance Calculation:                                       │
│ 🟢 VARIANCE: ₹0.00 (PERFECTLY BALANCED)                     │
│                                                             │
│ Supervisor Verification Notes:                              │
│ [ Verified in presence of driver; sealed in pouch #14.    ] │
├─────────────────────────────────────────────────────────────┤
│ [ 🔒 Approve & Lock Shift Reconciliation ]                  │
│ (Creates immutable financial audit record)                  │
└─────────────────────────────────────────────────────────────┘
```

---

### Screen 9: Platform Governance & Multi-Tenant Setup
- **URL Route:** `/platform/tenants`
- **Target Role:** Platform Administrator (`Role: PLATFORM_ADMIN`).
- **Main Purpose:** Provisioning new municipality tenants, configuring feature flags, and inspecting system-wide health without touching operational citizen data.
- **Essential Information:**
  - Tenant list with status, tenant ID, slug, and active vehicle count.
  - New Municipality Provisioning form (Name, State, Admin Email, Slug).
  - System health probes (PostgreSQL connection pool, In-memory telemetry cache, Ingress rate).

```
┌─────────────────────────────────────────────────────────────┐
│ 🌐 Central Platform Governance Console     [ Platform Admin]│
├─────────────────────────────────────────────────────────────┤
│ System Status: 🟢 ALL SERVICES HEALTHY (Postgres RLS / Cache)│
├─────────────────────────────────────────────────────────────┤
│ REGISTERED MUNICIPALITIES                                   │
│                                                             │
│ • Verdant Hills Municipal Corp [verdant-hills]              │
│   Status: Active (Demo Mode) | Wards: 3 | Vehicles: 6       │
│                                                             │
│ • Oceanfront Nagar Panchayat   [oceanfront]                 │
│   Status: Active (Demo Mode) | Wards: 2 | Vehicles: 2       │
│                                                             │
│ [ ➕ Provision New Municipality Tenant ]                    │
├─────────────────────────────────────────────────────────────┤
│ PROVISION NEW TENANT (Standard Configuration):              │
│ Name:       [ Riverdale City Council                      ] │
│ Slug:       [ riverdale                                   ] │
│ State:      [ Karnataka                                   ] │
│ Admin Email:[ sanitation@riverdale.gov.in                 ] │
│ [ 💾 Save & Generate Tenant Admin Invitation Link ]         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Comprehensive Screen State Matrix

Every interface is specified to handle all potential runtime states predictably:

| Screen | Loading State | Empty State | Error State | Offline / Disconnected State | Stale Data State | Success State |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Public Schedule** | Skeleton cards with pulsing shimmer. | "No collection schedules published for this locality yet." | "Unable to load schedule. [Retry]" | Shows cached schedule from ServiceWorker. | Not applicable (static catalog). | Displays clean schedule cards. |
| **Live Vehicle Map** | Gray map placeholder with "Locating vehicle...". | "No vehicle dispatched on route for this locality today." | "Map tiles unavailable. Showing text status." | "Network disconnected. Tracking paused." | Amber badge: "Signal delayed — last seen X mins ago". | Green pulsing marker with live heading. |
| **Citizen Bills** | Shimmer rows for bills and balance. | "All sanitation bills are fully paid. Balance: ₹0.00." | "Failed to load invoices. [Retry]" | "Offline: Showing last loaded balance." | Not applicable. | Invoices listed with clear pay buttons. |
| **Driver Shift** | Loading itinerary spinner. | "No stops assigned to your route today." | "Failed to submit stop. Retrying..." | Amber indicator: "Offline mode. Marks saved to device." | Not applicable. | Green checkmark animation on stop card. |
| **Complaint Track** | Skeleton ticket timeline. | "Ticket not found. Check your ticket number." | "Server error retrieving ticket. [Retry]" | Shows cached ticket status if previously viewed. | "Ticket updated 2 hours ago." | Complete audited step progression. |
| **Cash Reconcile** | Shimmer calculation box. | "No shifts currently awaiting cash reconciliation." | "Validation failed: Deposit amount must be numeric." | "Action blocked: Reconciliations require active connection." | Not applicable. | Green banner: "Shift #991 locked & balanced." |

---
*End of Phase 2 UI/UX Specification.*
