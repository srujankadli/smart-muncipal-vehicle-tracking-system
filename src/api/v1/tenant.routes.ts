import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireVerifiedTenant } from '../middleware/tenant.middleware';
import { TenantService } from '../../services/tenant.service';

const router = Router();

// Apply auth and tenant verification to all tenant operational routes
router.use(requireAuth);
router.use(requireVerifiedTenant);

/**
 * GET /api/v1/tenants/current
 * Returns the verified tenant context and role of the requesting user
 */
router.get('/current', (req: Request, res: Response): void => {
  res.json({
    tenant: req.tenant,
  });
});

/**
 * GET /api/v1/tenants/wards
 * Returns wards within the verified municipality
 */
router.get('/wards', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const wards = await TenantService.getTenantWards(req.tenant!.tenantId);
    res.json({
      count: wards.length,
      data: wards,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/tenants/localities
 * Returns localities within the verified municipality (optional wardId query filter)
 */
router.get('/localities', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const wardId = req.query.wardId as string;
    const localities = await TenantService.getTenantLocalities(req.tenant!.tenantId, wardId);
    res.json({
      count: localities.length,
      data: localities,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
