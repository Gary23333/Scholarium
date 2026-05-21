import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Middleware } from '../context.ts';
import { logger } from '../../utils/logger.js';

export const loggerMiddleware: Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  const start = Date.now();
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  logger.info('api', `${method} ${url}`);

  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = ((statusCode: number, ...args: unknown[]) => {
    const ms = Date.now() - start;
    if (statusCode >= 400) {
      logger.warn('api', `${method} ${url} → ${statusCode} (${ms}ms)`);
    } else {
      logger.debug('api', `${method} ${url} → ${statusCode} (${ms}ms)`);
    }
    return origWriteHead(statusCode, ...(args as [Record<string, string> | undefined]));
  }) as typeof res.writeHead;

  next();
};
