// Peer Review Types — Multi-perspective review system

export type ReviewerRole = 'eic' | 'methodology' | 'domain' | 'perspective' | 'da';
export type ReviewVerdict = 'accept' | 'minor_revision' | 'major_revision' | 'reject';
export type ConsensusLevel = 'CONSENSUS_4' | 'CONSENSUS_3' | 'SPLIT' | 'DA_CRITICAL';
export type ReviewStage = 'field_analysis' | 'parallel_review' | 'synthesis' | 'coaching' | 'completed';
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'suggestion';

export interface ReviewFinding {
  id: string;
  dimension: string;
  severity: FindingSeverity;
  description: string;
  location?: string;
  suggestion?: string;
  consensus?: ConsensusLevel;
}

export interface ReviewerConfig {
  role: ReviewerRole;
  name: string;
  expertise: string;
  reviewFocus: string;
}

export interface ReviewerConfigCard {
  field: string;
  subField: string;
  paradigm: string;
  methodologyType: string;
  targetJournalTier: string;
  reviewers: ReviewerConfig[];
}

export interface ReviewReport {
  reviewerId: string;
  reviewerRole: ReviewerRole;
  reviewerName: string;
  expertise: string;
  scores: Record<string, number>; // 0-100 per dimension
  strengths: string[];
  weaknesses: string[];
  findings: ReviewFinding[];
  verdict: ReviewVerdict;
  confidence: number;
  summary: string;
  generatedAt: string;
}

export interface DevilsAdvocateReport extends ReviewReport {
  strongestCounterArgument: string;
  logicalFallacies: string[];
  alternativeExplanations: string[];
  stakeholderBlindSpots: string[];
  soWhatTest: string;
  concessionRate: number;
}

export interface RevisionItem {
  id: string;
  priority: 'P0' | 'P1' | 'P2';
  source: string; // reviewer role that raised it
  consensus: ConsensusLevel;
  description: string;
  suggestion: string;
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  authorResponse?: string;
}

export interface TraceabilityRow {
  issueId: string;
  reviewerComment: string;
  reviewerRole: ReviewerRole;
  consensus: ConsensusLevel;
  authorClaim: string;
  verified: boolean;
  verificationNotes?: string;
}

export interface EditorialDecision {
  decision: ReviewVerdict;
  consensusSummary: string;
  revisionRoadmap: RevisionItem[];
  traceabilityMatrix: TraceabilityRow[];
  daCriticalIssues: string[];
  editorNotes: string;
  generatedAt: string;
}

export interface RevisionRound {
  round: number;
  decision: ReviewVerdict;
  itemsAddressed: number;
  itemsRemaining: number;
  responseDocument?: string;
  timestamp: string;
}

export interface ReviewSession {
  id: string;
  paperId: string;
  stage: ReviewStage;
  round: number; // 1 = first review, 2 = re-review
  fieldAnalystConfig?: ReviewerConfigCard;
  reports: ReviewReport[];
  daReport?: DevilsAdvocateReport;
  editorialDecision?: EditorialDecision;
  revisionHistory: RevisionRound[];
  traceabilityMatrix: TraceabilityRow[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewStartRequest {
  paperId: string;
  paperContent: string;
  round?: number;
}

export interface ReReviewRequest {
  paperId: string;
  revisedContent: string;
  originalRoadmap: RevisionItem[];
  responseToReviewers?: string;
}
