// e2e 专用服务启动器 — 每次全新临时数据目录，端口 3460。
import { ScholariumAPI } from '../src/server.ts';
import * as path from 'node:path';
import * as fs from 'node:fs';

const DATA_DIR = '/tmp/scholar-e2e-playwright';
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const api = new ScholariumAPI({
  port: Number(process.env.PORT ?? 3460),
  dataDir: DATA_DIR,
  staticDir: path.join(process.cwd(), 'src/frontend'),
});
await api.start();
