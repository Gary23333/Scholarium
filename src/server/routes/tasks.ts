/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from '../context.ts';
import { json, error } from '../utils/helpers.ts';
import { taskManager } from '../../task-manager.ts';

type TasksContext = Pick<ServerContext, 'port'>;

export function registerTasksRoutes(
  ctx: TasksContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('GET', '/api/tasks', async (req, res) => {
    const url = new URL((req as any).url ?? '/', `http://localhost:${ctx.port}`);
    const status = url.searchParams.get('status') as any;
    const type = url.searchParams.get('type') as any;
    const limit = parseInt(url.searchParams.get('limit') ?? '50');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');
    const result = taskManager.getAll({ status, type, limit, offset });
    json(res, result);
  });

  register('GET', '/api/tasks/stats', async (_req, res) => {
    json(res, taskManager.getStats());
  });

  register('GET', /^\/api\/tasks\/[^/]+$/, async (_req, res) => {
    const url = new URL((_req as any).url ?? '/', `http://localhost:${ctx.port}`);
    const taskId = decodeURIComponent(url.pathname.split('/').pop()!);
    const task = taskManager.get(taskId);
    if (!task) return error(res, 'Task not found', 404);
    json(res, task);
  });

  register('POST', '/api/tasks/clear', async (_req, res) => {
    taskManager.clear();
    json(res, { ok: true });
  });
}
