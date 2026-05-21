// Integrity Gate — 5-phase verification for academic integrity
import type { LLMRouter } from '../llm/router.ts';
import type {
  IntegrityGateResult,
  IntegrityPhaseResult,
  VerificationResult,
  FailureModeReport,
  FailureMode,
  ClaimAuditResult,
  ClaimAuditSummary,
  ClaimAnchor,
} from '../types/index.ts';
import { randomUUID } from 'node:crypto';

export interface IntegrityGateInput {
  paperId: string;
  paperContent: string;
  references: Array<{ key: string; bibtex: string; title?: string }>;
  gateType: 'pre_review' | 'final_check';
  mockMode?: boolean;
}

export class IntegrityGate {
  private router?: LLMRouter;

  constructor(router?: LLMRouter) {
    this.router = router;
  }

  async run(input: IntegrityGateInput): Promise<IntegrityGateResult> {
    const { paperContent, references, gateType, mockMode } = input;

    // Phase A: Reference verification
    const phaseA = this.verifyReferences(paperContent, references);

    // Phase B: Citation context verification
    const phaseB = this.verifyCitationContext(paperContent, references);

    // Phase C: Statistical data verification
    const phaseC = this.verifyStatistics(paperContent);

    // Phase D: Originality verification
    const phaseD = this.verifyOriginality(paperContent);

    // Phase E: Claim verification
    const phaseE = this.verifyClaims(paperContent, references);

    // Failure mode detection
    const failureModes = this.checkFailureModes(paperContent, phaseA, phaseB, phaseC, phaseD, phaseE);

    const overallPassed =
      phaseA.passed && phaseB.passed && phaseC.passed && phaseD.passed && phaseE.passed && !failureModes.blocked;

    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const correctionList: string[] = [];

    for (const phase of [phaseA, phaseB, phaseC, phaseD, phaseE]) {
      for (const check of phase.checks) {
        if (check.verdict === 'not_found' || check.verdict === 'suspected_fabrication') {
          criticalIssues.push(check.details);
          correctionList.push(`修复: ${check.target}`);
        } else if (check.verdict === 'mismatch') {
          warnings.push(check.details);
        }
      }
    }

    if (failureModes.blocked) {
      criticalIssues.push(`AI 研究失败模式阻断: ${failureModes.suspectedModes.join(', ')}`);
    }

    return {
      id: randomUUID(),
      paperId: input.paperId,
      gateType,
      phases: { A: phaseA, B: phaseB, C: phaseC, D: phaseD, E: phaseE },
      failureModes,
      overallPassed,
      criticalIssues,
      warnings,
      correctionList,
      createdAt: new Date().toISOString(),
    };
  }

  private verifyReferences(content: string, refs: Array<{ key: string; bibtex: string }>): IntegrityPhaseResult {
    const checks: VerificationResult[] = [];
    const citeKeys = new Set<string>();
    const citeRegex = /\\cite\{([^}]+)\}/g;
    let match;
    while ((match = citeRegex.exec(content)) !== null) {
      for (const k of match[1].split(',').map((s) => s.trim())) citeKeys.add(k);
    }

    const refKeys = new Set(refs.map((r) => r.key));
    for (const key of citeKeys) {
      if (refKeys.has(key)) {
        checks.push({ target: key, verdict: 'verified', details: `引用 ${key} 存在于参考文献库中`, confidence: 1.0 });
      } else {
        checks.push({
          target: key,
          verdict: 'not_found',
          details: `引用 ${key} 未在参考文献库中找到`,
          confidence: 0.9,
        });
      }
    }

