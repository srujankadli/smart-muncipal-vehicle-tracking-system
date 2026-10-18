import express, { Express, Request, Response } from 'express';
import { errorHandler } from './api/middleware/error.middleware';
import authRoutes from './api/v1/auth.routes';
import discoveryRoutes from './api/v1/discovery.routes';
import tenantRoutes from './api/v1/tenant.routes';
import propertyRoutes from './api/v1/property.routes';
import accountingRoutes from './api/v1/accounting.routes';
import telemetryRoutes from './api/v1/telemetry.routes';
import citizenTrackingRoutes from './api/v1/citizen-tracking.routes';
import paymentRoutes from './api/v1/payment.routes';
import webhookRoutes from './api/v1/webhook.routes';
import { config } from './config';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  // Hardened Security Headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    next();
  });

  // Controlled CORS Policy
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Tenant-Id, X-Device-Token, X-Idempotency-Key, X-Webhook-Signature'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Middleware with raw body retention for webhook signature verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      environment: config.env,
      policies: {
        taxPolicyConfirmed: config.policies.taxPolicyConfirmed,
        accountingPolicyConfirmed: config.policies.accountingPolicyConfirmed,
        dataRetentionConfirmed: config.policies.dataRetentionConfirmed,
        propertyIdStrategy: config.policies.propertyIdStrategy,
        doorstepCashEnabled: config.policies.doorstepCashEnabled,
      },
    });
  });

  // API v1 Versioned Routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1', discoveryRoutes);
  app.use('/api/v1/tenants', tenantRoutes);
  app.use('/api/v1/properties', propertyRoutes);
  app.use('/api/v1/accounting', accountingRoutes);
  app.use('/api/v1/telemetry', telemetryRoutes);
  app.use('/api/v1/citizen/tracking', citizenTrackingRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/webhooks', webhookRoutes);

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}

export const app = createApp();
