import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from '../context.ts';
import { json, error, parseBody } from '../utils/helpers.ts';
import { handleRouteError } from '../middleware/error-handler.ts';

type ReviewContext = Pick<ServerContext, 'reviewOrchestrator' | 'papers' | 'db'>;

export function registerReviewRoutes(
  ctx: ReviewContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('POST', /^\/api\/review\/[^/]+\/start$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const paperId = decodeURIComponent(url.pathname.split('/')[3]);
    const paper = ctx.papers.get(paperId) ?? ctx.db.getPaper(paperId);
    if (!paper) return error(res, 'Paper not found', 404);

    const sections = ctx.db.getPaperSections(paperId);
    const paperContent = sections
      .map((s: any) => s.content_tex)
      .filter(Boolean)
      .join('\n\n');
    if (!paperContent) return error(res, 'Paper has no content to review', 400);

    try {
      const result = await ctx.reviewOrchestrator.startReview(paperId, paperContent, paper.title);
      json(res, {
        sessionId: result.session.id,
        session: result.session,
        editorialDecision: result.editorialDecision,
      });
    } catch (e: unknown) {
      handleRouteError(e, res);
    }
  });

  register('GET', /^\/api\/review\/[^/]+$/, async (_req, res) => {
    const url = new URL((_req as any).url ?? '/', 'http://localhost');
    const sessionId = decodeURIComponent(url.pathname.split('/')[3]);
    const session = ctx.reviewOrchestrator.getSession(sessionId);
    if (!session) return error(res, 'Review session not found', 404);
    json(res, session);
  });
}
