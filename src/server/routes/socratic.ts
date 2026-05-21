import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SocraticMode } from '../../types/research.ts';
import type { ServerContext } from '../context.ts';
import { json, error, parseBody } from '../utils/helpers.ts';

type SocraticContext = Pick<ServerContext, 'socraticOrchestrator' | 'papers' | 'db'>;

export function registerSocraticRoutes(
  ctx: SocraticContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('POST', '/api/socratic/start', async (req, res) => {
    const { paperId, mode } = await parseBody(req);
    if (!paperId) return error(res, 'paperId is required', 400);

    const paper = ctx.papers.get(paperId) ?? ctx.db.getPaper(paperId);
    if (!paper) return error(res, 'Paper not found', 404);

    const topic = paper.research_topic || paper.researchTopic || paper.title;
    const result = await ctx.socraticOrchestrator.startSession(paperId, topic, mode as SocraticMode | undefined);

    const paperData = ctx.db.getPaper(paperId);
    if (paperData) {
      paperData.socratic_session_id = result.session.id;
    }

    json(res, {
      sessionId: result.session.id,
      session: result.session,
      firstMessage: result.firstMessage,
    });
  });

  register('POST', /^\/api\/socratic\/[^/]+\/respond$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const sessionId = url.pathname.split('/')[3];
    const { message, skipCommitment } = await parseBody(req);
    if (!message) return error(res, 'message is required', 400);

    try {
      const result = await ctx.socraticOrchestrator.respond(sessionId, message, skipCommitment);
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  });

  register('GET', /^\/api\/socratic\/[^/]+\/summary$/, async (_req, res) => {
    const url = new URL((_req as any).url ?? '/', 'http://localhost');
    const sessionId = url.pathname.split('/')[3];
    const session = ctx.socraticOrchestrator.getSession(sessionId);
    if (!session) return error(res, 'Session not found', 404);

    const paper = ctx.db.getPaper(session.paperId);
    json(res, {
      session,
      insights: session.insights,
      commitments: session.commitments,
      researchBrief: paper?.research_brief ?? null,
      methodology: paper?.methodology ?? null,
    });
  });

  register('POST', /^\/api\/socratic\/[^/]+\/complete$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const sessionId = url.pathname.split('/')[3];
    try {
      const session = ctx.socraticOrchestrator.getSession(sessionId);
      if (!session) return error(res, 'Session not found', 404);

      const topic = ctx.db.getPaper(session.paperId)?.title ?? '未指定';
      const result = await ctx.socraticOrchestrator.respond(sessionId, '我已经准备好总结我的研究想法了。', true);
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  });

  register('POST', /^\/api\/socratic\/[^/]+\/commitment$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const sessionId = url.pathname.split('/')[3];
    const { commitment } = await parseBody(req);
    if (!commitment) return error(res, 'commitment is required', 400);

    try {
      const result = await ctx.socraticOrchestrator.completeCommitment(sessionId, commitment);
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  });
}
