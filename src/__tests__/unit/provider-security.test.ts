import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPublicAddress, validateProviderUrl } from '../../llm/safe-request.ts';
import { LLMClient } from '../../llm/client.ts';
import { validateConfig, createDefaultConfig } from '../../config/index.ts';

afterEach(() => vi.unstubAllEnvs());

describe('provider transport policy', () => {
  it('allows only explicitly opted-in loopback providers, not other private hosts', () => {
    vi.stubEnv('SCHOLARIUM_ALLOW_LOCAL_PROVIDERS', '1');
    expect(validateProviderUrl('http://127.0.0.1:11434/v1').port).toBe('11434');
    expect(validateProviderUrl('http://localhost:11434/v1').hostname).toBe('localhost');
    expect(validateProviderUrl('http://[::1]:11434/v1').hostname).toBe('[::1]');
    expect(() => validateProviderUrl('http://192.168.1.1/v1')).toThrow();
    expect(() => validateProviderUrl('http://localhost.example/v1')).toThrow();
  });
  it('rejects insecure schemes, embedded credentials and local endpoints', () => {
    for (const url of [
      'http://api.example.com',
      'https://user:pass@api.example.com',
      'https://api.example.com?key=example',
      'https://api.example.com/#fragment',
      'https://localhost',
      'https://foo.localhost',
      'https://service.local',
      'https://127.1',
      'https://2130706433',
      'https://[::ffff:127.0.0.1]',
      'https://[fe80::1]',
      'https://10.0.0.1',
    ]) {
      expect(() => validateProviderUrl(url)).toThrow();
      expect(() => new LLMClient({ baseUrl: url, apiKey: 'fake', model: 'fake' })).toThrow();
    }
  });
  it('accepts public HTTPS origins and version paths', () => {
    expect(validateProviderUrl('https://api.openai.com/v1').pathname).toBe('/v1');
  });
  it('rejects non-public resolved addresses, including IPv6 and CGNAT', () => {
    for (const address of [
      '127.0.0.2',
      '10.1.2.3',
      '100.64.1.2',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '0.0.0.0',
      '224.0.0.1',
      '198.18.0.1',
      '::1',
      '::ffff:10.0.0.1',
      'fd12::1',
      'fe80::1',
      '2001:db8::1',
      '2002:7f00:1::',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    expect(isPublicAddress('1.1.1.1')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it('validates saved configuration URLs before provider registration', () => {
    const config = createDefaultConfig();
    config.llm.providers.deepseek.baseUrl = 'https://127.0.0.1';
    expect(validateConfig(config).ok).toBe(false);
  });
});
