/**
 * Phase 6 Domain Types: Payment Foundation
 */

export type PaymentStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';
export type PaymentMethod = 'ONLINE_GATEWAY' | 'DOORSTEP_CASH' | 'MUNICIPAL_COUNTER';
export type BillStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export type PaymentEventType = 
  | 'ORDER_CREATED'
  | 'PAYMENT_AUTHORIZED'
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'REFUND_PROCESSED'
  | 'DISPUTE_OPENED';

export type EventProcessingStatus = 'PROCESSED' | 'DUPLICATE_IGNORED' | 'ANOMALY_PENDING_REVIEW';

export interface BillRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  citizenUserId: string | null;
  billNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  amountDueMinorUnits: string; // BIGINT string
  amountPaidMinorUnits: string; // BIGINT string
  status: BillStatus;
  dueDate: string;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentTransactionRecord {
  id: string;
  tenantId: string;
  billId: string | null;
  propertyId: string | null;
  citizenUserId: string;
  paymentMethod: PaymentMethod;
  amountMinorUnits: string; // BIGINT string
  currency: string;
  status: PaymentStatus;
  gatewayProvider: string | null;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  receiptNumber: string;
  idempotencyKey: string | null;
  failureReason: string | null;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentEventRecord {
  id: string;
  tenantId: string;
  paymentTransactionId: string | null;
  gatewayProvider: string;
  gatewayEventId: string;
  eventType: PaymentEventType;
  processingStatus: EventProcessingStatus;
  errorDetails: string | null;
  eventPayload: any;
  occurredAt: Date;
  createdAt: Date;
  isDemo: boolean;
}

export interface CreateOrderParams {
  amountMinorUnits: string;
  currency: string;
  receiptNumber: string;
  notes?: Record<string, string>;
}

export interface GatewayOrderResult {
  gatewayOrderId: string;
  gatewayProvider: string;
  amountMinorUnits: string;
  currency: string;
  status: 'CREATED';
  rawResponse?: any;
}

export interface GatewayEventPayload {
  gatewayEventId: string;
  gatewayProvider: string;
  eventType: PaymentEventType;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  amountMinorUnits?: bigint;
  currency?: string;
  signatureValid: boolean;
  failureReason?: string;
  rawPayload: any;
}

export interface CreatePaymentOrderInput {
  billId?: string;
  propertyId?: string;
  paymentMethod: PaymentMethod;
  amountMinorUnits: bigint | string | number;
  currency?: string;
  idempotencyKey?: string;
}
