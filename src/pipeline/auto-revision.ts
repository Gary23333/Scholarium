// 评审驱动自动定向修订 (②) — 低分审计/反AI发现实时派生修订动作 → 局部重写 → 复评择优。
import type {
  AutoRevisionReport,
  AutoRevisionSectionReport,
  TargetedRevisionAction,
  AuditReport,
  AuditFindingFull,
  AIScoreReport,
  Section,
  AuditDimension,
  Severity,
} from '../types/index.ts';
import { runFullAudit } from '../audit/index.ts';
import { detect } from '../anti-ai/index.ts';
import type { LLMRouter } from '../llm/router.ts';
import type { PaperProject } from '../server/context.ts';
import {
  revisePassageCore,
  type RevisePassageCoreDeps,
  type RevisePassageCoreResult,
} from '../lib/revise-passage-core.ts';
import { findPassageInContent, spliceContent, type LocatedPassage } from '../lib/segment-locator.ts';

export interface AutoRevisionOptions {
  paperId: string;
  sectionIds?: string[];
  maxPerSection?: number;
  taskId?: string;
}

export interface AutoRevisionDeps extends RevisePassageCoreDeps {
  papers: Map<string, PaperProject>;
  router?: LLMRouter;
  persistSection: (paperId: string, section: Section) => void;
  updateProgress?: (taskId: string, pct: number, message: string) => void;
}

const DIMENSION_KEYWORDS: Partial<Record<AuditDimension, string[]>> = {
  logic_consistency: ['因为', '所以', '因此', '逻辑', 'reason'],
  citation_integrity: ['\\cite'],
  terminology_consistency: ['术语', 'terminolog'],
  data_veracity: ['数据', 'data'],
  math_correctness: ['公式', '方程', 'equation'],
  structure_integrity: ['\\begin', '\\section'],
  academic_format: ['\\cite', '格式'],
  language_quality: ['此外', '总之', '值得注意的是', 'furthermore', 'moreover'],
  claim_evidence_chain: ['论证', 'evidence', 'claim'],
  inter_section_consistency: ['前文', '上文', 'previously'],
  narrative_flow: ['段落', 'transition'],
  novelty_alignment: ['创新', 'novel'],
  data_fidelity: ['实验', 'experiment'],
};

export function severityWeight(report: Pick<AuditReport, 'stats'>): number {
  return report.stats.critical * 3 + report.stats.warning * 2 + report.stats.info;
}

/** Extract a quoted excerpt ("…", 「…」, '…') from a suggestion/description string. */
export function extractQuote(text: string): string | null {
  const m = text.match(/"([^"]{4,})"/) || text.match(/「([^」]{4,})」/) || text.match(/'([^']{4,})'/);
  return m ? m[1] : null;
}

function sentenceAt(content: string, start: number): LocatedPassage {
  const e = content.indexOf('。', start);
  const end = e === -1 ? content.length : e + 1;
  return { start, end, matchedText: content.slice(start, end) };
}

function sentenceContaining(content: string, keywords: string[]): LocatedPassage | null {
  const sentences = content.split(/(?<=[。；!?])/);
  let idx = 0;
  for (const sentence of sentences) {
    const s = sentence.trim();
    if (s.length < 4) {
      idx += sentence.length;
      continue;
    }
    if (keywords.some((k) => s.includes(k))) {
      return { start: idx + sentence.indexOf(s), end: idx + sentence.length, matchedText: s };
    }
    idx += sentence.length;
  }
  return null;
}

/** Locate the concrete passage inside a section that an audit finding refers to. */
export function locateAuditFinding(content: string, finding: AuditFindingFull): LocatedPassage | null {
  const loc = finding.location;
  if (loc && /^\d{1,6}$/.test(loc.trim())) {
    const start = Number(loc.trim());
    if (start >= 0 && start < content.length) {
      const p = sentenceAt(content, start);
      if (p.matchedText.trim().length >= 4) return p;
    }
  }
  const quote = extractQuote(finding.suggestion ?? '') ?? extractQuote(finding.description ?? '');
  if (quote) {
    const res = findPassageInContent(content, quote);
    if (res.ok) return res.result;
  }
  const keywords = DIMENSION_KEYWORDS[finding.dimension] ?? [];
  if (keywords.length > 0) {
    const p = sentenceContaining(content, keywords);
    if (p) return p;
  }
  return null;
}

export interface AggregateFindingsInput {
  sectionId: string;
  contentTex: string;
  auditReport?: AuditReport;
  aiReport?: AIScoreReport;
  maxPerSection?: number;
}

/**
 * Derive targeted revision actions from audit findings (critical/warning first)
 * and anti-AI high-risk spans. Each action carries an exact passage + offsets.
 */
export function aggregateFindings(input: AggregateFindingsInput): TargetedRevisionAction[] {
  const actions: TargetedRevisionAction[] = [];
  const max = input.maxPerSection ?? 5;
  const seen = new Set<string>();

  const addAction = (
    sectionId: string,
    severity: Severity,
    dimension: string,
    passage: LocatedPassage,
    note: string,
    reason: string,
    findingId?: string,
  ) => {
    const key = `${dimension}:${passage.start}:${passage.end}`;
    if (seen.has(key)) return;
    if (passage.matchedText.trim().length < 4) return;
    seen.add(key);
    actions.push({
      id: `act-${actions.length + 1}`,
      sectionId,
      dimension,
      severity,
      findingId,
      passage: passage.matchedText,
      start: passage.start,
      end: passage.end,
      note,
      reason,
      status: 'pending',
    });
  };

  // 1) Audit findings — critical & warning, sorted by severity.
  const findings = [...(input.auditReport?.findings ?? [])].filter(
    (f) => f.severity === 'critical' || f.severity === 'warning',
  );
  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
  for (const f of findings) {
    if (actions.length >= max) break;
    const passage = locateAuditFinding(input.contentTex, f);
    if (!passage) continue;
    addAction(input.sectionId, f.severity, f.dimension, passage, f.suggestion ?? f.description, f.description, f.id);
  }

  // 2) Anti-AI high-risk spans.
  for (const span of input.aiReport?.highRiskSpans ?? []) {
    if (actions.length >= max) break;
    if (span.text.trim().length < 4) continue;
    const res = findPassageInContent(input.contentTex, span.text);
    if (!res.ok) continue;
    addAction(
      input.sectionId,
      span.localScore >= 0.5 ? 'critical' : 'warning',
      'anti_ai',
      res.result,
      `降低AI痕迹：${span.reason}`,
      `高风险的 AI 写作痕迹：${span.reason}`,
      span.id,
    );
  }

  return actions;
}

