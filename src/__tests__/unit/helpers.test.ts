import { describe, it, expect } from 'vitest';
import { json, error, parseBody, readBody } from '../../server/utils/helpers.ts';
import type { ServerResponse, IncomingMessage } from 'node:http';

function mockResponse(): ServerResponse {
  const res = {
    _headers: {} as Record<string, string>,
    _statusCode: -1,
    _body: '',
    writeHead(statusCode: number, headers?: Record<string, string>) {
      res._statusCode = statusCode;
      if (headers) Object.assign(res._headers, headers);
      return res;
    },
    setHeader(key: string, value: string) {
      res._headers[key] = value;
    },
    end(data?: string) {
      res._body = data ?? '';
      return res;
    },
  } as unknown as ServerResponse;
  return res;
}

function mockRequest(body: string | null, opts?: { method?: string }): IncomingMessage {
  type Listener = (...args: unknown[]) => void;
  const listeners: Record<string, Listener[]> = {};
  const req = {
    method: opts?.method ?? 'POST',
    on(event: string, fn: Listener) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    removeListener(event: string, fn: Listener) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    },
    emit(event: string, ...args: unknown[]) {
      for (const fn of listeners[event] ?? []) fn(...args);
    },
  } as unknown as IncomingMessage;

  setImmediate(() => {
    if (body !== null) {
      req.emit('data', Buffer.from(body));
    }
    req.emit('end');
  });

  return req;
}

describe('json()', () => {
  it('should write JSON response with default status 200', () => {
    const res = mockResponse();
    json(res, { hello: 'world' });
    expect(res._statusCode).toBe(200);
    expect(res._headers['Content-Type']).toBe('application/json');
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(JSON.parse(res._body)).toEqual({ hello: 'world' });
  });

  it('should write JSON response with custom status', () => {
    const res = mockResponse();
    json(res, { created: true }, 201);
    expect(res._statusCode).toBe(201);
    expect(JSON.parse(res._body)).toEqual({ created: true });
  });
});

describe('error()', () => {
  it('should write error response with default status 400', () => {
    const res = mockResponse();
    error(res, 'Something went wrong');
    expect(res._statusCode).toBe(400);
    const parsed = JSON.parse(res._body);
    expect(parsed.error).toBe('Something went wrong');
    expect(parsed.code).toBe(400);
  });

  it('should write error response with custom status', () => {
    const res = mockResponse();
    error(res, 'Not found', 404);
    expect(res._statusCode).toBe(404);
    const parsed = JSON.parse(res._body);
    expect(parsed.error).toBe('Not found');
    expect(parsed.code).toBe(404);
  });
});

describe('parseBody()', () => {
  it('should parse valid JSON body', async () => {
    const req = mockRequest(JSON.stringify({ title: 'test' }));
    const result = await parseBody(req);
    expect(result).toEqual({ title: 'test' });
  });

  it('should return empty object for empty body', async () => {
    const req = mockRequest('');
    const result = await parseBody(req);
    expect(result).toEqual({});
  });

  it('should return empty object for whitespace-only body', async () => {
    const req = mockRequest('   ');
    const result = await parseBody(req);
    expect(result).toEqual({});
  });

  it('should throw on invalid JSON', async () => {
    const req = mockRequest('not json at all');
    await expect(parseBody(req)).rejects.toThrow('Invalid JSON in request body');
  });
});

describe('readBody()', () => {
  it('should read the request body as a string', async () => {
    const req = mockRequest('hello world');
    const result = await readBody(req);
    expect(result).toBe('hello world');
  });

  it('should reject if body exceeds size limit', async () => {
    type Listener = (...args: unknown[]) => void;
    const listeners: Record<string, Listener[]> = {};
    const req = {
      on(event: string, fn: Listener) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
      },
      removeListener(event: string, fn: Listener) {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((f) => f !== fn);
        }
      },
    } as unknown as IncomingMessage;

    setImmediate(() => {
      const bigChunk = Buffer.alloc(1100000);
      for (const fn of listeners['data'] ?? []) fn(bigChunk);
    });

    await expect(readBody(req)).rejects.toThrow('Body too large');
  });
});
