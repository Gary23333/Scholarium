import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ScholariumAPI } from './server.ts';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ❌ ${label}`);
  }
}

function fetchJson(
  url: string,
  opts?: RequestInit,
): Promise<{ status: number; data: any; headers: Record<string, string> }> {
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
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') headers[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, data, headers });
        });
      },
    );
    req.on('error', reject);
    if (opts?.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  console.log('\n🧪 Scholarium Mock Test Suite\n');

  const port = 3457;
  const dataDir = path.join(os.tmpdir(), `scholarium-mock-test-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });

  let api: ScholariumAPI;
  try {
    api = new ScholariumAPI({ port, dataDir });
    await api.start();
    console.log(`Server started on port ${port}\n`);
  } catch (e: any) {
    console.error(`Failed to start server: ${e.message}`);
    process.exit(1);
  }

  const base = `http://127.0.0.1:${port}`;

  try {
    console.log('--- Health Endpoints ---');
    {
      const r = await fetchJson(`${base}/api/health`);
      assert(r.status === 200, 'GET /api/health returns 200');
      assert(r.data.status === 'ok', 'GET /api/health status is ok');
      assert(typeof r.data.uptime === 'number', 'GET /api/health has uptime');
      assert(typeof r.data.timestamp === 'string', 'GET /api/health has timestamp');
    }
    {
      const r = await fetchJson(`${base}/api/health/ready`);
      assert(r.status === 503 || r.status === 200, 'GET /api/health/ready returns valid status');
      assert(r.data.checks !== undefined, 'GET /api/health/ready has checks');
      assert(r.data.checks.db?.ok === true, 'GET /api/health/ready db check is ok');
    }

    console.log('\n--- Stats Endpoint ---');
    {
      const r = await fetchJson(`${base}/api/stats`);
      assert(r.status === 200, 'GET /api/stats returns 200');
      assert(typeof r.data.papers === 'number', 'GET /api/stats has papers count');
      assert(typeof r.data.mindmaps === 'number', 'GET /api/stats has mindmaps count');
    }

    console.log('\n--- Papers Endpoints ---');
    {
      const r = await fetchJson(`${base}/api/papers`);
      assert(r.status === 200, 'GET /api/papers returns 200');
      assert(Array.isArray(r.data.papers), 'GET /api/papers returns papers array');
      assert(typeof r.data.total === 'number', 'GET /api/papers returns total');
    }
    {
      const r = await fetchJson(`${base}/api/papers`, {
        method: 'POST',
        body: JSON.stringify({ title: 'Test Paper', targetJournal: 'Nature' }),
      });
      assert(r.status === 200, 'POST /api/papers returns 200');
      assert(typeof r.data.paperId === 'string', 'POST /api/papers returns paperId');
      assert(r.data.paper.title === 'Test Paper', 'POST /api/papers sets title');
      assert(r.data.paper.targetJournal === 'Nature', 'POST /api/papers sets targetJournal');
    }
    {
      const r = await fetchJson(`${base}/api/papers/nonexistent`);
      assert(r.status === 404, 'GET /api/papers/:id returns 404 for unknown paper');
    }

    console.log('\n--- Tasks Endpoint ---');
    {
      const r = await fetchJson(`${base}/api/tasks`);
      assert(r.status === 200, 'GET /api/tasks returns 200');
      assert(Array.isArray(r.data.tasks), 'GET /api/tasks returns tasks array');
    }

    console.log('\n--- LLM Config Endpoint ---');
    {
      const r = await fetchJson(`${base}/api/llm/config`);
      assert(r.status === 200, 'GET /api/llm/config returns 200');
      assert(r.data.config !== undefined, 'GET /api/llm/config has config');
      assert(r.data.routes !== undefined, 'GET /api/llm/config has routes');
      assert(r.data.validation !== undefined, 'GET /api/llm/config has validation');
    }

    console.log('\n--- CORS Preflight ---');
    {
      const r = await fetchJson(`${base}/api/papers`, { method: 'OPTIONS' });
      assert(r.status === 204, 'OPTIONS /api/papers returns 204');
    }

    console.log('\n--- 404 Handling ---');
    {
      const r = await fetchJson(`${base}/api/nonexistent`);
      assert(r.status === 404, 'Unknown route returns 404');
      assert(r.data.error === 'Not found', 'Unknown route returns Not found error');
    }

    console.log('\n--- CORS Headers ---');
    {
      const r = await fetchJson(`${base}/api/health`);
      assert(r.headers['access-control-allow-origin'] === '*', 'CORS header present on responses');
    }
  } catch (e: any) {
    console.error(`\nTest execution error: ${e.message}`);
    failed++;
    failures.push(`Execution error: ${e.message}`);
  } finally {
    api.stop();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // cleanup error acceptable
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  ❌ ${f}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
