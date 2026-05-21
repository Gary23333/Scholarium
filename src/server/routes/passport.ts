import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from '../context.ts';
import { json, error, parseBody } from '../utils/helpers.ts';
import { handleRouteError } from '../middleware/error-handler.ts';

type PassportContext = Pick<ServerContext, 'passportManager'>;

export function registerPassportRoutes(
  ctx: PassportContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('GET', /^\/api\/passport\/[^/]+$/, async (_req, res) => {
    const url = new URL((_req as any).url ?? '/', 'http://localhost');
    const paperId = decodeURIComponent(url.pathname.split('/')[3]);
    const passport = ctx.passportManager.getPassport(paperId);
    if (!passport) return error(res, 'Passport not found', 404);
    json(res, passport);
  });

  register('POST', /^\/api\/passport\/[^/]+$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const paperId = decodeURIComponent(url.pathname.split('/')[3]);
    try {
      const passport = ctx.passportManager.createPassport(paperId);
      json(res, passport);
    } catch (e: unknown) {
      handleRouteError(e, res);
    }
  });

  register('POST', /^\/api\/passport\/[^/]+\/resume$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const paperId = decodeURIComponent(url.pathname.split('/')[3]);
    const { hash } = await parseBody(req);
    if (!hash) return error(res, 'hash is required', 400);

    const result = ctx.passportManager.resumeFromPassport(paperId, hash);
    json(res, result);
  });

  register('POST', /^\/api\/passport\/[^/]+\/boundary$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const paperId = decodeURIComponent(url.pathname.split('/')[3]);
    const { stage, nextStage, pendingDecision } = await parseBody(req);
    if (stage === undefined) return error(res, 'stage is required', 400);

    const boundary = ctx.passportManager.addResetBoundary(paperId, stage, nextStage, pendingDecision);
    json(res, boundary);
  });
}
