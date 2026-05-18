// Integrity Verification Types

export type VerificationVerdict = 'verified' | 'not_found' | 'mismatch' | 'suspected_fabrication';
export type FailureModeStatus = 'pass' | 'suspected' | 'insufficient_evidence';
export type IntegrityPhase = 'A' | 'B' | 'C' | 'D' | 'E';

export type FailureMode =
  | 'implementation_bug'
  | 'hallucinated_results'
  | 'shortcut_reliance'
  | 'bug_as_insight'
  | 'methodology_fabrication'
  | 'frame_lock'
  | 'citation_hallucination';

export const FAILURE_MODE_LABELS: Record<FailureMode, string> = {
  implementation_bug: '实施 Bug',
  hallucinated_results: '幻觉结果',
  shortcut_reliance: '捷径依赖',
  bug_as_insight: 'Bug-as-Insight',
  methodology_fabrication: '方法论伪造',
  frame_lock: '框架锁定',
  citation_hallucination: '引用幻觉',
};

export const PHASE_LABELS: Record<IntegrityPhase, string> = {
  A: '参考文献验证',
  B: '引用上下文验证',
  C: '统计数据验证',
  D: '原创性验证',
  E: '声明验证',
};

export interface VerificationResult {
  target: string;
  verdict: VerificationVerdict;
  details: string;
  source?: string;
  confidence: number;
}

export interface IntegrityPhaseResult {
  phase: IntegrityPhase;
  checks: VerificationResult[];
  passed: boolean;
  criticalCount: number;
  warningCount: number;
}

export interface FailureModeReport {
  modes: Record<FailureMode, FailureModeStatus>;
  blocked: boolean;
  suspectedModes: FailureMode[];
  overrideReason?: string;
  overrideBy?: string;
  overrideAt?: string;
}

export interface IntegrityGateResult {
  id: string;
  paperId: string;
  gateType: 'pre_review' | 'final_check';
  phases: {
    A: IntegrityPhaseResult;
    B: IntegrityPhaseResult;
    C: IntegrityPhaseResult;
    D: IntegrityPhaseResult;
    E: IntegrityPhaseResult;
  };
  failureModes: FailureModeReport;
  overallPassed: boolean;
  criticalIssues: string[];
  warnings: string[];
  correctionList: string[];
  createdAt: string;
}

export interface ClaimAnchor {
  kind: 'quote' | 'page' | 'section' | 'paragraph' | 'none';
  value: string;
}

export interface ClaimAuditResult {
  claimId: string;
  claimText: string;
  citationKey: string;
  anchor: ClaimAnchor;
  verdict: 'supported' | 'not_supported' | 'anchorless' | 'negative_constraint_violation';
  confidence: number;
  retrievedExcerpt?: string;
}

export interface ClaimAuditSummary {
  totalChecked: number;
  supported: number;
  notSupported: number;
  anchorless: number;
  constraintViolations: number;
  results: ClaimAuditResult[];
}
