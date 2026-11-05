import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { ScholariumAPI } from '../../server.ts';
import { createDefaultConfig } from '../../config/default.ts';

const fakeKey = 'fixture-key-do-not-send';
let directory: string;
let api: ScholariumAPI;
let base: string;
let cookie: string;
let template: string;

beforeAll(async () => {
  const port = await new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      server.close(() => resolve(address.port));
    });
  });
  directory = mkdtempSync(join(tmpdir(), 'scholarium-security-'));
  const config = createDefaultConfig(directory);
  for (const provider of Object.values(config.llm.providers)) provider.apiKey = '';
  config.llm.providers.deepseek.apiKey = fakeKey;
  template = JSON.stringify(config);
  writeFileSync(join(directory, 'scholarium.config.json'), template);
  api = new ScholariumAPI({ port, dataDir: directory, configDir: directory });
  await api.start();
  base = `http://127.0.0.1:${port}`;
  const response = await fetch(`${base}/api/session`, {
    method: 'POST',
    headers: { 'X-Scholarium-Client': 'local-ui' },
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get('set-cookie')!;
  expect(setCookie).toContain('HttpOnly');
  expect(setCookie).toContain('SameSite=Strict');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
  cookie = setCookie.split(';')[0];
});

afterAll(() => {
  api?.stop();
  rmSync(directory, { recursive: true, force: true });
});

function post(path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('local API boundary', () => {
  it('requires a session for reads and writes, while liveness stays public', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    expect((await fetch(`${base}/api/llm/config`)).status).toBe(401);
    expect((await fetch(`${base}/api/llm/config`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${base}/api/session`, { method: 'POST' })).status).toBe(403);
  });
  it('rejects hostile origins, DNS-rebinding hosts and forwarded clients even with a session', async () => {
    for (const headers of [
      { Origin: 'https://untrusted.example' },
      { Host: 'untrusted.example' },
      { 'Sec-Fetch-Site': 'cross-site' },
      { 'X-Forwarded-For': '198.51.100.2' },
    ]) {
      const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request(`${base}/api/llm/config`, { headers: { Cookie: cookie, ...headers } }, (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        });
        req.on('error', reject);
        req.end();
      });
      expect(response.status, JSON.stringify(headers)).toBe(403);
      expect(response.body).not.toContain(fakeKey);
    }
  });
  it('returns only masked provider keys', async () => {
    const response = await fetch(`${base}/api/llm/config`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('***configured***');
    expect(text).not.toContain(fakeKey);
  });
  it('validates all interactive provider endpoints before making requests', async () => {
    for (const path of ['/api/llm/test', '/api/llm/provider-models']) {
      const response = await post(path, { baseUrl: 'http://127.0.0.1:1', apiKey: fakeKey, model: 'fake' });
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain(fakeKey);
    }
  });
  it('requires explicit key replacement when changing endpoints', async () => {
    for (const apiKey of [undefined, '***configured***']) {
      const response = await post('/api/llm/config', {
        providers: { deepseek: { baseUrl: 'https://replacement.example/v1', apiKey } },
      });
      expect(response.status).toBe(400);
    }
  });
  it('persists explicitly cleared keys privately without overwriting tracked templates', async () => {
    const response = await post('/api/llm/config', {
      providers: { deepseek: { baseUrl: 'https://replacement.example/v1', apiKey: '' } },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(fakeKey);
    const file = join(directory, 'scholarium.local.json');
    expect(JSON.parse(readFileSync(file, 'utf8')).llm.providers.deepseek.apiKey).toBe('');
    expect(readFileSync(join(directory, 'scholarium.config.json'), 'utf8')).toBe(template);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});
