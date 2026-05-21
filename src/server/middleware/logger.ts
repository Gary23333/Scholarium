import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Middleware } from '../context.ts';
import { logger } from '../../utils/logger.ts';

export const loggerMiddleware: Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  const start = Date.now();
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  logger.info('api', `${method} ${url}`);

  res.on('finish', () => {
    const ms = Date.now() - start;
    const statusCode = res.statusCode;
    if (statusCode >= 400) {
      logger.warn('api', `${method} ${url} → ${statusCode} (${ms}ms)`);
    } else {
      logger.debug('api', `${method} ${url} → ${statusCode} (${ms}ms)`);
    }
  });

  next();
};
