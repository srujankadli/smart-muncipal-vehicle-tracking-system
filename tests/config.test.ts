import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config';

describe('Configuration & Policy Foundations', () => {
  it('should load default development environment configuration', () => {
    assert.ok(config.port, 'Port must be defined');
    assert.ok(config.jwt.secret, 'JWT secret must be defined');
    assert.ok(config.database.roles.runtime.user, 'Runtime DB user must be defined');
    assert.equal(config.database.roles.runtime.user, 'waste_app_user');
    assert.equal(config.database.roles.migration.user, 'waste_migration_user');
    assert.equal(config.database.roles.admin.user, 'waste_dba_admin');
  });

  it('should enforce strict doorstep cash deactivation for pilot', () => {
    assert.equal(
      config.policies.doorstepCashEnabled,
      false,
      'Doorstep cash must be strictly disabled for the pilot phase'
    );
  });

  it('should mark GST tax treatment as unconfirmed pending qualified tax counsel review', () => {
    assert.equal(
      config.policies.taxPolicyConfirmed,
      false,
      'GST tax policy must remain unconfirmed until formal tax counsel ruling'
    );
    assert.equal(
      config.policies.taxPolicyNote,
      'UNCONFIRMED_PENDING_MUNICIPAL_TAX_COUNSEL_REVIEW'
    );
  });

  it('should mark accounting policy as unconfirmed pending CFO sign-off', () => {
    assert.equal(
      config.policies.accountingPolicyConfirmed,
      false,
      'Accounting policy must remain unconfirmed until CFO approval'
    );
  });

  it('should mark data retention periods as provisional engineering proposals', () => {
    assert.equal(
      config.policies.dataRetentionConfirmed,
      false,
      'Data retention schedules must remain provisional pending municipal legal approval'
    );
    assert.ok(config.policies.financialRetentionYears >= 7, 'Financial retention default should be at least 7 years');
    assert.ok(config.policies.citizenPiiRetentionYears >= 3, 'Citizen PII retention default should be at least 3 years');
  });

  it('should support configurable property identifier strategy without assuming municipal PIN', () => {
    assert.ok(
      ['PLATFORM_GENERATED', 'MUNICIPAL_PIN', 'BIDIRECTIONAL_MAPPING'].includes(
        config.policies.propertyIdStrategy
      ),
      'Property identifier strategy must be one of the supported strategies'
    );
  });

  it('should not mandate complaint photo blurring unless confirmed by municipal policy', () => {
    assert.equal(
      config.policies.complaintPhotoBlurringMandatory,
      false,
      'Complaint photo blurring must not be asserted as universally legally mandatory'
    );
  });

  it('should block automatic revenue recognition when accounting policy is unconfirmed', () => {
    assert.equal(config.policies.revenueRecognitionTiming, null);
    assert.throws(
      () => {
        const { AccountingService } = require('../src/services/accounting.service');
        AccountingService.getEffectiveRevenueRecognitionTiming();
      },
      /UNCONFIRMED_ACCOUNTING_POLICY/,
      'Must throw UNCONFIRMED_ACCOUNTING_POLICY when unconfirmed'
    );
  });

  it('should block automatic gateway fee allocation when accounting policy is unconfirmed', () => {
    assert.equal(config.policies.gatewayFeeTreatment, null);
    assert.throws(
      () => {
        const { AccountingService } = require('../src/services/accounting.service');
        AccountingService.getEffectiveGatewayFeeTreatment();
      },
      /UNCONFIRMED_ACCOUNTING_POLICY/,
      'Must throw UNCONFIRMED_ACCOUNTING_POLICY when unconfirmed'
    );
  });

  it('should block tax rate calculation when tax policy is unconfirmed', () => {
    assert.equal(config.policies.taxDefaultRateBps, null);
    assert.throws(
      () => {
        const { AccountingService } = require('../src/services/accounting.service');
        AccountingService.getEffectiveTaxRateBasisPoints();
      },
      /UNCONFIRMED_TAX_POLICY/,
      'Must throw UNCONFIRMED_TAX_POLICY when unconfirmed'
    );
  });
});
