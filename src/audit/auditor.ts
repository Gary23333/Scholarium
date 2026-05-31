// Audit modules — Master + 3 Sub-Auditors
import type {
  AuditDimension,
  AuditFindingFull,
  AuditInput,
  AuditReport,
  AuditFixInstructions,
  SubAuditAssignment,
  SubAuditReport,
  VoteConsensus,
} from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import type { LLMRouter } from '../llm/router.ts';
import { runRealSubAuditor } from './real-audit.ts';

export const ALL_DIMENSIONS: AuditDimension[] = [
  'logic_consistency',
  'citation_integrity',
  'terminology_consistency',
  'data_veracity',
  'math_correctness',
  'structure_integrity',
  'academic_format',
  'language_quality',
  'claim_evidence_chain',
  'inter_section_consistency',
  'narrative_flow',
  'novelty_alignment',
  'data_fidelity',
];

const DEFAULT_ASSIGNMENTS: SubAuditAssignment[] = [
  {
    subId: 'A',
    model: 'deepseek-chat',
    primaryDimensions: [
      'logic_consistency',
      'terminology_consistency',
      'structure_integrity',
      'claim_evidence_chain',
      'narrative_flow',
    ],
    secondaryDimensions: ['language_quality', 'math_correctness', 'novelty_alignment'],
    focusHint: 'Logic, terminology, structure, claim-evidence chains, narrative flow.',
  },
  {
    subId: 'B',
    model: 'deepseek-chat',
    primaryDimensions: ['citation_integrity', 'data_veracity', 'math_correctness', 'data_fidelity'],
    secondaryDimensions: ['logic_consistency', 'academic_format', 'inter_section_consistency'],
    focusHint: 'Citations, data, math, data fidelity, cross-section consistency.',
  },
  {
    subId: 'C',
    model: 'deepseek-chat',
    primaryDimensions: ['language_quality', 'academic_format', 'novelty_alignment'],
    secondaryDimensions: ['citation_integrity', 'terminology_consistency', 'narrative_flow'],
    focusHint: 'Language, format, novelty alignment, narrative flow.',
  },
];

let findingIdCounter = 0;
function nextId(): string {
  return `finding-${++findingIdCounter}-${Date.now().toString(36)}`;
}

