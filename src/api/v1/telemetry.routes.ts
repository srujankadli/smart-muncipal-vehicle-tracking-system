import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { TrackingService } from '../../services/tracking.service';
import { telemetryRateLimiter } from '../middleware/rate-limit.middleware';
import { config } from '../../config';

const router = Router();

// Middleware: enforce 2 KB payload cap specifically for telemetry ingestion
const telemetryJsonParser = express.json({ limit: `${config.tracking.maxPayloadSizeBytes}b` });

/**
 * POST /api/v1/telemetry/ingest
 * Ingest high-frequency GPS telemetry from mobile/hardware tracking devices.
 * Authenticated via X-Device-Token header.
 */
router.post('/ingest', telemetryRateLimiter, (req: Request, res: Response, next: NextFunction) => {
  const contentLength = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;
  const rawBodyLength = req.body ? Buffer.byteLength(JSON.stringify(req.body)) : 0;

  if (contentLength > config.tracking.maxPayloadSizeBytes || rawBodyLength > config.tracking.maxPayloadSizeBytes) {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Telemetry payload exceeds maximum permitted size of 2 KB.',
      },
    });
    return;
  }
  next();
}, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.headers['x-device-token'] as string | undefined;
    const device = await TrackingService.authenticateDevice(rawToken);

    const result = await TrackingService.ingestTelemetry(device, req.body);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
