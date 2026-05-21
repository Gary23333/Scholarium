import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Middleware } from '../context.ts';
import { getCorsOrigin } from '../utils/helpers.ts';

export const corsMiddleware: Middleware = (_req: IncomingMessage, res: ServerResponse, next: () => void) => {
  res.setHeader('Access-Control-Allow-Origin', getCorsOrigin());
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
};

export function handlePreflight(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', getCorsOrigin());
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}