function runMockSubAudit(assignment: SubAuditAssignment, input: AuditInput): AuditFindingFull[] {
  const findings: AuditFindingFull[] = [];
  const draft = input.draft;
  const sectionId = input.sectionId;

  if (assignment.subId === 'A') {
    // PDF: logic — conclusion should follow reasoning
    if (/因此|所以|thus\s+therefore/i.test(draft) && !/因为|since|because/i.test(draft)) {
      findings.push({
        id: nextId(),
        dimension: 'logic_consistency',
        severity: 'warning',
        description: 'Conclusion word found without preceding reasoning.',
        foundBy: ['A'],
        consensus: 'possible',
        suggestion: 'Add reasoning before conclusions.',
        status: 'open',
      });
    }
    // PDF: 引言 — should not start with research question
    if (sectionId === '1' || sectionId.startsWith('1-')) {
      if (/^(本文|我们|this paper|we)\s*(研究|探讨|investigate|propose)/i.test(draft.trim())) {
        findings.push({
          id: nextId(),
          dimension: 'structure_integrity',
          severity: 'warning',
          description:
            'Introduction starts with research question/hypothesis. PDF guideline: 避免开篇提出研究问题或假设.',
          foundBy: ['A'],
          consensus: 'probable',
          suggestion: 'Start with broader background context first.',
          status: 'open',
        });
      }
    }
    // PDF: 讨论 — should acknowledge limitations
    if (sectionId === '5' || sectionId.startsWith('5-')) {
      if (!/局限|不足|limitation|future work|future direction/i.test(draft)) {
        findings.push({
          id: nextId(),
          dimension: 'structure_integrity',
          severity: 'warning',
          description: 'Discussion section lacks limitations/outlook. PDF guideline: 诚实讨论方法局限并展望未来.',
          foundBy: ['A'],
          consensus: 'probable',
          suggestion: 'Add a subsection acknowledging limitations and future directions.',
          status: 'open',
        });
      }
    }
    // PDF: 避免开篇使用"研究的结果将会被讨论"式空话
    if (/will be discussed|将会被讨论|will be presented/i.test(draft)) {
      findings.push({
        id: nextId(),
        dimension: 'language_quality',
        severity: 'warning',
        description: 'Vague language: "results will be discussed". PDF guideline: 需要写下结果以及为什么重要.',
        foundBy: ['A'],
        consensus: 'possible',
        suggestion: 'Replace with specific findings and their significance.',
        status: 'open',
      });
    }
    if (/\\section\{[^}]+\}\s*\\label\{[^}]+\}\s*(?=\\section|\\end)/s.test(draft)) {
      findings.push({
        id: nextId(),
        dimension: 'structure_integrity',
        severity: 'critical',
        description: 'Empty section detected.',
        foundBy: ['A'],
        consensus: 'probable',
        suggestion: 'Add content to the section.',
        status: 'open',
      });
    }
    // NEW: claim_evidence_chain — each claim needs supporting evidence
    const claimPattern = /(我们提出|我们证明|we propose|we demonstrate|our method achieves|our approach outperforms)/gi;
    let claimMatch;
    while ((claimMatch = claimPattern.exec(draft)) !== null) {
      const span = draft.substring(Math.max(0, claimMatch.index - 80), claimMatch.index + claimMatch[0].length + 80);
      const hasCite = /\\cite\{[^}]+\}/.test(span);
      const hasData = /\d+\.?\d*\s*(%|x|×)/.test(span);
      if (!hasCite && !hasData) {
        findings.push({
          id: nextId(),
          dimension: 'claim_evidence_chain',
          severity: 'warning',
          description: `Claim "${claimMatch[0]}" lacks supporting citation or data evidence.`,
          foundBy: ['A'],
          consensus: 'possible',
          suggestion: 'Add citation or data to support this claim.',
          status: 'open',
        });
        break; // one warning per section
      }
    }
    // NEW: narrative_flow — check for abrupt topic shifts
    const paragraphs = draft.split(/\n\s*\n/);
    for (let i = 1; i < paragraphs.length; i++) {
      const prev = paragraphs[i - 1].trim();
      const curr = paragraphs[i].trim();
      if (prev && curr && prev.length > 50 && curr.length > 50) {
        const _prevEnd = prev.substring(Math.max(0, prev.length - 60));
        const currStart = curr.substring(0, 60);
        const hasTransition =
          /(因此|然而|此外|具体地|基于此|furthermore|however|moreover|specifically|building on|consequently)/i.test(
            currStart,
          );
        if (!hasTransition) {
          findings.push({
            id: nextId(),
            dimension: 'narrative_flow',
            severity: 'info',
            description: `Abrupt transition between paragraphs ${i} and ${i + 1}. Consider adding a linking phrase.`,
            foundBy: ['A'],
            consensus: 'possible',
            suggestion: 'Add a transition phrase between these paragraphs.',
            status: 'open',
          });
          break;
        }
      }
    }
  }

  if (assignment.subId === 'B') {
    const citeRegex = /\\cite\{([^}]+)\}/g;
    const bibKeys = new Set(input.bibleSummary.citationMap.map((c) => c.key));
    let m;
    while ((m = citeRegex.exec(draft)) !== null) {
      for (const k of m[1].split(',').map((s) => s.trim())) {
        if (!bibKeys.has(k)) {
          findings.push({
            id: nextId(),
            dimension: 'citation_integrity',
            severity: 'critical',
            description: `\\cite{${k}} not in Bible citation map.`,
            foundBy: ['B'],
            consensus: 'probable',
            suggestion: 'Verify citation key or add to references.',
            status: 'open',
          });
        }
      }
    }
    // PDF: 方法可重复性
    if (sectionId.startsWith('3') && draft.length < 200) {
      findings.push({
        id: nextId(),
        dimension: 'structure_integrity',
        severity: 'critical',
        description:
          'Method section is too short to ensure reproducibility. PDF guideline: 方法必须描述清楚以便研究可以被其他研究人员重复.',
        foundBy: ['B'],
        consensus: 'probable',
        suggestion: 'Expand method description with sufficient detail for reproducibility.',
        status: 'open',
      });
    }
    if ((draft.match(/\\begin\{equation\}/g) || []).length !== (draft.match(/\\end\{equation\}/g) || []).length) {
      findings.push({
        id: nextId(),
        dimension: 'math_correctness',
        severity: 'critical',
        description: 'Mismatched equation environments.',
        foundBy: ['B'],
        consensus: 'probable',
        suggestion: 'Check equation environments.',
        status: 'open',
      });
    }
    if ((sectionId === '5' || sectionId.startsWith('5-')) && sectionId.startsWith('3-2')) {
      if (!/alternative|对比|alternative approach|other method/i.test(draft)) {
        findings.push({
          id: nextId(),
          dimension: 'logic_consistency',
          severity: 'info',
          description: 'No alternative approaches discussed. PDF guideline: 选择替代方案来回应.',
          foundBy: ['B'],
          consensus: 'possible',
          suggestion: 'Consider discussing alternative interpretations.',
          status: 'open',
        });
      }
    }
    // NEW: inter_section_consistency — check method section doesn't contain results
    if (sectionId.startsWith('3')) {
      if (
        /(我们的方法达到了|our method achieves|实验结果表明|experimental results show|我们取得了|we achieve)/i.test(
          draft,
        )
      ) {
        findings.push({
          id: nextId(),
          dimension: 'inter_section_consistency',
          severity: 'critical',
          description:
            'Method section contains experimental result language. Results belong in the experiment/results section.',
          foundBy: ['B'],
          consensus: 'probable',
          suggestion: 'Move result statements to the experiment/results section.',
          status: 'open',
        });
      }
    }
    // NEW: inter_section_consistency — intro should not include method details
    if (sectionId.startsWith('1')) {
      if (
        /(我们提出的算法|our proposed algorithm|我们设计的网络|our designed network|模型架构如图|the architecture is shown)/i.test(
          draft,
        )
      ) {
        findings.push({
          id: nextId(),
          dimension: 'inter_section_consistency',
          severity: 'warning',
          description:
            'Introduction contains method architecture details. Introduction should only outline motivation and contributions.',
          foundBy: ['B'],
          consensus: 'possible',
          suggestion: 'Keep introduction focused on motivation; move architecture details to the method section.',
          status: 'open',
        });
      }
    }
    // NEW: data_fidelity — check number consistency in results
    if (sectionId.startsWith('4') || sectionId.startsWith('5')) {
      const numPattern = /(\d+\.?\d*)\s*(%|x|×)/g;
      const numbers: string[] = [];
      let nm;
      while ((nm = numPattern.exec(draft)) !== null) {
        numbers.push(nm[0]);
      }
      // Flag if same number appears with different values
      // Simple check: warn about unqualified numbers
      if (numbers.length > 3) {
        findings.push({
          id: nextId(),
          dimension: 'data_fidelity',
          severity: 'info',
          description: `Section contains ${numbers.length} numerical claims. Ensure all are verifiable from experiment data.`,
          foundBy: ['B'],
          consensus: 'possible',
          suggestion: 'Verify each number against actual experimental results.',
          status: 'open',
        });
      }
    }
  }

  if (assignment.subId === 'C') {
    // PDF: 删除高度概括和冗余的词句
    for (const conn of ['furthermore', 'moreover', 'notably', 'importantly']) {
      const matches = draft.match(new RegExp(`\\b${conn}\\b`, 'gi'));
      if (matches && matches.length >= 2) {
        findings.push({
          id: nextId(),
          dimension: 'language_quality',
          severity: 'warning',
          description: `AI connector "${conn}" used ${matches.length} times. PDF guideline: 删除高度概括和冗余的词句.`,
          foundBy: ['C'],
          consensus: 'possible',
          suggestion: 'Vary transition expressions or remove unnecessary fillers.',
          status: 'open',
        });
      }
    }
    // PDF: Abstract — should not contain citations
    if (sectionId === 'abstract' || sectionId === '0') {
      if (/\\cite\{[^}]+\}/.test(draft)) {
        findings.push({
          id: nextId(),
          dimension: 'academic_format',
          severity: 'critical',
          description: 'Abstract contains citations. PDF guideline: 不要在摘要中出现引用.',
          foundBy: ['C'],
          consensus: 'confirmed',
          suggestion: 'Remove all citations from abstract.',
          status: 'open',
        });
      }
    }
    // PDF: 图表有效性
    if (/(Table|图|表|Figure)\\s*\\((not clear|模糊|unclear)\\)/i.test(draft)) {
      findings.push({
        id: nextId(),
        dimension: 'academic_format',
        severity: 'warning',
        description: 'Possible unclear figure/table. PDF guideline: 确保图片足够放大和清晰以便读者理解.',
        foundBy: ['C'],
        consensus: 'possible',
        suggestion: 'Ensure all figures and tables are clear and legible.',
        status: 'open',
      });
    }
    // NEW: novelty_alignment — contributions vs actual content
    if (sectionId === '1' || sectionId === '5') {
      const hasContribution = /(贡献|contribution|novel|创新)/i.test(draft);
      const hasSpecific = /(我们提出|we propose|我们设计|we design|本文的贡献|our contribution)/i.test(draft);
      if (hasContribution && !hasSpecific) {
        findings.push({
          id: nextId(),
          dimension: 'novelty_alignment',
          severity: 'warning',
          description:
            'Section mentions contributions generically but lacks specific novelty statements. PDF guideline: 通过指出前人研究的不足与不确定来突出你自己研究的学术意义.',
          foundBy: ['C'],
          consensus: 'possible',
          suggestion: 'Replace generic contribution language with specific novelty claims.',
          status: 'open',
        });
      }
    }
    // NEW: novelty_alignment — intro conclusion mismatch
    if (sectionId === '5') {
      const match = draft.match(/对比.*(实验|experiment)|(提升|improvement|提高).*\d+/i);
      if (!match) {
        findings.push({
          id: nextId(),
          dimension: 'novelty_alignment',
          severity: 'info',
          description: 'Conclusion section lacks quantitative evidence to support claimed contributions.',
          foundBy: ['C'],
          consensus: 'possible',
          suggestion: 'Include specific numbers comparing your results with baselines.',
          status: 'open',
        });
      }
    }
    // PDF: plagiarised-sounding text (no citation for claim)
    const claimPatterns = /(achieves|outperforms|demonstrates|首次|首次提出|state-of-the-art|SOTA|最好)/gi;
    let claimMatch;
    while ((claimMatch = claimPatterns.exec(draft)) !== null) {
      const before = draft.substring(Math.max(0, claimMatch.index - 60), claimMatch.index);
      const after = draft.substring(
        claimMatch.index + claimMatch[0].length,
        claimMatch.index + claimMatch[0].length + 60,
      );
      const _surroundingText = before + claimMatch[0] + after;
      // Check if there's a citation within 100 chars
      const nearbyCite = draft.substring(
        Math.max(0, claimMatch.index - 100),
        claimMatch.index + claimMatch[0].length + 100,
      );
      if (!/\\cite\{[^}]+\}/.test(nearbyCite)) {
        findings.push({
          id: nextId(),
          dimension: 'citation_integrity',
          severity: 'warning',
          description: `Claim "${claimMatch[0]}" without supporting citation. PDF guideline: 使用他人文字或想法必须注明原作者.`,
          foundBy: ['C'],
          consensus: 'possible',
          suggestion: 'Add citation to support this claim.',
          status: 'open',
        });
      }
    }
  }

  return findings;
}

