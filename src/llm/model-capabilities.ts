// Model capabilities configuration — auto-detect maxTokens based on model
export interface ModelCapabilities {
  maxTokens: number;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  pricing: {
    input: number;  // per 1M tokens
    output: number; // per 1M tokens
  };
}

// Known model capabilities
const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // DeepSeek models
  'deepseek-chat': {
    maxTokens: 4096,
    contextWindow: 32768,
    supportsStreaming: true,
    supportsVision: false,
    pricing: { input: 0.14, output: 0.28 },
  },
  'deepseek-v4-pro': {
    maxTokens: 8192,
    contextWindow: 65536,
    supportsStreaming: true,
    supportsVision: false,
    pricing: { input: 0.14, output: 0.28 },
  },
  'deepseek-v4-flash': {
    maxTokens: 4096,
    contextWindow: 32768,
    supportsStreaming: true,
    supportsVision: false,
    pricing: { input: 0.07, output: 0.14 },
  },
  'deepseek-reasoner': {
    maxTokens: 8192,
    contextWindow: 65536,
    supportsStreaming: true,
    supportsVision: false,
    pricing: { input: 0.55, output: 2.19 },
  },

  // OpenAI models
  'gpt-4o': {
    maxTokens: 16384,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { input: 2.5, output: 10 },
  },
  'gpt-4o-mini': {
    maxTokens: 16384,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { input: 0.15, output: 0.6 },
  },
  'gpt-4-turbo': {
    maxTokens: 4096,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { input: 10, output: 30 },
  },
  'gpt-3.5-turbo': {
    maxTokens: 4096,
    contextWindow: 16385,
    supportsStreaming: true,
    supportsVision: false,
    pricing: { input: 0.5, output: 1.5 },
  },

  // Anthropic models
  'claude-sonnet-4-20250514': {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { input: 3, output: 15 },
  },
  'claude-3-5-sonnet-20241022': {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { input: 3, output: 15 },
  },
  'claude-3-opus-20240229': {
    maxTokens: 4096,
    contextWindow: 200000,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { input: 15, output: 75 },
  },
  'claude-3-haiku-20240307': {
    maxTokens: 4096,
    contextWindow: 200000,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { input: 0.25, output: 1.25 },
  },

  // Other models
  'glm-4': {
    maxTokens: 4096,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: true,
    pricing: { input: 0.7, output: 1.4 },
  },
  'glm-4-flash': {
    maxTokens: 4096,
    contextWindow: 128000,
    supportsStreaming: true,
    supportsVision: false,
    pricing: { input: 0.01, output: 0.01 },
  },
};

// Default capabilities for unknown models
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  maxTokens: 4096,
  contextWindow: 32768,
  supportsStreaming: true,
  supportsVision: false,
  pricing: { input: 1, output: 2 },
};

/**
 * Get model capabilities based on model name
 * Supports fuzzy matching for model families
 */
export function getModelCapabilities(model: string): ModelCapabilities {
  // Direct match
  if (MODEL_CAPABILITIES[model]) {
    return MODEL_CAPABILITIES[model];
  }

  // Fuzzy match for model families
  const modelLower = model.toLowerCase();

  // DeepSeek family
  if (modelLower.includes('deepseek-v4-pro') || modelLower.includes('deepseek-r1')) {
    return MODEL_CAPABILITIES['deepseek-v4-pro'];
  }
  if (modelLower.includes('deepseek-v4-flash') || modelLower.includes('deepseek-v3')) {
    return MODEL_CAPABILITIES['deepseek-v4-flash'];
  }
  if (modelLower.includes('deepseek')) {
    return MODEL_CAPABILITIES['deepseek-chat'];
  }

  // GPT family
  if (modelLower.includes('gpt-4o-mini')) {
    return MODEL_CAPABILITIES['gpt-4o-mini'];
  }
  if (modelLower.includes('gpt-4o') || modelLower.includes('gpt-4-turbo')) {
    return MODEL_CAPABILITIES['gpt-4o'];
  }
  if (modelLower.includes('gpt-4')) {
    return MODEL_CAPABILITIES['gpt-4-turbo'];
  }
  if (modelLower.includes('gpt-3.5')) {
    return MODEL_CAPABILITIES['gpt-3.5-turbo'];
  }

  // Claude family
  if (modelLower.includes('claude-3-5-sonnet') || modelLower.includes('claude-sonnet')) {
    return MODEL_CAPABILITIES['claude-3-5-sonnet-20241022'];
  }
  if (modelLower.includes('claude-3-opus')) {
    return MODEL_CAPABILITIES['claude-3-opus-20240229'];
  }
  if (modelLower.includes('claude-3-haiku')) {
    return MODEL_CAPABILITIES['claude-3-haiku-20240307'];
  }

  // GLM family
  if (modelLower.includes('glm-4-flash')) {
    return MODEL_CAPABILITIES['glm-4-flash'];
  }
  if (modelLower.includes('glm-4')) {
    return MODEL_CAPABILITIES['glm-4'];
  }

  // Return default for unknown models
  return DEFAULT_CAPABILITIES;
}

/**
 * Get recommended maxTokens based on task type
 */
export function getRecommendedMaxTokens(model: string, taskType: string): number {
  const capabilities = getModelCapabilities(model);
  const maxTokens = capabilities.maxTokens;

  switch (taskType) {
    case 'creative':
      // Creative tasks need more tokens
      return Math.min(maxTokens, 16384);
    case 'factual':
      // Factual tasks need moderate tokens
      return Math.min(maxTokens, 8192);
    case 'audit':
      // Audit tasks need fewer tokens
      return Math.min(maxTokens, 4096);
    case 'extraction':
      // Extraction tasks need few tokens
      return Math.min(maxTokens, 2048);
    default:
      return maxTokens;
  }
}

/**
 * Get all known models
 */
export function getKnownModels(): string[] {
  return Object.keys(MODEL_CAPABILITIES);
}

/**
 * Check if a model supports a feature
 */
export function modelSupports(model: string, feature: 'streaming' | 'vision'): boolean {
  const capabilities = getModelCapabilities(model);
  switch (feature) {
    case 'streaming':
      return capabilities.supportsStreaming;
    case 'vision':
      return capabilities.supportsVision;
    default:
      return false;
  }
}
