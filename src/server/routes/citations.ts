import type { IncomingMessage, ServerResponse } from 'node:http';
import { json, error, parseBody, isSafeUrl } from '../utils/helpers.ts';
import type { ServerContext } from '../context.ts';
import { validateCitations } from '../../librarian/index.ts';
import { searchSemanticScholar, searchArxiv, searchCrossRef, searchAllSources } from '../../librarian/adapters.ts';
import { parseBibFile } from '../../librarian/bib-parser.ts';
import { LLMClient } from '../../llm/client.ts';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { taskManager } from '../../task-manager.ts';
import { logger } from '../../utils/logger.js';

type CitationContext = Pick<ServerContext, 'bible' | 'db' | 'config' | 'dataDir'>;

export function registerCitationRoutes(
  ctx: CitationContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('POST', '/api/citations/validate', async (req, res) => {
    const b = await parseBody(req);
    const cites = ctx.bible.getEntries(b.paperId ?? '', { category: 'citations' });
    const report = await validateCitations(b.draft, b.sectionId ?? 'unknown', {
      localCitations: cites.map((e: any) => ({
        id: e.id,
        paperId: e.paperId,
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
      enableExternalSearch: false,
    });
    json(res, report);
  });

  register('POST', '/api/citations/search', async (req, res) => {
    const b = await parseBody(req);
    const page = b.page ?? 1;
    const pageSize = b.pageSize ?? 10;
    const maxResults = b.maxResults ?? Math.min(pageSize * 3, 50);
    const offset = (page - 1) * pageSize;
    const [ss, arxiv, cr] = await Promise.allSettled([
      searchSemanticScholar(b.query, { maxResults }),
      searchArxiv(b.query, { maxResults }),
      searchCrossRef(b.query, { maxResults }),
    ]);
    const allResults: any[] = [];
    const errors: Array<{ source: string; message: string; retryable: boolean }> = [];
    for (const r of [ss, arxiv, cr]) {
      if (r.status === 'fulfilled') {
        allResults.push(...r.value.results);
        errors.push(...r.value.errors);
      }
    }
    const seen = new Set<string>();
    const uniqueResults = allResults.filter((r) => {
      const key = r.doi ?? r.title?.substring(0, 50) ?? r.url ?? '';
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const total = uniqueResults.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const paged = uniqueResults.slice(offset, offset + pageSize);
    json(res, { results: paged, total, page, pageSize, totalPages, errors });
  });

  register('POST', '/api/citations/parse-bib', async (req, res) => {
    const b = await parseBody(req);
    json(res, parseBibFile(b.content ?? ''));
  });

  register('POST', '/api/citations/from-url', async (req, res) => {
    const b = await parseBody(req);
    const { url: pageUrl, model, format } = b;
    if (!pageUrl) return error(res, 'url is required', 400);
    if (!isSafeUrl(pageUrl)) return error(res, 'URL is not allowed', 400);

    const task = taskManager.create('from-url', `URL 转引用`, { url: pageUrl, format });
    taskManager.start(task.id);

    try {
      taskManager.updateProgress(task.id, 20, '正在获取网页内容...');
      const fetchRes = await fetch(pageUrl, { signal: AbortSignal.timeout(15000) });
      const html = await fetchRes.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : pageUrl;
      const cleanText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 3000);

      taskManager.updateProgress(task.id, 50, '正在生成引用格式...');
      const isTemplate = format && /\{\{/.test(format);
      const sysPrompt =
        'You are a citation format generator. Extract metadata from the webpage content and generate a citation.';
      const userPrompt = isTemplate
        ? `URL: ${pageUrl}\nTitle: ${title}\nContent preview: ${cleanText}\n\nGenerate a citation following this EXACT template format. Replace each {{placeholder}} with the appropriate value from the page:\n\n${format}\n\nOutput ONLY the filled citation text, no other text.`
        : `URL: ${pageUrl}\nTitle: ${title}\nContent preview: ${cleanText}\n\nGenerate a citation in ${format || 'bibtex'} format. Include: author(s), title, publication date/access date, URL. Output ONLY the citation text.`;
      const client = new LLMClient({
        apiKey: ctx.config.llm.providers[model ? 'deepseek' : 'deepseek']?.apiKey || '',
        baseUrl: ctx.config.llm.providers[model ? 'deepseek' : 'deepseek']?.baseUrl || 'https://api.deepseek.com/v1',
        model: model || 'deepseek-v4-flash',
        maxTokens: 1000,
        timeout: 60000,
      });
      const citation = await client.complete(sysPrompt, userPrompt);

      taskManager.complete(task.id, '引用格式生成完成');
      json(res, { ok: true, citation, title, url: pageUrl, taskId: task.id });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      json(res, {
        ok: false,
        error: e.message,
        citation: `@misc{web,\n  title = {${pageUrl}},\n  howpublished = {\\url{${pageUrl}}},\n  note = {Accessed: ${new Date().toISOString().split('T')[0]}}\n}`,
      });
    }
  });

  register('POST', '/api/citations/generate-template', async (req, res) => {
    const b = await parseBody(req);
    const { userInput, model } = b;
    if (!userInput) return error(res, 'userInput is required', 400);

    const task = taskManager.create('generate-template', `生成引用模板`, { model });
    taskManager.start(task.id);

    try {
      taskManager.updateProgress(task.id, 30, '正在分析需求...');
      const sysPrompt =
        'You are a citation template designer. Based on the user\'s description, generate a reusable citation format template. The template should use {{placeholders}} for variable parts. Output as JSON: { "name": string, "format": string, "description": string, "variables": string[] }';
      const userPrompt = `User requirement: ${userInput}\n\nGenerate a citation template that matches this requirement. Use {{variableName}} syntax for placeholders.`;

      const agentConfig = ctx.config.llm.models.citationGenerator;
      const selectedModel = model || agentConfig?.model || 'deepseek-v4-flash';
      const providerName = selectedModel.startsWith('deepseek') ? 'deepseek' : 'deepseek';
      const provider = ctx.config.llm.providers[providerName];

      taskManager.updateProgress(task.id, 60, '正在生成模板...');
      const client = new LLMClient({
        apiKey: provider?.apiKey || '',
        baseUrl: provider?.baseUrl || 'https://api.deepseek.com/v1',
        model: selectedModel,
        maxTokens: 2000,
        timeout: 60000,
      });
      const raw = await client.complete(sysPrompt, userPrompt);
      const cleaned = raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const template = JSON.parse(cleaned);

      taskManager.complete(task.id, `模板 "${template.name}" 生成完成`);
      json(res, {
        ok: true,
        template: { id: randomUUID(), ...template, createdAt: new Date().toISOString() },
        taskId: task.id,
      });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      json(res, { ok: false, error: e.message });
    }
  });

  register('GET', '/api/citations/templates', async (_req, res) => {
    const filePath = path.join(ctx.dataDir, 'citation-templates.json');
    let templates: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        templates = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        logger.warn('Failed to parse citation-templates.json, using defaults');
      }
    }
    json(res, { templates });
  });

  register('POST', '/api/citations/templates', async (req, res) => {
    const b = await parseBody(req);
    const filePath = path.join(ctx.dataDir, 'citation-templates.json');
    let templates: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        templates = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        logger.warn('Failed to parse citation-templates.json for save, using defaults');
      }
    }
    const incoming = Array.isArray(b) ? b : [b];
    for (const item of incoming) {
      const idx = templates.findIndex((t: any) => t.id === item.id);
      if (idx >= 0) {
        templates[idx] = { ...templates[idx], ...item, updatedAt: new Date().toISOString() };
      } else {
        templates.push({
          id: randomUUID(),
          ...item,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    fs.writeFileSync(filePath, JSON.stringify(templates, null, 2), 'utf-8');
    json(res, { ok: true, templates });
  });

  register('DELETE', /^\/api\/citations\/templates\/[^/]+$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const templateId = url.pathname.split('/').pop()!;
    const filePath = path.join(ctx.dataDir, 'citation-templates.json');
    let templates: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        templates = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        logger.warn('Failed to parse citation-templates.json for delete, using defaults');
      }
    }
    templates = templates.filter((t: any) => t.id !== templateId);
    fs.writeFileSync(filePath, JSON.stringify(templates, null, 2), 'utf-8');
    json(res, { ok: true });
  });

  register('GET', /^\/api\/papers\/[^/]+\/citations$/, async (_req, res) => {
    const url = new URL((_req as any).url ?? '/', 'http://localhost');
    const paperId = url.pathname.split('/')[3];
    const dbCitations = ctx.db.getPaperCitations(paperId);
    const bibleCitations = ctx.bible.getEntries(paperId, { category: 'citations' });
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const c of dbCitations) {
      seen.add(c.cite_key);
      merged.push({
        id: c.id,
        cite_key: c.cite_key,
        bibtex: c.bibtex ?? '',
        title: c.title ?? '',
        url: c.url ?? '',
        authors: c.authors ?? '',
        year: c.year,
      });
    }
    for (const c of bibleCitations) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      merged.push({
        id: c.id,
        cite_key: c.key,
        bibtex: c.value ?? '',
        title: '',
        url: '',
        authors: '',
        year: null,
      });
    }
    json(res, { citations: merged });
  });

  register('POST', /^\/api\/papers\/[^/]+\/citations$/, async (req, res) => {
    const reqUrl = new URL((req as any).url ?? '/', 'http://localhost');
    const paperId = reqUrl.pathname.split('/')[3];
    const b = await parseBody(req);
    const { citeKey, bibtex, title, url, authors, year } = b;
    if (!citeKey) return error(res, 'citeKey is required', 400);
    const id = `cit-${randomUUID()}`;
    ctx.db.createPaperCitation({
      id,
      paperId,
      citeKey,
      bibtex: bibtex ?? '',
      title: title ?? '',
      url: url ?? '',
      authors: authors ?? '',
      year: year ?? null,
    });
    ctx.bible.addEntry({
      paperId,
      category: 'citations',
      key: citeKey,
      value: bibtex ?? '',
      sourceType: 'user',
      confidence: 1.0,
      approvalStatus: 'approved',
    });
    json(res, { ok: true, citation: { id, paperId, citeKey, bibtex, title, url, authors, year } });
  });

  register('PUT', /^\/api\/papers\/[^/]+\/citations\/[^/]+$/, async (req, res) => {
    const parts = new URL((req as any).url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const citeKey = parts[6];
    const b = await parseBody(req);
    const existing = ctx.db.getCitation(paperId, citeKey);
    if (!existing) return error(res, 'Citation not found', 404);
    const updates: any = {};
    if (b.bibtex !== undefined) updates.bibtex = b.bibtex;
    if (b.title !== undefined) updates.title = b.title;
    if (b.url !== undefined) updates.url = b.url;
    if (b.authors !== undefined) updates.authors = b.authors;
    if (b.year !== undefined) updates.year = b.year;
    ctx.db.updatePaperCitation(existing.id, updates);
    json(res, { ok: true });
  });

  register('DELETE', /^\/api\/papers\/[^/]+\/citations\/[^/]+$/, async (_req, res) => {
    const parts = new URL((_req as any).url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const citeKey = parts[6];
    const existing = ctx.db.getCitation(paperId, citeKey);
    if (!existing) return error(res, 'Citation not found', 404);
    ctx.db.deletePaperCitation(existing.id);
    json(res, { ok: true });
  });

  register('POST', /^\/api\/papers\/[^/]+\/citations\/lookup$/, async (req, res) => {
    const parts = new URL((req as any).url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = parts[3];
    const b = await parseBody(req);
    let citeKeys: string[] = b.citeKeys;

    if (!citeKeys || citeKeys.length === 0) {
      const all = ctx.db.getPaperCitations(paperId);
      const bible = ctx.bible.getEntries(paperId, { category: 'citations' });
      const keys = new Set<string>();
      for (const c of all) if (!c.title) keys.add(c.cite_key);
      for (const c of bible) if (!c.value?.startsWith('http')) keys.add(c.key);
      citeKeys = [...keys];
      logger.info(
        `[lookup] DB citations without title: ${all
          .filter((c: any) => !c.title)
          .map((c: any) => c.cite_key)
          .join(', ')}`,
      );
      logger.info(`[lookup] Bible citations: ${bible.map((c: any) => `${c.key}=${c.value?.slice(0, 40)}`).join(', ')}`);
      logger.info(`[lookup] Auto-detected keys to look up (${citeKeys.length}): ${citeKeys.join(', ')}`);
    } else {
      logger.info(`[lookup] Requested keys (${citeKeys.length}): ${citeKeys.join(', ')}`);
    }

    if (citeKeys.length === 0) return error(res, 'No citations to look up', 400);

    const results: any[] = [];
    for (const key of citeKeys.slice(0, 20)) {
      const query = key
        .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
        .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
        .replace(/[,;:_-]/g, ' ')
        .trim();

      try {
        logger.info(`[lookup] Searching for "${key}" → query: "${query}"`);
        const searchResult = await searchAllSources(query, { maxResults: 3 });
        const best = searchResult.results[0];

        if (best) {
          logger.info(
            `[lookup] ✓ Found "${key}" → title: "${best.title?.slice(0, 60)}", authors: ${best.authors?.join(', ')?.slice(0, 40)}, source: ${best.source}`,
          );
          const title = best.title;
          const authors = best.authors.join(', ');
          const year = best.year;
          const url = best.url ?? (best.doi ? `https://doi.org/${best.doi}` : '');

          const existing = ctx.db.getCitation(paperId, key);
          if (existing) {
            ctx.db.updatePaperCitation(existing.id, { title, authors, year, url });
          } else {
            ctx.db.createPaperCitation({
              id: `cit-${randomUUID()}`,
              paperId,
              citeKey: key,
              bibtex: '',
              title,
              url,
              authors,
              year: year ?? null,
            });
          }

          const bibleEntry = ctx.db.getBibleEntryByKey(paperId, 'citations', key);
          if (bibleEntry) {
            bibleEntry.value = `${authors} (${year ?? 'n.d.'}). ${title}. ${url || ''}`;
            ctx.db.flush();
          }

          results.push({ citeKey: key, title, authors, year, url, found: true });
        } else {
          logger.info(`[lookup] ✗ Not found "${key}" (query: "${query}")`);
          results.push({ citeKey: key, found: false, error: 'No results from any source' });
        }
      } catch (e: any) {
        logger.info(`[lookup] ✗ Error "${key}": ${e.message}`);
        results.push({ citeKey: key, found: false, error: e.message });
      }
    }

    logger.info(`[lookup] Done: ${results.filter((r) => r.found).length}/${results.length} found`);
    json(res, { results, total: citeKeys.length, lookedUp: results.length });
  });
}
