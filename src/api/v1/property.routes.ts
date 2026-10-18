import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireVerifiedTenant } from '../middleware/tenant.middleware';
import { PropertyService } from '../../services/property.service';

const router = Router();

router.use(requireAuth);
router.use(requireVerifiedTenant);

/**
 * POST /api/v1/properties
 * Register a new property service account within the verified tenant
 */
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { localityId, citizenUserId, propertyType, addressLine, customIdentifier } = req.body;

    if (!localityId || !propertyType || !addressLine) {
      res.status(400).json({
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'localityId, propertyType, and addressLine are required.',
        },
      });
      return;
    }

    // Role-based authorization: Citizens can ONLY register properties for themselves
    const effectiveCitizenId =
      req.tenant!.roleName === 'CITIZEN' ? req.user!.userId : citizenUserId || req.user!.userId;

    const property = await PropertyService.createProperty(req.tenant!.tenantId, {
      localityId,
      citizenUserId: effectiveCitizenId,
      propertyType,
      addressLine,
      customIdentifier,
    });

    res.status(201).json({
      data: property,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/properties
 * List properties registered in the verified municipality.
 * For CITIZEN roles, strictly restricted to their own registered properties.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Privacy boundary: Citizens strictly see only their own properties
    const effectiveCitizenId =
      req.tenant!.roleName === 'CITIZEN' ? req.user!.userId : (req.query.citizenUserId as string);

    const properties = await PropertyService.getProperties(req.tenant!.tenantId, effectiveCitizenId);
    res.json({
      count: properties.length,
      data: properties,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/properties/rates
 * Returns active fee assessment tariffs with integer minor units and provisional tax note
 */
router.get('/rates', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rates = await PropertyService.getAssessmentRates(req.tenant!.tenantId);
    res.json({
      count: rates.length,
      data: rates,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
