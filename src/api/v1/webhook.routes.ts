import { Router, Request, Response } from 'express';
import { PaymentService } from '../../services/payment.service';

const router = Router();

/**
 * POST /api/v1/webhooks/payments/:gateway
 * External payment gateway callback handler (HMAC signature verified).
 */
router.post('/payments/:gateway', async (req: Request, res: Response, next) => {
  try {
    const gateway = req.params.gateway as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const headers = req.headers as Record<string, string>;

    const result = await PaymentService.handleWebhook(gateway, rawBody, headers);

    return res.status(200).json({
      status: 'SUCCESS',
      data: {
        received: true,
        processingStatus: result.status,
        eventId: result.eventId,
        paymentStatus: result.paymentStatus,
        ...(result.error ? { error: result.error } : {}),
      },
    });
  } catch (err: any) {
    if (err.message && err.message.includes('AUTH_INVALID_WEBHOOK_SIGNATURE')) {
      return res.status(401).json({
        error: {
          code: 'INVALID_WEBHOOK_SIGNATURE',
          message: 'Webhook signature verification failed.',
        },
      });
    }
    next(err);
  }
});

export default router;
