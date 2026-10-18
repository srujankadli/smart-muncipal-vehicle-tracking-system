import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireVerifiedTenant } from '../middleware/tenant.middleware';
import { TrackingService } from '../../services/tracking.service';

const router = Router();

/**
 * Middleware: Ensure authenticated role in the verified tenant is CITIZEN.
 * Non-citizen roles (e.g. municipal administrators, supervisors) are rejected
 * to prevent accidental unauthorized cross-role access through generic routes.
 */
export function requireCitizenRole(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Tenant context required for citizen tracking.',
      },
    });
    return;
  }

  if (req.tenant.roleName !== 'CITIZEN') {
    res.status(403).json({
      error: {
        code: 'AUTH_CITIZEN_ONLY_ENDPOINT',
        message: 'Vehicle tracking endpoint is restricted to authenticated citizens with verified property eligibility.',
      },
    });
    return;
  }

  next();
}

/**
 * GET /api/v1/citizen/tracking
 * Allows authenticated citizens to view live tracking of garbage collection vehicles
 * assigned to their registered property localities.
 */
router.get(
  '/',
  requireAuth,
  requireVerifiedTenant,
  requireCitizenRole,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const localityId = req.query.localityId as string | undefined;
      const vehicleId = req.query.vehicleId as string | undefined;

      const trackingSnapshots = await TrackingService.getCitizenTracking(
        req.user!.userId,
        req.tenant!.tenantId,
        localityId,
        vehicleId
      );

      res.json({
        data: trackingSnapshots,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
