// Figures Module — Chart rendering for LaTeX papers
// Supports: Mermaid diagrams, LaTeX tables, data tables

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

export interface MermaidOptions {
  format?: 'svg' | 'png';
  theme?: 'default' | 'neutral' | 'dark' | 'forest';
  backgroundColor?: string;
}

export interface TableOptions {
  caption?: string;
  label?: string;
  columnAlign?: string;
  float?: 'htbp' | 'H' | 't';
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

// ═══════════════════════════════════════════
// Mermaid Diagram Rendering
// ═══════════════════════════════════════════

export async function renderMermaid(
  diagram: string,
  outputPath?: string,
  options: MermaidOptions = {}
): Promise<string> {
  const format = options.format ?? 'svg';
  const mmdFile = outputPath ?? join('/tmp', `scholarium-${Date.now()}.mmd`);
  const outputFile = mmdFile.replace(/\.mmd$/, `.${format}`);

  try {
    writeFileSync(mmdFile, diagram, 'utf-8');

    // Try mmdc CLI first
    try {
      const mmdcArgs = [
        '-i', mmdFile,
        '-o', outputFile,
        '-t', options.theme ?? 'default',
      ];
      if (options.backgroundColor) {
        mmdcArgs.push('-C', options.backgroundColor);
      }
      execSync(`npx -y @mermaid-js/mermaid-cli ${mmdcArgs.join(' ')}`, {
        timeout: 30000,
        stdio: 'pipe',
      });
      logger.debug('Figures', `Mermaid rendered: ${outputFile}`);
    } catch {
      // Fallback: return mermaid code block for LaTeX
      logger.warn('Figures', 'mermaid-cli unavailable, returning raw diagram code');
      return formatMermaidAsLaTeX(diagram, options);
    }

    return outputFile;
  } catch (e) {
    logger.warn('Figures', `Mermaid render failed: ${String(e)}`);
    return formatMermaidAsLaTeX(diagram, options);
  }
}

function formatMermaidAsLaTeX(diagram: string, options: MermaidOptions): string {
  // Return as a LaTeX comment with URL for external rendering
  const encoded = encodeURIComponent(diagram);
  const url = `https://mermaid.ink/svg/${Buffer.from(diagram).toString('base64')}`;
  return `% Mermaid diagram (render externally):\n% ${url}\n% Raw diagram:\n% ${diagram.replace(/\n/g, '\n% ')}`;
}

// ═══════════════════════════════════════════
// LaTeX Table Formatting
// ═══════════════════════════════════════════

export function formatTable(data: TableData, options: TableOptions = {}): string {
  const { caption, label, columnAlign, float = 'htbp' } = options;
  const ncols = data.headers.length;

  // Auto-align
  const align = columnAlign ?? 'l' + 'c'.repeat(ncols - 1);

  const lines: string[] = [];
  lines.push(`\\begin{table}[${float}]`);
  lines.push('  \\centering');

  if (caption) {
    lines.push(`  \\caption{${caption}}`);
  }
  if (label) {
    lines.push(`  \\label{${label}}`);
  }

  lines.push(`  \\begin{tabular}{${align}}`);
  lines.push('    \\hline');

  // Header
  lines.push('    ' + data.headers.map(h => escapeLaTeX(h)).join(' & ') + ' \\\\');
  lines.push('    \\hline');

  // Rows
  for (const row of data.rows) {
    const padded = [...row];
    while (padded.length < ncols) padded.push('');
    lines.push('    ' + padded.map(c => escapeLaTeX(c)).join(' & ') + ' \\\\');
  }

  lines.push('    \\hline');
  lines.push('  \\end{tabular}');
  lines.push(`\\end{table}`);

  return lines.join('\n');
}

// ═══════════════════════════════════════════
// Quick data table (lists of objects)
// ═══════════════════════════════════════════

export function formatDataTable(
  data: Record<string, unknown>[],
  options: TableOptions = {}
): string {
  if (data.length === 0) return '% No data';

  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => String(row[h] ?? ''))
  );

  return formatTable({ headers, rows }, options);
}

// ═══════════════════════════════════════════
// Matplotlib / Python chart rendering
// ═══════════════════════════════════════════

export async function renderMatplotlib(
  code: string,
  outputPath?: string
): Promise<string> {
  const outputFile = outputPath ?? join('/tmp', `scholarium-plot-${Date.now()}.png`);

  // Security: disallow dangerous Python functions
  const dangerous = ['os.', 'subprocess', 'sys.', 'shutil', '__import__', 'eval', 'exec', 'open('];
  for (const d of dangerous) {
    if (code.includes(d)) {
      throw new Error(`Matplotlib code contains disallowed function: ${d}`);
    }
  }

  try {
    const pythonCode = `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

${code}

plt.savefig('${outputFile}', dpi=150, bbox_inches='tight')
plt.close()
`;
    const tmpFile = join('/tmp', `scholarium-plot-${Date.now()}.py`);
    writeFileSync(tmpFile, pythonCode, 'utf-8');

    execSync(`python3 ${tmpFile}`, {
      timeout: 30000,
      stdio: 'pipe',
    });

    // Cleanup temp file
    try { unlinkSync(tmpFile); } catch {}

    if (existsSync(outputFile)) {
      return outputFile;
    }
    return `% Matplotlib chart generation attempted but no output produced.\n% Code:\n% ${code.replace(/\n/g, '\n% ')}`;
  } catch (e) {
    logger.warn('Figures', `Matplotlib render failed: ${String(e)}`);
    return `% Matplotlib chart generation failed: ${String(e)}\n% Code:\n% ${code.replace(/\n/g, '\n% ')}`;
  }
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function escapeLaTeX(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}~^]/g, (m) => {
      const map: Record<string, string> = {
        '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
        '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}',
        '^': '\\textasciicircum{}',
      };
      return map[m] ?? m;
    });
}