export async function runAutoRevision(deps: AutoRevisionDeps, opts: AutoRevisionOptions): Promise<AutoRevisionReport> {
  const paper = deps.papers.get(opts.paperId);
  if (!paper) throw new Error('Paper not found');
  const sections = paper.sections.filter((s) => s.contentTex && (!opts.sectionIds || opts.sectionIds.includes(s.id)));
  const maxPerSection = opts.maxPerSection ?? 5;
  const report: AutoRevisionReport = { paperId: opts.paperId, sections: [], totalAdopted: 0 };

  const bibleEntries = deps.bible.getEntries(opts.paperId);
  const buildBibleSummary = () => ({
    terminology: bibleEntries.filter((e) => e.category === 'terminology').map((e) => ({ key: e.key, value: e.value })),
    citationMap: bibleEntries.filter((e) => e.category === 'citations').map((e) => ({ key: e.key, value: e.value })),
    dataPoints: bibleEntries.filter((e) => e.category === 'data').map((e) => ({ key: e.key, value: e.value })),
  });

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const contentTex = section.contentTex!;
    const auditMock = !deps.hasLLMFor('auditor');
    const aiMock = !deps.hasLLMFor('antiAiDetector');

    const auditReport = await runFullAudit(
      { sectionId: section.id, draft: contentTex, bibleSummary: buildBibleSummary(), mockMode: auditMock },
      deps.router,
    );
    const aiReport = await detect(contentTex, { mockMode: aiMock }, deps.router);

    const actions = aggregateFindings({
      sectionId: section.id,
      contentTex,
      auditReport,
      aiReport,
      maxPerSection,
    });

    const beforeScore = severityWeight(auditReport);
    const secReport: AutoRevisionSectionReport = {
      sectionId: section.id,
      beforeScore,
      afterScore: beforeScore,
      actions: actions.map((a) => ({ ...a })),
      adopted: 0,
      rejected: 0,
      report: auditReport,
    };
    report.sections.push(secReport);

    if (actions.length === 0) {
      secReport.actions = [];
      continue;
    }

    // Apply every action to a working copy; re-locate against the current text each time
    // so earlier edits never shift a later action's offsets.
    let workingContent = contentTex;
    const results: RevisePassageCoreResult[] = [];
    for (const action of actions) {
      const result = await revisePassageCore(deps, opts.paperId, section, {
        passage: action.passage,
        note: action.note,
        content: workingContent,
      });
      results.push(result);
      if (result.ok) {
        workingContent = spliceContent(workingContent, result.passage.start, result.passage.end, result.revised);
      }
    }

    // Re-audit the final working copy.
    const postReport = await runFullAudit(
      {
        sectionId: section.id,
        draft: workingContent,
        bibleSummary: buildBibleSummary(),
        mockMode: auditMock,
      },
      deps.router,
    );
    const afterScore = severityWeight(postReport);

    const anyProtectedViolated = results.some((r) => r.ok && r.protectedViolated);
    const anyChanged = results.some((r) => r.ok && r.revised !== r.passage.matchedText);
    const adopt = auditMock ? anyChanged && !anyProtectedViolated : afterScore < beforeScore;

    secReport.afterScore = afterScore;
    secReport.postReport = postReport;

    actions.forEach((action, idx) => {
      const r = results[idx];
      if (!r?.ok) {
        action.status = 'rejected';
        secReport.rejected++;
        return;
      }
      if (!adopt || r.protectedViolated || r.revised === r.passage.matchedText) {
        action.status = 'rejected';
        secReport.rejected++;
        return;
      }
      action.status = 'adopted';
      secReport.adopted++;
    });

    if (adopt && anyChanged) {
      section.contentTex = workingContent;
      section.version++;
      section.status = 'drafting';
      deps.persistSection(opts.paperId, section);
      const adopted = actions.filter((a) => a.status === 'adopted');
      if (adopted.length > 0) {
        paper.directives = [
          ...(paper.directives ?? []),
          ...adopted.map((a) => ({
            id: `auto-${Date.now()}-${a.id}`,
            paperId: opts.paperId,
            sectionId: section.id,
            directive: a.note,
            action: 'targeted_revision',
            priority: a.severity === 'critical' ? 'high' : 'medium',
            createdAt: new Date().toISOString(),
            applied: true,
          })),
        ];
      }
      report.totalAdopted += secReport.adopted;
    } else {
      secReport.adopted = 0;
      secReport.rejected = actions.length;
      actions.forEach((a) => (a.status = 'rejected'));
    }

    // 同步动作最终状态回报告（secReport.actions 此前持有副本）
    secReport.actions = actions;

    if (deps.updateProgress) {
      deps.updateProgress(opts.taskId ?? '', Math.round(((i + 1) / sections.length) * 90), `修订：${section.title}`);
    }
  }

  return report;
}
