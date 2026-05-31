// Input Governance — Validate writer input against quality rules
// Inspired by InkOS InputGovernance (20+ rules adapted for academic papers)

import type {
  GovernanceRule,
  GovernanceViolation,
  GovernanceResult,
  WriterInput,
  BibleEntry,
  OutlineSection,
} from '../types/index.ts';

export interface GovernanceContext {
  approvedCiteKeys: Set<string>;
  approvedTermKeys: Set<string>;
  approvedDataKeys: Map<string, string>;
  section: OutlineSection;
  previousSections: Array<{ id: string; title: string; summary: string }>;
}

export class InputGovernance {
  private enabledRules: Set<GovernanceRule>;

  constructor(enabled?: GovernanceRule[]) {
    this.enabledRules = new Set(
      enabled ?? [
        'no_fabricated_citations',
        'no_method_result_confusion',
        'must_reference_bible_facts',
        'no_undefined_terms',
        'no_self_references',
        'no_empty_transitions',
        'data_precision_check',
      ],
    );
  }

  validate(input: WriterInput, context: GovernanceContext): GovernanceResult {
    const violations: GovernanceViolation[] = [];

    if (this.enabledRules.has('no_fabricated_citations')) {
      violations.push(...this.checkFabricatedCitations(input, context));
    }
    if (this.enabledRules.has('no_method_result_confusion')) {
      violations.push(...this.checkMethodResultConfusion(input, context));
    }
    if (this.enabledRules.has('must_reference_bible_facts')) {
      violations.push(...this.checkBibleFactUsage(input, context));
    }
    if (this.enabledRules.has('no_undefined_terms')) {
      violations.push(...this.checkUndefinedTerms(input, context));
    }
    if (this.enabledRules.has('no_self_references')) {
      violations.push(...this.checkSelfReferences(input));
    }
    if (this.enabledRules.has('no_empty_transitions')) {
      violations.push(...this.checkEmptyTransitions(input));
    }
    if (this.enabledRules.has('data_precision_check')) {
      violations.push(...this.checkDataPrecision(input, context));
    }

    const critical = violations.filter((v) => v.severity === 'critical').length;
    const warning = violations.filter((v) => v.severity === 'warning').length;
    const info = violations.filter((v) => v.severity === 'info').length;

    return {
      passed: critical === 0,
      violations,
      stats: { critical, warning, info },
    };
  }

