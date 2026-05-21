import { LLMClient, type LLMClientConfig, type LLMMessage, type LLMResponse } from './client.ts';
import type { ScholariumConfig } from '../types/index.ts';
import { getAgentRoute } from '../config/loader.ts';
import { getModelCapabilities, getRecommendedMaxTokens } from './model-capabilities.ts';
import { logger } from '../utils/logger.js';

export interface RouteResult {
  model: string;
  temperature: number;
  provider: string;
  maxTokens: number;
  isDegraded: boolean;
}

export class LLMRouter {
  private clients: Map<string, LLMClient> = new Map();
  private modelConfigs: Map<string, { model: string; temperature: number; taskType: string }> = new Map();
  private fallbackConfigs: Map<string, { primary: string; fallback: string[]; allowDegraded: boolean }> = new Map();
  private providerConfigs: Map<string, { apiKey?: string; baseUrl?: string }> = new Map();

  private config?: ScholariumConfig;
  constructor(config?: ScholariumConfig) {
    this.config = config;
    if (config) this.initFromConfig(config);
  }

  private initFromConfig(config: ScholariumConfig): void {
    // Register providers
    for (const [name, prov] of Object.entries(config.llm.providers)) {
      this.providerConfigs.set(name, prov);
      if (prov.apiKey && prov.baseUrl) {
        this.registerProvider(name, {
          apiKey: prov.apiKey,
          baseUrl: prov.baseUrl,
          model: 'deepseek-chat', // default, overridden per-call
        });
      }
    }
    // Model assignments
    for (const [agent, route] of Object.entries(config.llm.models)) {
      this.modelConfigs.set(this.normalizeAgentName(agent), {
        model: route.model,
        temperature: route.temperature,
        taskType: route.taskType,
      });
    }
    // Fallbacks
    for (const [agent, fb] of Object.entries(config.llm.fallbacks)) {
      this.fallbackConfigs.set(this.normalizeAgentName(agent), fb);
    }
  }

  updateConfig(config: ScholariumConfig): void {
    this.config = config;
    this.clients.clear();
    this.modelConfigs.clear();
    this.fallbackConfigs.clear();
    this.providerConfigs.clear();
    this.initFromConfig(config);
  }

  registerProvider(name: string, config: LLMClientConfig): void {
    this.providerConfigs.set(name, { apiKey: config.apiKey, baseUrl: config.baseUrl });
    this.clients.set(name, new LLMClient(config));
  }

  /** Get a client for a specific agent */
  getClient(agentName: string): { client: LLMClient; model: string; temperature: number; maxTokens: number } {
    const agentKey = this.normalizeAgentName(agentName);
    const configuredRoute = this.config ? getAgentRoute(this.config, agentKey) : undefined;
    const mc = this.modelConfigs.get(agentKey) ?? configuredRoute;
    const provider = this.inferProvider(mc?.model ?? 'deepseek-chat');
    let client = this.clients.get(provider);
    if (!client) {
      const providerConfig = this.providerConfigs.get(provider);
      if (providerConfig?.apiKey && providerConfig.baseUrl) {
        this.registerProvider(provider, {
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          model: mc?.model ?? 'deepseek-chat',
        });
        client = this.clients.get(provider);
      }
    }
    if (!client) {
      throw new Error(
        `No LLM client registered for provider: ${provider}. Configure llm.providers.${provider}.apiKey and baseUrl.`,
      );
    }
    const model = mc?.model ?? 'deepseek-chat';
    const taskType = mc?.taskType ?? 'factual';
    const maxTokens = getRecommendedMaxTokens(model, taskType);
    return {
      client,
      model,
      temperature: mc?.temperature ?? 0.7,
      maxTokens,
    };
  }

  /** Chat using agent routing */
  async chat(
    agentName: string,
    messages: LLMMessage[],
    overrides?: { temperature?: number; model?: string; maxTokens?: number; timeout?: number },
  ): Promise<LLMResponse> {
    const agentKey = this.normalizeAgentName(agentName);
    const { client, model, temperature, maxTokens } = this.getClient(agentKey);
    try {
      return await client.chat(messages, {
        model: overrides?.model ?? model,
        temperature: overrides?.temperature ?? temperature,
        maxTokens: overrides?.maxTokens ?? maxTokens,
        timeout: overrides?.timeout,
      });
    } catch (err) {
      // Try fallback
      const fb = this.fallbackConfigs.get(agentKey);
      if (fb) {
        for (const fbModel of fb.fallback) {
          try {
            const fbProvider = this.inferProvider(fbModel);
            let fbClient = this.clients.get(fbProvider);
            const providerConfig = this.providerConfigs.get(fbProvider);
            if (!fbClient && providerConfig?.apiKey && providerConfig.baseUrl) {
              this.registerProvider(fbProvider, {
                apiKey: providerConfig.apiKey,
                baseUrl: providerConfig.baseUrl,
                model: fbModel,
              });
              fbClient = this.clients.get(fbProvider);
            }
            if (fbClient) {
              const fbMaxTokens = getRecommendedMaxTokens(fbModel, 'factual');
              const resp = await fbClient.chat(messages, { model: fbModel, temperature, maxTokens: fbMaxTokens });
              return { ...resp, model: fbModel };
            }
          } catch {
            logger.warn('LLM fallback client failed, continuing to next fallback'); /* continue to next fallback */
          }
        }
      }
      throw err;
    }
  }

  /** Complete using agent routing */
  async complete(
    agentName: string,
    systemPrompt: string,
    userPrompt: string,
    overrides?: { temperature?: number; model?: string; maxTokens?: number; timeout?: number },
  ): Promise<string> {
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const resp = await this.chat(agentName, messages, overrides);
    return resp.content;
  }

  route(agent: string): RouteResult {
    const agentKey = this.normalizeAgentName(agent);
    const mc = this.modelConfigs.get(agentKey) ?? (this.config ? getAgentRoute(this.config, agentKey) : undefined);
    const model = mc?.model ?? 'deepseek-chat';
    const taskType = mc?.taskType ?? 'factual';
    return {
      model,
      temperature: mc?.temperature ?? 0.7,
      provider: this.inferProvider(model),
      maxTokens: getRecommendedMaxTokens(model, taskType),
      isDegraded: false,
    };
  }

  private inferProvider(model: string): string {
    if (model.startsWith('claude')) return 'anthropic';
    if (model.startsWith('gpt')) return 'openai';
    if (model.startsWith('deepseek')) return 'deepseek';
    if (model.startsWith('glm')) return 'zhipu';
    // Default: try deepseek
    return 'deepseek';
  }

  private normalizeAgentName(agentName: string): string {
    return agentName
      .trim()
      .replace(/[-_\s]+([a-z])/g, (_, c) => c.toUpperCase())
      .replace(/^([A-Z])/, (c) => c.toLowerCase());
  }
}
