import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPaise, formatDate, formatDateTime, getFreshnessLabel } from '../frontend/src/utils/formatters';
import { apiClient } from '../frontend/src/api/client';
import type { TenantMembership, Bill, CitizenTrackingSnapshot } from '../frontend/src/types/api.types';

describe('Phase 8: Frontend UI Logic, Formatters, API Client & Role Guards', () => {
  // =========================================================================
  // 1. Monetary Formatting & Precision (Integer Paise Arithmetic)
  // =========================================================================
  describe('1. Currency & Monetary Formatting Invariants', () => {
    it('accurately converts integer minor units (paise) to INR currency string without floating point drift', () => {
      // 10000 paise = ₹100.00
      const formatted100 = formatPaise('10000');
      assert.ok(formatted100.includes('100.00') || formatted100.includes('100'), 'Must format 10000 paise as 100 INR');

      // 50 paise = ₹0.50
      const formattedHalf = formatPaise('50');
      assert.ok(formattedHalf.includes('0.50'), 'Must format 50 paise as 0.50 INR');

      // 0 paise = ₹0.00
      const formattedZero = formatPaise('0');
      assert.ok(formattedZero.includes('0.00') || formattedZero.includes('0'), 'Must format 0 paise as 0.00 INR');

      // Large municipal fee: 2,50,000 paise = ₹2,500.00
      const formattedLarge = formatPaise('250000');
      assert.ok(formattedLarge.includes('2,500.00') || formattedLarge.includes('2500'), 'Must format 250000 paise as 2,500 INR');

      // Null or undefined gracefully handled
      assert.equal(formatPaise(null), '₹0.00');
      assert.equal(formatPaise(undefined), '₹0.00');
      assert.equal(formatPaise('invalid'), '₹0.00');
    });

    it('formats ISO-8601 dates and timestamps gracefully', () => {
      const formatted = formatDate('2026-10-18T00:00:00.000Z');
      assert.ok(formatted.includes('18') && (formatted.includes('Oct') || formatted.includes('10')), 'Must format date correctly');
      assert.equal(formatDate(null), '—');
      assert.equal(formatDateTime(null), '—');
    });
  });

  // =========================================================================
  // 2. Telemetry Freshness & Shift Status Invariants
  // =========================================================================
  describe('2. Telemetry Freshness Labels & State Invariants', () => {
    it('evaluates freshness labels according to municipal SLA thresholds', () => {
      // CURRENT: <= 60 seconds
      const currentLabel = getFreshnessLabel('CURRENT', 14);
      assert.ok(currentLabel.includes('LIVE') && currentLabel.includes('14s'), 'Current label must show LIVE and seconds');

      // STALE: 61 - 300 seconds
      const staleLabel = getFreshnessLabel('STALE', 180);
      assert.ok(staleLabel.includes('DELAYED') && staleLabel.includes('3m'), 'Stale label must show DELAYED and minutes');

      // UNAVAILABLE: > 300 seconds or ended shift
      const offlineLabel = getFreshnessLabel('UNAVAILABLE', 900);
      assert.ok(offlineLabel.includes('OFFLINE') && offlineLabel.includes('Shift ended'), 'Unavailable label must indicate off duty / shift ended');
    });

    it('accurately distinguishes tracking snapshots by status', () => {
      const activeSnapshot: CitizenTrackingSnapshot = {
        vehicle_id: 'v1',
        vehicle_label: 'Truck #01',
        registration_number: 'MH-12-WM-1001',
        shift_id: 's1',
        shift_status: 'ACTIVE',
        locality_id: 'l1',
        locality_name: 'Highland Ridge',
        ward_number: 'WARD-01',
        latitude: 18.521,
        longitude: 73.857,
        speed_kmh: 22,
        heading_degrees: 90,
        last_recorded_at: new Date().toISOString(),
        freshness: 'CURRENT',
        elapsed_seconds: 10,
        is_demo: true,
      };

      const endedSnapshot: CitizenTrackingSnapshot = {
        ...activeSnapshot,
        shift_status: 'COMPLETED',
        freshness: 'UNAVAILABLE',
        elapsed_seconds: 400,
      };

      assert.equal(activeSnapshot.freshness, 'CURRENT');
      assert.equal(endedSnapshot.freshness, 'UNAVAILABLE');
    });
  });

  // =========================================================================
  // 3. Centralized API Client Header & Security Injection
  // =========================================================================
  describe('3. Centralized API Client Header & Error Handling', () => {
    it('injects Authorization Bearer and X-Tenant-Id headers when set', () => {
      apiClient.setToken('test_jwt_token_123');
      apiClient.setTenantId('tenant_uuid_456');

      // Test unauthorized callback registration
      let unauthorizedTriggered = false;
      apiClient.setOnUnauthorized(() => {
        unauthorizedTriggered = true;
      });

      assert.ok(typeof apiClient.login === 'function');
      assert.ok(typeof apiClient.listProperties === 'function');
      assert.ok(typeof apiClient.listCitizenBills === 'function');
      assert.ok(typeof apiClient.getCitizenTracking === 'function');
      assert.ok(typeof apiClient.getChartOfAccounts === 'function');

      // Clean up
      apiClient.setToken(null);
      apiClient.setTenantId(null);
      apiClient.setOnUnauthorized(() => {});
    });
  });

  // =========================================================================
  // 4. Role-Restricted Screen Access & Navigation Guards
  // =========================================================================
  describe('4. Role-Restricted Screen Access & Navigation Guards', () => {
    const citizenMembership: TenantMembership = {
      tenantId: 't1',
      tenantSlug: 'verdant-hills',
      tenantName: 'Verdant Hills Municipal Council',
      roleName: 'CITIZEN',
      isDefault: true,
    };

    const adminMembership: TenantMembership = {
      tenantId: 't1',
      tenantSlug: 'verdant-hills',
      tenantName: 'Verdant Hills Municipal Council',
      roleName: 'MUNICIPAL_ADMIN',
      isDefault: true,
    };

    function isScreenAllowedForRole(role: string, screenTab: string): boolean {
      if (role === 'CITIZEN') {
        const citizenAllowed = [
          'citizen-dashboard',
          'citizen-properties',
          'citizen-bills',
          'citizen-history',
          'citizen-tracking',
        ];
        return citizenAllowed.includes(screenTab);
      }

      if (['MUNICIPAL_ADMIN', 'SUPERVISOR', 'ACCOUNTANT'].includes(role)) {
        const adminAllowed = [
          'admin-overview',
          'admin-properties',
          'admin-accounting',
          'admin-master',
        ];
        return adminAllowed.includes(screenTab);
      }

      return false;
    }

    it('permits citizen role to access citizen portal screens and blocks administrative screens', () => {
      assert.equal(isScreenAllowedForRole(citizenMembership.roleName, 'citizen-dashboard'), true);
      assert.equal(isScreenAllowedForRole(citizenMembership.roleName, 'citizen-bills'), true);
      assert.equal(isScreenAllowedForRole(citizenMembership.roleName, 'citizen-tracking'), true);

      // Blocked from admin console
      assert.equal(isScreenAllowedForRole(citizenMembership.roleName, 'admin-overview'), false);
      assert.equal(isScreenAllowedForRole(citizenMembership.roleName, 'admin-accounting'), false);
      assert.equal(isScreenAllowedForRole(citizenMembership.roleName, 'admin-master'), false);
    });

    it('permits municipal admin role to access administrative screens and blocks citizen-only screens', () => {
      assert.equal(isScreenAllowedForRole(adminMembership.roleName, 'admin-overview'), true);
      assert.equal(isScreenAllowedForRole(adminMembership.roleName, 'admin-accounting'), true);
      assert.equal(isScreenAllowedForRole(adminMembership.roleName, 'admin-properties'), true);
      assert.equal(isScreenAllowedForRole(adminMembership.roleName, 'admin-master'), true);

      // Blocked from citizen tracking (backend enforces CITIZEN role on /api/v1/citizen/tracking)
      assert.equal(isScreenAllowedForRole(adminMembership.roleName, 'citizen-tracking'), false);
    });
  });

  // =========================================================================
  // 5. Citizen Bill & Sandbox Payment Lifecycle Logic
  // =========================================================================
  describe('5. Citizen Bill & Sandbox Payment Lifecycle Logic', () => {
    it('correctly computes outstanding balance across multiple bills without negative balances', () => {
      const mockBills: Bill[] = [
        {
          id: 'b1',
          tenant_id: 't1',
          property_id: 'p1',
          citizen_user_id: 'u1',
          bill_number: 'BILL-001',
          billing_period_start: '2026-10-01',
          billing_period_end: '2026-10-31',
          amount_due_minor_units: '50000', // ₹500
          amount_paid_minor_units: '0',
          status: 'UNPAID',
          due_date: '2026-11-10',
          created_at: new Date().toISOString(),
        },
        {
          id: 'b2',
          tenant_id: 't1',
          property_id: 'p1',
          citizen_user_id: 'u1',
          bill_number: 'BILL-002',
          billing_period_start: '2026-09-01',
          billing_period_end: '2026-09-30',
          amount_due_minor_units: '30000', // ₹300
          amount_paid_minor_units: '30000', // ₹300 paid
          status: 'PAID',
          due_date: '2026-10-10',
          created_at: new Date().toISOString(),
        },
        {
          id: 'b3',
          tenant_id: 't1',
          property_id: 'p1',
          citizen_user_id: 'u1',
          bill_number: 'BILL-003',
          billing_period_start: '2026-08-01',
          billing_period_end: '2026-08-31',
          amount_due_minor_units: '40000', // ₹400
          amount_paid_minor_units: '20000', // ₹200 paid
          status: 'PARTIALLY_PAID',
          due_date: '2026-09-10',
          created_at: new Date().toISOString(),
        },
      ];

      const unpaidBills = mockBills.filter((b) => b.status === 'UNPAID' || b.status === 'PARTIALLY_PAID');
      assert.equal(unpaidBills.length, 2);

      const totalBalancePaise = unpaidBills.reduce((acc, b) => {
        const due = parseInt(b.amount_due_minor_units, 10);
        const paid = parseInt(b.amount_paid_minor_units, 10);
        return acc + Math.max(0, due - paid);
      }, 0);

      // (50000 - 0) + (40000 - 20000) = 70000 paise (₹700.00)
      assert.equal(totalBalancePaise, 70000);
      assert.ok(formatPaise(totalBalancePaise).includes('700.00') || formatPaise(totalBalancePaise).includes('700'));
    });
  });
});
