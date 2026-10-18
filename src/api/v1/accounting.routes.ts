import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireVerifiedTenant } from '../middleware/tenant.middleware';
import { AccountingService } from '../../services/accounting.service';

const router = Router();

router.use(requireAuth);
router.use(requireVerifiedTenant);

function requireAccountingRole(req: Request, res: Response, next: NextFunction): void {
  const allowedRoles = ['MUNICIPAL_ADMIN', 'SUPERVISOR', 'ACCOUNTANT'];
  if (!req.tenant || !allowedRoles.includes(req.tenant.roleName)) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN_MUNICIPAL_ADMIN_ONLY',
        message: 'Accounting and financial operations are restricted to municipal administrative roles.',
      },
    });
    return;
  }
  next();
}

router.use(requireAccountingRole);

/**
 * GET /api/v1/accounting/accounts
 * List Chart of Accounts for current verified tenant
 */
router.get('/accounts', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const accounts = await AccountingService.getChartOfAccounts(req.tenant!.tenantId);
    res.json({
      count: accounts.length,
      data: accounts,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/accounting/journals
 * Create a new DRAFT journal entry with balanced lines
 */
router.post('/journals', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { postingDate, businessEventType, businessEventId, currency, description, lines } = req.body;

    if (!postingDate || !businessEventType || !businessEventId || !description || !lines) {
      res.status(400).json({
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'postingDate, businessEventType, businessEventId, description, and lines are required.',
        },
      });
      return;
    }

    const draft = await AccountingService.createJournalDraft(
      req.tenant!.tenantId,
      {
        postingDate,
        businessEventType,
        businessEventId,
        currency,
        description,
        lines,
      },
      req.user!.userId
    );

    res.status(201).json({
      data: draft,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/accounting/journals/:id/post
 * Post a draft journal entry atomically with row locking and invariant verification
 */
router.post('/journals/:id/post', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const journalEntryId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const posted = await AccountingService.postJournalEntry(
      req.tenant!.tenantId,
      journalEntryId,
      req.user!.userId
    );

    res.json({
      message: 'Journal entry successfully posted.',
      data: posted,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/accounting/journals/:id/reverse
 * Create a separate, balanced compensating reversal entry.
 * STRICT IMMUTABILITY: The original entry remains in POSTED status.
 */
router.post('/journals/:id/reverse', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const journalEntryId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const { reason } = req.body;

    const result = await AccountingService.createCompensatingReversal(
      req.tenant!.tenantId,
      journalEntryId,
      req.user!.userId,
      reason
    );

    res.status(201).json({
      message: 'Compensating reversal successfully created and posted. Original entry remains immutable.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/accounting/journals
 * List journal entries with balanced lines for the verified tenant
 */
router.get('/journals', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const journals = await AccountingService.getJournalEntries(req.tenant!.tenantId, limit);
    res.json({
      count: journals.length,
      data: journals,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
