import { describe, it, expect } from 'vitest';
import {
  aggregateFindings,
  locateAuditFinding,
  extractQuote,
  severityWeight,
  runAutoRevision,
} from '../../pipeline/auto-revision.ts';
import { revisePassageCore } from '../../lib/revise-passage-core.ts';
import { ReviserAgent } from '../../agents/reviser.ts';
import type { AuditReport, AIScoreReport, HighRiskSpan, AuditFindingFull, Section } from '../../types/index.ts';
import type { PaperProject } from '../../server/context.ts';

const CONTENT =
  '值得注意的是，本文提出的方法在多项基准上取得了最优结果。由于计算资源有限，模型参数量控制在十亿以内。综上所述，该方案具有工程可行性。';

function fakeAuditReport(findings: AuditFindingFull[] = []): AuditReport {
  return {
    reportId: 'r1',
    sectionId: 's1',
    version: 1,
    masterModel: 'mock',
    findings,
    stats: { critical: 0, warning: 0, info: 0 },
    dimensionStats: {},
    fixInstructions: { instruction: '', issues: [] },
    passed: true,
    elapsedMs: 0,
    mockMode: true,
  };
}

function fakeAiReport(spans: HighRiskSpan[] = []): AIScoreReport {
  return {
    overall: 0.6,
    confidence: 0.5,
    details: {
      patternScore: 0.6,
      burstinessScore: 0.5,
      perplexityScore: 0.5,
      ngramDiversityScore: 0.5,
      semanticConsistencyScore: 0.5,
      stylisticFingerprintScore: 0.5,
    },
    suggestions: [],
    highRiskSpans: spans,
    configSnapshot: {
      weights: {
        pattern: 0.2,
        burstiness: 0.2,
        perplexity: 0.2,
        ngramDiversity: 0.15,
        semanticConsistency: 0.1,
        stylisticFingerprint: 0.15,
      },
      threshold: 0.5,
      maxRewriteRounds: 3,
      mockMode: true,
    },
    mockMode: true,
  };
}

describe('severityWeight', () => {
  it('weights critical / warning / info', () => {
    expect(severityWeight({ stats: { critical: 1, warning: 2, info: 3 } })).toBe(3 + 4 + 3);
  });
});

describe('extractQuote', () => {
  it('extracts quoted excerpts in several styles', () => {
    expect(extractQuote('请改写 "论证不充分" 这一句')).toBe('论证不充分');
    expect(extractQuote('请改写「论证不充分」')).toBe('论证不充分');
    expect(extractQuote('没有引号')).toBeNull();
  });
});

describe('locateAuditFinding', () => {
  it('locates a quoted excerpt in the suggestion', () => {
    const finding: AuditFindingFull = {
      id: 'f1',
      dimension: 'language_quality',
      severity: 'warning',
      description: 'x',
      suggestion: '请改写 "值得注意的是"',
      foundBy: ['A'],
      consensus: 'confirmed',
      status: 'open',
    };
    const p = locateAuditFinding(CONTENT, finding);
    expect(p).not.toBeNull();
    expect(p?.matchedText).toContain('值得注意的是');
  });

  it('locates by numeric location offset', () => {
    const finding: AuditFindingFull = {
      id: 'f2',
      dimension: 'logic_consistency',
      severity: 'critical',
      description: 'x',
      location: '8',
      foundBy: ['A'],
      consensus: 'confirmed',
      status: 'open',
    };
    const p = locateAuditFinding(CONTENT, finding);
    expect(p).not.toBeNull();
    if (!p) return;
    expect(CONTENT.slice(p.start, p.end)).toBe(p.matchedText);
  });

  it('returns null for an unlocatable finding', () => {
    const finding: AuditFindingFull = {
      id: 'f3',
      dimension: 'novelty_alignment',
      severity: 'warning',
      description: 'generic',
      foundBy: ['A'],
      consensus: 'possible',
      status: 'open',
    };
    expect(locateAuditFinding(CONTENT, finding)).toBeNull();
  });
});

