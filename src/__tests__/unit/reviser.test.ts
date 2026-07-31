import { describe, it, expect } from 'vitest';
import {
  ReviserAgent,
  buildReviseSystemPrompt,
  buildReviseUserPrompt,
  cleanLatexOutput,
} from '../../agents/reviser.ts';
import type { ReviserInput } from '../../types/index.ts';

const BASE_INPUT: ReviserInput = {
  passage: '值得注意的是，该方法的性能优于现有方案\\cite{smith2020}，如图\\ref{fig:1}所示。',
  note: '删除AI套话，让表达更直接。',
  before: '上文内容保持不变。',
  after: '下文内容保持不变。',
  protectedBlocks: ['\\cite{smith2020}', '\\ref{fig:1}'],
  approvedCiteKeys: ['smith2020', 'doe2021'],
  sectionTitle: '实验结果',
};

describe('buildReviseSystemPrompt', () => {
  it('contains the passage-immutability contract and protected blocks', () => {
    const p = buildReviseSystemPrompt(BASE_INPUT);
    expect(p).toContain('只改划中的这一段');
    expect(p).toContain('受保护内容');
    expect(p).toContain('[0]: \\cite{smith2020}');
    expect(p).toContain('smith2020, doe2021');
  });

  it('falls back gracefully when there are no protected blocks or cite keys', () => {
    const p = buildReviseSystemPrompt({ ...BASE_INPUT, protectedBlocks: [], approvedCiteKeys: [] });
    expect(p).toContain('本段内没有检测到受保护内容');
    expect(p).toContain('无可用引文键，不得新增');
  });
});

describe('buildReviseUserPrompt', () => {
  it('has the before / marked-passage / after / note structure', () => {
    const p = buildReviseUserPrompt(BASE_INPUT);
    expect(p).toContain('# 上文');
    expect(p).toContain('上文内容保持不变。');
    expect(p).toContain('# ★要重写的段落★');
    expect(p).toContain('# 下文');
    expect(p).toContain('# 修改意见');
    expect(p).toContain('删除AI套话');
  });

  it('uses placeholders when before/after are absent', () => {
    const p = buildReviseUserPrompt({ ...BASE_INPUT, before: undefined, after: undefined });
    expect(p).toContain('段落位于章节开头附近');
    expect(p).toContain('段落位于章节末尾附近');
  });
});

describe('cleanLatexOutput', () => {
  it('strips markdown code fences', () => {
    expect(cleanLatexOutput('```latex\n内容\n```')).toBe('内容');
    expect(cleanLatexOutput('```\n内容\n```')).toBe('内容');
    expect(cleanLatexOutput('  内容  ')).toBe('内容');
  });
});

describe('ReviserAgent.mockExecute', () => {
  const agent = new ReviserAgent();

  it('preserves protected content verbatim', async () => {
    const out = await agent.execute(BASE_INPUT, { mock: true });
    expect(out.revisedPassage).toContain('\\cite{smith2020}');
    expect(out.revisedPassage).toContain('\\ref{fig:1}');
    expect(out.protectedViolated).toBe(false);
  });

  it('applies the anti-AI replacements outside protected ranges', async () => {
    const out = await agent.execute(
      { ...BASE_INPUT, passage: '值得注意的是，\\cite{smith2020} 指出该方法更优。' },
      { mock: true },
    );
    expect(out.revisedPassage).not.toContain('值得注意的是');
    expect(out.revisedPassage).toContain('需要注意的是');
    expect(out.revisedPassage).toContain('\\cite{smith2020}');
  });

  it('expands when the note asks for expansion', async () => {
    const out = await agent.execute({ ...BASE_INPUT, note: '请展开补充' }, { mock: true });
    expect(out.revisedPassage.length).toBeGreaterThan(BASE_INPUT.passage.length);
  });

  it('is deterministic', async () => {
    const a = await agent.execute(BASE_INPUT, { mock: true });
    const b = await agent.execute(BASE_INPUT, { mock: true });
    expect(a.revisedPassage).toBe(b.revisedPassage);
  });
});
