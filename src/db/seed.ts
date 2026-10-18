import { migrationPool } from './pool';
import { AuthService } from '../services/auth.service';
import { TrackingService } from '../services/tracking.service';

/**
 * Synthetic Demo Data Seeder for Development & Staging Validation
 * STRICT COMPLIANCE:
 * - All records are purely fictional test fixtures (Verdant Hills & Oceanfront Nagar Panchayat).
 * - All tenant records have is_demo = TRUE.
 * - Doorstep cash accounts are marked inactive (is_active = FALSE).
 * - Tax rates are set to NULL with explicit UNCONFIRMED_PENDING_TAX_AUTHORITY_REVIEW notes.
 * - Demo passwords use standard development hashes, never production credentials.
 */
export async function seedDemoData(): Promise<void> {
  const client = await migrationPool.connect();

  try {
    console.log('Seeding synthetic demo datasets for Verdant Hills & Oceanfront Nagar Panchayat...');
    await client.query('BEGIN');

    // 1. Roles Check
    const { rows: roles } = await client.query('SELECT id, role_name FROM user_roles');
    const roleMap = new Map<string, string>();
    roles.forEach((r) => roleMap.set(r.role_name, r.id));

    // 2. Demo Password Hash
    const demoPasswordHash = await AuthService.hashPassword('DemoPass@2026!');

    // 3. Insert Demo Users (Fictional test accounts)
    const usersData = [
      { mobile: '+919876543210', name: 'Aarav Sharma (Demo Admin)', email: 'aarav.demo@example.com' },
      { mobile: '+919876543211', name: 'Vikram Singh (Demo Supervisor)', email: 'vikram.demo@example.com' },
      { mobile: '+919876543212', name: 'Ramesh Kumar (Demo Staff)', email: 'ramesh.demo@example.com' },
      { mobile: '+919876543213', name: 'Sunita Patel (Demo Citizen)', email: 'sunita.demo@example.com' },
      { mobile: '+919876543214', name: 'Ananya Roy (Demo Citizen ONP)', email: 'ananya.demo@example.com' },
    ];

    const userMap = new Map<string, string>();
    for (const u of usersData) {
      const { rows } = await client.query(
        `INSERT INTO users (mobile_number, password_hash, full_name, email, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (mobile_number) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [u.mobile, demoPasswordHash, u.name, u.email]
      );
      userMap.set(u.mobile, rows[0].id);
    }

    // 4. Tenant 1: Verdant Hills Municipal Council (VHMC)
    const { rows: t1Rows } = await client.query(
      `INSERT INTO tenants (name, slug, is_active, is_demo)
       VALUES ('Verdant Hills Municipal Council (Demo)', 'verdant-hills', TRUE, TRUE)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_demo = TRUE
       RETURNING id`
    );
    const vhmcTenantId = t1Rows[0].id;

    // Set transaction-local tenant context for Tenant 1
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [vhmcTenantId]);

    // Tenant 1 Municipality
    await client.query(
      `INSERT INTO municipalities (
        tenant_id, official_name, state_or_ut, classification, contact_email, contact_phone, 
        center_latitude, center_longitude, is_demo
       ) VALUES ($1, 'Verdant Hills Municipal Council', 'State of Fictional Demo', 'MUNICIPAL_COUNCIL', 'contact@verdant-hills.demo.local', '+919876543210', 18.5204000, 73.8567000, TRUE)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [vhmcTenantId]
    );

    // Tenant 1 Memberships
    const vhmcMemberships = [
      { userId: userMap.get('+919876543210')!, role: 'MUNICIPAL_ADMIN' },
      { userId: userMap.get('+919876543211')!, role: 'FIELD_SUPERVISOR' },
      { userId: userMap.get('+919876543212')!, role: 'COLLECTION_STAFF' },
      { userId: userMap.get('+919876543213')!, role: 'CITIZEN' },
    ];
    for (const m of vhmcMemberships) {
      await client.query(
        `INSERT INTO user_tenant_memberships (user_id, tenant_id, role_id, is_active, is_demo)
         VALUES ($1, $2, $3, TRUE, TRUE)
         ON CONFLICT (user_id, tenant_id) DO NOTHING`,
        [m.userId, vhmcTenantId, roleMap.get(m.role)]
      );
    }

    // Tenant 1 Wards
    const { rows: w1Rows } = await client.query(
      `INSERT INTO wards (tenant_id, ward_number, ward_name, center_latitude, center_longitude, is_demo)
       VALUES ($1, 'WARD-01', 'Highland Ridge (Fictional)', 18.5210000, 73.8570000, TRUE)
       ON CONFLICT (tenant_id, ward_number) DO UPDATE SET ward_name = EXCLUDED.ward_name
       RETURNING id`,
      [vhmcTenantId]
    );
    const ward1Id = w1Rows[0].id;

    const { rows: w2Rows } = await client.query(
      `INSERT INTO wards (tenant_id, ward_number, ward_name, center_latitude, center_longitude, is_demo)
       VALUES ($1, 'WARD-02', 'Valley View (Fictional)', 18.5190000, 73.8550000, TRUE)
       ON CONFLICT (tenant_id, ward_number) DO UPDATE SET ward_name = EXCLUDED.ward_name
       RETURNING id`,
      [vhmcTenantId]
    );
    const ward2Id = w2Rows[0].id;

    // Tenant 1 Localities
    const { rows: l1Rows } = await client.query(
      `INSERT INTO localities (tenant_id, ward_id, locality_name, center_latitude, center_longitude, is_demo)
       VALUES ($1, $2, 'Pine Grove (Fictional)', 18.5215000, 73.8575000, TRUE)
       ON CONFLICT (ward_id, locality_name) DO UPDATE SET locality_name = EXCLUDED.locality_name
       RETURNING id`,
      [vhmcTenantId, ward1Id]
    );
    const loc1Id = l1Rows[0].id;

    await client.query(
      `INSERT INTO localities (tenant_id, ward_id, locality_name, center_latitude, center_longitude, is_demo)
       VALUES ($1, $2, 'Cedar Heights (Fictional)', 18.5205000, 73.8565000, TRUE)
       ON CONFLICT (ward_id, locality_name) DO NOTHING`,
      [vhmcTenantId, ward1Id]
    );

    // Tenant 1 Assessment Rates (Fictional Tariffs)
    await client.query(
      `INSERT INTO assessment_rates (
        tenant_id, property_type, billing_frequency, base_fee_minor_units, tax_rate_basis_points, 
        tax_status_note, effective_from, is_active, is_demo
       ) VALUES 
        ($1, 'RESIDENTIAL', 'MONTHLY', 15000, NULL, 'UNCONFIRMED_PENDING_TAX_AUTHORITY_REVIEW', '2026-01-01', TRUE, TRUE),
        ($1, 'COMMERCIAL', 'MONTHLY', 50000, NULL, 'UNCONFIRMED_PENDING_TAX_AUTHORITY_REVIEW', '2026-01-01', TRUE, TRUE)`,
      [vhmcTenantId]
    );

    // Tenant 1 Chart of Accounts
    const coaData = [
      { code: '1020', name: 'Bank Operating Account - SBI', type: 'ASSET', balance: 'DEBIT', active: true },
      { code: '1030', name: 'Payment Gateway Clearing Account', type: 'ASSET', balance: 'DEBIT', active: true },
      { code: '1040', name: 'Citizen Accounts Receivable', type: 'ASSET', balance: 'DEBIT', active: true },
      { code: '1010', name: 'Doorstep Cash in Hand (Deactivated for Pilot)', type: 'ASSET', balance: 'DEBIT', active: false },
      { code: '2010', name: 'Citizen Advance Deposits', type: 'LIABILITY', balance: 'CREDIT', active: true },
      { code: '3010', name: 'Municipal Operating Fund Balance', type: 'EQUITY', balance: 'CREDIT', active: true },
      { code: '4010', name: 'Residential Waste Collection Fees', type: 'REVENUE', balance: 'CREDIT', active: true },
      { code: '4020', name: 'Commercial Waste Collection Fees', type: 'REVENUE', balance: 'CREDIT', active: true },
      { code: '5010', name: 'Payment Gateway Processing Charges', type: 'EXPENSE', balance: 'DEBIT', active: true },
    ];

    const coaMap = new Map<string, string>();
    for (const a of coaData) {
      const { rows } = await client.query(
        `INSERT INTO chart_of_accounts (tenant_id, account_code, account_name, account_type, normal_balance, is_active, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT (tenant_id, account_code) DO UPDATE SET account_name = EXCLUDED.account_name
         RETURNING id`,
        [vhmcTenantId, a.code, a.name, a.type, a.balance, a.active]
      );
      coaMap.set(a.code, rows[0].id);
    }

    // Tenant 1 Properties
    const { rows: propRows } = await client.query(
      `INSERT INTO properties (
        tenant_id, locality_id, citizen_user_id, property_identifier, property_type, address_line, is_active, is_demo
       ) VALUES 
        ($1, $2, $3, 'PROP-VHMC-2026-001', 'RESIDENTIAL', 'Flat 402, Pine Crest Apartments, Pine Grove', TRUE, TRUE),
        ($1, $2, NULL, 'PROP-VHMC-2026-002', 'COMMERCIAL', 'Shop 12, Main Market, Pine Grove', TRUE, TRUE)
       ON CONFLICT (tenant_id, property_identifier) DO UPDATE SET address_line = EXCLUDED.address_line
       RETURNING id, property_identifier`,
      [vhmcTenantId, loc1Id, userMap.get('+919876543213')]
    );
    const vhmcProp1Id = propRows.find((p) => p.property_identifier === 'PROP-VHMC-2026-001')?.id;

    // Tenant 1 Balanced Posted Journal Entry (Monthly Billing Event)
    const { rows: jeRows } = await client.query(
      `INSERT INTO journal_entries (
        tenant_id, entry_number, posting_date, status, business_event_type, business_event_id, 
        currency, description, created_by_user_id, is_demo
       ) VALUES ($1, 'JE-VHMC-2026-001', '2026-03-01', 'DRAFT', 'MONTHLY_BILLING_RUN', 'BILL-VHMC-2026-03', 'INR', 'March 2026 Residential Waste Assessment Billing', $2, TRUE)
       ON CONFLICT (tenant_id, business_event_type, business_event_id) DO NOTHING
       RETURNING id`,
      [vhmcTenantId, userMap.get('+919876543210')]
    );

    if (jeRows.length > 0) {
      const jeId = jeRows[0].id;
      // Line 1: Debit Accounts Receivable (15000 paise)
      await client.query(
        `INSERT INTO journal_entry_lines (journal_entry_id, tenant_id, line_number, account_id, entry_type, amount_minor_units, currency, memo, is_demo)
         VALUES ($1, $2, 1, $3, 'DEBIT', 15000, 'INR', 'Assessment fee receivable for Sunita Patel', TRUE)
         ON CONFLICT (journal_entry_id, line_number) DO NOTHING`,
        [jeId, vhmcTenantId, coaMap.get('1040')]
      );
      // Line 2: Credit Residential Waste Fee Revenue (15000 paise)
      await client.query(
        `INSERT INTO journal_entry_lines (journal_entry_id, tenant_id, line_number, account_id, entry_type, amount_minor_units, currency, memo, is_demo)
         VALUES ($1, $2, 2, $3, 'CREDIT', 15000, 'INR', 'Earned fee revenue for March 2026', TRUE)
         ON CONFLICT (journal_entry_id, line_number) DO NOTHING`,
        [jeId, vhmcTenantId, coaMap.get('4010')]
      );
      // Transition to POSTED (validating database triggers)
      await client.query(
        `UPDATE journal_entries SET status = 'POSTED', posted_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [jeId]
      );
    }

    // Tenant 1 Bills & Synthetic Payment Order
    if (vhmcProp1Id) {
      const { rows: billRows } = await client.query(
        `INSERT INTO bills (
          tenant_id, property_id, citizen_user_id, bill_number, billing_period_start, billing_period_end,
          amount_due_minor_units, amount_paid_minor_units, status, due_date, is_demo
         ) VALUES ($1, $2, $3, 'BILL-VHMC-2026-03', '2026-03-01', '2026-03-31', 15000, 0, 'UNPAID', '2026-04-15', TRUE)
         ON CONFLICT (tenant_id, bill_number) DO UPDATE SET amount_due_minor_units = EXCLUDED.amount_due_minor_units
         RETURNING id`,
        [vhmcTenantId, vhmcProp1Id, userMap.get('+919876543213')]
      );
      const vhmcBill1Id = billRows[0]?.id;

      if (vhmcBill1Id) {
        await client.query(
          `INSERT INTO payment_transactions (
            tenant_id, bill_id, property_id, citizen_user_id, payment_method, amount_minor_units,
            currency, status, gateway_provider, gateway_order_id, receipt_number, idempotency_key, is_demo
           ) VALUES (
            $1, $2, $3, $4, 'ONLINE_GATEWAY', 15000, 'INR', 'PENDING', 'MOCK_GATEWAY', 'order_mock_seed_vhmc_001',
            'REC-VHMC-2026-0001', 'seed-vhmc-tx-001', TRUE
           )
           ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
          [vhmcTenantId, vhmcBill1Id, vhmcProp1Id, userMap.get('+919876543213')]
        );
      }
    }

    // Tenant 1 Vehicles (Fleet master data)
    const { rows: v1Rows } = await client.query(
      `INSERT INTO vehicles (tenant_id, registration_number, vehicle_label, vehicle_type, capacity_metric_tonnes, operational_status, is_active, is_demo)
       VALUES ($1, 'MH-12-VH-2026-01', 'Tipper Truck #01 (Pine Grove Route)', 'TIPPER', 2.50, 'ACTIVE', TRUE, TRUE)
       ON CONFLICT (tenant_id, registration_number) DO UPDATE SET vehicle_label = EXCLUDED.vehicle_label
       RETURNING id`,
      [vhmcTenantId]
    );
    const vhmcTruck1Id = v1Rows[0].id;

    const { rows: v2Rows } = await client.query(
      `INSERT INTO vehicles (tenant_id, registration_number, vehicle_label, vehicle_type, capacity_metric_tonnes, operational_status, is_active, is_demo)
       VALUES ($1, 'MH-12-VH-2026-02', 'Compactor Truck #02 (Valley View Route)', 'COMPACTOR', 5.00, 'ACTIVE', TRUE, TRUE)
       ON CONFLICT (tenant_id, registration_number) DO UPDATE SET vehicle_label = EXCLUDED.vehicle_label
       RETURNING id`,
      [vhmcTenantId]
    );
    const vhmcTruck2Id = v2Rows[0].id;

    const { rows: v3Rows } = await client.query(
      `INSERT INTO vehicles (tenant_id, registration_number, vehicle_label, vehicle_type, capacity_metric_tonnes, operational_status, is_active, is_demo)
       VALUES ($1, 'MH-12-VH-2026-03', 'Tipper Truck #03 (Maintenance Reserve)', 'TIPPER', 2.50, 'MAINTENANCE', FALSE, TRUE)
       ON CONFLICT (tenant_id, registration_number) DO NOTHING
       RETURNING id`,
      [vhmcTenantId]
    );
    const vhmcTruck3Id = v3Rows.length > 0 ? v3Rows[0].id : null;

    // Tenant 1 Tracking Devices & Credentials
    const dev1Token = 'dev_vhmc01_s3cr3tvhmc01token';
    const dev1Hash = TrackingService.hashToken(dev1Token);
    const { rows: dev1Rows } = await client.query(
      `INSERT INTO tracking_devices (tenant_id, vehicle_id, device_serial, key_prefix, token_hash, status, is_demo)
       VALUES ($1, $2, 'DEV-VHMC-SN-001', 'dev_vhmc01', $3, 'ACTIVE', TRUE)
       ON CONFLICT (tenant_id, vehicle_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, status = 'ACTIVE'
       RETURNING id`,
      [vhmcTenantId, vhmcTruck1Id, dev1Hash]
    );
    const dev1Id = dev1Rows[0].id;

    const dev2Token = 'dev_vhmc02_s3cr3tvhmc02token';
    const dev2Hash = TrackingService.hashToken(dev2Token);
    const { rows: dev2Rows } = await client.query(
      `INSERT INTO tracking_devices (tenant_id, vehicle_id, device_serial, key_prefix, token_hash, status, is_demo)
       VALUES ($1, $2, 'DEV-VHMC-SN-002', 'dev_vhmc02', $3, 'ACTIVE', TRUE)
       ON CONFLICT (tenant_id, vehicle_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, status = 'ACTIVE'
       RETURNING id`,
      [vhmcTenantId, vhmcTruck2Id, dev2Hash]
    );
    const dev2Id = dev2Rows[0].id;

    if (vhmcTruck3Id) {
      const dev3Token = 'dev_vhmc03_rev_s3cr3trevokedtoken';
      const dev3Hash = TrackingService.hashToken(dev3Token);
      await client.query(
        `INSERT INTO tracking_devices (tenant_id, vehicle_id, device_serial, key_prefix, token_hash, status, is_demo)
         VALUES ($1, $2, 'DEV-VHMC-SN-003', 'dev_vhmc03_rev', $3, 'REVOKED', TRUE)
         ON CONFLICT (tenant_id, vehicle_id) DO UPDATE SET status = 'REVOKED'`,
        [vhmcTenantId, vhmcTruck3Id, dev3Hash]
      );
    }

    // Tenant 1 Vehicle Shifts
    // Shift 1: ACTIVE shift on Pine Grove locality
    const { rows: s1Rows } = await client.query(
      `INSERT INTO vehicle_shifts (tenant_id, vehicle_id, driver_user_id, locality_id, shift_date, shift_status, start_time, is_demo)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, 'ACTIVE', CURRENT_TIMESTAMP - INTERVAL '2 hours', TRUE)
       RETURNING id`,
      [vhmcTenantId, vhmcTruck1Id, userMap.get('+919876543212'), loc1Id]
    );
    const shift1Id = s1Rows[0].id;

    // Shift 2: COMPLETED shift (ended 1 hour ago)
    const { rows: s2Rows } = await client.query(
      `INSERT INTO vehicle_shifts (tenant_id, vehicle_id, driver_user_id, locality_id, shift_date, shift_status, start_time, end_time, is_demo)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, 'COMPLETED', CURRENT_TIMESTAMP - INTERVAL '6 hours', CURRENT_TIMESTAMP - INTERVAL '1 hour', TRUE)
       RETURNING id`,
      [vhmcTenantId, vhmcTruck2Id, userMap.get('+919876543212'), loc1Id]
    );
    const shift2Id = s2Rows[0].id;

    // Tenant 1 Latest Vehicle Positions & Historical Logs
    // Position 1: Current (15s ago, Pine Grove)
    await client.query(
      `INSERT INTO latest_vehicle_positions (
        vehicle_id, tenant_id, device_id, shift_id, latitude, longitude, speed_kmh, heading_degrees,
        last_recorded_at, freshness_status, is_demo, updated_at
       ) VALUES ($1, $2, $3, $4, 18.5215000, 73.8575000, 14.50, 85.00, CURRENT_TIMESTAMP - INTERVAL '15 seconds', 'CURRENT', TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (vehicle_id) DO UPDATE SET
        shift_id = EXCLUDED.shift_id,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        speed_kmh = EXCLUDED.speed_kmh,
        heading_degrees = EXCLUDED.heading_degrees,
        last_recorded_at = EXCLUDED.last_recorded_at,
        freshness_status = 'CURRENT',
        updated_at = CURRENT_TIMESTAMP`,
      [vhmcTruck1Id, vhmcTenantId, dev1Id, shift1Id]
    );

    await client.query(
      `INSERT INTO vehicle_telemetry_logs (
        tenant_id, vehicle_id, device_id, shift_id, latitude, longitude, speed_kmh, heading_degrees, event_timestamp, validation_status, is_demo
       ) VALUES ($1, $2, $3, $4, 18.5215000, 73.8575000, 14.50, 85.00, CURRENT_TIMESTAMP - INTERVAL '15 seconds', 'ACCEPTED', TRUE)`,
      [vhmcTenantId, vhmcTruck1Id, dev1Id, shift1Id]
    );

    // Position 2: Shift Ended -> Forced UNAVAILABLE
    await client.query(
      `INSERT INTO latest_vehicle_positions (
        vehicle_id, tenant_id, device_id, shift_id, latitude, longitude, speed_kmh, heading_degrees,
        last_recorded_at, freshness_status, is_demo, updated_at
       ) VALUES ($1, $2, $3, $4, 18.5205000, 73.8565000, 0.00, 0.00, CURRENT_TIMESTAMP - INTERVAL '30 seconds', 'UNAVAILABLE', TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (vehicle_id) DO UPDATE SET
        shift_id = EXCLUDED.shift_id,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        freshness_status = 'UNAVAILABLE',
        updated_at = CURRENT_TIMESTAMP`,
      [vhmcTruck2Id, vhmcTenantId, dev2Id, shift2Id]
    );

    // 5. Tenant 2: Oceanfront Nagar Panchayat (ONP)
    const { rows: t2Rows } = await client.query(
      `INSERT INTO tenants (name, slug, is_active, is_demo)
       VALUES ('Oceanfront Nagar Panchayat (Demo)', 'oceanfront-np', TRUE, TRUE)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_demo = TRUE
       RETURNING id`
    );
    const onpTenantId = t2Rows[0].id;

    // Switch transaction-local tenant context for Tenant 2
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [onpTenantId]);

    await client.query(
      `INSERT INTO municipalities (
        tenant_id, official_name, state_or_ut, classification, contact_email, contact_phone, 
        center_latitude, center_longitude, is_demo
       ) VALUES ($1, 'Oceanfront Nagar Panchayat', 'State of Fictional Demo', 'NAGAR_PANCHAYAT', 'contact@oceanfront-np.demo.local', '+919876543214', 15.4989000, 73.8278000, TRUE)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [onpTenantId]
    );

    // Tenant 2 Citizen Membership
    await client.query(
      `INSERT INTO user_tenant_memberships (user_id, tenant_id, role_id, is_active, is_demo)
       VALUES ($1, $2, $3, TRUE, TRUE)
       ON CONFLICT (user_id, tenant_id) DO NOTHING`,
      [userMap.get('+919876543214'), onpTenantId, roleMap.get('CITIZEN')]
    );

    // Tenant 2 Wards
    const { rows: onpW1Rows } = await client.query(
      `INSERT INTO wards (tenant_id, ward_number, ward_name, center_latitude, center_longitude, is_demo)
       VALUES ($1, 'WARD-01', 'Coastline Ward (Fictional)', 15.4990000, 73.8280000, TRUE)
       ON CONFLICT (tenant_id, ward_number) DO UPDATE SET ward_name = EXCLUDED.ward_name
       RETURNING id`,
      [onpTenantId]
    );
    const onpWard1Id = onpW1Rows[0].id;

    // Tenant 2 Localities
    const { rows: onpL1Rows } = await client.query(
      `INSERT INTO localities (tenant_id, ward_id, locality_name, center_latitude, center_longitude, is_demo)
       VALUES ($1, $2, 'Seaside Promenade (Fictional)', 15.4995000, 73.8285000, TRUE)
       ON CONFLICT (ward_id, locality_name) DO UPDATE SET locality_name = EXCLUDED.locality_name
       RETURNING id`,
      [onpTenantId, onpWard1Id]
    );
    const onpLoc1Id = onpL1Rows[0].id;

    // Tenant 2 Assessment Rates
    await client.query(
      `INSERT INTO assessment_rates (
        tenant_id, property_type, billing_frequency, base_fee_minor_units, tax_rate_basis_points, 
        tax_status_note, effective_from, is_active, is_demo
       ) VALUES 
        ($1, 'RESIDENTIAL', 'MONTHLY', 12000, NULL, 'UNCONFIRMED_PENDING_TAX_AUTHORITY_REVIEW', '2026-01-01', TRUE, TRUE),
        ($1, 'COMMERCIAL', 'MONTHLY', 40000, NULL, 'UNCONFIRMED_PENDING_TAX_AUTHORITY_REVIEW', '2026-01-01', TRUE, TRUE)`,
      [onpTenantId]
    );

    // Tenant 2 Chart of Accounts
    for (const a of coaData) {
      await client.query(
        `INSERT INTO chart_of_accounts (tenant_id, account_code, account_name, account_type, normal_balance, is_active, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT (tenant_id, account_code) DO UPDATE SET account_name = EXCLUDED.account_name`,
        [onpTenantId, a.code, a.name, a.type, a.balance, a.active]
      );
    }

    // Tenant 2 Properties
    const { rows: onpPropRows } = await client.query(
      `INSERT INTO properties (
        tenant_id, locality_id, citizen_user_id, property_identifier, property_type, address_line, is_active, is_demo
       ) VALUES 
        ($1, $2, $3, 'PROP-ONP-2026-001', 'RESIDENTIAL', 'Villa 5, Seaside Promenade', TRUE, TRUE)
       ON CONFLICT (tenant_id, property_identifier) DO UPDATE SET address_line = EXCLUDED.address_line
       RETURNING id`,
      [onpTenantId, onpLoc1Id, userMap.get('+919876543214')]
    );
    const onpProp1Id = onpPropRows[0]?.id;

    if (onpProp1Id) {
      await client.query(
        `INSERT INTO bills (
          tenant_id, property_id, citizen_user_id, bill_number, billing_period_start, billing_period_end,
          amount_due_minor_units, amount_paid_minor_units, status, due_date, is_demo
         ) VALUES ($1, $2, $3, 'BILL-ONP-2026-03', '2026-03-01', '2026-03-31', 12000, 0, 'UNPAID', '2026-04-15', TRUE)
         ON CONFLICT (tenant_id, bill_number) DO NOTHING`,
        [onpTenantId, onpProp1Id, userMap.get('+919876543214')]
      );
    }

    // Tenant 2 Vehicles (Fleet master data)
    const { rows: onpV1Rows } = await client.query(
      `INSERT INTO vehicles (tenant_id, registration_number, vehicle_label, vehicle_type, capacity_metric_tonnes, operational_status, is_active, is_demo)
       VALUES ($1, 'GA-01-ONP-2026-01', 'Coastal Tipper #01 (Seaside Route)', 'TIPPER', 2.00, 'ACTIVE', TRUE, TRUE)
       ON CONFLICT (tenant_id, registration_number) DO UPDATE SET vehicle_label = EXCLUDED.vehicle_label
       RETURNING id`,
      [onpTenantId]
    );
    const onpTruck1Id = onpV1Rows[0].id;

    // Tenant 2 Tracking Devices
    const onpDevToken = 'dev_onp01_s3cr3tonp01token';
    const onpDevHash = TrackingService.hashToken(onpDevToken);
    const { rows: onpDevRows } = await client.query(
      `INSERT INTO tracking_devices (tenant_id, vehicle_id, device_serial, key_prefix, token_hash, status, is_demo)
       VALUES ($1, $2, 'DEV-ONP-SN-001', 'dev_onp01', $3, 'ACTIVE', TRUE)
       ON CONFLICT (tenant_id, vehicle_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, status = 'ACTIVE'
       RETURNING id`,
      [onpTenantId, onpTruck1Id, onpDevHash]
    );
    const onpDevId = onpDevRows[0].id;

    // Tenant 2 Shifts (ACTIVE shift on Seaside Promenade)
    const { rows: onpS1Rows } = await client.query(
      `INSERT INTO vehicle_shifts (tenant_id, vehicle_id, driver_user_id, locality_id, shift_date, shift_status, start_time, is_demo)
       VALUES ($1, $2, NULL, $3, CURRENT_DATE, 'ACTIVE', CURRENT_TIMESTAMP - INTERVAL '1 hour', TRUE)
       RETURNING id`,
      [onpTenantId, onpTruck1Id, onpLoc1Id]
    );
    const onpShift1Id = onpS1Rows[0].id;

    // Tenant 2 Position: Stale (180s ago -> between 61s and 300s -> STALE)
    await client.query(
      `INSERT INTO latest_vehicle_positions (
        vehicle_id, tenant_id, device_id, shift_id, latitude, longitude, speed_kmh, heading_degrees,
        last_recorded_at, freshness_status, is_demo, updated_at
       ) VALUES ($1, $2, $3, $4, 15.4995000, 73.8285000, 12.00, 180.00, CURRENT_TIMESTAMP - INTERVAL '180 seconds', 'STALE', TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (vehicle_id) DO UPDATE SET
        shift_id = EXCLUDED.shift_id,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        speed_kmh = EXCLUDED.speed_kmh,
        heading_degrees = EXCLUDED.heading_degrees,
        last_recorded_at = EXCLUDED.last_recorded_at,
        freshness_status = 'STALE',
        updated_at = CURRENT_TIMESTAMP`,
      [onpTruck1Id, onpTenantId, onpDevId, onpShift1Id]
    );

    // Clear tenant context before commit
    await client.query(`SELECT set_config('app.current_tenant_id', '', true)`);

    await client.query('COMMIT');
    console.log('Synthetic demo data successfully seeded!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
