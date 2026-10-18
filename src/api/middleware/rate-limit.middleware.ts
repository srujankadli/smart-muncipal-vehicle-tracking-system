import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  errorCode?: string;
}

// In-memory sliding-window store for IP / client rate limiting
const store = new Map<string, RateLimitRecord>();

/**
 * Creates a rate limiting middleware with standard rate-limit headers.
 * Protects sensitive endpoints (login, telemetry ingest, payment order creation) from abuse.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests. Please try again later.',
    errorCode = 'RATE_LIMIT_EXCEEDED',
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.baseUrl || req.path}:${ip}`;

    let record = store.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      store.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('RateLimit-Limit', maxRequests.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', resetSeconds.toString());

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds.toString());
      res.status(429).json({
        error: {
          code: errorCode,
          message,
          retryAfterSeconds: resetSeconds,
        },
      });
      return;
    }

    next();
  };
}

/**
 * Reset all rate limits in memory (used during testing).
 */
export function resetRateLimits(): void {
  store.clear();
}

// Standard rate limiters configured for sensitive API routes
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 15,
  message: 'Too many authentication attempts. Please wait before retrying.',
  errorCode: 'AUTH_RATE_LIMIT_EXCEEDED',
});

export const telemetryRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 150,
  message: 'Telemetry ingestion rate limit exceeded.',
  errorCode: 'TELEMETRY_RATE_LIMIT_EXCEEDED',
});

export const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  message: 'Payment order creation rate limit exceeded. Please wait.',
  errorCode: 'PAYMENT_RATE_LIMIT_EXCEEDED',
});
