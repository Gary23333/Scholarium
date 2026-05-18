// Material Passport & Process Summary Types

import type { ResearchBrief, MethodologyBlueprint } from './research.ts';
import type { ReviewSession, RevisionRound } from './review.ts';
import type { BibleEntry, CitationRecord, PaperOutline } from './index.ts';

export type ResetBoundaryKind = 'boundary' | 'resume';

export interface ResetBoundary {
  id: string;
  kind: ResetBoundaryKind;
  stage: number;
  hash: string;
  nextStage?: number;
  pendingDecision?: string;
  timestamp: string;
}

export interface MaterialPassport {
  paperId: string;
  currentStage: number;
  researchBrief?: ResearchBrief;
  methodology?: MethodologyBlueprint;
  outline?: PaperOutline;
  bible: BibleEntry[];
  citations: CitationRecord[];
  reviewSession?: ReviewSession;
  revisionHistory?: RevisionRound[];
  resetBoundaries: ResetBoundary[];
  hash: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollaborationQuality {
  directionSetting: number;        // 1-100 方向设定
  intellectualContribution: number; // 1-100 知识贡献
  qualityGatekeeping: number;       // 1-100 质量把关
  iterationDiscipline: number;      // 1-100 迭代纪律
  delegationEfficiency: number;     // 1-100 委托效率
  metaLearning: number;             // 1-100 元学习
}

export interface AISelfReflection {
  sycophancyRisk: 'low' | 'medium' | 'high';
  frameLockIncidents: number;
  convergencePattern: string;
  concessionRate: number;
  checkpointSkipRate: number;
  healthAlerts: number;
  ironyNote: string;
}

export interface StageLogEntry {
  stage: number;
  name: string;
  startedAt: string;
  completedAt: string;
  duration: number;
  status: 'completed' | 'skipped' | 'failed';
  notes?: string;
}

export interface ProcessSummary {
  paperId: string;
  title: string;
  collaborationQuality: CollaborationQuality;
  aiSelfReflection: AISelfReflection;
  stageLog: StageLogEntry[];
  totalDuration: number;
  generatedAt: string;
}

export interface Checkpoint {
  id: string;
  paperId: string;
  stageId: string;
  type: 'full' | 'slim' | 'mandatory';
  deliverables: string[];
  metrics: Record<string, { value: number | string; status: 'ok' | 'warning' | 'critical' }>;
  selfCheck: {
    citationIntegrity: boolean;
    sycophanticConcession: boolean;
    qualityTrajectory: boolean;
    scopeDiscipline: boolean;
    completeness: boolean;
  };
  requiresUserConfirmation: boolean;
  confirmed: boolean;
  confirmedAt?: string;
  createdAt: string;
}
