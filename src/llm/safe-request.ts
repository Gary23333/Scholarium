import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns';
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2001::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return !blocked.check(address, 'ipv4');
  return isIP(address) === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
function isLocalProvider(url: URL): boolean {
  return process.env.SCHOLARIUM_ALLOW_LOCAL_PROVIDERS === '1' && LOOPBACK.has(url.hostname);
}

export function validateProviderUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (
    (!isLocalProvider(url) && url.protocol !== 'https:') ||
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (!isLocalProvider(url) && hostname === 'localhost') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    (!isLocalProvider(url) && isIP(hostname) && !isPublicAddress(hostname))
  )
    throw new Error('Provider URL must be a public HTTPS endpoint without credentials, query or fragment');
  return url;
}

/** Resolve at connection time, validate every answer and pin the selected address.
 * HTTPS retains the original hostname for certificate verification. No redirects.
 */
export function providerRequest(
  value: string,
  options: { apiKey: string; body?: string; signal?: AbortSignal },
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  const url = validateProviderUrl(value);
  const allowedAddress = isLocalProvider(url)
    ? (address: string) => address === '127.0.0.1' || address === '::1'
    : isPublicAddress;
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'http:' ? httpRequest : request;
    const req = transport(
      url,
      {
        method: options.body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
        signal: options.signal,
        agent: false,
        lookup: (hostname, opts, callback) => {
          lookup(hostname, { all: true }, (err, addresses) => {
            if (err) return callback(new Error('Provider DNS lookup failed'), '', 4);
            if (!addresses.length || addresses.some(({ address }) => !allowedAddress(address))) {
              return callback(new Error('Provider DNS resolved to a non-public address'), '', 4);
            }
            if (opts.all) callback(null, addresses);
            else callback(null, addresses[0].address, addresses[0].family);
          });
        },
      },
      (res) => {
        const status = res.statusCode ?? 500;
        if (status >= 300 && status < 400) {
          res.resume();
          reject(new Error('Provider redirects are not allowed'));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 10 * 1024 * 1024) {
            res.destroy();
            reject(new Error('Provider response is too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', () => reject(new Error('Provider response failed')));
        res.on('end', () =>
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
          }),
        );
      },
    );
    req.on('error', (err: Error) => {
      if (err.name === 'AbortError') reject(err);
      else reject(new Error('Provider request failed'));
    });
    req.end(options.body);
  });
}
