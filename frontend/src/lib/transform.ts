import type { LLMProvider, AgentModelConfig, BackendConfigResponse, ModelRoute } from './types';
import { PROVIDER_DISPLAY_NAMES, inferProvider } from './constants';

export function backendToFrontend(response: BackendConfigResponse): {
  providers: LLMProvider[];
  agentModelConfigs: AgentModelConfig[];
  defaultProvider: string;
  defaultModel: string;
} {
  const llm = response.config.llm;
  const providerKeys = Object.keys(llm.providers);

  // Build LLMProvider[]
  const providers: LLMProvider[] = providerKeys.map((key) => {
    const p = llm.providers[key];
    // Provider 模型列表仅来自其自身配置，不与 Agent 路由模型合并
    const models = new Set<string>(p.models ?? []);
    return {
      id: key,
      name: PROVIDER_DISPLAY_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1),
      baseUrl: p.baseUrl || '',
      apiKey: p.apiKey || '',
      models: [...models],
    };
  });

  // Build AgentModelConfig[]
  const agentModelConfigs: AgentModelConfig[] = Object.entries(llm.models).map(([agentName, route]) => ({
    agentName,
    providerId: inferProvider(route.model),
    model: route.model,
    temperature: route.temperature,
    taskType: route.taskType,
  }));

  // Determine default from first agent route or first provider
  const firstRoute = Object.values(llm.models)[0];
  const defaultProvider = firstRoute ? inferProvider(firstRoute.model) : providerKeys[0] || 'deepseek';
  const defaultModel = firstRoute?.model || '';

  return { providers, agentModelConfigs, defaultProvider, defaultModel };
}

export function frontendToBackend(
  providers: LLMProvider[],
  agentModelConfigs: AgentModelConfig[],
): { providers: Record<string, { apiKey?: string; baseUrl?: string; models?: string[] }>; models: Record<string, ModelRoute> } {
  // Convert providers array to Record
  const providersRecord: Record<string, { apiKey?: string; baseUrl?: string; models?: string[] }> = {};
  for (const p of providers) {
    const entry: { apiKey?: string; baseUrl?: string; models?: string[] } = { baseUrl: p.baseUrl };
    // Only send apiKey if it's not masked and not empty
    if (p.apiKey && p.apiKey !== '***configured***') {
      entry.apiKey = p.apiKey;
    }
    // Send models if present
    if (p.models && p.models.length > 0) {
      entry.models = p.models;
    }
    providersRecord[p.id] = entry;
  }

  // Convert agentModelConfigs to models Record
  const modelsRecord: Record<string, ModelRoute> = {};
  for (const config of agentModelConfigs) {
    modelsRecord[config.agentName] = {
      agent: config.agentName,
      model: config.model,
      temperature: config.temperature,
      taskType: config.taskType,
    };
  }

  return { providers: providersRecord, models: modelsRecord };
}
