import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PipelineOrchestrator } from '../../pipeline/orchestrator.ts';
import { InMemoryStorage } from '../../storage/fs-storage.ts';
import { assembleFullPaper } from '../../latex/assembler.ts';
import { compile } from '../../latex/compiler.ts';
import type { ConfirmedFocus } from '../../types/index.ts';
import type { ServerContext, PaperProject } from '../context.ts';
import { json, error, parseBody } from '../utils/helpers.ts';
import { latexToMarkdown, stripLatex } from '../utils/latex-to-md.ts';
import { taskManager } from '../../task-manager.ts';
import { logger } from '../../utils/logger.js';

type PapersRouteContext = Pick<ServerContext, 'papers' | 'planner' | 'architect' | 'composer' | 'writer' | 'observer' | 'normalizer' | 'bible' | 'db' | 'router' | 'config' | 'dataDir' | 'port' | 'persistSection' | 'hasLLMFor'>;

export function registerPapersRoutes(
  ctx: PapersRouteContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('GET', '/api/papers', async (_req, res) => {
    const papers = [...ctx.papers.values()].map((p) => ({
      id: p.id,
      title: p.title,
      targetJournal: p.targetJournal,
      status: p.status,
      createdAt: p.createdAt,
      sections: p.sections.length,
    }));
    json(res, { papers, total: papers.length });
  });

  register('POST', '/api/papers', async (req, res) => {
    const b = await parseBody(req);
    const id = `paper-${randomUUID()}`;
    const p: PaperProject = {
      id,
      title: b.title ?? 'Untitled',
      targetJournal: b.targetJournal,
      researchTopic: b.researchTopic ?? b.title,
      contributionGaps: b.contributionGaps ?? [],
      sections: [],
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    ctx.papers.set(id, p);
    ctx.db.createPaper(id, p.title, p.targetJournal);
    if (Array.isArray(b.citations))
      for (const c of b.citations)
        ctx.bible.addEntry({
          paperId: id,
          category: 'citations',
          key: c.key,
          value: c.bibtex,
          sourceType: 'user',
          confidence: 1.0,
          approvalStatus: 'approved',
        });
    json(res, { paperId: id, paper: p });
  });

  register('GET', /^\/api\/papers\/[^/]+$/, async (req, res) => {
    const p = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const id = p[p.length - 1];
    const paper = ctx.papers.get(id);
    if (!paper) return error(res, 'Paper not found', 404);
    const bibleStats = ctx.bible.getStats(id);
    json(res, { ...paper, bibleStats });
  });

  register('DELETE', /^\/api\/papers\/[^/]+$/, async (req, res) => {
    const p = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const id = p[p.length - 1];
    if (!ctx.papers.has(id)) return error(res, 'Paper not found', 404);
    ctx.papers.delete(id);
    ctx.db.deletePaper(id);
    json(res, { ok: true });
  });

  register('POST', /^\/api\/papers\/[^/]+\/plan$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);

    const task = taskManager.create('plan', `生成大纲 - ${p.title}`, { paperId });
    taskManager.start(task.id);

    try {
      taskManager.updateProgress(task.id, 20, '正在分析研究主题...');
      const focus: ConfirmedFocus = b.confirmedFocus ?? {
        researchTopic: p.researchTopic ?? p.title,
        selectedBranches: [],
        confirmedNodes: [],
        contributionGaps: p.contributionGaps ?? [],
      };

      taskManager.updateProgress(task.id, 50, '正在生成大纲结构...');
      const outline = await ctx.planner.execute(
        { confirmedFocus: focus, journalProfile: b.journalProfile },
        { mock: !ctx.hasLLMFor('planner') },
      );

      taskManager.updateProgress(task.id, 90, '正在保存大纲...');
      p.outline = outline;
      p.status = 'planned';
      ctx.db.savePaperOutline(paperId, outline);
      ctx.db.updatePaperStatus(paperId, 'planned');

      taskManager.complete(task.id, `完成，共 ${outline.sections.length} 个章节`);
      json(res, { outline, taskId: task.id });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      throw e;
    }
  });

  register('POST', /^\/api\/papers\/[^/]+\/write$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const p = ctx.papers.get(paperId);
    if (!p || !p.outline) return error(res, 'Paper or outline not found', 404);
    const b = await parseBody(req);
    const sectionDef = p.outline.sections[b.sectionIndex ?? 0];
    if (!sectionDef) return error(res, 'Section not found', 404);

    const task = taskManager.create('write', `写作章节 - ${sectionDef.title}`, {
      paperId,
      sectionId: sectionDef.id,
      sectionIndex: b.sectionIndex,
    });
    taskManager.start(task.id);

    const storage = new InMemoryStorage();
    const orch = new PipelineOrchestrator({
      planner: ctx.planner,
      architect: ctx.architect,
      composer: ctx.composer,
      writer: ctx.writer,
      observer: ctx.observer,
      normalizer: ctx.normalizer,
      bible: ctx.bible,
      storage,
      localCitations: ctx.bible.getEntries(paperId, { category: 'citations' }).map((e) => ({
        id: e.id,
        paperId,
        citeKey: e.key,
        bibtex: e.value,
        doi: null,
        title: null,
        authors: null,
        year: null,
        verified: true,
        approvalStatus: e.approvalStatus,
        source: 'user',
        matchConfidence: 1.0,
        lastVerifiedAt: null,
        embedding: null,
        createdAt: '',
        updatedAt: '',
      })),
    });

    try {
      taskManager.updateProgress(task.id, 5, '正在生成写作蓝图...', 'architect');
      const { section, state } = await orch.writeSection(paperId, p.outline, sectionDef, {
        mock: !ctx.hasLLMFor('writer'),
        skipAntiAI: b.skipAntiAI ?? false,
        taskId: task.id,
        taskManager,
      });

      const existingIdx = p.sections.findIndex((s) => s.id === section.id);
      if (existingIdx >= 0) p.sections[existingIdx] = section;
      else p.sections.push(section);
      ctx.persistSection(paperId, section);

      const contentLength = section.contentTex?.length || 0;
      taskManager.complete(task.id, `完成，状态: ${state}，字数: ${contentLength}`);
      json(res, { section, state, taskId: task.id });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      throw e;
    }
  });

  register('POST', /^\/api\/papers\/[^/]+\/compile$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const outDir = path.join(ctx.dataDir, 'output', paperId);
    fs.mkdirSync(outDir, { recursive: true });
    const sectionContents: Record<string, string> = {};
    for (const s of p.sections) if (s.contentTex) sectionContents[s.id] = s.contentTex;
    const refs = p.sections
      .filter((s) => s.contentTex)
      .map((s, i) => ({
        id: s.id,
        number: i + 1,
        title: s.title,
        texPath: `sections/section_${i + 1}.tex`,
        status: s.status,
        version: s.version,
      }));
    assembleFullPaper(
      {
        title: p.title,
        authors: ['Scholarium', 'DeepSeek'],
        sections: refs,
        sectionContents,
        bibFilePath: 'references.bib',
        figures: [],
        appendices: [],
        templateId: 'default',
      },
      outDir,
    );
    const bibEntries = ctx.bible.getEntries(paperId, { category: 'citations' });
    fs.writeFileSync(path.join(outDir, 'references.bib'), bibEntries.map((e) => e.value).join('\n\n'), 'utf-8');
    const result = await compile({ workDir: outDir, texFile: 'main.tex' });
    json(res, result);
  });

  register('GET', /^\/api\/papers\/[^/]+\/fulltext$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const url = new URL((req as any).url ?? '/', `http://localhost:${ctx.port}`);
    const format = url.searchParams.get('format') ?? 'latex';

    const sections = p.sections.filter((s) => s.contentTex).sort((a, b) => a.sectionNumber - b.sectionNumber);

    if (format === 'markdown') {
      const md = sections
        .map((s) => {
          const header = '#'.repeat(Math.min(3, s.sectionNumber + 1));
          const title = `${header} ${s.title}`;
          const body = s.contentTex ? latexToMarkdown(s.contentTex) : '';
          return `${title}\n\n${body}`;
        })
        .join('\n\n---\n\n');

      json(res, { format: 'markdown', content: md, title: p.title, totalSections: sections.length });
    } else if (format === 'text') {
      const text = sections
        .map((s) => {
          return `${s.title}\n${'='.repeat(s.title.length)}\n\n${stripLatex(s.contentTex ?? '')}`;
        })
        .join('\n\n');
      json(res, { format: 'text', content: text, title: p.title, totalSections: sections.length });
    } else {
      const latex = sections
        .map((s) => {
          return `% ${s.title}\n${s.contentTex ?? ''}`;
        })
        .join('\n\n');
      json(res, { format: 'latex', content: latex, title: p.title, totalSections: sections.length });
    }
  });

  register('GET', /^\/api\/papers\/[^/]+\/export$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const url = new URL((req as any).url ?? '/', `http://localhost:${ctx.port}`);
    const format = url.searchParams.get('format') ?? 'md';

    const sections = p.sections.filter((s) => s.contentTex).sort((a, b) => a.sectionNumber - b.sectionNumber);

    if (format === 'md' || format === 'markdown') {
      const md = sections
        .map((s) => {
          const header = '#'.repeat(Math.min(3, s.sectionNumber + 1));
          const title = `${header} ${s.title}`;
          const body = s.contentTex ? latexToMarkdown(s.contentTex) : '';
          return `${title}\n\n${body}`;
        })
        .join('\n\n---\n\n');

      const buf = Buffer.from(md);
      const asciiName = p.title.replace(/[^\x20-\x7e]/g, '_').replace(/["\r\n]/g, '').substring(0, 50);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${asciiName}.md"`);
      res.setHeader('Content-Length', buf.length);
      res.writeHead(200);
      res.end(buf);
    } else if (format === 'latex') {
      const latex = sections.map((s) => s.contentTex ?? '').join('\n\n');
      const buf = Buffer.from(latex);
      const asciiName = p.title.replace(/[^\x20-\x7e]/g, '_').replace(/["\r\n]/g, '').substring(0, 50);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${asciiName}.tex"`);
      res.setHeader('Content-Length', buf.length);
      res.writeHead(200);
      res.end(buf);
    } else {
      error(res, 'Unsupported format. Use md or latex.', 400);
    }
  });

  register('GET', /^\/api\/papers\/[^/]+\/status$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);

    const sections = p.sections.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      version: s.version,
      wordCount: s.contentTex ? s.contentTex.split(/\s+/).length : 0,
      hasContent: !!s.contentTex && s.contentTex.length > 0,
    }));

    const completedSections = sections.filter((s) => s.hasContent).length;
    const totalSections = p.outline?.sections.length ?? sections.length;
    const progress = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;

    json(res, {
      id: p.id,
      title: p.title,
      status: p.status,
      targetJournal: p.targetJournal,
      researchTopic: p.researchTopic,
      createdAt: p.createdAt,
      progress,
      completedSections,
      totalSections,
      sections,
      outline: p.outline
        ? {
            title: p.outline.title,
            sectionCount: p.outline.sections.length,
          }
        : null,
    });
  });

  register('POST', /^\/api\/papers\/[^/]+\/directive$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);

    const b = await parseBody(req);
    const { directive, sectionId, action, priority } = b;

    if (!directive || typeof directive !== 'string') {
      return error(res, 'directive (string) is required', 400);
    }

    const validActions = [
      'revise_claim',
      'add_citation',
      'expand_section',
      'compress_section',
      'rewrite_paragraph',
      'fix_terminology',
      'user_comment',
    ];
    const actionType = validActions.includes(action) ? action : 'user_comment';

    const directiveRecord = {
      id: randomUUID(),
      paperId,
      sectionId: sectionId ?? null,
      directive,
      action: actionType,
      priority: priority ?? 'normal',
      createdAt: new Date().toISOString(),
      applied: false,
    };

    if (!p.directives) p.directives = [];
    p.directives.push(directiveRecord);

    if (sectionId) {
      const section = p.sections.find((s) => s.id === sectionId);
      if (section) {
        json(res, {
          ok: true,
          directive: directiveRecord,
          message: `Directive recorded for section "${section.title}". The next rewrite of this section will apply: "${directive}"`,
          sectionStatus: section.status,
        });
        return;
      }
    }

    json(res, {
      ok: true,
      directive: directiveRecord,
      message: `Directive recorded for paper "${p.title}". It will be applied to relevant sections on next write/rewrite.`,
    });
  });

  register('POST', /^\/api\/papers\/[^/]+\/rewrite$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);

    const b = await parseBody(req);
    const { sectionId, instruction, sectionIds } = b;

    const targets: string[] = sectionId ? [sectionId] : (sectionIds ?? []);
    if (targets.length === 0) {
      targets.push(...p.sections.filter((s) => s.contentTex).map((s) => s.id));
    }

    if (targets.length === 0) {
      return error(res, 'No sections to rewrite. Specify sectionId or ensure sections have content.', 400);
    }

    json(res, {
      ok: true,
      paperId,
      instruction: instruction ?? null,
      targetSections: targets,
      scheduled: targets.length,
      message: `Rewrite scheduled for ${targets.length} section(s). Use the per-section rewrite endpoint to execute: POST /api/papers/${paperId}/sections/{sectionId}/rewrite`,
    });
  });

  register('POST', /^\/api\/papers\/[^/]+\/audit$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);

    const b = await parseBody(req);
    const { sectionId, sectionIds } = b;

    const targets: string[] = sectionId ? [sectionId] : (sectionIds ?? []);
    if (targets.length === 0) {
      targets.push(...p.sections.filter((s) => s.contentTex).map((s) => s.id));
    }

    if (targets.length === 0) {
      return error(res, 'No sections to audit. Write section content first.', 400);
    }

    const results: Record<string, any> = {};
    const bibleEntries = ctx.bible.getEntries(paperId);

    for (const sid of targets) {
      const section = p.sections.find((s) => s.id === sid);
      if (!section?.contentTex) {
        results[sid] = { sectionId: sid, reportAvailable: false, message: 'No content to audit' };
        continue;
      }

      try {
        const auditInput = {
          sectionId: sid,
          draft: section.contentTex,
          bibleSummary: {
            terminology: bibleEntries
              .filter((e) => e.category === 'terminology')
              .map((e) => ({ key: e.key, value: e.value })),
            citationMap: bibleEntries
              .filter((e) => e.category === 'citations')
              .map((e) => ({ key: e.key, value: e.value })),
            dataPoints: bibleEntries.filter((e) => e.category === 'data').map((e) => ({ key: e.key, value: e.value })),
          },
          mockMode: !ctx.hasLLMFor('auditor'),
        };
        const { runFullAudit } = await import('../../audit/index.ts');
        const report = await runFullAudit(auditInput, ctx.router);
        results[sid] = { sectionId: sid, title: section.title, reportAvailable: true, report };
      } catch (e: any) {
        results[sid] = {
          sectionId: sid,
          title: section.title,
          reportAvailable: false,
          message: `Audit failed: ${e.message}`,
        };
      }
    }

    json(res, {
      ok: true,
      paperId,
      auditedSections: targets.length,
      results,
    });
  });
}
