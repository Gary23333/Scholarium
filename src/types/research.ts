// Research Guidance Types — Socratic mentor, RQ Brief, Methodology Blueprint

export interface FinerScore {
  feasible: number;      // 1-5 可行性
  interesting: number;   // 1-5 趣味性
  novel: number;         // 1-5 新颖性
  ethical: number;       // 1-5 伦理性
  relevant: number;      // 1-5 相关性
}

export interface ScopeBoundaries {
  inScope: string[];
  outOfScope: string[];
}

export interface ResearchBrief {
  researchQuestion: string;
  finerScore: FinerScore;
  scopeBoundaries: ScopeBoundaries;
  subQuestions: string[];
  summary: string;
  generatedAt: string;
}

export type ResearchParadigm = 'positivist' | 'interpretivist' | 'pragmatist';
export type ResearchMethod = 'qualitative' | 'quantitative' | 'mixed';
export type DataStrategy = 'primary' | 'secondary' | 'both';

export interface MethodologyBlueprint {
  paradigm: ResearchParadigm;
  method: ResearchMethod;
  dataStrategy: DataStrategy;
  analyticalFramework: string;
  validityCriteria: string[];
  samplingStrategy?: string;
  dataCollectionMethods?: string[];
  ethicalConsiderations?: string;
  generatedAt: string;
}

export type SocraticLayer = 1 | 2 | 3 | 4 | 5;
export type SocraticMode = 'exploratory' | 'goal_oriented';
export type SocraticSessionStatus = 'active' | 'completed' | 'abandoned';

export const LAYER_NAMES: Record<SocraticLayer, string> = {
  1: '问题框架',
  2: '方法论反思',
  3: '证据推理',
  4: '观点评估',
  5: '影响后果',
};

export const LAYER_QUESTIONS: Record<SocraticLayer, string> = {
  1: '你想回答的真正问题是什么？',
  2: '你打算如何回答这个问题？',
  3: '什么样的证据能支持你的论点？',
  4: '审稿人最可能挑战什么？',
  5: '如果你的研究成功，世界会有什么不同？',
};

export type TurnRole = 'mentor' | 'user';
export type TurnTag = 'insight' | 'commitment' | 'challenge' | 'probe' | 'divergence' | 'health_alert';

export interface SocraticTurn {
  id: string;
  layer: SocraticLayer;
  role: TurnRole;
  content: string;
  tags: TurnTag[];
  timestamp: string;
}

export interface DialogueHealth {
  persistentAgreement: boolean;
  conflictAvoidance: boolean;
  prematureConvergence: boolean;
  lastCheckedTurn: number;
  agreementRatio: number;
}

export interface SocraticSession {
  id: string;
  paperId: string;
  currentLayer: SocraticLayer;
  mode: SocraticMode;
  turns: SocraticTurn[];
  insights: string[];
  commitments: string[];
  health: DialogueHealth;
  status: SocraticSessionStatus;
  turnCount: number;
  maxTurns: number;
  createdAt: string;
  updatedAt: string;
}

export interface SocraticStartRequest {
  paperId: string;
  mode?: SocraticMode;
}

export interface SocraticRespondRequest {
  message: string;
  skipCommitment?: boolean;
}

export interface SocraticRespondResponse {
  reply: string;
  layer: SocraticLayer;
  newInsights: string[];
  commitmentGate?: { question: string; layer: SocraticLayer };
  layerChanged: boolean;
  healthAlert?: { dimension: string; message: string };
  sessionComplete: boolean;
  researchBrief?: ResearchBrief;
}

export interface SocraticSummaryResponse {
  session: SocraticSession;
  insights: string[];
  commitments: string[];
  researchBrief?: ResearchBrief;
  methodology?: MethodologyBlueprint;
}
