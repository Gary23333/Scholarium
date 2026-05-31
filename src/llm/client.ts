/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from '../utils/logger.ts';
// Scholarium LLM Client — OpenAI-compatible protocol with retry
export interface LLMClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  maxRetries?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: string;
}

export class LLMClient {
  private config: Required<LLMClientConfig>;

  constructor(config: LLMClientConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl.replace(/\/+$/, ''),
      model: config.model,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 16384,
      timeout: config.timeout ?? 600000,
      maxRetries: config.maxRetries ?? 3,
    };
  }

  async chat(messages: LLMMessage[], overrides?: Partial<LLMClientConfig>): Promise<LLMResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const body = {
      model: overrides?.model ?? this.config.model,
      messages,
      temperature: overrides?.temperature ?? this.config.temperature,
      max_tokens: overrides?.maxTokens ?? this.config.maxTokens,
    };
    const maxRetries = overrides?.maxRetries ?? this.config.maxRetries;
    const timeout = overrides?.timeout ?? this.config.timeout;

    logger.info(`[LLMClient] Using timeout: ${timeout}ms, model: ${body.model}`);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (resp.ok) {
          const data = (await resp.json()) as any;
          clearTimeout(timer);
          return {
            content: data.choices?.[0]?.message?.content ?? '',
            model: data.model ?? body.model,
            usage: {
              promptTokens: data.usage?.prompt_tokens ?? 0,
              completionTokens: data.usage?.completion_tokens ?? 0,
              totalTokens: data.usage?.total_tokens ?? 0,
            },
            finishReason: data.choices?.[0]?.finish_reason ?? 'unknown',
          };
        }

        // Retry on 429 (rate limit) and 5xx (server error)
        if (resp.status === 429 || resp.status >= 500) {
          const errText = await resp.text();
          lastError = new Error(`LLM API ${resp.status}: ${errText.substring(0, 200)}`);
          clearTimeout(timer);
          continue;
        }

        // Non-retryable error
        const errText = await resp.text();
        clearTimeout(timer);
        throw new Error(`LLM API error ${resp.status}: ${errText.substring(0, 500)}`);
      } catch (err: any) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          lastError = new Error(`LLM API timeout after ${timeout}ms`);
          continue;
        }
        // Network errors are retryable
        if (
          err.message?.includes('fetch failed') ||
          err.message?.includes('ECONNRESET') ||
          err.message?.includes('ETIMEDOUT')
        ) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error('LLM API failed after retries');
  }

  async complete(systemPrompt: string, userPrompt: string, overrides?: Partial<LLMClientConfig>): Promise<string> {
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const resp = await this.chat(messages, overrides);
    return resp.content;
  }

  getModel(): string {
    return this.config.model;
  }
  getBaseUrl(): string {
    return this.config.baseUrl;
  }
}
