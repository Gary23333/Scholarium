import { describe, it, expect, vi } from 'vitest';
import { corsMiddleware, handlePreflight } from '../../server/middleware/cors.ts';
import { handleRouteError } from '../../server/middleware/error-handler.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

function mockResponse(): ServerResponse & {
  _headers: Record<string, string>;
  _statusCode: number;
  _body: string;
  _ended: boolean;
} {
  return {
    _headers: {},
    _statusCode: -1,
    _body: '',
    _ended: false,
    writeHead(statusCode: number, headers?: Record<string, string>) {
      this._statusCode = statusCode;
      if (headers) Object.assign(this._headers, headers);
      return this;
    },
    setHeader(key: string, value: string) {
      this._headers[key] = value;
    },
    end(data?: string) {
      this._body = data ?? '';
      this._ended = true;
      return this;
    },
  } as any;
}

function mockRequest(method: string): IncomingMessage {
  return { method } as IncomingMessage;
}

describe('corsMiddleware', () => {
  it('should set correct CORS headers', () => {
    const req = mockRequest('GET');
    const res = mockResponse();
    let nextCalled = false;

    corsMiddleware(req, res, () => {
      nextCalled = true;
    });

    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res._headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
    expect(res._headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(nextCalled).toBe(true);
  });

  it('should call next() after setting headers', () => {
    const req = mockRequest('POST');
    const res = mockResponse();
    let nextCalled = false;

    corsMiddleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });
});

describe('handlePreflight()', () => {
  it('should return true and send 204 for OPTIONS request', () => {
    const req = mockRequest('OPTIONS');
    const res = mockResponse();

    const result = handlePreflight(req, res);

    expect(result).toBe(true);
    expect(res._statusCode).toBe(204);
    expect(res._ended).toBe(true);
  });

  it('should return false for non-OPTIONS request', () => {
    const req = mockRequest('GET');
    const res = mockResponse();

    const result = handlePreflight(req, res);

    expect(result).toBe(false);
    expect(res._ended).toBe(false);
  });

  it('should return false for POST request', () => {
    const req = mockRequest('POST');
    const res = mockResponse();

    const result = handlePreflight(req, res);

    expect(result).toBe(false);
  });
});

describe('handleRouteError()', () => {
  it('should respond with 400 for Invalid JSON error', () => {
    const res = mockResponse();
    const err = new Error('Invalid JSON in request body');

    handleRouteError(err, res);

    expect(res._statusCode).toBe(400);
    const parsed = JSON.parse(res._body);
    expect(parsed.error).toBe('Invalid JSON in request body');
    expect(parsed.code).toBe(400);
  });

  it('should respond with 500 for generic errors', () => {
    const res = mockResponse();
    const err = new Error('Something unexpected happened');

    handleRouteError(err, res);

    expect(res._statusCode).toBe(500);
    const parsed = JSON.parse(res._body);
    expect(parsed.error).toBe('Something unexpected happened');
    expect(parsed.code).toBe(500);
  });

  it('should respond with 500 for non-Error thrown values', () => {
    const res = mockResponse();

    handleRouteError('string error', res);

    expect(res._statusCode).toBe(500);
    const parsed = JSON.parse(res._body);
    expect(parsed.error).toBe('string error');
    expect(parsed.code).toBe(500);
  });

  it('should not write headers if already sent', () => {
    const res = mockResponse();
    (res as any).headersSent = true;

    handleRouteError(new Error('late error'), res);

    expect(res._statusCode).toBe(-1);
    expect(res._body).toBe('');
  });
});
