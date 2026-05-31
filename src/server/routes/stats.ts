import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from '../context.ts';
import { json } from '../utils/helpers.ts';

type StatsContext = Pick<ServerContext, 'papers' | 'mmSessions' | 'bible' | 'db'>;

export function registerStatsRoutes(
  ctx: StatsContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('GET', '/api/stats', async (_req, res) => {
    let totalCitations = 0;
    let totalBibleEntries = 0;
    for (const paperId of ctx.papers.keys()) {
      totalCitations += ctx.db.getPaperCitations(paperId).length;
      totalBibleEntries += ctx.bible.getEntries(paperId).length;
    }
    const socraticSessions = ctx.db.listSocraticSessions().length;
    json(res, {
      papers: ctx.papers.size,
      mindmaps: ctx.mmSessions.size,
      totalCitations,
      totalBibleEntries,
      socraticSessions,
      reviewReports: 0,
    });
  });
}
