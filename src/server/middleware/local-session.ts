import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Middleware } from '../context.ts';
import { error, json } from '../utils/helpers.ts';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Local processes are trusted; websites and forwarded remote clients are not. */
export function isLocalRequest(req: IncomingMessage): boolean {
  if (!LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '')) return false;
  if (!req.headers.host || req.headers['x-forwarded-for'] || req.headers.forwarded) return false;
  try {
    const host = new URL(`http://${req.headers.host}`);
    if (!LOOPBACK_HOSTS.has(host.hostname) || host.username || host.password) return false;
    if (req.headers.origin && req.headers.origin !== host.origin) return false;
  } catch {
    return false;
  }
  const site = req.headers['sec-fetch-site'];
  return !site || site === 'same-origin' || site === 'none';
}

export function createLocalSessionMiddleware(port: number): Middleware {
  const token = randomBytes(32).toString('hex');
  const cookieName = `scholarium-session-${port}`;
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (!isLocalRequest(req)) return error(res, 'Only same-origin loopback access is supported', 403);
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (!pathname.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-store');
    if (pathname === '/api/health' || req.method === 'OPTIONS') return next();
    if (pathname === '/api/session' && req.method === 'POST') {
      if (req.headers['x-scholarium-client'] !== 'local-ui') return error(res, 'Local client header required', 403);
      res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/api`);
      return json(res, { ok: true });
    }
    const value = (req.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!value || !/^[a-f0-9]{64}$/.test(value) || !timingSafeEqual(Buffer.from(value), Buffer.from(token))) {
      return error(res, 'Local session required; reload the web app', 401);
    }
    next();
  };
}
