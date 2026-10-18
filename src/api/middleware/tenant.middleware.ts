import { Request, Response, NextFunction } from 'express';
import { AuthService, VerifiedMembership } from '../../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      tenant?: VerifiedMembership;
    }
  }
}

/**
 * Tenant derivation middleware.
 * Strictly verifies that the authenticated user possesses active membership in the target tenant.
 * Client-supplied headers (e.g. X-Tenant-Id) are treated solely as requested context and are NEVER
 * trusted without database verification against user_tenant_memberships.
 */
export async function requireVerifiedTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user || !req.user.userId) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Tenant context requires an authenticated user session.',
      },
    });
    return;
  }

  // Optional requested tenant (via header or query param)
  const requestedTenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenantId as string);

  try {
    const verifiedMembership = await AuthService.getVerifiedMembership(
      req.user.userId,
      requestedTenantId
    );

    req.tenant = verifiedMembership;
    next();
  } catch (err: any) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN_TENANT_ACCESS',
        message: err.message || 'User does not possess verified membership in this municipality.',
      },
    });
  }
}
