import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
    setLogFile: vi.fn(),
  },
}));

vi.mock('../../utils/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
    setLogFile: vi.fn(),
  },
  getErrorMessage: (e: unknown) => String(e),
}));

import { ScholariumAPI } from '../../server.ts';

let api: ScholariumAPI;
let port: number;
let baseUrl: string;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const server = require('node:net').createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      server.close(() => resolve(addr.port));
    });
    server.on('error', reject);
  });
}

function fetchJson(url: string, opts?: RequestInit): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: opts?.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...((opts?.headers as Record<string, string>) ?? {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let data: any;
          try {
            data = JSON.parse(body);
          } catch {
            data = body;
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    req.on('error', reject);
    if (opts?.body) req.write(opts.body);
    req.end();
  });
}

describe('Server Routes (Integration)', () => {
  beforeAll(async () => {
    port = await getFreePort();
    const dataDir = path.join(os.tmpdir(), `scholarium-integration-${Date.now()}`);
    fs.mkdirSync(dataDir, { recursive: true });
    api = new ScholariumAPI({ port, dataDir });
    await api.start();
    baseUrl = `http://127.0.0.1:${port}`;
  }, 30000);

  afterAll(() => {
    api?.stop();
  });

  describe('GET /api/stats', () => {
    it('should return stats', async () => {
      const { status, data } = await fetchJson(`${baseUrl}/api/stats`);
      expect(status).toBe(200);
      expect(data).toHaveProperty('papers');
      expect(data).toHaveProperty('mindmaps');
      expect(data).toHaveProperty('totalCitations');
      expect(data).toHaveProperty('totalBibleEntries');
    });
  });

  describe('GET /api/papers', () => {
    it('should return 404 for unknown paper', async () => {
      const { status } = await fetchJson(`${baseUrl}/api/papers/nonexistent`);
      expect(status).toBe(404);
    });
  });

  describe('GET /api/tasks', () => {
    it('should return tasks list', async () => {
      const { status, data } = await fetchJson(`${baseUrl}/api/tasks`);
      expect(status).toBe(200);
      expect(data).toBeDefined();
    });
  });

  describe('POST /api/papers', () => {
    it('should create a new paper', async () => {
      const { status, data } = await fetchJson(`${baseUrl}/api/papers`, {
        method: 'POST',
        body: JSON.stringify({ title: 'Test Paper', targetJournal: 'Nature' }),
      });
      expect(status).toBe(200);
      expect(data).toHaveProperty('paperId');
      expect(data.paper.title).toBe('Test Paper');
      expect(data.paper.targetJournal).toBe('Nature');
    });

    it('should create paper with default title', async () => {
      const { status, data } = await fetchJson(`${baseUrl}/api/papers`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(status).toBe(200);
      expect(data.paper.title).toBe('Untitled');
    });
  });

  describe('OPTIONS request (CORS preflight)', () => {
    it('should respond with 204 for OPTIONS', async () => {
      const { status } = await fetchJson(`${baseUrl}/api/stats`, {
        method: 'OPTIONS',
      });
      expect(status).toBe(204);
    });
  });

  describe('404 for unknown routes', () => {
    it('should return 404 for unknown path', async () => {
      const { status, data } = await fetchJson(`${baseUrl}/api/nonexistent`);
      expect(status).toBe(404);
      expect(data.error).toBe('Not found');
    });
  });
});
