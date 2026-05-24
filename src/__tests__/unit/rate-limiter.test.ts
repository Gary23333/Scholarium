import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../../utils/rate-limiter.ts';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('getDomainConfig()', () => {
    it('should return default config for unknown domain', () => {
      const config = limiter.getDomainConfig('unknown.example.com');
      expect(config.maxTokens).toBe(5);
      expect(config.refillRate).toBe(1);
    });

    it('should return specific config for known domain', () => {
      const config = limiter.getDomainConfig('api.semanticscholar.org');
      expect(config.maxTokens).toBe(5);
      expect(config.refillRate).toBe(5);
    });

    it('should return config for arxiv', () => {
      const config = limiter.getDomainConfig('export.arxiv.org');
      expect(config.maxTokens).toBe(1);
      expect(config.refillRate).toBe(1);
    });

    it('should return config for crossref', () => {
      const config = limiter.getDomainConfig('api.crossref.org');
      expect(config.maxTokens).toBe(10);
      expect(config.refillRate).toBe(10);
    });
  });

  describe('acquire()', () => {
    it('should acquire a token when bucket has tokens', async () => {
      await limiter.acquire('test-domain');
    });

    it('should deplete tokens after multiple acquires', async () => {
      const config = limiter.getDomainConfig('test-domain');
      for (let i = 0; i < config.maxTokens; i++) {
        await limiter.acquire('test-domain');
      }
      const stats = limiter.getStats();
      const domainStats = stats.find((s) => s.domain === 'test-domain');
      expect(domainStats?.tokens).toBe(0);
    });
  });

  describe('cache', () => {
    it('should cache and retrieve data', () => {
      limiter.cacheSet('key1', { hello: 'world' }, 'test-domain');
      const result = limiter.cacheGet('key1');
      expect(result).toEqual({ hello: 'world' });
    });

    it('should return undefined for missing cache key', () => {
      expect(limiter.cacheGet('nonexistent')).toBeUndefined();
    });

    it('should clear cache', () => {
      limiter.cacheSet('key1', 'data', 'test-domain');
      limiter.clearCache();
      expect(limiter.cacheGet('key1')).toBeUndefined();
    });
  });

  describe('getStats()', () => {
    it('should return empty stats initially', () => {
      const stats = limiter.getStats();
      expect(stats).toEqual([]);
    });

    it('should return stats after acquiring', async () => {
      await limiter.acquire('test-domain');
      const stats = limiter.getStats();
      expect(stats.length).toBe(1);
      expect(stats[0].domain).toBe('test-domain');
      expect(stats[0].tokens).toBeGreaterThanOrEqual(0);
    });
  });
});
