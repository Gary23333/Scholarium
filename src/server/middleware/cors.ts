import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Middleware } from '../context.ts';
import { getCorsOrigin } from '../utils/helpers.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': getCorsOrigin(),
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const corsMiddleware: Middleware = (_req: IncomingMessage, res: ServerResponse, next: () => void) => {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
  next();
};

export function handlePreflight(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}