describe('aggregateFindings', () => {
  it('derives actions from anti-AI high-risk spans with valid offsets', () => {
    const start = CONTENT.indexOf('值得注意的是');
    const span: HighRiskSpan = {
      id: 'span-1',
      start,
      end: start + '值得注意的是'.length,
      text: '值得注意的是',
      triggeredBy: ['pattern'],
      localScore: 0.6,
      reason: 'AI 高频引导词',
    };
    const actions = aggregateFindings({ sectionId: 's1', contentTex: CONTENT, aiReport: fakeAiReport([span]) });
    expect(actions.length).toBeGreaterThan(0);
    const aiAction = actions.find((a) => a.dimension === 'anti_ai');
    expect(aiAction).toBeDefined();
    if (!aiAction) return;
    expect(CONTENT.slice(aiAction.start, aiAction.end)).toBe(aiAction.passage);
    expect(aiAction.note).toContain('降低AI痕迹');
  });

  it('derives actions from audit findings with quoted evidence', () => {
    const finding: AuditFindingFull = {
      id: 'f1',
      dimension: 'language_quality',
      severity: 'warning',
      description: 'x',
      suggestion: '请改写 "综上所述"',
      foundBy: ['A'],
      consensus: 'confirmed',
      status: 'open',
    };
    const actions = aggregateFindings({
      sectionId: 's1',
      contentTex: CONTENT,
      auditReport: fakeAuditReport([finding]),
    });
    expect(actions.some((a) => a.passage.includes('综上所述'))).toBe(true);
  });

  it('respects maxPerSection', () => {
    const spans: HighRiskSpan[] = ['值得注意的是', '综上所述'].map((t, i) => {
      const start = CONTENT.indexOf(t);
      return {
        id: `s${i}`,
        start,
        end: start + t.length,
        text: t,
        triggeredBy: ['pattern'],
        localScore: 0.6,
        reason: 'AI 痕迹',
      };
    });
    const actions = aggregateFindings({
      sectionId: 's1',
      contentTex: CONTENT,
      aiReport: fakeAiReport(spans),
      maxPerSection: 1,
    });
    expect(actions.length).toBe(1);
  });
});

describe('revisePassageCore content override (offset-drift regression)', () => {
  it('locates against the provided content, not the section text', async () => {
    const original = '甲句。值得注意的是，乙句。综上所述，丙句。';
    // A prior edit inserted text before the second sentence, shifting its offset.
    const shifted = original.replace('综上所述，丙句。', '\n\n% 新增注释段\n综上所述，丙句。');
    const deps = {
      bible: { getEntries: () => [] },
      reviser: new ReviserAgent(),
      hasLLMFor: () => false,
    };
    const section = { id: 's1', title: '引言', contentTex: original };
    const result = await revisePassageCore(deps, 'p1', section, {
      passage: '综上所述，丙句。',
      note: '请删掉AI味',
      content: shifted,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Offsets must be relative to the SHIFTED content, not the original.
    expect(result.passage.start).toBe(shifted.indexOf('综上所述，丙句。'));
    expect(shifted.slice(result.passage.start, result.passage.end)).toBe('综上所述，丙句。');
  });
});

describe('runAutoRevision (mock mode)', () => {
  function makeDeps(section: Section) {
    const paper: PaperProject = {
      id: 'p1',
      title: '测试论文',
      status: 'draft',
      sections: [section],
      createdAt: '',
      directives: [],
    };
    const papers = new Map<string, PaperProject>([['p1', paper]]);
    const deps = {
      papers,
      bible: { getEntries: () => [] },
      reviser: new ReviserAgent(),
      hasLLMFor: () => false, // force mock mode everywhere
      router: undefined,
      persistSection: () => {},
    };
    return { deps, paper };
  }

  it('adopts an anti-AI targeted rewrite deterministically', async () => {
    const section: Section = {
      id: 's1',
      paperId: 'p1',
      sectionNumber: 1,
      title: '引言',
      contentTex: CONTENT,
      status: 'drafting',
      version: 3,
    };
    const { deps, paper } = makeDeps(section);
    const report = await runAutoRevision(deps, { paperId: 'p1' });
    expect(report.sections.length).toBe(1);
    const sec = report.sections[0];
    // In mock mode the mock reviser rewrites 值得注意的是 → 需要注意的是, so the section is adopted.
    expect(sec.adopted).toBeGreaterThan(0);
    expect(section.version).toBe(4);
    expect(section.status).toBe('drafting');
    expect(section.contentTex).toContain('需要注意的是');
    expect(report.totalAdopted).toBeGreaterThan(0);
    // directives audit trail recorded
    expect(paper.directives?.length).toBeGreaterThan(0);
    expect(paper.directives![0].action).toBe('targeted_revision');
  });

  it('leaves content untouched when no finding is locatable', async () => {
    // Content with no AI-trace phrases and no keyword matches → no actions → no mutation.
    const plain = '本文研究了线性回归模型，并在合成数据上进行了验证。实验结果表明模型收敛稳定。';
    const section: Section = {
      id: 's1',
      paperId: 'p1',
      sectionNumber: 1,
      title: '引言',
      contentTex: plain,
      status: 'passed',
      version: 1,
    };
    const { deps } = makeDeps(section);
    const report = await runAutoRevision(deps, { paperId: 'p1' });
    expect(section.contentTex).toBe(plain);
    expect(section.version).toBe(1);
    expect(report.totalAdopted).toBe(0);
  });
});
