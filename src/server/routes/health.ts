import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from '../context.ts';
import { json } from '../utils/helpers.ts';

export function registerHealthRoutes(
  ctx: ServerContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('GET', '/api/health', async (_req, res) => {
    json(res, {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  register('GET', '/api/health/ready', async (_req, res) => {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};

    try {
      ctx.db.listPaperIds();
      checks.db = { ok: true };
    } catch (e: any) {
      checks.db = { ok: false, detail: e.message };
    }

    try {
      const hasProviders = Object.keys(ctx.config.llm.providers).length > 0;
      const hasConfiguredProvider = Object.values(ctx.config.llm.providers).some((p) => p.apiKey && p.baseUrl);
      checks.llm = {
        ok: hasConfiguredProvider,
        detail: hasConfiguredProvider
          ? `${Object.keys(ctx.config.llm.providers).length} provider(s) configured`
          : hasProviders
            ? 'No provider with apiKey and baseUrl configured'
            : 'No LLM providers configured',
      };
    } catch (e: any) {
      checks.llm = { ok: false, detail: e.message };
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    json(
      res,
      {
        status: allOk ? 'ok' : 'degraded',
        checks,
        timestamp: new Date().toISOString(),
      },
      allOk ? 200 : 503,
    );
  });
}
