import type { ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';

export function isSafeUrl(urlStr: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return false;
  if (hostname.endsWith('.localhost') || hostname.endsWith('.local')) return false;
  const ipMatch = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipMatch) {
    const octets = [Number(ipMatch[1]), Number(ipMatch[2]), Number(ipMatch[3]), Number(ipMatch[4])];
    if (octets[0] === 10) return false;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
    if (octets[0] === 192 && octets[1] === 168) return false;
    if (octets[0] === 169 && octets[1] === 254) return false;
    if (octets[0] === 0) return false;
    if (octets[0] === 127) return false;
  }
  if (hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')) return false;
  const localIPs = getLocalIPs();
  if (localIPs.has(hostname)) return false;
  return true;
}

const _localIPs = new Set<string>();
let _localIPsComputed = false;
function getLocalIPs(): Set<string> {
  if (_localIPsComputed) return _localIPs;
  try {
    for (const ifs of Object.values(networkInterfaces())) {
      if (!ifs) continue;
      for (const addr of ifs) {
        if (addr.address) _localIPs.add(addr.address);
      }
    }
  } catch { /* ignore */ }
  _localIPsComputed = true;
  return _localIPs;
}

export function getCorsOrigin(): string {
  return process.env.CORS_ORIGIN || '*';
}

export function json(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getCorsOrigin() });
  res.end(JSON.stringify(data));
}

export function error(res: ServerResponse, msg: string, status = 400) {
  json(res, { error: msg, code: status }, status);
}

export function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    const onData = (c: Buffer) => {
      if (tooLarge) return;
      size += c.length;
      if (size > 1048576) {
        tooLarge = true;
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(c);
    };
    const onEnd = () => resolve(Buffer.concat(chunks).toString());
    const onError = (err: Error) => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      reject(err);
    };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

export async function parseBody(req: any): Promise<any> {
  const raw = await readBody(req);
  if (!raw || raw.trim() === '') return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Invalid JSON in request body', { cause: e });
  }
}

export function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}
