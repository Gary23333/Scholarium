/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from '../context.ts';
import { json, error, parseBody } from '../utils/helpers.ts';

type BibleContext = Pick<ServerContext, 'bible' | 'db' | 'papers'>;

export function registerBibleRoutes(
  ctx: BibleContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('GET', /^\/api\/bible\/[^/]+$/, async (_req, res) => {
    const url = new URL((_req as any).url ?? '/', 'http://localhost');
    const paperId = decodeURIComponent(url.pathname.split('/').pop()!);
    const entries = ctx.bible.getEntries(paperId);
    const stats = ctx.bible.getStats(paperId);
    json(res, { entries, stats });
  });

  register('POST', /^\/api\/bible\/[^/]+\/entries$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const paperId = decodeURIComponent(url.pathname.split('/')[3]);
    if (!ctx.papers.has(paperId)) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { category, key, value, confidence, approvalStatus } = b;
    if (!category || !key || value === undefined) return error(res, 'category, key, and value are required', 400);
    const id = ctx.bible.addEntry({
      paperId,
      category,
      key,
      value,
      sourceType: 'user',
      confidence: confidence ?? 1.0,
      approvalStatus: approvalStatus ?? 'approved',
    });
    const entry = ctx.bible.getEntries(paperId).find((e: any) => e.id === id);
    json(res, { ok: true, entry }, 201);
  });

  register('PUT', /^\/api\/bible\/[^/]+\/entries\/[^/]+$/, async (req, res) => {
    const parts = new URL((req as any).url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const entryId = decodeURIComponent(parts[5]);
    if (!ctx.papers.has(paperId)) return error(res, 'Paper not found', 404);
    const existing = ctx.db.getBibleEntry(entryId);
    if (!existing || existing.paper_id !== paperId) return error(res, 'Bible entry not found', 404);
    const b = await parseBody(req);
    const updates: { key?: string; value?: string; category?: string; confidence?: number; approvalStatus?: string } =
      {};
    if (b.key !== undefined) updates.key = b.key;
    if (b.value !== undefined) updates.value = b.value;
    if (b.category !== undefined) updates.category = b.category;
    if (b.confidence !== undefined) updates.confidence = b.confidence;
    if (b.approvalStatus !== undefined) updates.approvalStatus = b.approvalStatus;
    ctx.db.updateBibleEntry(entryId, updates);
    const updated = ctx.db.getBibleEntry(entryId);
    json(res, {
      ok: true,
      entry: {
        id: updated.id,
        paperId: updated.paper_id,
        category: updated.category,
        key: updated.key,
        value: updated.value,
        confidence: updated.confidence,
        approvalStatus: updated.approval_status,
      },
    });
  });

  register('DELETE', /^\/api\/bible\/[^/]+\/entries\/[^/]+$/, async (_req, res) => {
    const parts = new URL((_req as any).url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const entryId = decodeURIComponent(parts[5]);
    if (!ctx.papers.has(paperId)) return error(res, 'Paper not found', 404);
    const existing = ctx.db.getBibleEntry(entryId);
    if (!existing || existing.paper_id !== paperId) return error(res, 'Bible entry not found', 404);
    ctx.db.deleteBibleEntry(entryId);
    json(res, { ok: true });
  });
}
