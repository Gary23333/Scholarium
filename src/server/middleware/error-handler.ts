import type { IncomingMessage, ServerResponse } from 'node:http';
import { error } from '../utils/helpers.ts';
import { AppError } from './errors.ts';
import { logger } from '../../utils/logger.ts';

export function handleRouteError(err: unknown, res: ServerResponse): void {
  if (res.headersSent) return;

  const isProduction = process.env.NODE_ENV === 'production';

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`[${err.code}] ${err.message}`, err);
    } else {
      logger.warn(`[${err.code}] ${err.message}`);
    }
    error(res, err.message, err.statusCode);
    return;
  }

  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    logger.warn('[SYNTAX_ERROR] JSON parse error in request body');
    error(res, 'Invalid JSON in request body', 400);
    return;
  }

  if (err instanceof Error && err.message === 'Invalid JSON in request body') {
    logger.warn('[VALIDATION_ERROR] Invalid JSON in request body');
    error(res, 'Invalid JSON in request body', 400);
    return;
  }

  logger.error(
    `[INTERNAL_ERROR] ${err instanceof Error ? err.message : String(err)}`,
    err instanceof Error ? err : undefined,
  );

  const message = isProduction ? 'Internal server error' : err instanceof Error ? err.message : String(err);
  error(res, message, 500);
}
