// Embedding Provider — Text embedding support for citation matching and Bible retrieval
// Supports: local (mock), OpenAI API, DeepSeek API

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokens: number;
}

export interface EmbeddingProvider {
  readonly name: string;
  embed(text: string): Promise<EmbeddingResult>;
  similarity(a: number[], b: number[]): number;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ═══════════════════════════════════════════
// Local Provider — lightweight TF-IDF + random projection
// ═══════════════════════════════════════════

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local';
  private dim: number;

  constructor(dim: number = 128) {
    this.dim = dim;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const words = this.tokenize(text);
    const embedding = this.tfidfVectorize(words);
    return {
      embedding,
      model: `local-tfidf-${this.dim}`,
      tokens: words.length,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  similarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z\u4e00-\u9fa5\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }

  private tfidfVectorize(words: string[]): number[] {
    // Simplified TF-IDF with random projection to fixed dimension
    const freq = new Map<string, number>();
    for (const w of words) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }

    const vec = new Array(this.dim).fill(0);
    let _i = 0;
    for (const [word, count] of freq) {
      const tf = count / words.length;
      const hash = this.hashString(word);
      const idx = hash % this.dim;
      vec[idx] += tf * (1 + Math.log(words.length / count));
      _i++;
    }

    // Normalize
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return mag === 0 ? vec : vec.map((v) => v / mag);
  }

  private hashString(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = (hash << 5) - hash + s.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit
    }
    return Math.abs(hash);
  }
}

// ═══════════════════════════════════════════
// OpenAI Embedding Provider
// ═══════════════════════════════════════════

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  private config: Required<OpenAIConfig>;

  constructor(config: OpenAIConfig) {
    this.config = {
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
      ...config,
    };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const resp = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        input: text.substring(0, 8191), // OpenAI token limit
        model: this.config.model,
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`OpenAI embedding failed: ${resp.status} ${error}`);
    }

    const data = (await resp.json()) as any;
    return {
      embedding: data.data?.[0]?.embedding ?? [],
      model: data.model ?? this.config.model,
      tokens: data.usage?.total_tokens ?? 0,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const resp = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        input: texts.map((t) => t.substring(0, 8191)),
        model: this.config.model,
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`OpenAI embedding batch failed: ${resp.status} ${error}`);
    }

    const data = (await resp.json()) as any;
    return (data.data ?? []).map((d: any, _i: number) => ({
      embedding: d.embedding ?? [],
      model: data.model ?? this.config.model,
      tokens: data.usage?.total_tokens ?? 0,
    }));
  }

  similarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }
}

// ═══════════════════════════════════════════
// DeepSeek / Compatible Provider
// ═══════════════════════════════════════════

export interface DeepSeekEmbeddingConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export class DeepSeekEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'deepseek';
  private config: Required<DeepSeekEmbeddingConfig>;

  constructor(config: DeepSeekEmbeddingConfig) {
    this.config = {
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-embedding',
      ...config,
    };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const resp = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        input: text.substring(0, 8000),
        model: this.config.model,
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`DeepSeek embedding failed: ${resp.status} ${error}`);
    }

    const data = (await resp.json()) as any;
    return {
      embedding: data.data?.[0]?.embedding ?? [],
      model: data.model ?? this.config.model,
      tokens: data.usage?.total_tokens ?? 0,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const resp = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        input: texts.map((t) => t.substring(0, 8000)),
        model: this.config.model,
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`DeepSeek embedding batch failed: ${resp.status} ${error}`);
    }

    const data = (await resp.json()) as any;
    return (data.data ?? []).map((d: any) => ({
      embedding: d.embedding ?? [],
      model: data.model ?? this.config.model,
      tokens: data.usage?.total_tokens ?? 0,
    }));
  }

  similarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }
}

// ═══════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════

export type EmbeddingProviderType = 'local' | 'openai' | 'deepseek';

export function createEmbeddingProvider(
  type: EmbeddingProviderType,
  config?: OpenAIConfig | DeepSeekEmbeddingConfig,
): EmbeddingProvider {
  switch (type) {
    case 'openai':
      return new OpenAIEmbeddingProvider(config as OpenAIConfig);
    case 'deepseek':
      return new DeepSeekEmbeddingProvider(config as DeepSeekEmbeddingConfig);
    case 'local':
    default:
      return new LocalEmbeddingProvider();
  }
}

// ═══════════════════════════════════════════
// Utility functions
// ═══════════════════════════════════════════

export async function semanticSearch(
  query: string,
  documents: string[],
  provider: EmbeddingProvider,
): Promise<Array<{ index: number; score: number; text: string }>> {
  const [queryEmb, ...docEmbs] = await Promise.all([provider.embed(query), ...documents.map((d) => provider.embed(d))]);

  return documents
    .map((text, i) => ({
      index: i,
      score: provider.similarity(queryEmb.embedding, docEmbs[i].embedding),
      text,
    }))
    .sort((a, b) => b.score - a.score);
}

export async function deduplicateBySemantics(
  items: string[],
  provider: EmbeddingProvider,
  threshold: number = 0.85,
): Promise<{ unique: string[]; duplicates: Array<{ original: number; duplicate: number; score: number }> }> {
  if (items.length <= 1) return { unique: items, duplicates: [] };

  const embeddings = await provider.embedBatch(items);
  const unique: string[] = [items[0]];
  const duplicates: Array<{ original: number; duplicate: number; score: number }> = [];

  for (let i = 1; i < items.length; i++) {
    let isDuplicate = false;
    for (let j = 0; j < unique.length; j++) {
      const sim = provider.similarity(embeddings[i].embedding, embeddings[j].embedding);
      if (sim >= threshold) {
        duplicates.push({ original: j, duplicate: i, score: sim });
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      unique.push(items[i]);
    }
  }

  return { unique, duplicates };
}
