/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Section } from '../../types/index.ts';
import type { ServerContext } from '../context.ts';
import { json, error, parseBody } from '../utils/helpers.ts';
import { taskManager } from '../../task-manager.ts';
import { getErrorMessage } from '../../utils/logger.ts';
import { revisePassageCore } from '../../lib/revise-passage-core.ts';

type SectionsRouteContext = Pick<
  ServerContext,
  'papers' | 'bible' | 'db' | 'router' | 'persistSection' | 'hasLLMFor' | 'reviser'
>;

export function registerSectionsRoutes(
  ctx: SectionsRouteContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('GET', /^\/api\/papers\/[^/]+\/sections\/[^/]+\/status$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const sectionId = decodeURIComponent(parts[5]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const section = p.sections.find((s) => s.id === sectionId);
    if (!section) return error(res, 'Section not found', 404);
    const outlineSec = p.outline?.sections.find((s) => s.id === sectionId);
    json(res, {
      sectionId: section.id,
      title: section.title,
      status: section.status,
      version: section.version,
      wordCount: section.contentTex ? section.contentTex.split(/\s+/).length : 0,
      auditFindings: 0,
      aiScore: undefined,
      coreArgument: outlineSec?.coreArgument,
      hasContent: !!section.contentTex && section.contentTex.length > 0,
      contentLength: section.contentTex?.length ?? 0,
    });
  });

  register('GET', /^\/api\/papers\/[^/]+\/sections\/[^/]+\/audit-report$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const sectionId = decodeURIComponent(parts[5]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const section = p.sections.find((s) => s.id === sectionId);
    if (!section) return error(res, 'Section not found', 404);
    if (!section.contentTex) {
      return json(res, {
        sectionId,
        title: section.title,
        status: section.status,
        reportAvailable: false,
        message: 'Section has no content. Write the section first.',
      });
    }
    const bibleEntries = ctx.bible.getEntries(paperId);
    const auditInput = {
      sectionId,
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
    try {
      const { runFullAudit } = await import('../../audit/index.ts');
      const report = await runFullAudit(auditInput, ctx.router);
      json(res, { sectionId, title: section.title, status: section.status, reportAvailable: true, report });
    } catch (e: unknown) {
      json(res, {
        sectionId,
        title: section.title,
        status: section.status,
        reportAvailable: false,
        message: `Audit failed: ${getErrorMessage(e)}`,
      });
    }
  });

  register('POST', /^\/api\/papers\/[^/]+\/outline\/sections$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { id, title, coreArgument, estimatedPages, requiredCitations, parent } = b;
    if (!id || !title) return error(res, 'id and title are required', 400);
    const newSection = {
      id,
      title,
      coreArgument: coreArgument ?? '',
      estimatedPages: estimatedPages ?? 1,
      requiredCitations: requiredCitations ?? 0,
      parent: parent ?? null,
    };
    p.outline?.sections.push(newSection);
    if (p.outline) ctx.db.savePaperOutline(paperId, p.outline);
    json(res, { section: newSection });
  });

  register('PUT', /^\/api\/papers\/[^/]+\/outline\/sections\/[^/]+$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const sectionId = decodeURIComponent(parts[6]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { title, coreArgument, estimatedPages, requiredCitations } = b;
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (coreArgument !== undefined) updates.coreArgument = coreArgument;
    if (estimatedPages !== undefined) updates.estimatedPages = estimatedPages;
    if (requiredCitations !== undefined) updates.requiredCitations = requiredCitations;
    ctx.db.updateOutlineSection(paperId, sectionId, updates);
    if (p.outline) {
      const sec = p.outline.sections.find((s) => s.id === sectionId);
      if (sec) Object.assign(sec, updates);
    }
    json(res, { ok: true });
  });

  register('DELETE', /^\/api\/papers\/[^/]+\/outline\/sections\/[^/]+$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const sectionId = decodeURIComponent(parts[6]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    ctx.db.removeOutlineSection(paperId, sectionId);
    if (p.outline) {
      p.outline.sections = p.outline.sections.filter((s) => s.id !== sectionId && s.parent !== sectionId);
    }
    json(res, { ok: true });
  });

  register('POST', /^\/api\/papers\/[^/]+\/outline\/reorder$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { orderedIds } = b;
    if (!Array.isArray(orderedIds)) return error(res, 'orderedIds array is required', 400);
    ctx.db.reorderOutlineSections(paperId, orderedIds);
    if (p.outline) {
      const sectionMap = new Map(p.outline.sections.map((s) => [s.id, s]));
      p.outline.sections = orderedIds.map((id) => sectionMap.get(id)).filter(Boolean) as typeof p.outline.sections;
    }
    json(res, { ok: true });
  });

  register('POST', /^\/api\/papers\/[^/]+\/sections\/[^/]+\/rewrite$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const sectionId = decodeURIComponent(parts[5]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { modificationDirection, requirements, givenContent } = b;
    if (!modificationDirection && !givenContent)
      return error(res, 'modificationDirection or givenContent is required', 400);
    const section = p.sections.find((s) => s.id === sectionId);
    if (!section || !section.contentTex) return error(res, 'Section content not found. Write the section first.', 404);
    const outlineSection = p.outline?.sections.find((s) => s.id === sectionId);
    if (!outlineSection) return error(res, 'Outline section not found', 404);

    const task = taskManager.create('rewrite', `修改章节 - ${section.title}`, { paperId, sectionId });
    taskManager.start(task.id);

    try {
      taskManager.updateProgress(task.id, 30, '正在组装修改上下文...');
      const modParts: string[] = [];
      if (modificationDirection) modParts.push(`修改方向：${modificationDirection}`);
      if (requirements) modParts.push(`修改要求：${requirements}`);
      if (givenContent) modParts.push(`给定的内容：${givenContent}`);
      const modificationPrompt = modParts.join('\n');

      const citeKeys = ctx.bible
        .getEntries(paperId, { category: 'citations' })
        .filter((e) => e.approvalStatus === 'approved')
        .map((e) => e.key);
      const systemPrompt = `You are an academic paper writer. You need to modify an existing section of a paper based on the user's instructions.
RULES:
- Preserve ALL citations (\\cite{...}) unless the instruction says to change them
- Preserve ALL equations and formulas
- Preserve the section structure and labels
- Use ONLY approved citation keys: ${citeKeys.join(', ') || 'none available'}
- Output ONLY the modified LaTeX content, including the section header and label`;

      const userPrompt = `Original section title: ${outlineSection.title}
Original section content:
${section.contentTex}

Modification instructions:
${modificationPrompt}

Please output the modified LaTeX content for this section.`;

      taskManager.updateProgress(task.id, 60, '正在调用模型进行修改...');
      if (!ctx.hasLLMFor('writer')) {
        const modified = `% [按修改意见修改] ${modificationPrompt}\n${section.contentTex}`;
        section.contentTex = modified;
        if (p.outline) ctx.db.updateOutlineSection(paperId, sectionId, {});
        ctx.persistSection(paperId, section);
        taskManager.complete(task.id, '修改完成 (规则模式)');
        return json(res, { section, modified: true, mockMode: true });
      }

      const content = await ctx.router.complete('writer', systemPrompt, userPrompt, {
        temperature: 0.2,
        maxTokens: 16384,
        timeout: 600000,
      });
      const cleaned = content
        .replace(/^```(?:latex)?\n?/i, '')
        .replace(/```\n?$/i, '')
        .trim();
      section.contentTex = cleaned || section.contentTex;
      section.version++;
      section.status = 'drafting';
      ctx.persistSection(paperId, section);
      taskManager.complete(task.id, '修改完成');
      json(res, { section, modified: true });
    } catch (e: unknown) {
      taskManager.fail(task.id, getErrorMessage(e));
      throw e;
    }
  });

  register('POST', /^\/api\/papers\/[^/]+\/sections\/[^/]+\/revise-passage$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const sectionId = decodeURIComponent(parts[5]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const section = p.sections.find((s) => s.id === sectionId);
    if (!section || !section.contentTex) return error(res, 'Section content not found. Write the section first.', 404);
    const b = await parseBody(req);
    const passage = typeof b.passage === 'string' ? b.passage.trim() : '';
    const note = typeof b.note === 'string' ? b.note.trim() : '';
    if (!passage || !note) return error(res, 'passage and note are required', 400);

    const task = taskManager.create('rewrite', `局部重写 - ${section.title}`, { paperId, sectionId });
    taskManager.start(task.id);

    try {
      taskManager.updateProgress(task.id, 30, '正在组装修改上下文...');
      const before = typeof b.before === 'string' ? b.before : undefined;
      const after = typeof b.after === 'string' ? b.after : undefined;

      taskManager.updateProgress(task.id, 60, '正在调用模型进行局部重写...');
      const result = await revisePassageCore(
        { bible: ctx.bible, reviser: ctx.reviser, hasLLMFor: ctx.hasLLMFor },
        paperId,
        section,
        { passage, note, before, after },
      );
      if (!result.ok) return error(res, result.reason, 400);

      taskManager.complete(task.id, result.mockMode ? '局部重写完成 (规则模式)' : '局部重写完成');
      json(res, {
        revised: result.revised,
        warnings: result.warnings,
        mockMode: result.mockMode,
        protectedViolated: result.protectedViolated,
        taskId: task.id,
      });
    } catch (e: unknown) {
      taskManager.fail(task.id, getErrorMessage(e));
      throw e;
    }
  });

  register('POST', /^\/api\/papers\/[^/]+\/sections\/[^/]+\/auto-revise$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const sectionId = decodeURIComponent(parts[5]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const section = p.sections.find((s) => s.id === sectionId);
    if (!section || !section.contentTex) return error(res, 'Section content not found. Write the section first.', 404);

    const task = taskManager.create('auto-revise', `自动定向修订 - ${section.title}`, { paperId, sectionId });
    taskManager.start(task.id);

    try {
      taskManager.updateProgress(task.id, 5, '正在聚合低分发现...');
      const { runAutoRevision } = await import('../../pipeline/auto-revision.ts');
      const report = await runAutoRevision(
        {
          bible: ctx.bible,
          reviser: ctx.reviser,
          hasLLMFor: ctx.hasLLMFor,
          router: ctx.router,
          papers: ctx.papers,
          persistSection: ctx.persistSection,
          updateProgress: (tid, pct, msg) => taskManager.updateProgress(tid, pct, msg),
        },
        { paperId, sectionIds: [sectionId], taskId: task.id },
      );
      taskManager.complete(task.id, `自动定向修订完成，采纳 ${report.totalAdopted} 处`);
      json(res, { ok: true, report });
    } catch (e: unknown) {
      taskManager.fail(task.id, getErrorMessage(e));
      throw e;
    }
  });

  register('PUT', /^\/api\/papers\/[^/]+\/sections\/[^/]+\/content$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const sectionId = decodeURIComponent(parts[5]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    if (!b.contentTex && b.contentTex !== '') return error(res, 'contentTex is required', 400);
    const section = p.sections.find((s) => s.id === sectionId);
    if (!section) return error(res, 'Section not found', 404);
    section.contentTex = b.contentTex;
    section.version++;
    section.status = 'drafting';
    ctx.persistSection(paperId, section);
    json(res, { section, updated: true });
  });

  register('POST', /^\/api\/papers\/[^/]+\/sections\/[^/]+\/optimize-related$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const sectionId = decodeURIComponent(parts[5]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const modifiedSection = p.sections.find((s) => s.id === sectionId);
    if (!modifiedSection || !modifiedSection.contentTex)
      return error(res, 'Modified section not found or has no content', 404);

    const task = taskManager.create('optimize-related', `优化关联章节 - ${modifiedSection.title}`, {
      paperId,
      sectionId,
    });
    taskManager.start(task.id);

    try {
      let relatedSections: Section[];
      if (b.targetSectionIds && b.targetSectionIds.length > 0) {
        relatedSections = p.sections.filter(
          (s) => b.targetSectionIds.includes(s.id) && s.id !== sectionId && s.contentTex,
        );
      } else {
        const outlineSection = p.outline?.sections.find((s) => s.id === sectionId);
        const parent = outlineSection?.parent;
        relatedSections = p.sections.filter((s) => {
          if (s.id === sectionId || !s.contentTex) return false;
          const sOutline = p.outline?.sections.find((os) => os.id === s.id);
          if (parent && sOutline?.parent === parent) return true;
          if (Math.abs(s.sectionNumber - modifiedSection.sectionNumber) <= 1) return true;
          return false;
        });
      }

      if (relatedSections.length === 0) {
        taskManager.complete(task.id, '没有找到关联章节');
        return json(res, { optimized: [], message: 'No related sections found' });
      }

      taskManager.updateProgress(task.id, 20, `找到 ${relatedSections.length} 个关联章节`);

      const results: any[] = [];
      const citeKeys = ctx.bible
        .getEntries(paperId, { category: 'citations' })
        .filter((e) => e.approvalStatus === 'approved')
        .map((e) => e.key);

      for (let i = 0; i < relatedSections.length; i++) {
        const relSection = relatedSections[i];
        const progress = 20 + Math.round((i / relatedSections.length) * 70);
        taskManager.updateProgress(task.id, progress, `正在优化 ${relSection.title}...`);

        const systemPrompt = `You are an academic paper editor. You need to optimize a section of a paper to ensure consistency with a recently modified related section.
RULES:
- Preserve ALL citations (\\cite{...})
- Preserve ALL equations and formulas
- Preserve the section structure and labels
- Use ONLY approved citation keys: ${citeKeys.join(', ') || 'none available'}
- Ensure terminology, notation, and argumentation are consistent with the modified section
- Output ONLY the optimized LaTeX content, including the section header and label`;

        const userPrompt = `Recently modified section "${modifiedSection.title}":
${modifiedSection.contentTex}

Section to optimize "${relSection.title}":
${relSection.contentTex}

Please optimize this section to ensure consistency with the modified section. Focus on:
1. Consistent terminology and notation
2. Logical flow between sections
3. Complementary (not redundant) arguments
4. Proper cross-references`;

        if (!ctx.hasLLMFor('writer')) {
          results.push({ sectionId: relSection.id, title: relSection.title, optimized: false, mockMode: true });
          continue;
        }

        const content = await ctx.router.complete('writer', systemPrompt, userPrompt, {
          temperature: 0.2,
          maxTokens: 16384,
          timeout: 600000,
        });
        const cleaned = content
          .replace(/^```(?:latex)?\n?/i, '')
          .replace(/```\n?$/i, '')
          .trim();

        relSection.contentTex = cleaned || relSection.contentTex;
        relSection.version++;
        relSection.status = 'drafting';
        ctx.persistSection(paperId, relSection);

        results.push({
          sectionId: relSection.id,
          title: relSection.title,
          optimized: true,
          version: relSection.version,
        });
      }

      taskManager.complete(task.id, `优化完成，共 ${results.length} 个章节`);
      json(res, { optimized: results, taskId: task.id });
    } catch (e: unknown) {
      taskManager.fail(task.id, getErrorMessage(e));
      throw e;
    }
  });

  register('GET', /^\/api\/papers\/[^/]+\/sections\/[^/]+\/citations$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const sectionId = decodeURIComponent(parts[5]);
    const bibleCites = ctx.bible.getEntries(paperId, { category: 'citations', sectionId });
    const dbCites = ctx.db.getPaperCitations(paperId);
    const dbMap = new Map<string, any>();
    for (const c of dbCites) dbMap.set(c.cite_key, c);

    const seen = new Set<string>();
    const merged: any[] = [];
    for (const c of bibleCites) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      const dbEntry = dbMap.get(c.key);
      merged.push({
        id: c.id,
        cite_key: c.key,
        bibtex: dbEntry?.bibtex ?? '',
        title: dbEntry?.title ?? c.key,
        url: dbEntry?.url ?? '',
        authors: dbEntry?.authors ?? '',
        year: dbEntry?.year ?? null,
        source: 'bible',
        hasDetail: !!dbEntry,
      });
    }
    for (const c of dbCites) {
      if (seen.has(c.cite_key)) continue;
      seen.add(c.cite_key);
      merged.push({
        id: c.id,
        cite_key: c.cite_key,
        bibtex: c.bibtex ?? '',
        title: c.title ?? c.cite_key,
        url: c.url ?? '',
        authors: c.authors ?? '',
        year: c.year,
        source: 'db',
        hasDetail: true,
      });
    }
    json(res, { citations: merged, total: seen.size });
  });

  register('POST', /^\/api\/papers\/[^/]+\/generate-references$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { template } = b;

    const bibleCites = ctx.bible.getEntries(paperId, { category: 'citations' });
    const dbCites = ctx.db.getPaperCitations(paperId);
    const dbMap = new Map<string, any>();
    for (const c of dbCites) dbMap.set(c.cite_key, c);

    const seen = new Set<string>();
    const allCites: any[] = [];
    for (const c of bibleCites) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      const dbEntry = dbMap.get(c.key);
      allCites.push({
        citeKey: c.key,
        bibtex: dbEntry?.bibtex ?? c.value ?? '',
        title: dbEntry?.title ?? '',
        url: dbEntry?.url ?? '',
        authors: dbEntry?.authors ?? '',
        year: dbEntry?.year ?? null,
      });
    }
    for (const c of dbCites) {
      if (seen.has(c.cite_key)) continue;
      seen.add(c.cite_key);
      allCites.push({
        citeKey: c.cite_key,
        bibtex: c.bibtex ?? '',
        title: c.title ?? '',
        url: c.url ?? '',
        authors: c.authors ?? '',
        year: c.year,
      });
    }

    if (allCites.length === 0) return error(res, 'No citations to generate references from', 400);

    const task = taskManager.create('write', '生成参考文献章节', { paperId });
    taskManager.start(task.id);

    try {
      taskManager.updateProgress(task.id, 30, '正在生成参考文献...');

      const citeList = allCites
        .map((c, i) => {
          const parts = [`${i + 1}. Key: ${c.citeKey}`];
          if (c.title) parts.push(`Title: ${c.title}`);
          if (c.authors) parts.push(`Authors: ${c.authors}`);
          if (c.year) parts.push(`Year: ${c.year}`);
          if (c.url) parts.push(`URL: ${c.url}`);
          if (c.bibtex) parts.push(`BibTeX: ${c.bibtex}`);
          return parts.join('\n     ');
        })
        .join('\n\n');

      const templateInfo = template
        ? `请使用以下引用格式模板生成每条引用（按 {{variable}} 占位符填充）：\n${template}`
        : '请为每条引用生成标准的 GB/T 7714-2015 中文参考文献格式（中国国家标准）。\n格式示例：\n[1] 作者. 标题[M]. 出版地: 出版社, 年份.\n[2] 作者. 标题[J]. 期刊名, 年, 卷(期): 起止页码.\n[3] 作者. 标题[D]. 学位授予单位, 年份.\n[4] 作者. 标题[EB/OL]. (发布日期). URL.';

      const systemPrompt = `You are an academic paper formatter. Generate a references (参考文献) section in LaTeX format.
Use \\bibitem{citeKey} for each entry.
Output ONLY LaTeX content with \\begin{thebibliography}...\\end{thebibliography}.`;

      const userPrompt = `请根据以下 ${allCites.length} 条引文生成参考文献章节。

${templateInfo}

引文列表：
${citeList}

输出 \\begin{thebibliography}{${allCites.length}} 和 \\end{thebibliography} 包裹的 LaTeX 内容。每条使用 \\bibitem{citeKey}。`;

      taskManager.updateProgress(task.id, 60, '正在调用模型格式化引文...');
      let content: string;
      if (!ctx.hasLLMFor('writer')) {
        const items = allCites
          .map(
            (c) =>
              `\\bibitem{${c.citeKey}} ${c.authors || '(author)'} ${c.title ? `\\textit{${c.title}}` : ''} ${c.year ? `(${c.year})` : ''} ${c.url ? `\\url{${c.url}}` : ''}`,
          )
          .join('\n\n');
        content = `\\begin{thebibliography}{${allCites.length}}\n${items}\n\\end{thebibliography}`;
      } else {
        content = await ctx.router.complete('writer', systemPrompt, userPrompt, {
          temperature: 0.1,
          maxTokens: 8192,
          timeout: 600000,
        });
      }
      const cleaned = content
        .replace(/^```(?:latex)?\n?/i, '')
        .replace(/```\n?$/i, '')
        .trim();

      const refSectionId = 'references';
      const refSection = p.sections.find((s) => s.id === refSectionId);
      if (refSection) {
        refSection.contentTex = cleaned;
        refSection.version++;
        refSection.status = 'passed';
        ctx.persistSection(paperId, refSection);
      } else {
        if (p.outline && !p.outline.sections.find((s) => s.id === refSectionId)) {
          p.outline.sections.push({
            id: refSectionId,
            title: '参考文献',
            coreArgument: '本文引用的全部参考文献',
            estimatedPages: Math.ceil(allCites.length / 20),
            requiredCitations: 0,
            parent: null,
          });
          ctx.db.savePaperOutline(paperId, p.outline);
        }
        const section: any = {
          id: refSectionId,
          paperId,
          sectionNumber: 99,
          title: '参考文献',
          contentTex: cleaned,
          status: 'passed',
          version: 1,
        };
        p.sections.push(section);
        ctx.persistSection(paperId, section);
      }

      taskManager.complete(task.id, `生成完成，共 ${allCites.length} 条参考文献`);
      json(res, { ok: true, content: cleaned, total: allCites.length });
    } catch (e: unknown) {
      taskManager.fail(task.id, getErrorMessage(e));
      throw e;
    }
  });
}
