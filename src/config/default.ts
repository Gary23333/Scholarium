import type { BibleCategory, ScholariumConfig } from '../types/index.ts';

const categories: BibleCategory[] = [
  'data',
  'terminology',
  'citations',
  'experiments',
  'formulas',
  'claims',
  'figures',
  'variables',
  'arguments',
];

export const DEFAULT_AGENT_MODELS: ScholariumConfig['llm']['models'] = {
  cartographer: { agent: 'cartographer', model: 'deepseek-chat', temperature: 0.7, taskType: 'creative' },
  radar: { agent: 'radar', model: 'deepseek-chat', temperature: 0.3, taskType: 'factual' },
  planner: { agent: 'planner', model: 'deepseek-chat', temperature: 0.2, taskType: 'factual' },
  architect: { agent: 'architect', model: 'deepseek-chat', temperature: 0.2, taskType: 'factual' },
  writer: { agent: 'writer', model: 'deepseek-chat', temperature: 0.1, taskType: 'factual' },
  observer: { agent: 'observer', model: 'deepseek-chat', temperature: 0, taskType: 'extraction' },
  normalizer: { agent: 'normalizer', model: 'deepseek-chat', temperature: 0.2, taskType: 'factual' },
  auditor: { agent: 'auditor', model: 'deepseek-chat', temperature: 0, taskType: 'audit' },
  antiAiDetector: { agent: 'antiAiDetector', model: 'deepseek-chat', temperature: 0, taskType: 'audit' },
  antiAiRewriter: { agent: 'antiAiRewriter', model: 'deepseek-chat', temperature: 0.3, taskType: 'creative' },
  librarian: { agent: 'librarian', model: 'deepseek-chat', temperature: 0, taskType: 'factual' },
  reviser: { agent: 'reviser', model: 'deepseek-chat', temperature: 0.3, taskType: 'creative' },
};

export function createDefaultConfig(root = '.'): ScholariumConfig {
  return {
    project: {
      name: 'Scholarium Paper',
      description: 'Multi-agent academic paper writing project',
    },
    paths: {
      root,
      sections: 'sections',
      bible: 'bible',
      citations: 'citations',
      output: 'output',
      templates: 'templates',
    },
    llm: {
      providers: {
        deepseek: {
          apiKey: '${DEEPSEEK_API_KEY}',
          baseUrl: 'https://api.deepseek.com',
          models: ['deepseek-chat', 'deepseek-reasoner'],
        },
        openai: {
          apiKey: '${OPENAI_API_KEY}',
          baseUrl: 'https://api.openai.com/v1',
          models: ['gpt-4o', 'gpt-4o-mini'],
        },
        anthropic: {
          apiKey: '${ANTHROPIC_API_KEY}',
          baseUrl: 'https://api.anthropic.com/v1',
          models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
        },
      },
      models: { ...DEFAULT_AGENT_MODELS },
      fallbacks: {
        writer: { primary: 'deepseek-chat', fallback: ['gpt-4o-mini'], allowDegraded: true },
        auditor: { primary: 'deepseek-chat', fallback: ['gpt-4o'], allowDegraded: false },
      },
    },
    bible: {
      categories,
      requireApproval: false,
    },
    pipeline: {
      maxAuditRounds: 3,
      maxAntiAiRounds: 3,
      humanReviewTimeout: 3600000,
    },
  };
}
