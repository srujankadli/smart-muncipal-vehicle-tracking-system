import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload } from '../../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication token is missing or malformed. Provide Bearer token in Authorization header.',
      },
    });
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    const payload = AuthService.verifyToken(token);
    req.user = payload;
    next();
  } catch (err: any) {
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: err.message || 'Authentication token is invalid or expired.',
      },
    });
  }
}
