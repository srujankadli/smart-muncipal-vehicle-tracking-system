import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  jwt: {
    secret: string;
    expiresIn: string;
  };
  database: {
    url?: string;
    host: string;
    port: number;
    name: string;
    // Dedicated role separation per Phase 2 & 3 architecture
    roles: {
      admin: {
        user: string;
        password?: string;
      };
      migration: {
        user: string;
        password?: string;
      };
      runtime: {
        user: string;
        password?: string;
      };
    };
    maxConnections: number;
    idleTimeoutMillis: number;
  };
  // Six Outstanding Policy Areas - Configurable flags with unconfirmed/provisional statuses
  policies: {
    // 1. GST Status: Unconfirmed pending qualified municipal finance/tax counsel review
    taxPolicyConfirmed: boolean;
    taxDefaultRateBps: number | null; // e.g. 0 or 1800 basis points; null means unconfirmed
    taxPolicyNote: string;

    // 2. Accounting Policy: Revenue recognition timing and fee allocation pending CFO approval
    accountingPolicyConfirmed: boolean;
    revenueRecognitionTiming: 'ACCRUAL_AT_BILLING' | 'CASH_AT_CAPTURE' | null;
    gatewayFeeTreatment: 'OPERATING_EXPENSE' | 'CITIZEN_SURCHARGE' | null;

    // 3. Data Retention: Provisional engineering proposals pending legal/finance sign-off
    dataRetentionConfirmed: boolean;
    financialRetentionYears: number; // e.g. provisional 7 years
    citizenPiiRetentionYears: number; // e.g. provisional 3 years
    complaintLogRetentionDays: number; // e.g. provisional 180 days
    telemetryRetentionDays: number; // e.g. provisional 30 days

    // 4. Property Identifier Strategy: Configurable identifier resolution
    propertyIdStrategy: 'PLATFORM_GENERATED' | 'MUNICIPAL_PIN' | 'BIDIRECTIONAL_MAPPING';

    // 5. Complaint Photos & Privacy Redaction: Configurable policy
    complaintPhotosAllowed: boolean;
    complaintPhotosMandatory: boolean;
    complaintPhotoBlurringMandatory: boolean;

    // 6. ERP Settlement Boundary: Interface boundary configurable
    erpSettlementEnabled: boolean;
    erpExportFormat: 'JSON' | 'CSV' | 'NONE';

    // Doorstep cash collection strictly deactivated for pilot
    doorstepCashEnabled: boolean;
  };
  tracking: {
    currentFreshnessSeconds: number;
    staleFreshnessSeconds: number;
    futureDriftLimitSeconds: number;
    maxPayloadSizeBytes: number;
    maxSpeedKmh: number;
  };
  payments: {
    mockWebhookSecret: string;
    defaultCurrency: string;
    defaultGatewayProvider: string;
  };
}

function parseBoolean(val: string | undefined, defaultVal: boolean): boolean {
  if (val === undefined || val === '') return defaultVal;
  return val.toLowerCase() === 'true' || val === '1';
}

function parseNumber(val: string | undefined, defaultVal: number): number {
  if (val === undefined || val === '') return defaultVal;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultVal : parsed;
}

