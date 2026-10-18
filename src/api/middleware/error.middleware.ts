import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Safe sanitized logging without leaking query params with credentials
  console.error(`[API_ERROR] ${req.method} ${req.path}:`, err.message || err);

  const message = err.message || 'An unexpected internal server error occurred.';

  // Handle JSON parsing syntax errors (malformed JSON payloads)
  if (err instanceof SyntaxError && ('body' in err || (err as any).type === 'entity.parse.failed')) {
    res.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'The request body contains invalid or malformed JSON syntax.',
      },
    });
    return;
  }

  // Handle JWT verification or expiration errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: err.message || 'Authentication token is invalid or expired.',
      },
    });
    return;
  }

  // Map known domain and invariant error codes to appropriate HTTP status codes
  if (message.includes('NOT_FOUND')) {
    res.status(404).json({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message,
      },
    });
    return;
  }

  if (message.includes('UNBALANCED_JOURNAL') || message.includes('POSTING_VALIDATION_FAILED') || message.includes('INSUFFICIENT_LINES')) {
    res.status(400).json({
      error: {
        code: 'ACCOUNTING_INVARIANT_VIOLATION',
        message,
      },
    });
    return;
  }

  if (message.includes('IMMUTABLE_RECORD') || message.includes('ALREADY_POSTED') || message.includes('CANNOT_REVERSE_DRAFT')) {
    res.status(409).json({
      error: {
        code: 'IMMUTABLE_RECORD_CONFLICT',
        message,
      },
    });
    return;
  }

  if (message.includes('DUPLICATE_BUSINESS_EVENT') || err.code === '23505') {
    res.status(409).json({
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'A record or journal entry already exists for this business event or unique key.',
      },
    });
    return;
  }

  if (
    message.includes('AUTH_MISSING_DEVICE_TOKEN') ||
    message.includes('AUTH_INVALID_TOKEN_FORMAT') ||
    message.includes('AUTH_INVALID_DEVICE_CREDENTIALS') ||
    message.includes('AUTH_DEVICE_REVOKED') ||
    message.includes('AUTH_DEVICE_SUSPENDED')
  ) {
    res.status(401).json({
      error: {
        code: 'DEVICE_AUTHENTICATION_FAILED',
        message,
      },
    });
    return;
  }

  if (
    message.includes('AUTH_DEVICE_VEHICLE_MISMATCH') ||
    message.includes('AUTH_VEHICLE_INACTIVE') ||
    message.includes('AUTH_CITIZEN_ONLY_ENDPOINT') ||
    message.includes('AUTH_NO_ELIGIBLE_SERVICE_AREAS') ||
    message.includes('AUTH_INELIGIBLE_SERVICE_AREA') ||
    message.includes('AUTH_INELIGIBLE_VEHICLE') ||
    message.includes('USER_NOT_AUTHORIZED_FOR_TENANT') ||
    message.includes('AUTH_FORBIDDEN_OBJECT_ACCESS') ||
    message.includes('FORBIDDEN')
  ) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN_ACCESS',
        message,
      },
    });
    return;
  }

  if (message.includes('DOORSTEP_CASH_DISABLED')) {
    res.status(403).json({
      error: {
        code: 'DOORSTEP_CASH_DISABLED',
        message,
      },
    });
    return;
  }

  if (message.includes('AUTH_FORBIDDEN_BILL_ACCESS')) {
    res.status(403).json({
      error: {
        code: 'AUTH_FORBIDDEN_BILL_ACCESS',
        message,
      },
    });
    return;
  }

  if (message.includes('INVALID_AMOUNT')) {
    res.status(400).json({
      error: {
        code: 'INVALID_AMOUNT',
        message,
      },
    });
    return;
  }

  if (message.includes('OVERPAYMENT_NOT_PERMITTED')) {
    res.status(400).json({
      error: {
        code: 'OVERPAYMENT_NOT_PERMITTED',
        message,
      },
    });
    return;
  }

  if (
    message.includes('MISSING_PAYMENT_METHOD') ||
    message.includes('MISSING_AMOUNT') ||
    message.includes('UNSUPPORTED_PAYMENT_METHOD')
  ) {
    res.status(400).json({
      error: {
        code: 'INVALID_PAYMENT_PARAMETERS',
        message,
      },
    });
    return;
  }

  if (message.includes('BILL_ALREADY_PAID') || message.includes('BILL_CANCELLED')) {
    res.status(409).json({
      error: {
        code: 'BILL_STATUS_CONFLICT',
        message,
      },
    });
    return;
  }

  if (message.includes('REPLAYED_OR_OUT_OF_ORDER_TELEMETRY')) {
    res.status(409).json({
      error: {
        code: 'REPLAYED_OR_OUT_OF_ORDER_TELEMETRY',
        message,
      },
    });
    return;
  }

  if (message.includes('PAYLOAD_TOO_LARGE') || err.type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Telemetry payload exceeds maximum permitted size of 2 KB.',
      },
    });
    return;
  }

  if (message.includes('INVALID_LOCALITY') || message.includes('VALIDATION_FAILED')) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message,
      },
    });
    return;
  }

  // Generic 500 without leaking stack traces or internal secrets
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal error occurred while processing the request.',
    },
  });
}
