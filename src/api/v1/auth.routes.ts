import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';
import { query } from '../../db/pool';

const router = Router();

/**
 * POST /api/v1/auth/login
 * Public authentication using mobile number and password
 */
router.post('/login', authRateLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { mobileNumber, password } = req.body;

    if (!mobileNumber || !password || typeof mobileNumber !== 'string' || typeof password !== 'string') {
      res.status(400).json({
        error: {
          code: 'INVALID_CREDENTIALS_PAYLOAD',
          message: 'Both mobileNumber and password are required and must be valid strings.',
        },
      });
      return;
    }

    const { rows } = await query(
      'SELECT id, mobile_number, password_hash, full_name, is_active FROM users WHERE mobile_number = $1',
      [mobileNumber.trim()]
    );

    if (rows.length === 0) {
      res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid mobile number or password.',
        },
      });
      return;
    }

    const user = rows[0];

    if (!user.is_active) {
      res.status(403).json({
        error: {
          code: 'USER_DEACTIVATED',
          message: 'This user account has been deactivated.',
        },
      });
      return;
    }

    const isValid = await AuthService.verifyPassword(password, user.password_hash);
    if (!isValid) {
      res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid mobile number or password.',
        },
      });
      return;
    }

    const token = AuthService.generateToken({
      userId: user.id,
      mobileNumber: user.mobile_number,
    });

    const memberships = await AuthService.getUserMemberships(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        mobileNumber: user.mobile_number,
        fullName: user.full_name,
      },
      memberships,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/auth/me
 * Authenticated user profile and tenant memberships
 */
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { rows } = await query(
      'SELECT id, mobile_number, full_name, email, is_active, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile not found.',
        },
      });
      return;
    }

    const memberships = await AuthService.getUserMemberships(userId);

    res.json({
      user: rows[0],
      memberships,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
