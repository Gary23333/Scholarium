import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';
import { lookup } from 'node:dns';
import { providerRequest } from '../../llm/safe-request.ts';

vi.mock('node:https', () => ({ request: vi.fn() }));
vi.mock('node:http', () => ({ request: vi.fn() }));
vi.mock('node:dns', () => ({ lookup: vi.fn() }));

let connection: EventEmitter & { end: ReturnType<typeof vi.fn> };
interface Address {
  address: string;
  family: number;
}
type LookupCallback = (error: Error | null, addresses?: Address[]) => void;
let requestOptions: {
  agent: boolean;
  lookup: (host: string, options: { all: boolean }, callback: ReturnType<typeof vi.fn>) => void;
};
let respond: (response: EventEmitter | { statusCode: number; resume: ReturnType<typeof vi.fn> }) => void;
beforeEach(() => {
  vi.clearAllMocks();
  connection = Object.assign(new EventEmitter(), { end: vi.fn() });
  vi.mocked(request).mockImplementation(((_url: unknown, options: unknown, callback: typeof respond) => {
    requestOptions = options as typeof requestOptions;
    respond = callback;
    return connection;
  }) as typeof request);
});

afterEach(() => vi.unstubAllEnvs());

describe('provider connection guard', () => {
  it('pins opted-in local HTTP providers to loopback DNS answers only', async () => {
    vi.stubEnv('SCHOLARIUM_ALLOW_LOCAL_PROVIDERS', '1');
    vi.mocked(httpRequest).mockImplementation(vi.mocked(request).getMockImplementation()!);
    const promise = providerRequest('http://localhost:11434/v1/models', { apiKey: 'local-fixture' });
    vi.mocked(lookup).mockImplementation(((_hostname: string, _opts: unknown, callback: LookupCallback) => {
      callback(null, [{ address: '1.1.1.1', family: 4 }]);
    }) as typeof lookup);
    const callback = vi.fn();
    requestOptions.lookup('localhost', { all: true }, callback);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(httpRequest).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    connection.emit('error', new Error('fake transport error'));
    await expect(promise).rejects.toThrow('Provider request failed');
  });
  it('validates every DNS answer at connection time, without a second resolution', async () => {
    const promise = providerRequest('https://provider.example/v1/models', { apiKey: 'test-fixture' });
    vi.mocked(lookup).mockImplementation(((_hostname: string, _opts: unknown, callback: LookupCallback) => {
      callback(null, [
        { address: '1.1.1.1', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]);
    }) as typeof lookup);
    const callback = vi.fn();
    requestOptions.lookup('provider.example', { all: true }, callback);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(requestOptions.agent).toBe(false);
    connection.emit('error', new Error('fake transport error'));
    await expect(promise).rejects.toThrow('Provider request failed');
  });
  it('returns only the already validated public addresses to the TLS socket', async () => {
    const promise = providerRequest('https://provider.example/v1/models', { apiKey: 'test-fixture' });
    const addresses = [{ address: '1.1.1.1', family: 4 }];
    vi.mocked(lookup).mockImplementation(((_hostname: string, _opts: unknown, callback: LookupCallback) => {
      callback(null, addresses);
    }) as typeof lookup);
    const callback = vi.fn();
    requestOptions.lookup('provider.example', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, addresses);
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });
    respond(response);
    response.emit('data', Buffer.from('{"data":[]}'));
    response.emit('end');
    expect(await (await promise).json()).toEqual({ data: [] });
  });
  it('never follows redirects or forwards credentials to their destinations', async () => {
    const promise = providerRequest('https://provider.example/v1/models', { apiKey: 'test-fixture' });
    respond({ statusCode: 307, resume: vi.fn() });
    await expect(promise).rejects.toThrow('Provider redirects are not allowed');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
