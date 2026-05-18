// Scholarium — 统一类型定义
// 合并自 01-core-infra/shared, 02-pipeline-agents, 04-librarian-rag, 05-quality-audit-antiai, 06-latex-publisher-cli

// ═══════════════════════════════════════════════════════════════
// Bible & Core Entities
// ═══════════════════════════════════════════════════════════════

export type BibleCategory =
  | 'data'
  | 'terminology'
  | 'citations'
  | 'experiments'
  | 'formulas'
  | 'claims'
  | 'figures'
  | 'variables'
  | 'arguments';

export const BIBLE_CATEGORIES: BibleCategory[] = [
  'data', 'terminology', 'citations', 'experiments',
  'formulas', 'claims', 'figures', 'variables', 'arguments',
];

export interface BibleEntry {
  id: string;
  paperId: string;
  category: BibleCategory;
  key: string;
  value: string;
  sourceSectionId?: string;
  sourceType: 'user' | 'agent' | 'api' | 'import';
  sourceArtifactVersion: number;
  confidence: number;
  approvalStatus: 'approved' | 'needs_human_review' | 'rejected';
  supersedesEntryId?: string;
  immutable: boolean;
}

export interface Paper {
  id: string;
  title: string;
  targetJournal?: string;
  status: 'draft' | 'writing' | 'reviewing' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Section {
  id: string;
  paperId: string;
  sectionNumber: number;
  title: string;
  contentTex?: string;
  status: SectionWriteState;
  version: number;
}

export type SectionWriteState =
  | 'pending'
  | 'drafting'
  | 'auditing'
  | 'needs_fix'
  | 'passed'
  | 'failed'
  | 'human_review'
  | 'reviewing'
  | 'revising'
  | 'integrity_check'
  | 'rereview';

// ═══════════════════════════════════════════════════════════════
// Pipeline & Agent
// ═══════════════════════════════════════════════════════════════

export interface Agent<I, O> {
  readonly name: string;
  execute(input: I, options?: AgentOptions): Promise<O>;
}

export interface AgentOptions {
  mock?: boolean;
  mockDelayMs?: number;
  metadata?: Record<string, unknown>;
}

export type PipelinePhase =
  | 'socratic' | 'planning' | 'architecting' | 'writing' | 'observing'
  | 'normalizing' | 'auditing' | 'anti_ai' | 'integrity_check'
  | 'integrity_gate' | 'review' | 'revision' | 'rereview'
  | 'saving' | 'full_paper_audit' | 'latex_compile' | 'finalizing'
  | 'process_summary';

export interface PipelineRun {
  id: string;
  paperId: string;
  currentPhase: PipelinePhase;
  currentStep: string;
  status: 'running' | 'paused' | 'failed' | 'completed' | 'human_review';
  currentStage: number;
  artifactVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// Planner & Architect
// ═══════════════════════════════════════════════════════════════

export interface ConfirmedFocus {
  researchTopic: string;
  selectedBranches: string[];
  confirmedNodes: Array<{ id: string; label: string; depth: number }>;
  contributionGaps: string[];
}

export interface JournalProfile {
  journalName: string;
  formatRequirements?: Record<string, unknown>;
  pageLimit?: number;
  avgCitationCount?: number;
}

export interface PaperOutline {
  title: string;
  sections: OutlineSection[];
}

export interface OutlineSection {
  id: string;
  title: string;
  coreArgument: string;
  estimatedPages: number;
  requiredCitations: number;
  parent: string | null;
  mustKeep?: string[];
  forbidden?: string[];
  primaryGoal?: string;
}

export interface SectionBlueprint {
  sectionId: string;
  sectionTitle: string;
  paragraphs: ParagraphBlueprint[];
  estimatedWords: number;
  requiredFormulas?: string[];
  requiredFigures?: string[];
}

export interface ParagraphBlueprint {
  id: string;
  order: number;
  coreSentence: string;
  purpose: 'background' | 'motivation' | 'method' | 'result' | 'discussion' | 'transition';
  requiredCitations?: string[];
}

// ═══════════════════════════════════════════════════════════════
// Composer & Writer
// ═══════════════════════════════════════════════════════════════

export interface ContextPackage {
  outline: PaperOutline;
  currentSection: OutlineSection;
  bibleSnapshot: BibleEntry[];
  citationPool: CitationPoolEntry[];
  previousSections?: Array<{ id: string; title: string; summary: string }>;
  fixInstructions?: FixInstructions;
  previousDraft?: string;
}

export interface CitationPoolEntry {
  citeKey: string;
  bibtex: string;
  doi?: string;
  verified: boolean;
  approvalStatus: 'approved' | 'needs_human_review';
}

export interface WriterInput {
  blueprint: SectionBlueprint;
  context: ContextPackage;
  previousDraft?: string;
}

export interface WriterOutput {
  texContent: string;
  wordCount: number;
  usedCitations: string[];
}

// ═══════════════════════════════════════════════════════════════
// Observer & Normalizer
// ═══════════════════════════════════════════════════════════════

export interface ObserverExtraction {
  entries: BibleEntryInput[];
  protectedSpans: ProtectedSpan[];
}

export interface BibleEntryInput {
  category: BibleCategory;
  key: string;
  value: string;
  confidence: number;
}

export interface ProtectedSpan {
  type: 'formula' | 'data' | 'citation' | 'variable';
  start: number;
  end: number;
  content: string;
}

export interface NormalizerInput {
  draft: string;
  targetWordCount: number;
  currentWordCount: number;
  bibleEntries: BibleEntry[];
}

export interface NormalizedChange {
  category: BibleCategory;
  key: string;
  oldValue: string;
  newValue: string;
  sourceSectionId: string;
  reason: string;
}

export interface NormalizeResult {
  normalizedDraft: string;
  newWordCount: number;
  changes: NormalizedChange[];
  overBudgetRatio: number;
  needsArchitectFeedback: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Fix Instructions
// ═══════════════════════════════════════════════════════════════

export interface FixInstructions {
  instruction: string;
  round: number;
  citationReport?: CitationFixReport;
  auditReport?: AuditFixReport;
  crossValidationDisputes?: CrossValidationDispute[];
  aiScore?: AIScoreFixInfo;
  protectedSpans?: ProtectedSpan[];
  violations?: IntegrityViolation[];
}

export interface CitationFixReport {
  fabricatedCitations: string[];
  unverifiedCitations: string[];
  suggestedReplacements: Array<{ original: string; replacement: string }>;
}

export interface AuditFixReport {
  criticals: AuditFinding[];
  warnings: AuditFinding[];
  infos: AuditFinding[];
}

export interface AuditFinding {
  dimension: string;
  severity: 'critical' | 'warning' | 'info';
  finding: string;
  location?: string;
  voteCount?: number;
}

export interface CrossValidationDispute {
  claim: string;
  type: 'numerical' | 'comparison' | 'theorem' | 'citation_semantic';
  verdictA: string;
  verdictB: string;
  needsHumanReview: boolean;
}

export interface AIScoreFixInfo {
  overall: number;
  threshold: number;
  highRiskSpans: Array<{ start: number; end: number; reason: string }>;
}

export interface IntegrityViolation {
  type: 'formula' | 'data' | 'citation' | 'variable' | 'terminology';
  expected: string;
  actual: string;
  location: string;
}

// ═══════════════════════════════════════════════════════════════
// Input Governance
// ═══════════════════════════════════════════════════════════════

export type GovernanceRule =
  | 'no_fabricated_citations'
  | 'no_method_result_confusion'
  | 'must_reference_bible_facts'
  | 'no_undefined_terms'
  | 'no_self_references'
  | 'no_empty_transitions'
  | 'data_precision_check';

export interface GovernanceViolation {
  rule: GovernanceRule;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  location?: string;
  suggestion?: string;
}

export interface GovernanceResult {
  passed: boolean;
  violations: GovernanceViolation[];
  stats: { critical: number; warning: number; info: number };
}

// ═══════════════════════════════════════════════════════════════
// Length Governance
// ═══════════════════════════════════════════════════════════════

export type LengthCountMode = 'char' | 'word' | 'sentence' | 'paragraph';

export interface LengthGovernanceConfig {
  mode: LengthCountMode;
  targetMin: number;
  targetMax: number;
  hardCap: number;
  strategy: 'compress_when_over' | 'expand_when_under' | 'warn_only' | 'enforce_hard_cap';
}

export interface LengthGovernanceResult {
  passed: boolean;
  originalCount: number;
  finalCount: number;
  ratio: number;
  action: 'none' | 'compressed' | 'expanded' | 'warned';
  messages: string[];
}

// ═══════════════════════════════════════════════════════════════
// Interactive Status
// ═══════════════════════════════════════════════════════════════

export interface SectionStatusReport {
  sectionId: string;
  title: string;
  status: SectionWriteState;
  version: number;
  wordCount: number;
  auditFindings: number;
  aiScore?: number;
}

export const RiskLevel = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
} as const;
export type RiskLevel = number;

export function assessContentRisk(text: string): RiskLevel {
  let score: RiskLevel = RiskLevel.LOW;
  if (/\\cite\{[^}]+\}/.test(text)) score = Math.max(score, RiskLevel.MEDIUM);
  if (/\b\d+\.?\d*\s*%?\b/.test(text) && /accuracy|rate|score|improvement|higher|lower/.test(text)) {
    score = Math.max(score, RiskLevel.HIGH);
  }
  if (/\b(outperforms|surpasses|better than|superior to|compared to)\b/i.test(text)) {
    score = Math.max(score, RiskLevel.HIGH);
  }
  if (/\b(we propose|our contribution|novel|state.of.the.art|SOTA)\b/i.test(text)) {
    score = Math.max(score, RiskLevel.CRITICAL);
  }
  return score;
}

// ═══════════════════════════════════════════════════════════════
// Citation / Librarian
// ═══════════════════════════════════════════════════════════════

export type CitationSource = 'user' | 'semantic_scholar' | 'arxiv' | 'crossref' | 'dblp';
export type CitationApprovalStatus = 'approved' | 'needs_human_review' | 'rejected';

export interface CitationRecord {
  id: string;
  paperId: string;
  citeKey: string;
  bibtex: string;
  doi: string | null;
  title: string | null;
  authors: string | null;
  year: number | null;
  verified: boolean;
  approvalStatus: CitationApprovalStatus;
  source: CitationSource;
  matchConfidence: number;
  lastVerifiedAt: string | null;
  embedding: number[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface CitationValidationResult {
  ok: boolean;
  fabricatedCitations: string[];
  unverifiedCitations: string[];
  semanticMismatches: Array<{ citeKey: string; similarity: number }>;
}

export interface CitationValidationReport {
  draftSectionId: string;
  validatedAt: string;
  citationsChecked: CheckedCitation[];
  fabricatedCitations: FabricatedCitation[];
  semanticMismatches: CitationSemanticMatch[];
  summary: ValidationSummary;
}

export interface CheckedCitation {
  citeKey: string;
  context: string;
  status: 'verified' | 'fabricated' | 'pending_approval' | 'error';
  localRecordId: string | null;
  externalMatches: LiteratureSearchResult[];
  semanticMatchPassed: boolean | null;
  semanticSimilarity: number | null;
}

export interface FabricatedCitation {
  citeKey: string;
  context: string;
  severity: 'critical';
  suggestedAction: 'rewrite_with_approved' | 'search_external';
  diagnosis: string;
}

export interface CitationSemanticMatch {
  citeKey: string;
  citeContext: string;
  abstractSnippet: string;
  similarity: number;
  belowThreshold: boolean;
  suggestion: string;
}

export interface ValidationSummary {
  totalCitations: number;
  approvedCount: number;
  pendingCount: number;
  fabricatedCount: number;
  semanticMismatchCount: number;
  criticalCount: number;
}

export type LiteratureSource = 'semantic_scholar' | 'arxiv' | 'crossref' | 'dblp';

export interface LiteratureSearchResult {
  source: LiteratureSource;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  abstract: string | null;
  url: string | null;
  sourceId: string;
  confidence: number;
  bibtex: string | null;
}

// ═══════════════════════════════════════════════════════════════
// Audit
// ═══════════════════════════════════════════════════════════════

export type AuditDimension =
  | 'logic_consistency' | 'citation_integrity' | 'terminology_consistency'
  | 'data_veracity' | 'math_correctness' | 'structure_integrity'
  | 'academic_format' | 'language_quality'
  | 'claim_evidence_chain' | 'inter_section_consistency'
  | 'narrative_flow' | 'novelty_alignment' | 'data_fidelity';

export type VoteConsensus = 'confirmed' | 'probable' | 'possible';
export type Severity = 'critical' | 'warning' | 'info';

export interface AuditInput {
  sectionId: string;
  draft: string;
  bibleSummary: {
    terminology: Array<{ key: string; value: string }>;
    citationMap: Array<{ key: string; value: string }>;
    dataPoints: Array<{ key: string; value: string }>;
  };
  mockMode?: boolean;
}

export interface AuditFindingFull {
  id: string;
  dimension: AuditDimension;
  severity: Severity;
  description: string;
  location?: string;
  foundBy: ('A' | 'B' | 'C')[];
  consensus: VoteConsensus;
  suggestion?: string;
  status: 'open' | 'fixed' | 'dismissed';
  relatedBibleKeys?: string[];
}

export interface AuditReport {
  reportId: string;
  sectionId: string;
  version: number;
  masterModel: string;
  findings: AuditFindingFull[];
  stats: { critical: number; warning: number; info: number };
  dimensionStats: Record<AuditDimension, { count: number; critical: number }>;
  fixInstructions: AuditFixInstructions;
  passed: boolean;
  elapsedMs: number;
  mockMode: boolean;
}

export interface AuditFixInstructions {
  instruction: string;
  issues: Array<{
    findingId: string;
    dimension: AuditDimension;
    severity: Severity;
    description: string;
    location?: string;
    suggestion?: string;
  }>;
  protectedConstraints?: Array<{
    type: 'citation' | 'formula' | 'data' | 'variable';
    spanStart: number;
    spanEnd: number;
    originalText: string;
    reason: string;
  }>;
}

export interface SubAuditAssignment {
  subId: 'A' | 'B' | 'C';
  model: string;
  primaryDimensions: AuditDimension[];
  secondaryDimensions: AuditDimension[];
  focusHint: string;
}

export interface SubAuditReport {
  subId: 'A' | 'B' | 'C';
  model: string;
  findings: AuditFindingFull[];
  elapsedMs: number;
  mockMode: boolean;
}

export interface AuditResult {
  ok: boolean;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  fixInstructions: AuditFixReport;
}

// ═══════════════════════════════════════════════════════════════
// Anti-AI
// ═══════════════════════════════════════════════════════════════

export interface DetectionConfig {
  weights: { pattern: number; burstiness: number; perplexity: number; ngramDiversity: number; semanticConsistency: number; stylisticFingerprint: number };
  threshold: number;
  maxRewriteRounds: number;
  mockMode?: boolean;
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  weights: { pattern: 0.2, burstiness: 0.2, perplexity: 0.2, ngramDiversity: 0.15, semanticConsistency: 0.1, stylisticFingerprint: 0.15 },
  threshold: 0.5,
  maxRewriteRounds: 3,
  mockMode: false,
};

export interface AIScoreReport {
  overall: number;
  confidence: number;
  details: {
    patternScore: number;
    burstinessScore: number;
    perplexityScore: number;
    ngramDiversityScore: number;
    semanticConsistencyScore: number;
    stylisticFingerprintScore: number;
  };
  suggestions: string[];
  highRiskSpans: HighRiskSpan[];
  configSnapshot: DetectionConfig;
  mockMode: boolean;
}

export interface HighRiskSpan {
  id: string;
  start: number;
  end: number;
  text: string;
  triggeredBy: string[];
  localScore: number;
  reason: string;
}

export interface AIPatternRule {
  id: string;
  pattern: string | RegExp;
  matchType: 'exact' | 'regex';
  weight: number;
  reason: string;
  lang: 'zh' | 'en';
}

export interface RewriterInput {
  text: string;
  highRiskSpans: HighRiskSpan[];
  protectedSpans: ProtectedSpanForRewrite[];
}

export interface ProtectedSpanForRewrite {
  id: string;
  type: 'citation' | 'formula' | 'data' | 'variable' | 'terminology';
  start: number;
  end: number;
  text: string;
  normalizedKey: string;
}

export interface RewriteResult {
  rewrittenText: string;
  diff: RewriteDiffReport;
  round: number;
  postScore: AIScoreReport;
  passed: boolean;
}

export interface RewriteDiffReport {
  textChangeRatio: number;
  protectedContentChanged: boolean;
  changes: TextChange[];
  protectedChanges: Array<{ type: string; oldText: string; newText: string; location?: string }>;
}

export interface TextChange {
  type: 'modified' | 'added' | 'removed';
  start: number;
  end: number;
  oldText: string;
  newText: string;
}

// ═══════════════════════════════════════════════════════════════
// Integrity
// ═══════════════════════════════════════════════════════════════

export interface BibleEntryStub {
  id: string;
  category: BibleCategory;
  key: string;
  value: string;
  immutable: boolean;
}

export interface ProtectedContentIntegrityReport {
  passed: boolean;
  violations: Array<{
    type: 'citation' | 'formula' | 'data' | 'variable' | 'terminology';
    expected: string;
    actual: string;
    location?: string;
  }>;
  stats: {
    totalChecked: number;
    unchanged: number;
    modified: number;
    removed: number;
    added: number;
  };
}

export interface ProtectedContentExtract {
  citations: ProtectedSpanForRewrite[];
  formulas: ProtectedSpanForRewrite[];
  dataPoints: ProtectedSpanForRewrite[];
  variables: ProtectedSpanForRewrite[];
  terminologies: ProtectedSpanForRewrite[];
}

// ═══════════════════════════════════════════════════════════════
// LaTeX & Publisher
// ═══════════════════════════════════════════════════════════════

export type SectionStatus = SectionWriteState;

export interface SectionRef {
  id: string;
  number: number;
  title: string;
  texPath: string;
  status: SectionStatus;
  version: number;
}

export interface FigurePlaceholder {
  id: string;
  caption: string;
  label: string;
  width?: string;
  filePath?: string;
}

export interface AppendixItem {
  id: string;
  title: string;
  content: string;
}

export interface LatexDocumentClass {
  name: string;
  options: string;
}

export interface LatexProject {
  rootDir: string;
  title: string;
  authors: string[];
  targetJournal?: string;
  documentClass: LatexDocumentClass;
  sections: SectionRef[];
  bibFile?: string;
  figures: FigurePlaceholder[];
  appendices: AppendixItem[];
  templateId: string;
  config: ScholariumProjectConfig;
}

export interface ScholariumProjectConfig {
  paperId: string;
  title: string;
  authors: string[];
  createdAt: string;
  updatedAt: string;
  templateId: string;
  targetJournal?: string;
}

export interface LatexTemplate {
  id: string;
  name: string;
  description: string;
  documentClass: LatexDocumentClass;
  preamble: string;
  titlePageTemplate: string;
  sectionIncludeTemplate: string;
  bibliographyTemplate: string;
  figureTemplate: string;
  builtin: boolean;
}

export interface CompileResult {
  ok: boolean;
  pdfPath?: string;
  rawLog: string;
  errors: CompileError[];
  warnings: CompileWarning[];
  durationMs: number;
  engine: 'tectonic' | 'pdflatex' | 'xelatex' | 'lualatex';
  timestamp: string;
}

export interface CompileError {
  type: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  context?: string;
  suggestion?: string;
}

export interface CompileWarning {
  message: string;
  file?: string;
  line?: number;
  type: 'overfull' | 'underfull' | 'reference' | 'citation' | 'font' | 'other';
}

export interface FullPaper {
  title: string;
  authors: string[];
  sections: SectionRef[];
  sectionContents: Record<string, string>;
  bibFilePath?: string;
  figures: FigurePlaceholder[];
  appendices: AppendixItem[];
  templateId?: string;
}

export interface PublishResult {
  ok: boolean;
  outputDir: string;
  pdfPath?: string;
  mainTexPath: string;
  artifacts: PublishArtifact[];
  compileResult?: CompileResult;
  error?: string;
}

export interface PublishArtifact {
  path: string;
  type: 'pdf' | 'tex' | 'bib' | 'log' | 'aux' | 'other';
  sizeBytes: number;
}

export interface CliCommandResult {
  success: boolean;
  command: string;
  message: string;
  error?: string;
  data?: unknown;
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════

export interface ModelRoute {
  agent: string;
  model: string;
  temperature: number;
  taskType: 'creative' | 'factual' | 'audit' | 'extraction';
}

export interface ModelFallback {
  primary: string;
  fallback: string[];
  allowDegraded: boolean;
}

export interface ScholariumConfig {
  project: {
    name: string;
    description?: string;
    targetJournal?: string;
  };
  paths: {
    root: string;
    sections: string;
    bible: string;
    citations: string;
    output: string;
    templates: string;
  };
  llm: {
    providers: Record<string, { apiKey?: string; baseUrl?: string; models?: string[] }>;
    models: Record<string, ModelRoute>;
    fallbacks: Record<string, ModelFallback>;
  };
  bible: {
    categories: BibleCategory[];
    requireApproval: boolean;
  };
  pipeline: {
    maxAuditRounds: number;
    maxAntiAiRounds: number;
    humanReviewTimeout: number;
  };
}

export interface HumanReviewTask {
  id: string;
  paperId: string;
  sectionId?: string;
  taskType: 'mindmap' | 'citation' | 'data' | 'ai_score' | 'audit';
  payload: string;
  status: 'open' | 'approved' | 'rejected' | 'resolved';
  createdAt: Date;
  resolvedAt?: Date;
}

export interface ArtifactVersion {
  id: string;
  paperId: string;
  version: number;
  createdAt: Date;
  description?: string;
}

// ═══════════════════════════════════════════════════════════════
// Re-exports from sub-modules
// ═══════════════════════════════════════════════════════════════

export type {
  ResearchBrief, MethodologyBlueprint, FinerScore, ScopeBoundaries,
  SocraticSession, SocraticTurn, SocraticLayer, SocraticMode,
  DialogueHealth, SocraticSessionStatus, TurnRole, TurnTag,
  SocraticStartRequest, SocraticRespondRequest, SocraticRespondResponse,
  SocraticSummaryResponse,
} from './research.ts';

export type {
  ReviewReport, ReviewSession, EditorialDecision, RevisionItem,
  TraceabilityRow, ReviewerConfig, ReviewerConfigCard, ReviewFinding,
  DevilsAdvocateReport, RevisionRound, ReviewVerdict, ConsensusLevel,
  ReviewStage, ReviewerRole, FindingSeverity, ReviewStartRequest, ReReviewRequest,
} from './review.ts';

export type {
  IntegrityGateResult, FailureModeReport, VerificationResult,
  IntegrityPhaseResult, ClaimAuditResult, ClaimAuditSummary,
  FailureMode, FailureModeStatus, VerificationVerdict, IntegrityPhase,
  ClaimAnchor,
} from './integrity.ts';

export type {
  MaterialPassport, ProcessSummary, CollaborationQuality,
  AISelfReflection, StageLogEntry, Checkpoint, ResetBoundary,
  ResetBoundaryKind,
} from './passport.ts';

// ═══════════════════════════════════════════════════════════════
// Agent Loop
// ═══════════════════════════════════════════════════════════════

export type AgentLoopAction =
  | 'write_section'
  | 'audit_section'
  | 'revise_section'
  | 'check_bible'
  | 'get_status';

export interface AgentLoopStep {
  action: AgentLoopAction;
  sectionId: string;
  sectionTitle: string;
  round: number;
  timestamp: string;
  result: 'success' | 'failure' | 'skipped';
  detail?: string;
}

export interface AgentLoopSectionState {
  sectionId: string;
  status: SectionWriteState;
  version: number;
  iterations: number;
  lastAction?: AgentLoopAction;
}

export interface AgentLoopState {
  paperId: string;
  steps: AgentLoopStep[];
  sectionStates: AgentLoopSectionState[];
  currentIteration: number;
  maxIterations: number;
  terminated: boolean;
  terminationReason?: string;
}

export interface AgentLoopOptions {
  mock?: boolean;
  maxIterations?: number;
  taskId?: string;
  taskManager?: any;
  skipAntiAI?: boolean;
}