    const criticalCount = checks.filter(
      (c) => c.verdict === 'not_found' || c.verdict === 'suspected_fabrication',
    ).length;
    return { phase: 'A', checks, passed: criticalCount === 0, criticalCount, warningCount: 0 };
  }

  private verifyCitationContext(content: string, refs: Array<{ key: string; bibtex: string }>): IntegrityPhaseResult {
    const checks: VerificationResult[] = [];
    const patterns = [
      { regex: /(首次|首次提出|state-of-the-art|SOTA|最好|最优)/gi, needsCite: true },
      { regex: /(我们提出|我们证明|we propose|we demonstrate)/gi, needsCite: true },
    ];

    for (const { regex, needsCite } of patterns) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const span = content.substring(Math.max(0, match.index - 80), match.index + match[0].length + 80);
        const hasCite = /\\cite\{[^}]+\}/.test(span);
        if (needsCite && !hasCite) {
          checks.push({
            target: match[0],
            verdict: 'mismatch',
            details: `声称 "${match[0]}" 缺少引用支撑`,
            confidence: 0.8,
          });
        }
      }
    }

    const warningCount = checks.filter((c) => c.verdict === 'mismatch').length;
    return { phase: 'B', checks, passed: warningCount === 0, criticalCount: 0, warningCount };
  }

  private verifyStatistics(content: string): IntegrityPhaseResult {
    const checks: VerificationResult[] = [];
    const numPattern = /(\d+\.?\d*)\s*(%|x|×)/g;
    const numbers: string[] = [];
    let match;
    while ((match = numPattern.exec(content)) !== null) {
      numbers.push(match[0]);
    }

    if (numbers.length > 5) {
      checks.push({
        target: '统计数据',
        verdict: 'verified',
        details: `检测到 ${numbers.length} 个数值声明，建议逐一验证`,
        confidence: 0.7,
      });
    }

    return { phase: 'C', checks, passed: true, criticalCount: 0, warningCount: checks.length };
  }

  private verifyOriginality(content: string): IntegrityPhaseResult {
    const checks: VerificationResult[] = [];
    const repetitivePatterns = /(.{20,})\1{2,}/g;
    const matches = content.match(repetitivePatterns);
    if (matches && matches.length > 0) {
      checks.push({
        target: '重复内容',
        verdict: 'mismatch',
        details: `检测到 ${matches.length} 处可能的重复内容`,
        confidence: 0.6,
      });
    }

    return { phase: 'D', checks, passed: checks.length === 0, criticalCount: 0, warningCount: checks.length };
  }

  private verifyClaims(content: string, refs: Array<{ key: string }>): IntegrityPhaseResult {
    const checks: VerificationResult[] = [];
    const claimPattern =
      /(我们的方法达到了|our method achieves|实验结果表明|experimental results show|我们取得了|we achieve|性能提升|performance improvement)/gi;
    let match;
    while ((match = claimPattern.exec(content)) !== null) {
      const span = content.substring(Math.max(0, match.index - 50), match.index + match[0].length + 50);
      const hasCite = /\\cite\{[^}]+\}/.test(span);
      const hasData = /\d+\.?\d*\s*(%|x|×)/.test(span);
      if (!hasCite && !hasData) {
        checks.push({
          target: match[0],
          verdict: 'not_found',
          details: `声明 "${match[0]}" 缺少引用或数据支撑`,
          confidence: 0.8,
        });
      }
    }

    const criticalCount = checks.filter((c) => c.verdict === 'not_found').length;
    return { phase: 'E', checks, passed: criticalCount === 0, criticalCount, warningCount: 0 };
  }

  private checkFailureModes(
    content: string,
    phaseA: IntegrityPhaseResult,
    phaseB: IntegrityPhaseResult,
    phaseC: IntegrityPhaseResult,
    phaseD: IntegrityPhaseResult,
    phaseE: IntegrityPhaseResult,
  ): FailureModeReport {
    const modes: Record<FailureMode, 'pass' | 'suspected' | 'insufficient_evidence'> = {
      implementation_bug: 'pass',
      hallucinated_results: phaseA.criticalCount > 0 ? 'suspected' : 'pass',
      shortcut_reliance: 'pass',
      bug_as_insight: 'pass',
      methodology_fabrication: 'pass',
      frame_lock: 'pass',
      citation_hallucination: phaseA.criticalCount > 2 ? 'suspected' : 'pass',
    };

    const suspectedModes = (Object.entries(modes) as [FailureMode, string][])
      .filter(([, status]) => status === 'suspected')
      .map(([mode]) => mode);

    return {
      modes,
      blocked: suspectedModes.length > 0,
      suspectedModes,
    };
  }

  async auditClaims(content: string, refs: Array<{ key: string; bibtex: string }>): Promise<ClaimAuditSummary> {
    const results: ClaimAuditResult[] = [];

    // Extract citations and their surrounding context
    const citeRegex = /\\cite\{([^}]+)\}/g;
    let match;
    while ((match = citeRegex.exec(content)) !== null) {
      const key = match[1].split(',')[0].trim();
      const contextStart = Math.max(0, match.index - 150);
      const contextEnd = Math.min(content.length, match.index + match[0].length + 50);
      const context = content.substring(contextStart, contextEnd).trim();

      const ref = refs.find((r) => r.key === key);
      const anchor: ClaimAnchor = { kind: 'none', value: '' };

      results.push({
        claimId: randomUUID(),
        claimText: context.slice(0, 200),
        citationKey: key,
        anchor,
        verdict: ref ? 'supported' : 'anchorless',
        confidence: ref ? 0.8 : 0.3,
      });
    }

    return {
      totalChecked: results.length,
      supported: results.filter((r) => r.verdict === 'supported').length,
      notSupported: results.filter((r) => r.verdict === 'not_supported').length,
      anchorless: results.filter((r) => r.verdict === 'anchorless').length,
      constraintViolations: results.filter((r) => r.verdict === 'negative_constraint_violation').length,
      results,
    };
  }
}
