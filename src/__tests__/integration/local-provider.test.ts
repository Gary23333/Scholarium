import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { LLMClient } from '../../llm/client.ts';

let server: Server;
let baseUrl: string;
let calls = 0;
beforeAll(async () => {
  vi.stubEnv('SCHOLARIUM_ALLOW_LOCAL_PROVIDERS', '1');
  server = createServer((req, res) => {
    calls += 1;
    expect(req.headers.authorization).toBe('Bearer fake-local-key');
    if (req.url?.startsWith('/redirect')) {
      res.writeHead(307, { Location: `${baseUrl}/unexpected` });
      res.end();
    } else if (req.url?.startsWith('/error')) {
      res.writeHead(401);
      res.end('upstream echoed fake-local-key');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: 'local fixture reply' } }] }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
function client(path = '') {
  return new LLMClient({ baseUrl: baseUrl + path, apiKey: 'fake-local-key', model: 'fixture', maxRetries: 0 });
}

describe('opted-in loopback provider', () => {
  it('preserves local model calls through the actual HTTP transport', async () => {
    expect(await client().complete('system', 'user')).toBe('local fixture reply');
  });
  it('rejects redirects without issuing a second request', async () => {
    const before = calls;
    await expect(client('/redirect').complete('system', 'user')).rejects.toThrow('redirects are not allowed');
    expect(calls).toBe(before + 1);
  });
  it('does not echo provider response bodies containing keys', async () => {
    await expect(client('/error').complete('system', 'user')).rejects.toThrow(/^LLM API error 401$/);
  });
});
