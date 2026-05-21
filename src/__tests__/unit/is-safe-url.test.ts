import { describe, it, expect } from 'vitest';
import { isSafeUrl } from '../../server/utils/helpers.ts';

describe('isSafeUrl', () => {
  it('rejects localhost', () => {
    expect(isSafeUrl('http://localhost/path')).toBe(false);
    expect(isSafeUrl('https://localhost:3000/path')).toBe(false);
  });

  it('rejects 127.0.0.1', () => {
    expect(isSafeUrl('http://127.0.0.1/path')).toBe(false);
  });

  it('rejects ::1 (IPv6 loopback)', () => {
    expect(isSafeUrl('http://[::1]/path')).toBe(false);
  });

  it('rejects 0.0.0.0', () => {
    expect(isSafeUrl('http://0.0.0.0/path')).toBe(false);
  });

  it('rejects private IP 10.x.x.x', () => {
    expect(isSafeUrl('http://10.0.0.1/path')).toBe(false);
    expect(isSafeUrl('http://10.255.255.255/path')).toBe(false);
  });

  it('rejects private IP 172.16.x.x - 172.31.x.x', () => {
    expect(isSafeUrl('http://172.16.0.1/path')).toBe(false);
    expect(isSafeUrl('http://172.31.255.255/path')).toBe(false);
  });

  it('allows IP 172.15.x.x and 172.32.x.x (outside private range)', () => {
    expect(isSafeUrl('http://172.15.0.1/path')).toBe(true);
    expect(isSafeUrl('http://172.32.0.1/path')).toBe(true);
  });

  it('rejects private IP 192.168.x.x', () => {
    expect(isSafeUrl('http://192.168.0.1/path')).toBe(false);
    expect(isSafeUrl('http://192.168.255.255/path')).toBe(false);
  });

  it('rejects link-local 169.254.x.x', () => {
    expect(isSafeUrl('http://169.254.0.1/path')).toBe(false);
    expect(isSafeUrl('http://169.254.169.254/path')).toBe(false);
  });

  it('rejects IPv6 link-local fe80:', () => {
    expect(isSafeUrl('http://[fe80::1]/path')).toBe(false);
  });

  it('rejects IPv6 unique local fc00: and fd00:', () => {
    expect(isSafeUrl('http://[fc00::1]/path')).toBe(false);
    expect(isSafeUrl('http://[fd00::1]/path')).toBe(false);
  });

  it('allows valid public URLs', () => {
    expect(isSafeUrl('https://example.com/path')).toBe(true);
    expect(isSafeUrl('http://scholar.google.com/search?q=test')).toBe(true);
    expect(isSafeUrl('https://arxiv.org/abs/2301.00001')).toBe(true);
    expect(isSafeUrl('https://doi.org/10.1000/xyz123')).toBe(true);
  });

  it('rejects non-http/https protocols', () => {
    expect(isSafeUrl('ftp://example.com/file')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<h1>hello</h1>')).toBe(false);
  });

  it('rejects .localhost and .local domains', () => {
    expect(isSafeUrl('http://myapp.localhost/path')).toBe(false);
    expect(isSafeUrl('http://myapp.local/path')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('not-a-url')).toBe(false);
  });

  it('rejects IP starting with 0', () => {
    expect(isSafeUrl('http://0.1.2.3/path')).toBe(false);
  });
});
