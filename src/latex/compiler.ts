// LaTeX compiler
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CompileResult, CompileError, CompileWarning } from '../types/index.ts';

export interface CompileOptions {
  workDir: string;
  texFile: string;
  outputDir?: string;
  engine?: 'tectonic' | 'pdflatex' | 'xelatex' | 'lualatex';
  timeoutMs?: number;
}

export async function compile(options: CompileOptions): Promise<CompileResult> {
  const startTime = Date.now();
  const engine = options.engine ?? await detectEngine();
  const workDir = path.resolve(options.workDir);
  const texFile = options.texFile;

  if (!fs.existsSync(path.join(workDir, texFile))) {
    return { ok: false, rawLog: '', errors: [{ type: 'missing_file', message: `File not found: ${path.join(workDir, texFile)}` }], warnings: [], durationMs: Date.now() - startTime, engine, timestamp: new Date().toISOString() };
  }

  return new Promise((resolve) => {
    let stdout = ''; let stderr = ''; let timedOut = false;
    const args = engine === 'tectonic'
      ? (options.outputDir ? ['--outdir', options.outputDir, texFile] : [texFile])
      : ['-interaction=nonstopmode', '-halt-on-error', ...(options.outputDir ? [`-output-directory=${options.outputDir}`] : []), texFile];

    const child = spawn(engine, args, { cwd: workDir, stdio: 'pipe', timeout: options.timeoutMs });
    const timer = options.timeoutMs ? setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutMs) : null;

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', () => {
      if (timer) clearTimeout(timer);
      const rawLog = stdout + '\n' + stderr;
      const errors: CompileError[] = []; const warnings: CompileWarning[] = [];

      if (timedOut) {
        resolve({ ok: false, rawLog, errors: [{ type: 'unknown', message: `Compile timeout (${options.timeoutMs}ms)` }], warnings, durationMs: Date.now() - startTime, engine, timestamp: new Date().toISOString() });
        return;
      }

      const ok = !rawLog.includes('! ') && !rawLog.includes('Fatal error');
      let pdfPath: string | undefined;
      if (ok) {
        const pdfName = texFile.replace(/\.tex$/i, '.pdf');
        const candidate = path.join(workDir, options.outputDir ?? '.', pdfName);
        if (fs.existsSync(candidate)) pdfPath = candidate;
      }
      resolve({ ok, pdfPath, rawLog, errors, warnings, durationMs: Date.now() - startTime, engine, timestamp: new Date().toISOString() });
    });

    child.on('error', (err: any) => {
      if (timer) clearTimeout(timer);
      const msg = err.code === 'ENOENT' ? `Engine "${engine}" not found. Install tectonic or TeX Live.` : err.message;
      resolve({ ok: false, rawLog: '', errors: [{ type: 'unknown', message: msg }], warnings: [], durationMs: Date.now() - startTime, engine, timestamp: new Date().toISOString() });
    });
  });
}

export async function detectEngine(): Promise<'tectonic' | 'pdflatex' | 'xelatex' | 'lualatex'> {
  for (const cmd of ['tectonic', 'pdflatex', 'xelatex', 'lualatex']) {
    if (await isCmdAvailable(cmd)) return cmd as any;
  }
  return 'tectonic';
}

function isCmdAvailable(cmd: string): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(cmd, ['--version'], { stdio: 'ignore', shell: true });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    setTimeout(() => { child.kill(); resolve(false); }, 5000);
  });
}
