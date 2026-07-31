import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  parsePlanOutput,
  parseSectionIds,
  mockPlan,
  similarityScore,
  locateEditPassage,
  applyEdit,
  applyChangesToDisk,
  readTemp,
  smartEditDir,
  type SmartEditDeps,
} from '../../lib/smart-edit.ts';
import { ReviserAgent } from '../../agents/reviser.ts';
import type { Section } from '../../types/index.ts';
import type { PaperProject } from '../../server/context.ts';

const CONTENT =
  '值得注意的是，本文提出的方法在多项基准上取得了最优结果。\n\n' +
  '实验设置与文献\\cite{smith2020}保持一致，公式见\\begin{equation}E=mc^2\\end{equation}。\n\n' +
  '综上所述，该方案具有工程可行性。';

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 's1',
    paperId: 'p1',
    sectionNumber: 1,
    title: '引言',
    contentTex: CONTENT,
    status: 'drafting',
    version: 2,
    ...overrides,
  };
}

function makeDeps(section: Section, dataDir: string) {
  const paper: PaperProject = {
    id: 'p1',
    title: '测试论文',
    status: 'draft',
    sections: [section],
    createdAt: '',
  };
  const papers = new Map<string, PaperProject>([['p1', paper]]);
  const rounds: Array<Record<string, unknown>> = [];
  const persisted: Array<{ id: string; contentTex?: string; version: number }> = [];
  const deps: SmartEditDeps = {
    papers,
    bible: { getEntries: () => [] },
    reviser: new ReviserAgent(),
    hasLLMFor: () => false,
    router: undefined,
    db: { addRevisionRound: (r: Record<string, unknown>) => rounds.push(r) },
    dataDir,
    persistSection: (pid, sec) => persisted.push({ id: sec.id, contentTex: sec.contentTex, version: sec.version }),
  };
  return { deps, paper, rounds, persisted };
}

describe('parsePlanOutput', () => {
  it('parses a fenced JSON block', () => {
    const raw =
      '好的，以下是计划：\n```json\n{"analysis":"a","edits":[{"sectionId":"s1","passageHint":"h","originalText":"原文内容二十个字符以上","change":"c","reason":"r"}]}\n```';
    const plan = parsePlanOutput(raw);
    expect(plan.edits.length).toBe(1);
    expect(plan.edits[0].sectionId).toBe('s1');
  });

  it('parses a brace-sliced JSON without fences', () => {
    const raw =
      '结果如下：{"analysis":"a","edits":[{"sectionId":"s2","originalText":"原文内容二十个字符以上","change":"c"}]} 结束';
    const plan = parsePlanOutput(raw);
    expect(plan.edits.length).toBe(1);
    expect(plan.affectedSectionIds).toEqual(['s2']);
  });

  it('repairs trailing commas', () => {
    const raw = '{"analysis":"a","edits":[{"sectionId":"s1","originalText":"原文内容二十个字符以上","change":"c",}]}';
    const plan = parsePlanOutput(raw);
    expect(plan.edits.length).toBe(1);
  });

  it('returns an empty plan on garbage', () => {
    const plan = parsePlanOutput('完全没有 JSON 的输出');
    expect(plan.edits).toEqual([]);
  });
});

describe('parseSectionIds', () => {
  it('extracts valid ids and preserves section order', () => {
    expect(parseSectionIds('我想改 sec-5, sec-2', ['sec-1', 'sec-2', 'sec-3', 'sec-4', 'sec-5'])).toEqual([
      'sec-2',
      'sec-5',
    ]);
    expect(parseSectionIds('没有匹配', ['sec-1'])).toEqual([]);
  });
});

describe('mockPlan', () => {
  it('produces edits from sections containing request keywords', () => {
    const plan = mockPlan([makeSection()], '请删除AI味，例如「值得注意的是」这样的表达');
    expect(plan.edits.length).toBeGreaterThan(0);
    expect(CONTENT.includes(plan.edits[0].originalText)).toBe(true);
    expect(plan.edits[0].originalText.length).toBeGreaterThanOrEqual(20);
  });
});

describe('similarityScore', () => {
  it('returns 1 for identical text and lower for different text', () => {
    expect(similarityScore('abcdef', 'abcdef')).toBe(1);
    expect(similarityScore('abcdef', 'abcxyz')).toBeLessThan(1);
    expect(similarityScore('', 'abc')).toBe(0);
  });
});

describe('locateEditPassage', () => {
  it('locates an exact passage', () => {
    const p = locateEditPassage(CONTENT, '值得注意的是，本文提出的方法在多项基准上取得了最优结果。');
    expect(p).not.toBeNull();
    if (p) expect(CONTENT.slice(p.start, p.end)).toBe(p.matchedText);
  });

  it('falls back to fuzzy paragraph match', () => {
    const p = locateEditPassage(CONTENT, '本文方法在多项基准 取得了最优结果');
    expect(p).not.toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(locateEditPassage(CONTENT, '完全无关的内容完全不相关')).toBeNull();
  });
});

describe('applyEdit / applyChangesToDisk (mock)', () => {
  let dataDir: string;
  let section: Section;
  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scholarium-smart-edit-'));
    section = makeSection();
  });
  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('stages a temp file without mutating the section', async () => {
    const { deps } = makeDeps(section, dataDir);
    const result = await applyEdit(deps, 'p1', section, {
      sectionId: 's1',
      passageHint: '第一段',
      originalText: '值得注意的是，本文提出的方法在多项基准上取得了最优结果。',
      change: '请删掉 AI 味',
      reason: '测试',
    });
    expect(result.success).toBe(true);
    // Section is NOT mutated yet; the edit is staged.
    expect(section.contentTex).toBe(CONTENT);
    expect(section.version).toBe(2);
    const staged = readTemp(deps, 'p1', 's1');
    expect(staged).not.toBeNull();
    expect(staged).toContain('\\cite{smith2020}');
  });

  it('applies to disk with backup and revision round', async () => {
    const { deps, rounds, persisted } = makeDeps(section, dataDir);
    await applyEdit(deps, 'p1', section, {
      sectionId: 's1',
      passageHint: '第一段',
      originalText: '值得注意的是，本文提出的方法在多项基准上取得了最优结果。',
      change: '请删掉 AI 味',
      reason: '测试',
    });
    const res = await applyChangesToDisk(deps, 'p1', ['s1']);
    expect(res.success).toEqual(['s1']);
    expect(section.version).toBe(3);
    expect(section.contentTex).not.toBe(CONTENT);
    expect(section.contentTex).toContain('\\cite{smith2020}');
    expect(persisted.length).toBe(1);
    expect(rounds.length).toBe(1);
    expect(rounds[0].kind).toBe('smart_edit');
    // temp removed, backup written
    expect(readTemp(deps, 'p1', 's1')).toBeNull();
    const bakPath = path.join(smartEditDir(deps, 'p1'), 'bak-s1.tex');
    expect(fs.existsSync(bakPath)).toBe(true);
    expect(fs.readFileSync(bakPath, 'utf8')).toBe(CONTENT);
  });

  it('reports failure when the original text cannot be located', async () => {
    const { deps } = makeDeps(section, dataDir);
    const result = await applyEdit(deps, 'p1', section, {
      sectionId: 's1',
      passageHint: 'x',
      originalText: '这一段完全不存在于正文当中啊啊啊',
      change: '改',
      reason: 'r',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('无法定位原文');
  });
});
