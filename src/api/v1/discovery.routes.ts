import { Router, Request, Response, NextFunction } from 'express';
import { TenantService } from '../../services/tenant.service';

const router = Router();

/**
 * GET /api/v1/municipalities
 * Public discovery endpoint: returns active municipalities, wards, and localities
 */
router.get('/municipalities', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const municipalities = await TenantService.getPublicMunicipalities();
    res.json({
      count: municipalities.length,
      data: municipalities,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
