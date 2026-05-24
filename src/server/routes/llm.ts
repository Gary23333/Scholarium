import type { IncomingMessage, ServerResponse } from 'node:http';
import { LLMClient } from '../../llm/client.ts';
import { saveConfig, validateConfig } from '../../config/index.ts';
import type { ScholariumConfig } from '../../types/index.ts';
import type { ServerContext } from '../context.ts';
import { json, error, parseBody, isSafeUrl } from '../utils/helpers.ts';
import { taskManager } from '../../task-manager.ts';

type LlmRouteContext = Pick<ServerContext, 'config' | 'router' | 'hasLLMFor'>;

function maskConfig(config: ScholariumConfig): ScholariumConfig {
  return {
    ...config,
    llm: {
      ...config.llm,
      providers: Object.fromEntries(
        Object.entries(config.llm.providers).map(([name, provider]) => [
          name,
          { ...provider, apiKey: provider.apiKey ? '***configured***' : '' },
        ]),
      ),
    },
  };
}

export function registerLlmRoutes(
  ctx: LlmRouteContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('POST', '/api/llm/test', async (req, res) => {
    const { baseUrl, apiKey, model } = await parseBody(req);
    if (!apiKey) return json(res, { ok: false, error: 'apiKey is required' }, 400);
    try {
      const client = new LLMClient({ apiKey, baseUrl, model, maxTokens: 30, timeout: 15000, maxRetries: 1 });
      const start = Date.now();
      const reply = await client.complete('Reply with exactly one word.', 'What is 2+2?');
      json(res, { ok: true, reply: reply.trim(), tokens: 0, latency: Date.now() - start });
    } catch (e: any) {
      const statusMatch = e.message?.match(/LLM API error (\d+)/);
      const httpStatus = statusMatch ? parseInt(statusMatch[1]) : 500;
      const isAuth = httpStatus === 401 || httpStatus === 403;
      json(res, { ok: false, error: e.message, httpStatus }, isAuth ? 401 : 500);
    }
  });

  register('GET', '/api/llm/models', async (req, res) => {
    const defaultModels = ['deepseek-chat', 'deepseek-reasoner', 'gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-20250514'];
    const allModels = new Set<string>(defaultModels);
    const errors: string[] = [];

    for (const [name, provider] of Object.entries(ctx.config.llm.providers)) {
      if (!provider.apiKey || !provider.baseUrl) continue;
      if (!isSafeUrl(provider.baseUrl)) continue;
      try {
        const url = provider.baseUrl.replace(/\/+$/, '') + '/models';
        const fetchRes = await fetch(url, {
          headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (fetchRes.ok) {
          const data = (await fetchRes.json()) as any;
          const models = (data.data ?? data.models ?? []).map((m: any) => m.id ?? m).filter(Boolean);
          for (const m of models) allModels.add(m);
        }
      } catch (e: any) {
        errors.push(`${name}: ${e.message}`);
      }
    }

    json(res, { models: [...allModels], errors: errors.length > 0 ? errors : undefined });
  });

  register('GET', '/api/llm/config', async (req, res) => {
    json(res, {
      config: maskConfig(ctx.config),
      routes: Object.fromEntries(Object.keys(ctx.config.llm.models).map((agent) => [agent, ctx.router.route(agent)])),
      validation: validateConfig(ctx.config),
    });
  });

  register('POST', '/api/llm/config', async (req, res) => {
    const body = await parseBody(req);

    const mergedProviders: ScholariumConfig['llm']['providers'] = {};
    const allProviderKeys = new Set([...Object.keys(ctx.config.llm.providers), ...Object.keys(body.providers ?? {})]);
    for (const key of allProviderKeys) {
      const existing = ctx.config.llm.providers[key] ?? {};
      const incoming = (body.providers ?? {})[key] ?? {};
      mergedProviders[key] = {
        baseUrl: incoming.baseUrl ?? existing.baseUrl ?? '',
        apiKey:
          incoming.apiKey !== undefined && incoming.apiKey !== '***configured***' ? incoming.apiKey : existing.apiKey,
      };
      const incomingModels = incoming.models;
      const existingModels = existing.models;
      if (Array.isArray(incomingModels) && incomingModels.length > 0) {
        mergedProviders[key]!.models = incomingModels;
      } else if (Array.isArray(existingModels) && existingModels.length > 0) {
        mergedProviders[key]!.models = existingModels;
      }
    }

    const nextConfig: ScholariumConfig = {
      ...ctx.config,
      llm: {
        providers: mergedProviders,
        models: { ...ctx.config.llm.models, ...(body.models ?? {}) },
        fallbacks: { ...ctx.config.llm.fallbacks, ...(body.fallbacks ?? {}) },
      },
    };
    const validation = validateConfig(nextConfig);
    if (!validation.ok) return json(res, validation, 400);
    ctx.config = nextConfig;
    ctx.router.updateConfig(nextConfig);
    saveConfig(nextConfig);
    json(res, { ok: true, config: maskConfig(ctx.config), validation });
  });

  register('POST', '/api/llm/provider-models', async (req, res) => {
    const { baseUrl, apiKey } = await parseBody(req);
    if (!isSafeUrl(baseUrl)) return json(res, { ok: false, error: 'URL is not allowed' }, 400);
    try {
      const url = baseUrl.replace(/\/+$/, '') + '/models';
      const fetchRes = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });
      if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status} ${fetchRes.statusText}`);
      const data = (await fetchRes.json()) as any;
      const models = (data.data ?? data.models ?? []).map((m: any) => m.id ?? m).filter(Boolean);
      json(res, { ok: true, models });
    } catch (e: any) {
      json(res, { ok: false, error: e.message });
    }
  });

  register('POST', '/api/llm/translate', async (req, res) => {
    const b = await parseBody(req);
    const { text, targetLang, sourceLang, model } = b;
    if (!text) return error(res, 'text is required', 400);

    const task = taskManager.create('translate', `翻译文本`, { targetLang, model });
    taskManager.start(task.id);

    try {
      taskManager.updateProgress(task.id, 30, '正在翻译...');
      const sysPrompt = `You are a professional translator. Translate the following text from ${sourceLang || 'auto-detect'} to ${targetLang || '中文'}. Output ONLY the translated text, no explanations.`;
      const userPrompt = text;
      const providerName =
        (model && Object.keys(ctx.config.llm.providers).find((k) => model.startsWith(k))) || 'deepseek';
      const provider = ctx.config.llm.providers[providerName] || ctx.config.llm.providers.deepseek;
      const client = new LLMClient({
        apiKey: provider?.apiKey || '',
        baseUrl: provider?.baseUrl || 'https://api.deepseek.com/v1',
        model: model || 'deepseek-v4-flash',
        maxTokens: 4000,
        timeout: 60000,
      });
      const translated = await client.complete(sysPrompt, userPrompt);

      taskManager.complete(task.id, '翻译完成');
      json(res, { ok: true, translated, sourceText: text, taskId: task.id });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      json(res, { ok: false, error: e.message });
    }
  });
}
