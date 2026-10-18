import crypto from 'crypto';
import { config } from '../config';
import { CreateOrderParams, GatewayEventPayload, GatewayOrderResult, PaymentEventType } from '../types/payment.types';

/**
 * Provider-neutral interface for municipal payment gateway adapters.
 */
export interface IPaymentGatewayAdapter {
  getProviderName(): string;
  createOrder(params: CreateOrderParams): Promise<GatewayOrderResult>;
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean;
  parseWebhookEvent(rawBody: string, headers: Record<string, string>, secret: string): GatewayEventPayload;
}

/**
 * Mock / Sandbox implementation of IPaymentGatewayAdapter for testing and demonstration.
 * Does NOT connect to live gateways or process real money.
 */
export class MockPaymentGatewayAdapter implements IPaymentGatewayAdapter {
  private readonly providerName: string;

  constructor(providerName: string = 'MOCK_GATEWAY') {
    this.providerName = providerName;
  }

  public getProviderName(): string {
    return this.providerName;
  }

  /**
   * Simulates order creation with an external payment gateway.
   */
  public async createOrder(params: CreateOrderParams): Promise<GatewayOrderResult> {
    const randomHex = crypto.randomBytes(8).toString('hex');
    const orderId = `order_${this.providerName.toLowerCase()}_${randomHex}`;

    return {
      gatewayOrderId: orderId,
      gatewayProvider: this.providerName,
      amountMinorUnits: params.amountMinorUnits,
      currency: params.currency || 'INR',
      status: 'CREATED',
      rawResponse: {
        id: orderId,
        entity: 'order',
        amount: params.amountMinorUnits.toString(),
        currency: params.currency || 'INR',
        receipt: params.receiptNumber,
        status: 'created',
        created_at: Math.floor(Date.now() / 1000),
      },
    };
  }

  /**
   * Verifies HMAC SHA-256 webhook signature using constant-time comparison.
   */
  public verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean {
    const activeSecret = secret || config.payments.mockWebhookSecret;
    if (!signature || !activeSecret || !rawBody) {
      return false;
    }

    try {
      // Normalize signature format (supports raw hex or sha256=<hex>)
      const cleanSignature = signature.startsWith('sha256=') ? signature.slice(7) : signature;

      const expectedHmac = crypto
        .createHmac('sha256', activeSecret)
        .update(rawBody, 'utf8')
        .digest('hex');

      if (cleanSignature.length !== expectedHmac.length) {
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(cleanSignature, 'hex'),
        Buffer.from(expectedHmac, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * Helper to generate a valid HMAC signature for mock / test webhooks.
   */
  public generateWebhookSignature(rawBody: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  }

  /**
   * Parses and normalizes incoming webhook event payload.
   */
  public parseWebhookEvent(
    rawBody: string,
    headers: Record<string, string>,
    secret: string
  ): GatewayEventPayload {
    const signature = headers['x-signature'] || headers['x-gateway-signature'] || headers['x-mock-signature'] || headers['x-webhook-signature'] || '';
    const signatureValid = this.verifyWebhookSignature(rawBody, signature, secret);

    let parsed: any = {};
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      // Keep empty object if JSON parsing fails
    }

    // Determine normalized event type
    const rawEvent = (parsed.event || parsed.event_type || headers['x-gateway-event-type'] || '').toLowerCase();
    let eventType: PaymentEventType = 'PAYMENT_CAPTURED';

    if (rawEvent.includes('failed')) {
      eventType = 'PAYMENT_FAILED';
    } else if (rawEvent.includes('refund')) {
      eventType = 'REFUND_PROCESSED';
    } else if (rawEvent.includes('dispute')) {
      eventType = 'DISPUTE_OPENED';
    } else if (rawEvent.includes('authorized')) {
      eventType = 'PAYMENT_AUTHORIZED';
    } else if (rawEvent.includes('order.created')) {
      eventType = 'ORDER_CREATED';
    } else {
      eventType = 'PAYMENT_CAPTURED';
    }

    // Extract payload data
    const paymentObj = parsed.payload?.payment?.entity || parsed.payload?.payment || parsed.data?.payment || parsed.payment || {};
    const refundObj = parsed.payload?.refund?.entity || parsed.payload?.refund || parsed.data?.refund || parsed.refund || {};

    const gatewayEventId =
      headers['x-gateway-event-id'] ||
      parsed.event_id ||
      parsed.id ||
      `evt_${crypto.randomBytes(8).toString('hex')}`;

    const gatewayOrderId =
      paymentObj.order_id ||
      parsed.payload?.order_id ||
      parsed.order_id ||
      parsed.orderId ||
      parsed.gatewayOrderId ||
      undefined;

    const gatewayPaymentId =
      paymentObj.id ||
      paymentObj.payment_id ||
      refundObj.payment_id ||
      parsed.payload?.payment_id ||
      parsed.payment_id ||
      parsed.paymentId ||
      parsed.gatewayPaymentId ||
      undefined;

    const amountRaw = paymentObj.amount ?? refundObj.amount ?? parsed.amount;
    let amountMinorUnits: bigint | undefined;
    if (amountRaw !== undefined && amountRaw !== null) {
      try {
        amountMinorUnits = BigInt(amountRaw);
      } catch {
        amountMinorUnits = undefined;
      }
    }

    return {
      gatewayEventId,
      gatewayProvider: this.providerName,
      eventType,
      gatewayOrderId,
      gatewayPaymentId,
      amountMinorUnits,
      currency: paymentObj.currency || refundObj.currency || parsed.currency || 'INR',
      signatureValid,
      failureReason: paymentObj.error_description || paymentObj.failure_reason || parsed.failure_reason,
      rawPayload: parsed,
    };
  }
}
