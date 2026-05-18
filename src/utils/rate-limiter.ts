// Rate Limiter — Token bucket + exponential backoff + local cache
// Applied to Semantic Scholar, arXiv, CrossRef API calls

import { logger } from './logger.js';

export interface RateLimitConfig {
  maxTokens: number;
  refillRate: number;       // tokens per second
  refillIntervalMs?: number; // defaults to 1000
  maxRetries?: number;       // max retries on 429
  backoffBaseMs?: number;    // exponential backoff base
  cacheTtlMs?: number;       // local cache TTL
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  config: RateLimitConfig;
}

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxTokens: 5,
  refillRate: 1,             // 1 QPS default
  refillIntervalMs: 1000,
  maxRetries: 3,
  backoffBaseMs: 1000,
  cacheTtlMs: 60000,         // 1 minute default
};

const DOMAIN_CONFIGS: Record<string, RateLimitConfig> = {
  'api.semanticscholar.org': {
    maxTokens: 5,
    refillRate: 5,            // 5 QPS (Semantic Scholar free tier)
    maxRetries: 3,
    backoffBaseMs: 2000,
    cacheTtlMs: 300000,       // 5 min cache
  },
  'export.arxiv.org': {
    maxTokens: 1,
    refillRate: 1,            // 1 QPS (arXiv rate limit)
    maxRetries: 5,
    backoffBaseMs: 5000,
    cacheTtlMs: 600000,       // 10 min cache
  },
  'api.crossref.org': {
    maxTokens: 10,
    refillRate: 10,           // 10 QPS (CrossRef polite pool)
    maxRetries: 3,
    backoffBaseMs: 1000,
    cacheTtlMs: 300000,       // 5 min cache
  },
};

export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private pending: Map<string, Promise<unknown>> = new Map();

  getDomainConfig(domain: string): RateLimitConfig {
    return DOMAIN_CONFIGS[domain] ?? DEFAULT_CONFIG;
  }

  private getBucket(domain: string): TokenBucket {
    let bucket = this.buckets.get(domain);
    if (!bucket) {
      const config = this.getDomainConfig(domain);
      bucket = { tokens: config.maxTokens, lastRefill: Date.now(), config };
      this.buckets.set(domain, bucket);
    }
    return bucket;
  }

  private refill(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refillInterval = bucket.config.refillIntervalMs ?? 1000;
    const refillCycles = Math.floor(elapsed / refillInterval);
    if (refillCycles > 0) {
      bucket.tokens = Math.min(
        bucket.config.maxTokens,
        bucket.tokens + refillCycles * bucket.config.refillRate
      );
      bucket.lastRefill = now;
    }
  }

  async acquire(domain: string): Promise<void> {
    const bucket = this.getBucket(domain);
    this.refill(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    // Wait for next refill cycle
    const waitMs = (bucket.config.refillIntervalMs ?? 1000) -
      (Date.now() - bucket.lastRefill);
    if (waitMs > 0) {
      logger.debug(`RateLimiter:${domain}`, `throttled, waiting ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
    bucket.tokens = bucket.config.maxTokens - 1;
    bucket.lastRefill = Date.now();
  }

  async fetchWithRetry(
    url: string,
    init: RequestInit = {},
    domain?: string
  ): Promise<Response> {
    const host = domain ?? new URL(url).hostname;
    const config = this.getDomainConfig(host);

    for (let attempt = 0; attempt <= (config.maxRetries ?? 3); attempt++) {
      await this.acquire(host);

      try {
        const resp = await fetch(url, init);
        if (resp.status === 429) {
          const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '', 10);
          const delay = retryAfter > 0
            ? retryAfter * 1000
            : (config.backoffBaseMs ?? 1000) * Math.pow(2, attempt);
          logger.warn(`RateLimiter:${host}`, `429 received, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        if (resp.status >= 500 && attempt < (config.maxRetries ?? 3)) {
          const delay = (config.backoffBaseMs ?? 1000) * Math.pow(2, attempt);
          logger.warn(`RateLimiter:${host}`, `Server error ${resp.status}, retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return resp;
      } catch (err) {
        if (attempt < (config.maxRetries ?? 3)) {
          const delay = (config.backoffBaseMs ?? 1000) * Math.pow(2, attempt);
          logger.warn(`RateLimiter:${host}`, `Network error, retrying in ${delay}ms: ${String(err)}`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw err;
        }
      }
    }

    throw new Error(`RateLimiter: max retries exceeded for ${host}`);
  }

  cacheGet(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  cacheSet(key: string, data: unknown, domain: string): void {
    const config = this.getDomainConfig(domain);
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (config.cacheTtlMs ?? 60000),
    });
  }

  async cachedFetch(url: string, init: RequestInit = {}, domain?: string): Promise<{ data: unknown; fromCache: boolean }> {
    const host = domain ?? new URL(url).hostname;
    const cacheKey = `${url}:${JSON.stringify(init)}`;

    const cached = this.cacheGet(cacheKey);
    if (cached !== undefined) {
      logger.debug(`RateLimiter:${host}`, 'cache hit');
      return { data: cached, fromCache: true };
    }

    // Deduplicate in-flight requests for the same URL
    const pending = this.pending.get(cacheKey);
    if (pending) {
      logger.debug(`RateLimiter:${host}`, 'dedup in-flight request');
      const data = await pending;
      return { data, fromCache: false };
    }

    const promise = (async () => {
      const resp = await this.fetchWithRetry(url, init, host);
      const data = await resp.json();
      this.cacheSet(cacheKey, data, host);
      return data;
    })();

    this.pending.set(cacheKey, promise);
    try {
      const data = await promise;
      return { data, fromCache: false };
    } finally {
      this.pending.delete(cacheKey);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  getStats(): { domain: string; tokens: number; cachedEntries: number }[] {
    const stats: { domain: string; tokens: number; cachedEntries: number }[] = [];
    for (const [domain, bucket] of this.buckets) {
      this.refill(bucket);
      let cachedCount = 0;
      for (const [key] of this.cache) {
        if (key.includes(domain)) cachedCount++;
      }
      stats.push({ domain, tokens: Math.floor(bucket.tokens), cachedEntries: cachedCount });
    }
    return stats;
  }
}

export const rateLimiter = new RateLimiter();
