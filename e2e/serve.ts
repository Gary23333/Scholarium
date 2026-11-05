// e2e 专用服务启动器 — 每次全新临时数据目录，端口 3460。
import { ScholariumAPI } from '../src/server.ts';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { createDefaultConfig } from '../src/config/default.ts';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scholarium-e2e-'));
const config = createDefaultConfig(DATA_DIR);
for (const provider of Object.values(config.llm.providers)) provider.apiKey = '';
fs.writeFileSync(path.join(DATA_DIR, 'scholarium.config.json'), JSON.stringify(config));
process.on('exit', () => fs.rmSync(DATA_DIR, { recursive: true, force: true }));

const api = new ScholariumAPI({
  port: Number(process.env.PORT ?? 3460),
  dataDir: DATA_DIR,
  configDir: DATA_DIR,
  staticDir: path.join(process.cwd(), 'src/frontend'),
});
await api.start();