export const config: AppConfig = {
  env: (process.env.NODE_ENV as AppConfig['env']) || 'development',
  port: parseNumber(process.env.PORT, 3000),
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_insecure_jwt_secret_do_not_use_in_prod_min_32_chars!',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  database: {
    url: process.env.DATABASE_URL,
    get host() {
      return process.env.DB_HOST || 'localhost';
    },
    get port() {
      return parseNumber(process.env.DB_PORT, 5432);
    },
    get name() {
      return process.env.DB_NAME || 'waste_management_dev';
    },
    roles: {
      admin: {
        get user() {
          return process.env.DB_ADMIN_USER || 'waste_dba_admin';
        },
        get password() {
          return process.env.DB_ADMIN_PASSWORD || 'dba_local_dev_secret_only';
        },
      },
      migration: {
        get user() {
          return process.env.DB_MIGRATION_USER || 'waste_migration_user';
        },
        get password() {
          return process.env.DB_MIGRATION_PASSWORD || 'migration_local_dev_secret_only';
        },
      },
      runtime: {
        get user() {
          return process.env.DB_APP_USER || 'waste_app_user';
        },
        get password() {
          return process.env.DB_APP_PASSWORD || 'app_local_dev_secret_only';
        },
      },
    },
    maxConnections: parseNumber(process.env.DB_POOL_MAX, 20),
    idleTimeoutMillis: parseNumber(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  },
  policies: {
    // 1. GST Policy: UNCONFIRMED PENDING TAX COUNSEL REVIEW
    taxPolicyConfirmed: parseBoolean(process.env.TAX_POLICY_CONFIRMED, false),
    taxDefaultRateBps:
      parseBoolean(process.env.TAX_POLICY_CONFIRMED, false) && process.env.TAX_DEFAULT_RATE_BPS
        ? parseNumber(process.env.TAX_DEFAULT_RATE_BPS, 0)
        : null,
    taxPolicyNote: 'UNCONFIRMED_PENDING_MUNICIPAL_TAX_COUNSEL_REVIEW',

    // 2. Accounting Policy: ACCRUAL vs CASH pending CFO sign-off
    // When unconfirmed, timing and fee allocation are strictly null to prevent nominal defaults from silently driving postings
    accountingPolicyConfirmed: parseBoolean(process.env.ACCOUNTING_POLICY_CONFIRMED, false),
    revenueRecognitionTiming:
      parseBoolean(process.env.ACCOUNTING_POLICY_CONFIRMED, false) && process.env.REVENUE_RECOGNITION_TIMING
        ? (process.env.REVENUE_RECOGNITION_TIMING as 'ACCRUAL_AT_BILLING' | 'CASH_AT_CAPTURE')
        : null,
    gatewayFeeTreatment:
      parseBoolean(process.env.ACCOUNTING_POLICY_CONFIRMED, false) && process.env.GATEWAY_FEE_TREATMENT
        ? (process.env.GATEWAY_FEE_TREATMENT as 'OPERATING_EXPENSE' | 'CITIZEN_SURCHARGE')
        : null,

    // 3. Data Retention: PROVISIONAL PROPOSALS (not asserted statutory mandates)
    dataRetentionConfirmed: parseBoolean(process.env.DATA_RETENTION_CONFIRMED, false),
    financialRetentionYears: parseNumber(process.env.FINANCIAL_RETENTION_YEARS, 7),
    citizenPiiRetentionYears: parseNumber(process.env.CITIZEN_PII_RETENTION_YEARS, 3),
    complaintLogRetentionDays: parseNumber(process.env.COMPLAINT_LOG_RETENTION_DAYS, 180),
    telemetryRetentionDays: parseNumber(process.env.TELEMETRY_RETENTION_DAYS, 30),

    // 4. Property Identifier Strategy: Default to platform generated
    propertyIdStrategy: (process.env.PROPERTY_ID_STRATEGY as 'PLATFORM_GENERATED' | 'MUNICIPAL_PIN' | 'BIDIRECTIONAL_MAPPING') || 'PLATFORM_GENERATED',

    // 5. Complaint Photos & Privacy (Blurring not asserted as mandatory without policy confirmation)
    complaintPhotosAllowed: parseBoolean(process.env.COMPLAINT_PHOTOS_ALLOWED, true),
    complaintPhotosMandatory: parseBoolean(process.env.COMPLAINT_PHOTOS_MANDATORY, false),
    complaintPhotoBlurringMandatory: parseBoolean(process.env.COMPLAINT_PHOTO_BLURRING_MANDATORY, false),

    // 6. ERP Settlement Boundary (Interface boundary documented without inventing ERP rules)
    erpSettlementEnabled: parseBoolean(process.env.ERP_SETTLEMENT_ENABLED, false),
    erpExportFormat: (process.env.ERP_EXPORT_FORMAT as 'JSON' | 'CSV' | 'NONE') || 'NONE',

    // Doorstep cash collection strictly deactivated for pilot
    doorstepCashEnabled: false, // Strict hardcode for pilot per requirements
  },
  tracking: {
    currentFreshnessSeconds: parseNumber(process.env.TRACKING_CURRENT_SECONDS, 60),
    staleFreshnessSeconds: parseNumber(process.env.TRACKING_STALE_SECONDS, 300),
    futureDriftLimitSeconds: parseNumber(process.env.TRACKING_FUTURE_DRIFT_SECONDS, 30),
    maxPayloadSizeBytes: parseNumber(process.env.TRACKING_MAX_PAYLOAD_BYTES, 2048),
    maxSpeedKmh: parseNumber(process.env.TRACKING_MAX_SPEED_KMH, 140),
  },
  payments: {
    mockWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'dev_mock_webhook_secret_key_2026',
    defaultCurrency: process.env.PAYMENT_DEFAULT_CURRENCY || 'INR',
    defaultGatewayProvider: process.env.PAYMENT_DEFAULT_PROVIDER || 'MOCK_GATEWAY',
  },
};

/**
 * Validates configuration readiness for production deployment.
 * Fails fast if insecure development secrets, placeholders, or defaults are detected.
 */
export function validateProductionConfig(cfg: AppConfig = config): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (cfg.env === 'production') {
    // 1. JWT Secret security
    if (!process.env.JWT_SECRET || cfg.jwt.secret.includes('dev_insecure') || cfg.jwt.secret.length < 32) {
      errors.push('CRITICAL: JWT_SECRET must be explicitly provided in production and contain at least 32 characters.');
    }

    // 2. Database credentials security
    if (!process.env.DB_APP_PASSWORD || cfg.database.roles.runtime.password?.includes('dev_secret')) {
      errors.push('CRITICAL: DB_APP_PASSWORD runtime database password must be securely configured.');
    }

    if (!process.env.DB_MIGRATION_PASSWORD || cfg.database.roles.migration.password?.includes('dev_secret')) {
      errors.push('CRITICAL: DB_MIGRATION_PASSWORD migration database password must be securely configured.');
    }

    // 3. Webhook secret
    if (!process.env.PAYMENT_WEBHOOK_SECRET || cfg.payments.mockWebhookSecret.includes('dev_mock')) {
      errors.push('CRITICAL: PAYMENT_WEBHOOK_SECRET must be explicitly configured with an authentic gateway secret in production.');
    }

    // 4. Doorstep cash strict pilot deactivation
    if (cfg.policies.doorstepCashEnabled) {
      errors.push('CRITICAL: Doorstep cash collection must remain deactivated for the pilot.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
