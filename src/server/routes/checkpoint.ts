/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from '../context.ts';
import { json } from '../utils/helpers.ts';

type CheckpointContext = Pick<ServerContext, 'checkpointManager'>;

export function registerCheckpointRoutes(
  ctx: CheckpointContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('GET', /^\/api\/checkpoint\/[^/]+$/, async (_req, res) => {
    const url = new URL((_req as any).url ?? '/', 'http://localhost');
    const paperId = decodeURIComponent(url.pathname.split('/')[3]);
    const checkpoint = ctx.checkpointManager.getActiveCheckpoint(paperId);
    if (!checkpoint) return json(res, { active: false });
    json(res, { active: true, checkpoint, message: ctx.checkpointManager.generateCheckpointMessage(checkpoint) });
  });

  register('POST', /^\/api\/checkpoint\/[^/]+\/confirm$/, async (_req, res) => {
    const url = new URL((_req as any).url ?? '/', 'http://localhost');
    const paperId = decodeURIComponent(url.pathname.split('/')[3]);
    ctx.checkpointManager.confirmCheckpoint(paperId);
    json(res, { ok: true });
  });
}
