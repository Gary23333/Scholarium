import type { SectionWriteState } from '../types/index.ts';

export const VALID_TRANSITIONS: Record<SectionWriteState, SectionWriteState[]> = {
  pending: ['drafting'],
  drafting: ['auditing'],
  auditing: ['needs_fix', 'passed'],
  needs_fix: ['drafting', 'human_review', 'failed'],
  passed: ['reviewing', 'integrity_check'],
  failed: [],
  human_review: [],
  reviewing: ['revising', 'passed'],
  revising: ['rereview', 'passed'],
  integrity_check: ['passed', 'needs_fix'],
  rereview: ['revising', 'passed'],
};

export function canTransition(from: SectionWriteState, to: SectionWriteState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function resolveStateAfterRound(options: {
  round: number;
  maxRounds: number;
  auditOk: boolean;
  crossValOk: boolean;
  aiOk: boolean;
  integrityOk: boolean;
  aiChangedSignificantly: boolean;
}): SectionWriteState {
  const { round, maxRounds, auditOk, crossValOk, aiOk, integrityOk, aiChangedSignificantly } = options;
  const hasFailure = !auditOk || !crossValOk || !aiOk || !integrityOk || aiChangedSignificantly;
  if (hasFailure) return round < maxRounds - 1 ? 'needs_fix' : 'human_review';
  return 'passed';
}
