import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from '../context.ts';
import { error, parseBody } from '../utils/helpers.ts';
import { taskManager } from '../../task-manager.ts';
import { getErrorMessage } from '../../utils/logger.ts';
import { planEdits, runSmartEdit, applyChangesToDisk, type SmartEditDeps } from '../../lib/smart-edit.ts';

type SmartEditRouteContext = Pick<
  ServerContext,
  'papers' | 'bible' | 'reviser' | 'hasLLMFor' | 'router' | 'db' | 'dataDir' | 'persistSection'
>;

type SSEWriter = (event: string, data: unknown) => void;

export function registerSmartEditRoutes(
  ctx: SmartEditRouteContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('POST', /^\/api\/papers\/[^/]+\/smart-edit$/, async (req, res) => {
    const parts = new URL(req.url ?? '/', 'http://localhost').pathname.split('/');
    const paperId = decodeURIComponent(parts[3]);
    const p = ctx.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);

    const b = await parseBody(req);
    const action = b.action as 'plan' | 'execute' | 'apply';
    if (!['plan', 'execute', 'apply'].includes(action)) return error(res, 'action must be plan | execute | apply', 400);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send: SSEWriter = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('stage', {
      stage: action,
      message: action === 'plan' ? '分析修改需求…' : action === 'execute' ? '执行局部重写…' : '确认落盘…',
    });

    const task = taskManager.create('smart-edit', `智能编辑 - ${p.title}`, { paperId, action });
    taskManager.start(task.id);

    const deps: SmartEditDeps = {
      papers: ctx.papers,
      bible: ctx.bible,
      reviser: ctx.reviser,
      hasLLMFor: ctx.hasLLMFor,
      router: ctx.router,
      db: ctx.db,
      dataDir: ctx.dataDir,
      persistSection: ctx.persistSection,
      onProgress: (stage, data) => {
        send('progress', { stage, data });
        if (stage === 'plan') taskManager.updateProgress(task.id, 15, '分析需求…');
        else if (stage === 'plan-done') taskManager.updateProgress(task.id, 25, '生成修改清单…');
        else if (stage === 'edit-done') taskManager.updateProgress(task.id, 50, '执行局部重写…');
        else if (stage === 'verify-done') taskManager.updateProgress(task.id, 75, '一致性校验…');
        else if (stage === 'done') taskManager.updateProgress(task.id, 90, '整理报告…');
      },
    };

    try {
      if (action === 'plan') {
        const request = typeof b.request === 'string' ? b.request.trim() : '';
        if (!request) throw new Error('request is required');
        const plan = await planEdits(deps, paperId, request);
        send('plan', { plan });
        send('done', { action, plan });
        taskManager.complete(task.id, '修改清单生成完成');
      } else if (action === 'execute') {
        const request = typeof b.request === 'string' ? b.request.trim() : '';
        if (!request) throw new Error('request is required');
        const report = await runSmartEdit(deps, paperId, request);
        send('done', { action, report });
        taskManager.complete(
          task.id,
          `智能编辑执行完成，修改 ${report.sectionsModified} 章 ${report.passagesModified} 处`,
        );
      } else {
        const sectionIds = Array.isArray(b.sectionIds)
          ? b.sectionIds.filter((x: unknown) => typeof x === 'string')
          : [];
        if (sectionIds.length === 0) throw new Error('sectionIds is required for apply');
        const result = await applyChangesToDisk(deps, paperId, sectionIds);
        send('done', { action, result });
        taskManager.complete(task.id, `已落盘 ${result.success.length} 章`);
      }
    } catch (e: unknown) {
      taskManager.fail(task.id, getErrorMessage(e));
      send('error', { message: getErrorMessage(e) });
    } finally {
      res.end();
    }
  });
}
