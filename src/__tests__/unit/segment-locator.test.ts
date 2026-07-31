import { describe, it, expect } from 'vitest';
import {
  findPassageInContent,
  spliceContent,
  normalizeWhitespace,
  normalizeWhitespaceWithMap,
  indexOfUnique,
} from '../../lib/segment-locator.ts';

const SAMPLE = '第一段正文。\n\n第二段包含公式 $E=mc^2$ 和引用 \\cite{smith2020}。\n\n第三段正文结尾。';

describe('findPassageInContent', () => {
  it('locates an exact unique passage', () => {
    const res = findPassageInContent(SAMPLE, '第二段包含公式');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(SAMPLE.slice(res.result.start, res.result.end)).toBe('第二段包含公式');
  });

  it('matches whitespace-normalized text and maps offsets back to raw content', () => {
    // Query collapses the real \\n\\n paragraph break into a single space.
    const res = findPassageInContent('段落A。\n\n段落B。', '段落A。 段落B。');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('段落A。\n\n段落B。'.slice(res.result.start, res.result.end)).toBe('段落A。\n\n段落B。');
  });

  it('matches when the content has extra whitespace the query does not', () => {
    // Content has a double space; query has a single space.
    const content = '结论  见表 1。';
    const res = findPassageInContent(content, '结论 见表 1。');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(content.slice(res.result.start, res.result.end)).toBe('结论  见表 1。');
  });

  it('rejects text that appears multiple times', () => {
    const res = findPassageInContent('研究结果表明 研究结果表明', '研究结果表明');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('ambiguous');
  });

  it('returns not-found for text outside the content', () => {
    const res = findPassageInContent(SAMPLE, '完全不存在的内容');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('not-found');
  });

  it('returns too-short for very short selections', () => {
    const res = findPassageInContent(SAMPLE, '二');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('too-short');
  });

  it('trims surrounding whitespace from the query', () => {
    const res = findPassageInContent(SAMPLE, '  第二段包含公式  ');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(SAMPLE.slice(res.result.start, res.result.end)).toBe('第二段包含公式');
  });
});

describe('spliceContent', () => {
  it('replaces the selected range', () => {
    const start = SAMPLE.indexOf('第二段包含公式');
    const end = SAMPLE.indexOf('\n\n第三段');
    const out = spliceContent(SAMPLE, start, end, '重写后的句子');
    expect(out).toContain('第一段正文。');
    expect(out).toContain('重写后的句子');
    expect(out).toContain('第三段正文结尾。');
    expect(out.includes('第二段包含公式')).toBe(false);
  });
});

describe('normalizeWhitespaceWithMap', () => {
  it('collapses runs and keeps a correct offset map', () => {
    const content = 'a\n\n b \tc';
    const { normalized, map } = normalizeWhitespaceWithMap(content);
    expect(normalized).toBe('a b c');
    // 'a' at raw 0; the collapsed space maps to the first '\n' at raw 1; 'b' at 4; ' ' at 5; 'c' at 7
    expect(map).toEqual([0, 1, 4, 5, 7]);
    expect(normalized.length).toBe(map.length);
  });
});

describe('normalizeWhitespace', () => {
  it('collapses all whitespace runs to a single space', () => {
    expect(normalizeWhitespace('a \n\n  b\t c')).toBe('a b c');
  });
});

describe('indexOfUnique', () => {
  it('returns index only when occurrence is unique', () => {
    expect(indexOfUnique('xabc z', 'abc')).toBe(1);
    expect(indexOfUnique('xabc yabc z', 'abc')).toBe(-1);
    expect(indexOfUnique('abc abc', 'abc')).toBe(-1);
    expect(indexOfUnique('nothing here', 'abc')).toBe(-1);
  });
});
