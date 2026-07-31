import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CartographerAgent, MindMapNode } from '../agents/cartographer.ts';
import type { LLMRouter } from '../llm/router.ts';
import type { PlannerAgent } from '../agents/planner.ts';
import type { ArchitectAgent } from '../agents/architect.ts';
import type { ComposerAgent } from '../agents/composer.ts';
import type { WriterAgent } from '../agents/writer.ts';
import type { ObserverAgent } from '../agents/observer.ts';
import type { NormalizerAgent } from '../agents/normalizer.ts';
import type { ReviserAgent } from '../agents/reviser.ts';
import type { SocraticMentorAgent } from '../agents/socratic-mentor.ts';
import type { ResearchQuestionAgent } from '../agents/research-question.ts';
import type { MethodologyAgent } from '../agents/methodology.ts';
import type { FieldAnalystAgent } from '../agents/field-analyst.ts';
import type { EditorInChiefAgent } from '../agents/editor-in-chief.ts';
import type { MethodologyReviewerAgent } from '../agents/methodology-reviewer.ts';
import type { DomainReviewerAgent } from '../agents/domain-reviewer.ts';
import type { PerspectiveReviewerAgent } from '../agents/perspective-reviewer.ts';
import type { DevilsAdvocateAgent } from '../agents/devils-advocate.ts';
import type { EditorialSynthesizerAgent } from '../agents/editorial-synthesizer.ts';
import type { SocraticOrchestrator } from '../pipeline/socratic-orchestrator.ts';
import type { ReviewOrchestrator } from '../review/orchestrator.ts';
import type { IntegrityGate } from '../integrity/gate.ts';
import type { PassportManager } from '../pipeline/passport.ts';
import type { CheckpointManager } from '../pipeline/checkpoint.ts';
import type { BibleManager } from '../bible/manager.ts';
import type { ScholariumDB } from '../db/database.ts';
import type { PaperOutline, Section, ScholariumConfig } from '../types/index.ts';
export interface MindMapSession {
  id: string;
  researchTopic: string;
  keywords: string[];
  targetJournal?: string;
  nodes: MindMapNode[];
  currentRound: number;
  status: string;
  createdAt: Date;
}

export interface PaperProject {
  id: string;
  title: string;
  targetJournal?: string;
  researchTopic?: string;
  contributionGaps?: string[];
  outline?: PaperOutline;
  sections: Section[];
  status: string;
  createdAt: string;
  directives?: Array<{
    id: string;
    paperId: string;
    sectionId: string | null;
    directive: string;
    action: string;
    priority: string;
    createdAt: string;
    applied: boolean;
  }>;
}

export interface ServerContext {
  db: ScholariumDB;
  bible: BibleManager;
  config: ScholariumConfig;
  router: LLMRouter;
  dataDir: string;
  port: number;
  staticDir?: string;

  mmSessions: Map<string, MindMapSession>;
  papers: Map<string, PaperProject>;
  sseClients: Map<string, ServerResponse[]>;

  cartographer: CartographerAgent;
  planner: PlannerAgent;
  architect: ArchitectAgent;
  composer: ComposerAgent;
  writer: WriterAgent;
  observer: ObserverAgent;
  normalizer: NormalizerAgent;
  reviser: ReviserAgent;
  socraticMentor: SocraticMentorAgent;
  researchQuestion: ResearchQuestionAgent;
  methodology: MethodologyAgent;
  socraticOrchestrator: SocraticOrchestrator;
  fieldAnalyst: FieldAnalystAgent;
  editorInChief: EditorInChiefAgent;
  methodologyReviewer: MethodologyReviewerAgent;
  domainReviewer: DomainReviewerAgent;
  perspectiveReviewer: PerspectiveReviewerAgent;
  devilsAdvocate: DevilsAdvocateAgent;
  editorialSynthesizer: EditorialSynthesizerAgent;
  reviewOrchestrator: ReviewOrchestrator;
  integrityGate: IntegrityGate;
  passportManager: PassportManager;
  checkpointManager: CheckpointManager;
  persistSection: (
    paperId: string,
    section: { id: string; sectionNumber: number; title: string; contentTex?: string; status: string },
  ) => void;
  hasLLMFor: (agent: string) => boolean;
}

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
