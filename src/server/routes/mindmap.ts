import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { MindMapNode, CartographerInput } from '../../agents/cartographer.ts';
import type { ServerContext, MindMapSession } from '../context.ts';
import { json, error, parseBody, now } from '../utils/helpers.ts';
import { taskManager } from '../../task-manager.ts';
import { handleRouteError } from '../middleware/error-handler.ts';
import { logger } from '../../utils/logger.ts';

type MindmapRouteContext = Pick<ServerContext, 'mmSessions' | 'sseClients' | 'cartographer' | 'db' | 'router' | 'hasLLMFor'>;

function mmSSESend(sseClients: Map<string, ServerResponse[]>, sid: string, data: any) {
  for (const c of sseClients.get(sid) ?? [])
    try {
      c.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      /* client disconnected */
    }
}

export function registerMindmapRoutes(
  ctx: MindmapRouteContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('POST', '/api/mindmap/create', async (req, res) => {
    const b = await parseBody(req);
    const s: MindMapSession = {
      id: `mm-${randomUUID()}`,
      researchTopic: b.researchTopic,
      keywords: b.keywords ?? [],
      targetJournal: b.targetJournal,
      nodes: [],
      currentRound: 0,
      status: 'active',
      createdAt: new Date(),
    };
    ctx.mmSessions.set(s.id, s);
    ctx.db.createMindMapSession(s);
    json(res, { sessionId: s.id, session: s });
  });

  register('POST', '/api/mindmap/diverge', async (req, res) => {
    const b = await parseBody(req);
    logger.info(`[MindMap] Diverge round ${b.round ?? 'next'} for session ${b.sessionId}`);
    const s = ctx.mmSessions.get(b.sessionId);
    if (!s) return error(res, 'Session not found', 404);
    const round = Math.min(3, Math.max(1, b.round ?? s.currentRound + 1));

    const task = taskManager.create('diverge', `思维导图发散 - 第${round}轮`, { sessionId: b.sessionId, round });
    taskManager.start(task.id);

    mmSSESend(ctx.sseClients, b.sessionId, { type: 'diverge_start', round, ts: now() });
    const input: CartographerInput = {
      researchTopic: s.researchTopic,
      keywords: s.keywords,
      targetJournal: s.targetJournal,
      existingNodes: s.nodes,
      selectedNodeIds: b.selectedNodeIds ?? [],
      currentRound: round,
    };
    try {
      taskManager.updateProgress(task.id, 30, '正在生成节点...');
      const output = await ctx.cartographer.execute(input, { mock: !ctx.hasLLMFor('cartographer') });
      logger.info(`[MindMap] Generated ${output.nodes.length} nodes`);

      taskManager.updateProgress(task.id, 80, `已生成 ${output.nodes.length} 个节点`);
      for (const n of output.nodes) {
        s.nodes.push(n);
        ctx.db.createMindMapNode({ ...n, sessionId: b.sessionId });
        mmSSESend(ctx.sseClients, b.sessionId, { type: 'node', node: n, ts: now() });
        await new Promise((r) => setTimeout(r, 80));
      }
      s.currentRound = output.round;
      ctx.db.updateMindMapSession(b.sessionId, { current_round: output.round });
      mmSSESend(ctx.sseClients, b.sessionId, {
        type: 'diverge_complete',
        round: output.round,
        summary: output.summary,
        ts: now(),
      });

      taskManager.complete(task.id, `完成，共 ${output.nodes.length} 个节点`);
      json(res, {
        nodes: output.nodes,
        round: output.round,
        summary: output.summary,
        totalNodes: s.nodes.length,
        taskId: task.id,
      });
    } catch (e: any) {
      logger.error('[MindMap] Cartographer failed:', e);
      taskManager.fail(task.id, e.message);
      mmSSESend(ctx.sseClients, b.sessionId, { type: 'error', message: e.message, ts: now() });
      handleRouteError(e, res);
    }
  });

  register('POST', '/api/mindmap/check', async (req, res) => {
    const b = await parseBody(req);
    const s = ctx.mmSessions.get(b.sessionId);
    if (!s) return error(res, 'Session not found', 404);
    const n = s.nodes.find((n) => n.id === b.nodeId);
    if (n) {
      n.checked = !!b.checked;
      ctx.db.updateMindMapNode(b.nodeId, { checked: !!b.checked });
    }
    mmSSESend(ctx.sseClients, b.sessionId, { type: 'check', nodeId: b.nodeId, checked: !!b.checked });
    json(res, { ok: true });
  });

  register('POST', '/api/mindmap/export', async (req, res) => {
    const b = await parseBody(req);
    const s = ctx.mmSessions.get(b.sessionId);
    if (!s) return error(res, 'Session not found', 404);
    const sel = s.nodes.filter((n) => n.checked);
    json(res, {
      researchTopic: s.researchTopic,
      selectedBranches: sel.filter((n) => n.round === 1).map((n) => n.label),
      confirmedNodes: sel.map((n) => ({ id: n.id, label: n.label, depth: n.round })),
      contributionGaps: s.nodes
        .filter((n) => n.round === 3 && n.label.startsWith('[Gap]'))
        .map((n) => n.label.replace(/^\[Gap\]\s*/, '')),
      noveltyCandidates: s.nodes
        .filter((n) => n.round === 3 && n.label.startsWith('[Novelty]'))
        .map((n) => n.label.replace(/^\[Novelty\]\s*/, '')),
    });
    s.status = 'exported';
    ctx.db.updateMindMapSession(b.sessionId, { status: 'exported' });
  });

  register('GET', /^\/api\/mindmap\/sse\/[^/]+$/, async (req, res) => {
    const p = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const sid = decodeURIComponent(p[p.length - 1]);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: {"type":"connected"}\n\n');
    const arr = ctx.sseClients.get(sid) ?? [];
    arr.push(res);
    ctx.sseClients.set(sid, arr);
    (req as any).on('close', () =>
      ctx.sseClients.set(
        sid,
        (ctx.sseClients.get(sid) ?? []).filter((c) => c !== res),
      ),
    );
  });

  register('GET', '/api/mindmap/sessions', async (req, res) => {
    json(
      res,
      [...ctx.mmSessions.values()].map((s) => ({
        id: s.id,
        topic: s.researchTopic,
        round: s.currentRound,
        nodes: s.nodes.length,
        status: s.status,
      })),
    );
  });

  register('GET', /^\/api\/mindmap\/sessions\/[^/]+$/, async (req, res) => {
    const p = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const id = decodeURIComponent(p[p.length - 1]);
    const s = ctx.mmSessions.get(id);
    if (!s) return error(res, 'Session not found', 404);
    json(res, {
      id: s.id,
      researchTopic: s.researchTopic,
      keywords: s.keywords,
      targetJournal: s.targetJournal,
      currentRound: s.currentRound,
      status: s.status,
      createdAt: s.createdAt,
      nodes: s.nodes,
    });
  });

  register('DELETE', /^\/api\/mindmap\/sessions\/[^/]+$/, async (req, res) => {
    const p = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const id = decodeURIComponent(p[p.length - 1]);
    if (!ctx.mmSessions.has(id)) return error(res, 'Session not found', 404);
    ctx.mmSessions.delete(id);
    ctx.db.deleteMindMapSession(id);
    json(res, { ok: true });
  });
}