function computeConsensus(dimension: AuditDimension, foundBy: ('A' | 'B' | 'C')[]): VoteConsensus {
  const count = foundBy.length;
  if (count >= 3) return 'confirmed';
  if (count === 2) return 'probable';
  if (['citation_integrity', 'data_veracity', 'math_correctness'].includes(dimension)) return 'probable';
  return 'possible';
}

function mergeFindings(subReports: SubAuditReport[]): AuditFindingFull[] {
  const groups: AuditFindingFull[][] = [];
  for (const report of subReports) {
    for (const finding of report.findings) {
      let matched = false;
      for (const group of groups) {
        const first = group[0];
        if (
          first.dimension === finding.dimension &&
          first.description.slice(0, 30) === finding.description.slice(0, 30)
        ) {
          group.push(finding);
          matched = true;
          break;
        }
      }
      if (!matched) groups.push([finding]);
    }
  }
  return groups.map((group) => {
    const first = group[0];
    const allSubIds = [...new Set(group.flatMap((f) => f.foundBy))] as ('A' | 'B' | 'C')[];
    const maxSev = group.reduce((max, f) => (sevRank(f.severity) > sevRank(max) ? f.severity : max), first.severity);
    return { ...first, foundBy: allSubIds, severity: maxSev, consensus: computeConsensus(first.dimension, allSubIds) };
  });
}

