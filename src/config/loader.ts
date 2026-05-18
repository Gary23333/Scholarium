import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScholariumConfig } from '../types/index.ts';
import { createDefaultConfig, DEFAULT_AGENT_MODELS } from './default.ts';

export interface ConfigLoadOptions {
  cwd?: string;
  configPath?: string;
  allowMissing?: boolean;
}

export interface ConfigValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const CONFIG_FILENAMES = ['scholarium.config.json', 'scholarium.json', 'config/scholarium.json'];

export function findConfigFile(cwd = process.cwd()): string | null {
  for (const name of CONFIG_FILENAMES) {
    const candidate = path.resolve(cwd, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadConfig(options: ConfigLoadOptions = {}): ScholariumConfig {
  const cwd = options.cwd ?? process.cwd();
  const configPath = options.configPath ? path.resolve(cwd, options.configPath) : findConfigFile(cwd);
  if (!configPath) {
    if (options.allowMissing ?? true) return createDefaultConfig(cwd);
    throw new Error(`Config file not found in ${cwd}`);
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const merged = mergeConfig(createDefaultConfig(path.dirname(configPath)), resolveEnvPlaceholders(raw));
  const validation = validateConfig(merged);
  if (!validation.ok) throw new Error(`Invalid Scholarium config: ${validation.errors.join('; ')}`);
  return merged;
}

export function writeDefaultConfig(filePath: string): void {
  const config = createDefaultConfig(path.dirname(path.resolve(filePath)));
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

export function saveConfig(config: ScholariumConfig, cwd = process.cwd()): void {
  const configPath = findConfigFile(cwd) || path.resolve(cwd, 'scholarium.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function validateConfig(config: ScholariumConfig): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!config.project?.name) errors.push('project.name is required');
  if (!config.paths?.root) errors.push('paths.root is required');
  if (!config.llm?.models || Object.keys(config.llm.models).length === 0) {
    errors.push('llm.models must define at least one agent route');
  }
  for (const [agent, route] of Object.entries(config.llm.models ?? {})) {
    if (!route.model) errors.push(`llm.models.${agent}.model is required`);
    if (typeof route.temperature !== 'number') errors.push(`llm.models.${agent}.temperature must be a number`);
    const provider = inferProvider(route.model);
    const providerConfig = config.llm.providers[provider];
    if (!providerConfig?.apiKey) {
      warnings.push(`Provider "${provider}" for agent "${agent}" has no API key; real LLM calls will fail unless configured at runtime.`);
    }
  }
  if (config.pipeline.maxAuditRounds < 1) errors.push('pipeline.maxAuditRounds must be >= 1');
  if (config.pipeline.maxAntiAiRounds < 1) errors.push('pipeline.maxAntiAiRounds must be >= 1');
  return { ok: errors.length === 0, errors, warnings };
}

export function getAgentRoute(config: ScholariumConfig, agentName: string) {
  const normalized = normalizeAgentName(agentName);
  return config.llm.models[normalized] ?? DEFAULT_AGENT_MODELS[normalized] ?? DEFAULT_AGENT_MODELS.writer;
}

function mergeConfig(base: ScholariumConfig, override: Partial<ScholariumConfig>): ScholariumConfig {
  return {
    project: { ...base.project, ...(override.project ?? {}) },
    paths: { ...base.paths, ...(override.paths ?? {}) },
    llm: {
      providers: { ...base.llm.providers, ...(override.llm?.providers ?? {}) },
      models: { ...base.llm.models, ...(override.llm?.models ?? {}) },
      fallbacks: { ...base.llm.fallbacks, ...(override.llm?.fallbacks ?? {}) },
    },
    bible: { ...base.bible, ...(override.bible ?? {}) },
    pipeline: { ...base.pipeline, ...(override.pipeline ?? {}) },
  };
}

function resolveEnvPlaceholders<T>(value: T): T {
  if (typeof value === 'string') {
    const resolved = value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? '');
    return resolved as T;
  }
  if (Array.isArray(value)) return value.map(resolveEnvPlaceholders) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveEnvPlaceholders(v)])) as T;
  }
  return value;
}

function inferProvider(model: string): string {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt')) return 'openai';
  if (model.startsWith('deepseek')) return 'deepseek';
  if (model.startsWith('glm')) return 'zhipu';
  return 'deepseek';
}

function normalizeAgentName(agentName: string): string {
  return agentName.trim().replace(/[-_\s]+([a-z])/g, (_, c) => c.toUpperCase()).replace(/^([A-Z])/, c => c.toLowerCase());
}
