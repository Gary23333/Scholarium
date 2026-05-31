export interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
}

export interface AgentModelConfig {
  agentName: string;
  providerId: string;
  model: string;
  temperature: number;
  taskType: 'creative' | 'factual' | 'audit' | 'extraction';
}

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

export interface BackendLLMConfig {
  providers: Record<string, { apiKey?: string; baseUrl?: string; models?: string[] }>;
  models: Record<string, ModelRoute>;
  fallbacks: Record<string, ModelFallback>;
}

export interface BackendConfigResponse {
  config: {
    llm: BackendLLMConfig;
  };
  routes: Record<string, { model: string }>;
  validation: { ok: boolean; errors: string[]; warnings: string[] };
}

export interface TestResult {
  ok: boolean;
  reply?: string;
  latency?: number;
  error?: string;
}

// ═══════════════════════════════════════════
// Socratic Research Guide
// ═══════════════════════════════════════════

export type SocraticLayer = 1 | 2 | 3 | 4 | 5;
export type SocraticMode = 'exploratory' | 'goal_oriented';

export interface FinerScore {
  feasible: number;
  interesting: number;
  novel: number;
  ethical: number;
  relevant: number;
}

export interface ResearchBrief {
  researchQuestion: string;
  finerScore: FinerScore;
  scopeBoundaries: { inScope: string[]; outOfScope: string[] };
  subQuestions: string[];
  summary: string;
  generatedAt: string;
}

export interface MethodologyBlueprint {
  paradigm: string;
  method: string;
  dataStrategy: string;
  analyticalFramework: string;
  validityCriteria: string[];
  samplingStrategy?: string;
  dataCollectionMethods?: string[];
  ethicalConsiderations?: string;
  generatedAt: string;
}

export interface SocraticTurn {
  id: string;
  layer: SocraticLayer;
  role: 'mentor' | 'user';
  content: string;
  tags: string[];
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
  status: 'active' | 'completed' | 'abandoned';
  turnCount: number;
  maxTurns: number;
  createdAt: string;
  updatedAt: string;
}

export interface SocraticStartResponse {
  sessionId: string;
  session: SocraticSession;
  firstMessage: string;
}

export interface SocraticRespondResponse {
  reply: string;
  session: SocraticSession;
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