function sevRank(s: string): number {
  return s === 'critical' ? 3 : s === 'warning' ? 2 : 1;
}

export async function runSubAuditor(
  assignment: SubAuditAssignment,
  input: AuditInput,
  router?: LLMRouter,
): Promise<SubAuditReport> {
  if (router && !input.mockMode) {
    try {
      return await runRealSubAuditor(assignment, input, router);
    } catch (e) {
      logger.warn('Real sub-audit failed, falling back to mock', String(e)); /* fall through to mock */
    }
  }
  const start = Date.now();
  const findings = runMockSubAudit(assignment, input);
  return {
    subId: assignment.subId,
    model: assignment.model,
    findings,
    elapsedMs: Date.now() - start,
    mockMode: !router,
  };
}

export async function masterAudit(input: AuditInput, subReports: SubAuditReport[]): Promise<AuditReport> {
  const start = Date.now();
  const mergedFindings = mergeFindings(subReports);
  const stats = {
    critical: mergedFindings.filter((f) => f.severity === 'critical').length,
    warning: mergedFindings.filter((f) => f.severity === 'warning').length,
    info: mergedFindings.filter((f) => f.severity === 'info').length,
  };
  const dimensionStats = {} as AuditReport['dimensionStats'];
  for (const dim of ALL_DIMENSIONS) {
    const df = mergedFindings.filter((f) => f.dimension === dim);
    (dimensionStats as any)[dim] = { count: df.length, critical: df.filter((f) => f.severity === 'critical').length };
  }

  const usingReal = subReports.some((r) => !r.mockMode);
  const fixInstructions: AuditFixInstructions = {
    instruction:
      stats.critical > 0
        ? `${stats.critical} critical issues must be fixed.`
        : stats.warning > 0
          ? `${stats.warning} warnings to optimize.`
          : 'Audit passed.',
    issues: mergedFindings.map((f) => ({
      findingId: f.id,
      dimension: f.dimension,
      severity: f.severity,
      description: `[${f.consensus.toUpperCase()}] ${f.description}`,
      location: f.location,
      suggestion: f.suggestion,
    })),
  };

  return {
    reportId: `audit-${Date.now()}`,
    sectionId: input.sectionId,
    version: 1,
    masterModel: usingReal ? 'llm-master' : 'mock-master',
    findings: mergedFindings,
    stats,
    dimensionStats,
    fixInstructions,
    passed: stats.critical === 0,
    elapsedMs: Date.now() - start,
    mockMode: !usingReal,
  };
}

export async function runFullAudit(input: AuditInput, router?: LLMRouter): Promise<AuditReport> {
  const subReports = await Promise.all(DEFAULT_ASSIGNMENTS.map((a) => runSubAuditor(a, input, router)));
  return masterAudit(input, subReports);
}