  private checkFabricatedCitations(input: WriterInput, ctx: GovernanceContext): GovernanceViolation[] {
    const result: GovernanceViolation[] = [];
    if (!input.previousDraft) return result;
    const citeRegex = /\\cite\{([^}]+)\}/g;
    let match;
    while ((match = citeRegex.exec(input.previousDraft)) !== null) {
      for (const k of match[1].split(',').map((s) => s.trim())) {
        if (!ctx.approvedCiteKeys.has(k)) {
          result.push({
            rule: 'no_fabricated_citations',
            severity: 'critical',
            message: `Citation "${k}" is not in the approved citation pool.`,
            location: `cite{${k}}`,
            suggestion: `Replace with an approved citation key from: ${[...ctx.approvedCiteKeys].slice(0, 5).join(', ')}...`,
          });
        }
      }
    }
    return result;
  }

  private checkMethodResultConfusion(input: WriterInput, ctx: GovernanceContext): GovernanceViolation[] {
    const result: GovernanceViolation[] = [];
    if (!input.previousDraft) return result;
    const sectionId = ctx.section.id;
    if (sectionId.startsWith('3')) {
      const resultPatterns =
        /(我们的方法达到了|our method achieves|实验结果表明|experimental results show|我们取得了|we achieve|性能提升|performance improvement|准确率达到|accuracy reaches)/gi;
      let m;
      while ((m = resultPatterns.exec(input.previousDraft)) !== null) {
        result.push({
          rule: 'no_method_result_confusion',
          severity: 'critical',
          message: `Method section contains result language: "${m[0]}". Move result statements to experiment section.`,
          location: `around position ${m.index}`,
          suggestion: 'Replace with methodological description without result claims.',
        });
        break;
      }
    }
    if (sectionId.startsWith('4') || sectionId.startsWith('5')) {
      if (
        /(我们提出的算法|our proposed algorithm|我们设计的网络|our designed network|模型架构)/i.test(
          input.previousDraft,
        )
      ) {
        result.push({
          rule: 'no_method_result_confusion',
          severity: 'warning',
          message: 'Experiment/conclusion section contains method architecture details.',
          suggestion: 'Keep method descriptions in the method section; focus on analysis here.',
        });
      }
    }
    return result;
  }

  private checkBibleFactUsage(input: WriterInput, ctx: GovernanceContext): GovernanceViolation[] {
    const result: GovernanceViolation[] = [];
    if (!input.previousDraft) return result;
    const draft = input.previousDraft;

    // Check for claimed data points that don't match Bible
    for (const [key, value] of ctx.approvedDataKeys) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const _escapedVal = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const userPattern = new RegExp(`${escapedKey}[^.]*?[=:是][^.]*?(\\d+\\.?\\d*\\s*%?)`, 'i');
      const draftMatch = draft.match(userPattern);
      if (draftMatch) {
        const draftVal = draftMatch[1];
        if (draftVal && Math.abs(parseFloat(draftVal) - parseFloat(value)) > 0.01) {
          result.push({
            rule: 'must_reference_bible_facts',
            severity: 'critical',
            message: `Data point "${key}" value "${draftVal}" differs from Bible value "${value}".`,
            suggestion: `Use the approved value: ${value}`,
          });
        }
      }
    }

    // Check for key claims without Bible backing
    const forbiddenClaimWords = /(首次|首次提出|state-of-the-art|SOTA|最好|最优|best|superior)/gi;
    let claimMatch;
    while ((claimMatch = forbiddenClaimWords.exec(draft)) !== null) {
      const span = draft.substring(Math.max(0, claimMatch.index - 60), claimMatch.index + claimMatch[0].length + 60);
      if (!/\\cite\{[^}]+\}/.test(span)) {
        result.push({
          rule: 'must_reference_bible_facts',
          severity: 'warning',
          message: `Claim "${claimMatch[0]}" without supporting citation or Bible entry.`,
          location: `around position ${claimMatch.index}`,
          suggestion: 'Add a citation from the approved citation pool to support this claim.',
        });
      }
    }

    return result;
  }

  private checkUndefinedTerms(input: WriterInput, ctx: GovernanceContext): GovernanceViolation[] {
    const result: GovernanceViolation[] = [];
    if (!input.previousDraft) return result;
    const draft = input.previousDraft;

    // Look for potential undefined acronyms/terms (ALL-CAPS words >2 chars)
    const acroPattern = /\b([A-Z][A-Z]+[a-z]?[A-Z]*)\b/g;
    const foundTerms = new Set<string>();
    let m;
    while ((m = acroPattern.exec(draft)) !== null) {
      const term = m[1];
      if (!ctx.approvedTermKeys.has(term.toLowerCase()) && !foundTerms.has(term)) {
        foundTerms.add(term);
        // Check if it's defined inline with parentheses
        const before = draft.substring(Math.max(0, m.index - 80), m.index);
        const hasDefinition = /\(/.test(before);
        if (!hasDefinition) {
          result.push({
            rule: 'no_undefined_terms',
            severity: 'warning',
            message: `Acronym "${term}" may be undefined. Define it on first use or register in Bible terminology.`,
            suggestion: `Add "${term}" to Bible terminology or define inline as "Full Name (${term})".`,
          });
        }
      }
    }
    return result;
  }

  private checkSelfReferences(input: WriterInput): GovernanceViolation[] {
    const result: GovernanceViolation[] = [];
    if (!input.previousDraft) return result;
    const draft = input.previousDraft;

    // Check for vague self-references
    const patterns = [
      {
        pattern: /as discussed above/gi,
        message: 'Vague self-reference "as discussed above".',
        suggestion: 'Replace with specific section reference (e.g., "as discussed in Section 2").',
      },
      {
        pattern: /as mentioned earlier/gi,
        message: 'Vague self-reference "as mentioned earlier".',
        suggestion: 'Replace with specific section reference.',
      },
      { pattern: /如前所述/gi, message: '模糊的自我指涉 "如前所述"。', suggestion: '替换为具体章节引用。' },
      { pattern: /上文提到/gi, message: '模糊的自我指涉 "上文提到"。', suggestion: '替换为具体章节引用。' },
    ];

    for (const { pattern, message, suggestion } of patterns) {
      if (pattern.test(draft)) {
        result.push({
          rule: 'no_self_references',
          severity: 'warning',
          message,
          suggestion,
        });
        break;
      }
    }

    return result;
  }

  private checkEmptyTransitions(input: WriterInput): GovernanceViolation[] {
    const result: GovernanceViolation[] = [];
    if (!input.previousDraft) return result;
    const draft = input.previousDraft;

    // Check for AI filler / empty transition phrases
    const fillerPatterns = [
      { pattern: /It is important to note that /gi, severity: 'warning' as const },
      { pattern: /It is worth noting that /gi, severity: 'warning' as const },
      { pattern: /It should be noted that /gi, severity: 'warning' as const },
      { pattern: /值得注意的是/gi, severity: 'warning' as const },
      { pattern: /不难发现/gi, severity: 'warning' as const },
      { pattern: /显而易见/gi, severity: 'warning' as const },
      { pattern: /不言而喻/gi, severity: 'info' as const },
      { pattern: /研究的结果将会被讨论/gi, severity: 'critical' as const },
    ];

    for (const { pattern, severity } of fillerPatterns) {
      if (pattern.test(draft)) {
        result.push({
          rule: 'no_empty_transitions',
          severity,
          message: `Empty transition/filler phrase detected.`,
          suggestion: 'Remove filler or replace with substantive content.',
        });
        break;
      }
    }

    return result;
  }

  private checkDataPrecision(input: WriterInput, _ctx: GovernanceContext): GovernanceViolation[] {
    const result: GovernanceViolation[] = [];
    if (!input.previousDraft) return result;
    const draft = input.previousDraft;

    // Check numerical precision — percentages should be specific
    const vagueNum = /(约|大约|around|roughly|approximately)\s*\d+/gi;
    if (vagueNum.test(draft)) {
      result.push({
        rule: 'data_precision_check',
        severity: 'warning',
        message: 'Vague numerical qualifier detected. Use precise numbers in academic writing.',
        suggestion: 'Replace "approximately X%" with the exact measured value from experiments.',
      });
    }

    // Check for "better than" without quantification
    const vagueCompare = /(better than|优于|高于|低于)\s+(?!\d)/gi;
    if (vagueCompare.test(draft)) {
      result.push({
        rule: 'data_precision_check',
        severity: 'warning',
        message: 'Comparison without quantitative backing. Academic claims need numerical evidence.',
        suggestion: 'Add specific numerical comparison (e.g., "3.2% better than baseline X").',
      });
    }

    return result;
  }
}

export function buildGovernanceContext(
  bibleEntries: BibleEntry[],
  section: OutlineSection,
  previousSections: Array<{ id: string; title: string; summary: string }>,
): GovernanceContext {
  const approvedCiteKeys = new Set(
    bibleEntries.filter((e) => e.category === 'citations' && e.approvalStatus === 'approved').map((e) => e.key),
  );
  const approvedTermKeys = new Set(
    bibleEntries.filter((e) => e.category === 'terminology').map((e) => e.key.toLowerCase()),
  );
  const approvedDataKeys = new Map(bibleEntries.filter((e) => e.category === 'data').map((e) => [e.key, e.value]));

  return { approvedCiteKeys, approvedTermKeys, approvedDataKeys, section, previousSections };
}
