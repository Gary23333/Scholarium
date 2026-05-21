import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from '../context.ts';
import { json, error, parseBody } from '../utils/helpers.ts';

type IntegrityContext = Pick<ServerContext, 'integrityGate' | 'papers' | 'db' | 'hasLLMFor'>;

export function registerIntegrityRoutes(
  ctx: IntegrityContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('POST', /^\/api\/integrity\/[^/]+\/gate$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const paperId = url.pathname.split('/')[3];
    const paper = ctx.papers.get(paperId) ?? ctx.db.getPaper(paperId);
    if (!paper) return error(res, 'Paper not found', 404);

    const sections = ctx.db.getPaperSections(paperId);
    const paperContent = sections
      .map((s: any) => s.content_tex)
      .filter(Boolean)
      .join('\n\n');
    if (!paperContent) return error(res, 'Paper has no content', 400);

    const citations = ctx.db.getPaperCitations(paperId);
    const references = citations.map((c: any) => ({ key: c.cite_key, bibtex: c.bibtex, title: c.title }));

    const body = await parseBody(req).catch(() => ({}));
    const gateType = body.gateType ?? 'pre_review';

    try {
      const result = await ctx.integrityGate.run({
        paperId,
        paperContent,
        references,
        gateType,
        mockMode: !ctx.hasLLMFor('auditor'),
      });
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 500);
    }
  });

  register('POST', /^\/api\/integrity\/[^/]+\/audit-claims$/, async (req, res) => {
    const url = new URL((req as any).url ?? '/', 'http://localhost');
    const paperId = url.pathname.split('/')[3];
    const sections = ctx.db.getPaperSections(paperId);
    const paperContent = sections
      .map((s: any) => s.content_tex)
      .filter(Boolean)
      .join('\n\n');
    const citations = ctx.db.getPaperCitations(paperId);
    const references = citations.map((c: any) => ({ key: c.cite_key, bibtex: c.bibtex }));

    try {
      const result = await ctx.integrityGate.auditClaims(paperContent, references);
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 500);
    }
  });
}
