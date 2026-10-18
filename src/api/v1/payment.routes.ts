import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireVerifiedTenant } from '../middleware/tenant.middleware';
import { paymentRateLimiter } from '../middleware/rate-limit.middleware';
import { PaymentService } from '../../services/payment.service';

const router = Router();

export function requireCitizenRole(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Tenant context required for payment operations.',
      },
    });
    return;
  }

  if (req.tenant.roleName !== 'CITIZEN') {
    res.status(403).json({
      error: {
        code: 'AUTH_CITIZEN_ONLY_ENDPOINT',
        message: 'Payment portal endpoints are restricted to authenticated citizens.',
      },
    });
    return;
  }

  next();
}

/**
 * POST /api/v1/payments/create-order
 * Authenticated Citizen initiates an online payment order for municipal services.
 */
router.post(
  '/create-order',
  paymentRateLimiter,
  requireAuth,
  requireVerifiedTenant,
  requireCitizenRole,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const citizenUserId = req.user!.userId;
      const tenantId = req.tenant!.tenantId;

      const { billId, propertyId, paymentMethod, amountMinorUnits, currency, idempotencyKey } = req.body;

      if (!paymentMethod) {
        return res.status(400).json({
          error: {
            code: 'MISSING_PAYMENT_METHOD',
            message: 'paymentMethod is required.',
          },
        });
      }

      if (amountMinorUnits === undefined || amountMinorUnits === null) {
        return res.status(400).json({
          error: {
            code: 'MISSING_AMOUNT',
            message: 'amountMinorUnits in integer minor units (paise) is required.',
          },
        });
      }

      const result = await PaymentService.createPaymentOrder(citizenUserId, tenantId, {
        billId,
        propertyId,
        paymentMethod,
        amountMinorUnits,
        currency,
        idempotencyKey,
      });

      return res.status(201).json({
        status: 'SUCCESS',
        data: {
          payment: result.paymentTransaction,
          order: result.gatewayOrder,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/payments/bills
 * Lists municipal assessment bills for the authenticated citizen.
 */
router.get(
  '/bills',
  requireAuth,
  requireVerifiedTenant,
  requireCitizenRole,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const citizenUserId = req.user!.userId;
      const tenantId = req.tenant!.tenantId;

      const bills = await PaymentService.listCitizenBills(tenantId, citizenUserId);

      return res.json({
        status: 'SUCCESS',
        data: {
          bills,
          count: bills.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/payments/history
 * Lists payment transactions for the authenticated citizen.
 */
router.get(
  '/history',
  requireAuth,
  requireVerifiedTenant,
  requireCitizenRole,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const citizenUserId = req.user!.userId;
      const tenantId = req.tenant!.tenantId;

      const payments = await PaymentService.listCitizenPayments(tenantId, citizenUserId);

      return res.json({
        status: 'SUCCESS',
        data: {
          payments,
          count: payments.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/payments/:id
 * Retrieve details of a specific payment transaction with object-level authorization.
 */
router.get(
  '/:id',
  requireAuth,
  requireVerifiedTenant,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const tenantId = req.tenant!.tenantId;
      const role = req.tenant!.roleName;
      const paymentId = req.params.id as string;

      const payment = await PaymentService.getPayment(tenantId, paymentId, userId, role);

      return res.json({
        status: 'SUCCESS',
        data: {
          payment,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
