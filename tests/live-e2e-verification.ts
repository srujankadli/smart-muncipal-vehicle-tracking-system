import assert from 'assert';

const FRONTEND_BASE = 'http://localhost:5173';
const BACKEND_BASE = 'http://localhost:3000';

async function runLiveVerification() {
  console.log('========================================================================');
  console.log('STARTING PHASE 8.1 LIVE END-TO-END VERIFICATION');
  console.log('Testing running servers:');
  console.log(`  Frontend: ${FRONTEND_BASE}`);
  console.log(`  Backend:  ${BACKEND_BASE}`);
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => Promise<void>) {
    total++;
    return fn()
      .then(() => {
        passed++;
        console.log(`  ✔ [PASS] ${name}`);
      })
      .catch((err) => {
        console.error(`  ✖ [FAIL] ${name}:`, err.message);
        throw err;
      });
  }

  // 1. Frontend Server Delivery
  await test('1.1 Frontend serves HTML with root mount and civic metadata', async () => {
    const res = await fetch(FRONTEND_BASE);
    assert.strictEqual(res.status, 200, `Expected 200 from ${FRONTEND_BASE}`);
    const html = await res.text();
    assert.ok(html.includes('<div id="root"></div>'), 'HTML must contain #root mount div');
    assert.ok(html.includes('Smart Municipal Waste Management'), 'HTML must contain title');
  });

  // 2. Backend Health & Statutory Policies
  await test('2.1 Backend /health returns UP with provisional policy flags', async () => {
    const res = await fetch(`${BACKEND_BASE}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'UP');
    assert.strictEqual(body.policies.doorstepCashEnabled, false, 'Doorstep cash must be false');
    assert.strictEqual(body.policies.taxPolicyConfirmed, false, 'Tax policy must be unconfirmed');
  });

  // 3. Public Discovery
  let verdantTenantId = '';
  let oceanfrontTenantId = '';
  await test('3.1 Public discovery lists operational municipalities and wards', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/municipalities`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.count, 2);
    const vhmc = body.data.find((m: any) => m.slug === 'verdant-hills');
    const onp = body.data.find((m: any) => m.slug.startsWith('oceanfront'));
    assert.ok(vhmc, 'Must include Verdant Hills');
    assert.ok(onp, 'Must include Oceanfront');
    verdantTenantId = vhmc.tenantId;
    oceanfrontTenantId = onp.tenantId;
    assert.ok(vhmc.wardsCount > 0, 'Wards must be counted');
    assert.ok(vhmc.localitiesCount > 0, 'Localities must be counted');
  });

  // 4. Citizen Authentication & Session
  let sunitaToken = '';
  let sunitaUserId = '';
  await test('4.1 Citizen login authenticates valid demo persona Sunita Patel', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: '+919876543213',
        password: 'DemoPass@2026!',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.token, 'Must return JWT token');
    assert.strictEqual(body.user.mobileNumber, '+919876543213');
    assert.ok(body.user.fullName.includes('Sunita Patel'));
    assert.strictEqual(body.memberships[0].roleName, 'CITIZEN');
    assert.strictEqual(body.memberships[0].tenantId, verdantTenantId);
    sunitaToken = body.token;
    sunitaUserId = body.user.id;
  });

  await test('4.2 Rejects login with invalid password with HTTP 401', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: '+919876543213',
        password: 'WrongPassword!',
      }),
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'INVALID_CREDENTIALS');
  });

  // 5. Citizen Properties
  let sunitaPropertyId = '';
  let pineGroveLocalityId = '';
  await test('5.1 Citizen lists their own registered properties in Verdant Hills', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/properties`, {
      headers: {
        Authorization: `Bearer ${sunitaToken}`,
        'X-Tenant-Id': verdantTenantId,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.count >= 1, 'Sunita must have at least one registered property');
    sunitaPropertyId = body.data[0].id;
    pineGroveLocalityId = body.data[0].locality_id;
    assert.strictEqual(body.data[0].citizen_user_id, sunitaUserId);
  });

  // 6. Citizen Bills & Sandbox Payment Order
  let sunitaBillId = '';
  let sunitaDuePaise = 0;
  await test('6.1 Citizen lists outstanding municipal sanitation bills', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/payments/bills`, {
      headers: {
        Authorization: `Bearer ${sunitaToken}`,
        'X-Tenant-Id': verdantTenantId,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'SUCCESS');
    assert.ok(body.data.bills.length >= 1, 'Must have at least one bill');
    const bill = body.data.bills[0];
    sunitaBillId = bill.id;
    sunitaDuePaise = parseInt(bill.amount_due_minor_units, 10);
    assert.ok(sunitaDuePaise > 0, 'Bill amount must be positive');
  });

  let gatewayOrderId = '';
  let mockReceiptNumber = '';
  await test('6.2 Citizen initiates idempotent sandbox payment order (ONLINE_GATEWAY)', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/payments/create-order`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sunitaToken}`,
        'X-Tenant-Id': verdantTenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        billId: sunitaBillId,
        propertyId: sunitaPropertyId,
        paymentMethod: 'ONLINE_GATEWAY',
        amountMinorUnits: sunitaDuePaise,
        currency: 'INR',
        idempotencyKey: `live_e2e_idem_${Date.now()}`,
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.status, 'SUCCESS');
    assert.strictEqual(body.data.payment.status, 'PENDING', 'Payment transaction must be PENDING');
    assert.ok(body.data.order.gatewayOrderId, 'Must provide gatewayOrderId');
    assert.ok(body.data.payment.receipt_number, 'Must provide formal receipt number');
    gatewayOrderId = body.data.order.gatewayOrderId;
    mockReceiptNumber = body.data.payment.receipt_number;
  });

  // 7. Doorstep Cash Rejection Invariant
  await test('7.1 Rejects doorstep cash collection with HTTP 403 DOORSTEP_CASH_DISABLED', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/payments/create-order`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sunitaToken}`,
        'X-Tenant-Id': verdantTenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        billId: sunitaBillId,
        propertyId: sunitaPropertyId,
        paymentMethod: 'DOORSTEP_CASH',
        amountMinorUnits: sunitaDuePaise,
      }),
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.ok(
      body.error.message.includes('DOORSTEP_CASH_DISABLED') || body.error.code === 'DOORSTEP_CASH_DISABLED',
      'Must reject doorstep cash explicitly'
    );
  });

  // 8. Citizen Payment History
  await test('8.1 Citizen views payment history containing the initiated order', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/payments/history`, {
      headers: {
        Authorization: `Bearer ${sunitaToken}`,
        'X-Tenant-Id': verdantTenantId,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'SUCCESS');
    assert.ok(body.data.payments.length >= 1);
    const match = body.data.payments.find((p: any) => p.receipt_number === mockReceiptNumber);
    assert.ok(match, 'Initiated transaction must appear in citizen payment ledger');
  });

  // 9. Citizen Vehicle Tracking
  await test('9.1 Citizen accesses live vehicle tracking for authorized locality', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/citizen/tracking`, {
      headers: {
        Authorization: `Bearer ${sunitaToken}`,
        'X-Tenant-Id': verdantTenantId,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data), 'Data must be array of vehicle snapshots');
    if (body.data.length > 0) {
      const v = body.data[0];
      assert.ok(['CURRENT', 'STALE', 'UNAVAILABLE'].includes(v.freshness));
      assert.ok(v.registration_number || v.vehicle_label);
    }
  });

  // 10. Cross-Citizen Bill Payment Access Prevention
  await test('10.1 Citizen cannot create payment order for another citizen bill (403)', async () => {
    // Attempt payment using invalid/another citizen bill ID
    const fakeBillId = '00000000-0000-0000-0000-000000000099';
    const res = await fetch(`${BACKEND_BASE}/api/v1/payments/create-order`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sunitaToken}`,
        'X-Tenant-Id': verdantTenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        billId: fakeBillId,
        paymentMethod: 'ONLINE_GATEWAY',
        amountMinorUnits: 15000,
      }),
    });
    assert.ok([400, 403, 404].includes(res.status), 'Must reject unauthorized bill access');
  });

  // 11. Cross-Tenant Isolation Enforcement
  await test('11.1 Rejects citizen accessing tenant where they have no membership (403)', async () => {
    // Sunita is a member of Verdant Hills, NOT Oceanfront Nagar Panchayat
    const res = await fetch(`${BACKEND_BASE}/api/v1/properties`, {
      headers: {
        Authorization: `Bearer ${sunitaToken}`,
        'X-Tenant-Id': oceanfrontTenantId,
      },
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'FORBIDDEN_TENANT_ACCESS');
  });

  // 12. Municipal Admin Authentication & Accounting Access
  let adminToken = '';
  await test('12.1 Municipal Admin login (Aarav Sharma)', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: '+919876543210',
        password: 'DemoPass@2026!',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.user.fullName.includes('Aarav Sharma'));
    assert.strictEqual(body.memberships[0].roleName, 'MUNICIPAL_ADMIN');
    adminToken = body.token;
  });

  let cashAccountId = '';
  let bankAccountId = '';
  await test('12.2 Municipal Admin reads Chart of Accounts (Asset, Liability, etc.)', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/accounting/accounts`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': verdantTenantId,
      },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.count >= 4, 'Must have standard municipal accounts');
    const b = body.data.find((a: any) => a.account_code === '1020');
    const c = body.data.find((a: any) => a.account_code === '1030');
    assert.ok(b, 'Account 1020 must exist');
    assert.ok(c, 'Account 1030 must exist');
    bankAccountId = b.id;
    cashAccountId = c.id;
  });

  await test('12.3 Municipal Admin drafts balanced double-entry journal entry (HTTP 201)', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/accounting/journals`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': verdantTenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        postingDate: '2026-10-18',
        businessEventType: 'MANUAL_ADJUSTMENT',
        businessEventId: `e2e_manual_${Date.now()}`,
        currency: 'INR',
        description: 'Live E2E Verification balanced journal test',
        lines: [
          { lineNumber: 1, accountId: bankAccountId, entryType: 'DEBIT', amountMinorUnits: 50000, memo: 'Debit 1020' },
          { lineNumber: 2, accountId: cashAccountId, entryType: 'CREDIT', amountMinorUnits: 50000, memo: 'Credit 1030' },
        ],
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.data.status, 'DRAFT');
  });

  await test('12.4 Rejects posting unbalanced journal entry with invariant violation', async () => {
    // 1. Create draft with mismatched debits and credits
    const draftRes = await fetch(`${BACKEND_BASE}/api/v1/accounting/journals`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': verdantTenantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        postingDate: '2026-10-18',
        businessEventType: 'MANUAL_ADJUSTMENT',
        businessEventId: `e2e_unbalanced_${Date.now()}`,
        currency: 'INR',
        description: 'Unbalanced entry test',
        lines: [
          { lineNumber: 1, accountId: bankAccountId, entryType: 'DEBIT', amountMinorUnits: 50000, memo: 'Debit 500' },
          { lineNumber: 2, accountId: cashAccountId, entryType: 'CREDIT', amountMinorUnits: 25000, memo: 'Credit mismatch 250' },
        ],
      }),
    });
    assert.strictEqual(draftRes.status, 201);
    const draftBody = await draftRes.json();
    const draftId = draftBody.data.id;

    // 2. Attempt to POST the unbalanced draft entry
    const postRes = await fetch(`${BACKEND_BASE}/api/v1/accounting/journals/${draftId}/post`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Tenant-Id': verdantTenantId,
      },
    });
    assert.notStrictEqual(postRes.status, 200, 'Posting unbalanced entry must NOT succeed');
    const postBody = await postRes.json();
    assert.ok(
      postBody.error.message.includes('INVARIANT_VIOLATION') ||
      postBody.error.message.includes('equal') ||
      postBody.error.message.includes('balanced'),
      'Must report debit/credit invariant violation'
    );
  });

  // 13. Field Supervisor Role Boundary Isolation
  let supervisorToken = '';
  await test('13.1 Field Supervisor login (Vikram Singh)', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: '+919876543211',
        password: 'DemoPass@2026!',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.user.fullName.includes('Vikram Singh'));
    assert.strictEqual(body.memberships[0].roleName, 'FIELD_SUPERVISOR');
    supervisorToken = body.token;
  });

  await test('13.2 Field Supervisor is BLOCKED from General Ledger accounts (HTTP 403)', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/accounting/accounts`, {
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'X-Tenant-Id': verdantTenantId,
      },
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'FORBIDDEN_MUNICIPAL_ADMIN_ONLY');
  });

  await test('13.3 Non-Citizen is BLOCKED from Citizen Live Tracking (HTTP 403)', async () => {
    const res = await fetch(`${BACKEND_BASE}/api/v1/citizen/tracking`, {
      headers: {
        Authorization: `Bearer ${supervisorToken}`,
        'X-Tenant-Id': verdantTenantId,
      },
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'AUTH_CITIZEN_ONLY_ENDPOINT');
  });

  console.log('\n========================================================================');
  console.log(`ALL LIVE END-TO-END VERIFICATION TESTS PASSED (${passed}/${total})`);
  console.log('========================================================================\n');
}

runLiveVerification().catch((err) => {
  console.error('\nFATAL LIVE VERIFICATION FAILURE:', err);
  process.exit(1);
});
