/**
 * TypeScript API contracts matching backend endpoints
 */

export interface User {
  id: string;
  mobileNumber: string;
  fullName: string;
  email?: string;
  isActive?: boolean;
}

export interface TenantMembership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  roleName: 'CITIZEN' | 'MUNICIPAL_ADMIN' | 'SUPERVISOR' | 'COLLECTION_STAFF' | 'DRIVER' | 'ACCOUNTANT';
  isDefault: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
  memberships: TenantMembership[];
}

export interface Ward {
  id: string;
  tenant_id: string;
  ward_number: string;
  ward_name: string;
  center_latitude?: number;
  center_longitude?: number;
  is_demo?: boolean;
}

export interface Locality {
  id: string;
  tenant_id: string;
  ward_id: string;
  locality_name: string;
  ward_number?: string;
  ward_name?: string;
  center_latitude?: number;
  center_longitude?: number;
  is_demo?: boolean;
}

export interface Municipality {
  id: string;
  name: string;
  slug: string;
  stateOrUt?: string;
  classification?: string;
  centerLatitude?: number;
  centerLongitude?: number;
  isDemo?: boolean;
  wards?: {
    id: string;
    wardNumber: string;
    wardName: string;
    localities: {
      id: string;
      localityName: string;
    }[];
  }[];
}

export interface Property {
  id: string;
  tenant_id: string;
  locality_id: string;
  citizen_user_id: string;
  property_type: 'RESIDENTIAL' | 'COMMERCIAL' | 'INSTITUTIONAL' | 'INDUSTRIAL';
  address_line: string;
  custom_identifier?: string;
  locality_name?: string;
  ward_number?: string;
  ward_name?: string;
  citizen_name?: string;
  is_active: boolean;
  is_demo: boolean;
  created_at: string;
}

export interface AssessmentRate {
  id: string;
  tenant_id: string;
  property_type: string;
  monthly_rate_minor_units: string;
  effective_from: string;
  effective_to?: string;
  is_active: boolean;
}

export interface Bill {
  id: string;
  tenant_id: string;
  property_id: string;
  citizen_user_id: string;
  bill_number: string;
  billing_period_start: string;
  billing_period_end: string;
  amount_due_minor_units: string;
  amount_paid_minor_units: string;
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  due_date: string;
  address_line?: string;
  property_type?: string;
  locality_name?: string;
  ward_number?: string;
  created_at: string;
}

export interface PaymentTransaction {
  id: string;
  tenant_id: string;
  bill_id?: string;
  citizen_user_id: string;
  payment_method: string;
  amount_minor_units: string;
  currency: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';
  receipt_number?: string;
  gateway_provider: string;
  gateway_order_id?: string;
  gateway_payment_id?: string;
  created_at: string;
  updated_at: string;
}

export interface GatewayOrder {
  gatewayOrderId: string;
  gatewayProvider: string;
  amountMinorUnits: string | number;
  currency: string;
  status: string;
  rawResponse?: any;
}

export interface CreateOrderResponse {
  status: string;
  data: {
    payment: PaymentTransaction;
    order: GatewayOrder;
  };
}

export interface CitizenTrackingSnapshot {
  vehicle_id: string;
  vehicle_label: string;
  registration_number: string;
  shift_id: string;
  shift_status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  locality_id: string;
  locality_name: string;
  ward_number: string;
  latitude: number | null;
  longitude: number | null;
  speed_kmh: number | null;
  heading_degrees: number | null;
  last_recorded_at: string | null;
  freshness: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
  elapsed_seconds: number;
  is_demo: boolean;
}

export interface ChartOfAccount {
  id: string;
  tenant_id: string;
  account_code: string;
  account_name: string;
  account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  is_active: boolean;
}

export interface JournalEntryLine {
  id?: string;
  line_number: number;
  account_id: string;
  account_code?: string;
  account_name?: string;
  entry_type: 'DEBIT' | 'CREDIT';
  amount_minor_units: string;
  currency?: string;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  tenant_id: string;
  entry_number: string;
  posting_date: string;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  business_event_type: string;
  business_event_id: string;
  currency: string;
  description: string;
  lines?: JournalEntryLine[];
  created_at: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}
