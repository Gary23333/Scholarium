import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMProvider, AgentModelConfig } from './types';
import { DEFAULT_PROVIDERS } from './constants';
import { backendToFrontend, frontendToBackend } from './transform';
import { fetchLLMConfig, saveLLMConfig } from './api';

interface ScholariumStore {
  providers: LLMProvider[];
  agentModelConfigs: AgentModelConfig[];
  defaultProvider: string;
  defaultModel: string;
  configLoaded: boolean;
  saveStatus: 'idle' | 'saving' | 'success' | 'error';
  saveError: string;

  setProviders: (p: LLMProvider[] | ((prev: LLMProvider[]) => LLMProvider[])) => void;
  setAgentModelConfigs: (c: AgentModelConfig[]) => void;
  setDefaultProvider: (p: string) => void;
  setDefaultModel: (m: string) => void;
  updateAgentModel: (agentName: string, providerId: string, model: string, temperature?: number, taskType?: string) => void;
  addProvider: (name: string, baseUrl: string, apiKey: string) => void;
  removeProvider: (id: string) => void;
  loadFromBackend: () => Promise<void>;
  saveToBackend: () => Promise<void>;
}

export const useStore = create<ScholariumStore>()(
  persist(
    (set, get) => ({
      providers: DEFAULT_PROVIDERS.map((p) => ({ ...p, apiKey: '' })),
      agentModelConfigs: [],
      defaultProvider: 'deepseek',
      defaultModel: 'deepseek-chat',
      configLoaded: false,
      saveStatus: 'idle',
      saveError: '',

      setProviders: (p) =>
        set((state) => ({ providers: typeof p === 'function' ? p(state.providers) : p })),
      setAgentModelConfigs: (c) => set({ agentModelConfigs: c }),
      setDefaultProvider: (p) => set({ defaultProvider: p }),
      setDefaultModel: (m) => set({ defaultModel: m }),

      updateAgentModel: (agentName, providerId, model, temperature?, taskType?) =>
        set((state) => {
          const idx = state.agentModelConfigs.findIndex((c) => c.agentName === agentName);
          const existing = state.agentModelConfigs[idx];
          const updated: AgentModelConfig = {
            agentName,
            providerId,
            model,
            temperature: temperature ?? existing?.temperature ?? 0.2,
            taskType: (taskType as AgentModelConfig['taskType']) ?? existing?.taskType ?? 'factual',
          };
          if (idx >= 0) {
            const configs = [...state.agentModelConfigs];
            configs[idx] = updated;
            return { agentModelConfigs: configs };
          }
          return { agentModelConfigs: [...state.agentModelConfigs, updated] };
        }),

      addProvider: (name, baseUrl, apiKey) =>
        set((state) => {
          const id = name.toLowerCase().replace(/\s+/g, '-');
          if (state.providers.some((p) => p.id === id)) return state;
          return {
            providers: [...state.providers, { id, name, baseUrl, apiKey, models: [] }],
          };
        }),

      removeProvider: (id) =>
        set((state) => ({
          providers: state.providers.filter((p) => p.id !== id),
        })),

      loadFromBackend: async () => {
        try {
          const response = await fetchLLMConfig();
          const { providers, agentModelConfigs, defaultProvider, defaultModel } = backendToFrontend(response);
          set({ providers, agentModelConfigs, defaultProvider, defaultModel, configLoaded: true });
        } catch (e) {
          console.error('Failed to load config from backend:', e);
          set({ configLoaded: true });
        }
      },

      saveToBackend: async () => {
        set({ saveStatus: 'saving', saveError: '' });
        try {
          const { providers, agentModelConfigs } = get();
          const body = frontendToBackend(providers, agentModelConfigs);
          const result = await saveLLMConfig(body);
          if (result.ok) {
            set({ saveStatus: 'success' });
            // Reload to get masked keys
            await get().loadFromBackend();
          } else {
            set({ saveStatus: 'error', saveError: result.error || 'Save failed' });
          }
        } catch (e: unknown) {
          set({ saveStatus: 'error', saveError: e instanceof Error ? e.message : 'Network error' });
        }
      },
    }),
    {
      name: 'scholarium-llm-config',
      version: 1,
      partialize: (state) => ({
        providers: state.providers,
        agentModelConfigs: state.agentModelConfigs,
        defaultProvider: state.defaultProvider,
        defaultModel: state.defaultModel,
      }),
    },
  ),
);
