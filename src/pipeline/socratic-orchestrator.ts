// Socratic Orchestrator — Manages the 5-layer Socratic dialogue flow
import type { SocraticMentorAgent, SocraticMentorInput } from '../agents/socratic-mentor.ts';
import type { ResearchQuestionAgent } from '../agents/research-question.ts';
import type { MethodologyAgent } from '../agents/methodology.ts';
import type { ScholariumDB } from '../db/database.ts';
import type {
  SocraticSession, SocraticTurn, SocraticLayer, SocraticMode,
  DialogueHealth, ResearchBrief, MethodologyBlueprint,
} from '../types/index.ts';
import { randomUUID } from 'node:crypto';

export interface SocraticOrchestratorDeps {
  mentor: SocraticMentorAgent;
  rqAgent: ResearchQuestionAgent;
  methodologyAgent: MethodologyAgent;
  db: ScholariumDB;
}

export interface StartSessionResult {
  session: SocraticSession;
  firstMessage: string;
}

export interface RespondResult {
  reply: string;
  session: SocraticSession;
  newInsights: string[];
  commitmentGate?: { question: string; layer: SocraticLayer };
  layerChanged: boolean;
  healthAlert?: { dimension: string; message: string };
  sessionComplete: boolean;
  researchBrief?: ResearchBrief;
}

export class SocraticOrchestrator {
  private deps: SocraticOrchestratorDeps;

  constructor(deps: SocraticOrchestratorDeps) {
    this.deps = deps;
  }

  async startSession(paperId: string, topic: string, mode?: SocraticMode): Promise<StartSessionResult> {
    const detectedMode = mode ?? 'goal_oriented';
    const maxTurns = detectedMode === 'exploratory' ? 60 : 40;

    const session: SocraticSession = {
      id: randomUUID(),
      paperId,
      currentLayer: 1,
      mode: detectedMode,
      turns: [],
      insights: [],
      commitments: [],
      health: {
        persistentAgreement: false,
        conflictAvoidance: false,
        prematureConvergence: false,
        lastCheckedTurn: 0,
        agreementRatio: 0,
      },
      status: 'active',
      turnCount: 0,
      maxTurns,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to DB
    this.deps.db.createSocraticSession({
      id: session.id,
      paper_id: paperId,
      current_layer: 1,
      mode: detectedMode,
      turns: [],
      insights: [],
      commitments: [],
      status: 'active',
      turn_count: 0,
      max_turns: maxTurns,
    });

    // Generate first message
    const firstMessage = this.getFirstMessage(topic, detectedMode);

    return { session, firstMessage };
  }

  async respond(sessionId: string, userMessage: string, skipCommitment?: boolean): Promise<RespondResult> {
    // Load session from DB
    const dbSession = this.deps.db.getSocraticSession(sessionId);
    if (!dbSession) throw new Error(`Socratic session ${sessionId} not found`);
    if (dbSession.status !== 'active') throw new Error('Session is not active');

    const session = this.dbToSession(dbSession);
    const topic = this.getTopicFromSession(dbSession.paper_id);

    // Add user turn
    const userTurn: SocraticTurn = {
      id: randomUUID(),
      layer: session.currentLayer,
      role: 'user',
      content: userMessage,
      tags: [],
      timestamp: new Date().toISOString(),
    };
    session.turns.push(userTurn);
    session.turnCount++;

    // Check for commitment gate (layer transition)
    const shouldGate = !skipCommitment && this.shouldTriggerCommitmentGate(session);
    if (shouldGate) {
      const question = this.getCommitmentGateQuestion(session.currentLayer);
      this.saveSession(sessionId, session);
      return {
        reply: '',
        session,
        newInsights: [],
        commitmentGate: { question, layer: session.currentLayer },
        layerChanged: false,
        sessionComplete: false,
      };
    }

    // Call mentor agent
    const mentorInput: SocraticMentorInput = {
      topic,
      currentLayer: session.currentLayer,
      turns: session.turns,
      mode: session.mode,
      userMessage,
    };

    const mentorOutput = await this.deps.mentor.execute(mentorInput);

    // Add mentor turn
    const mentorTurn: SocraticTurn = {
      id: randomUUID(),
      layer: session.currentLayer,
      role: 'mentor',
      content: mentorOutput.reply,
      tags: mentorOutput.newTags,
      timestamp: new Date().toISOString(),
    };
    session.turns.push(mentorTurn);

    // Collect insights
    const newInsights: string[] = [];
    if (mentorOutput.insightExtracted) {
      session.insights.push(mentorOutput.insightExtracted);
      newInsights.push(mentorOutput.insightExtracted);
    }

    // Update health
    if (mentorOutput.healthAlert) {
      session.health.lastCheckedTurn = session.turnCount;
    }

    // Check layer advancement
    let layerChanged = false;
    if (mentorOutput.layerReadyToAdvance && session.currentLayer < 5) {
      session.currentLayer = (session.currentLayer + 1) as SocraticLayer;
      layerChanged = true;
    }

    // Check session completion
    let sessionComplete = false;
    let researchBrief: ResearchBrief | undefined;

    if (session.currentLayer > 5 || session.turnCount >= session.maxTurns) {
      session.status = 'completed';
      sessionComplete = true;

      // Generate RQ Brief
      researchBrief = await this.deps.rqAgent.execute({
        topic,
        insights: session.insights,
        commitments: session.commitments,
        turns: session.turns,
      });

      // Save research brief to paper
      this.deps.db.updatePaperResearchBrief(session.paperId, researchBrief);

      // Generate methodology
      const methodology = await this.deps.methodologyAgent.execute({
        topic,
        researchBrief,
      });
      this.deps.db.updatePaperMethodology(session.paperId, methodology);
    }

    // Save session
    this.saveSession(sessionId, session);

    return {
      reply: mentorOutput.reply,
      session,
      newInsights,
      layerChanged,
      healthAlert: mentorOutput.healthAlert,
      sessionComplete,
      researchBrief,
    };
  }

  async completeCommitment(sessionId: string, commitment: string): Promise<RespondResult> {
    const dbSession = this.deps.db.getSocraticSession(sessionId);
    if (!dbSession) throw new Error(`Session ${sessionId} not found`);

    const session = this.dbToSession(dbSession);

    // Save commitment
    session.commitments.push(commitment);

    // Add commitment turn
    const commitmentTurn: SocraticTurn = {
      id: randomUUID(),
      layer: session.currentLayer,
      role: 'user',
      content: commitment,
      tags: ['commitment'],
      timestamp: new Date().toISOString(),
    };
    session.turns.push(commitmentTurn);

    // Advance layer
    const previousLayer = session.currentLayer;
    if (session.currentLayer < 5) {
      session.currentLayer = (session.currentLayer + 1) as SocraticLayer;
    }

    // Generate divergence reveal
    const topic = this.getTopicFromSession(session.paperId);
    const divergeReply = this.getDivergenceReveal(previousLayer, commitment, topic);

    const divergeTurn: SocraticTurn = {
      id: randomUUID(),
      layer: session.currentLayer,
      role: 'mentor',
      content: divergeReply,
      tags: ['divergence'],
      timestamp: new Date().toISOString(),
    };
    session.turns.push(divergeTurn);

    this.saveSession(sessionId, session);

    return {
      reply: divergeReply,
      session,
      newInsights: [],
      layerChanged: true,
      sessionComplete: false,
    };
  }

  getSession(sessionId: string): SocraticSession | null {
    const dbSession = this.deps.db.getSocraticSession(sessionId);
    if (!dbSession) return null;
    return this.dbToSession(dbSession);
  }

  getSessionByPaper(paperId: string): SocraticSession | null {
    const dbSession = this.deps.db.getSocraticSessionByPaper(paperId);
    if (!dbSession) return null;
    return this.dbToSession(dbSession);
  }

  private dbToSession(db: any): SocraticSession {
    return {
      id: db.id,
      paperId: db.paper_id,
      currentLayer: db.current_layer,
      mode: db.mode,
      turns: db.turns ?? [],
      insights: db.insights ?? [],
      commitments: db.commitments ?? [],
      health: db.health ?? {
        persistentAgreement: false,
        conflictAvoidance: false,
        prematureConvergence: false,
        lastCheckedTurn: 0,
        agreementRatio: 0,
      },
      status: db.status,
      turnCount: db.turn_count ?? 0,
      maxTurns: db.max_turns ?? 40,
      createdAt: db.created_at,
      updatedAt: db.updated_at,
    };
  }

  private saveSession(sessionId: string, session: SocraticSession): void {
    this.deps.db.updateSocraticSession(sessionId, {
      current_layer: session.currentLayer,
      turns: session.turns,
      insights: session.insights,
      commitments: session.commitments,
      health: session.health,
      status: session.status,
      turn_count: session.turnCount,
    });
  }

  private getTopicFromSession(paperId: string): string {
    const paper = this.deps.db.getPaper(paperId);
    return paper?.research_topic || paper?.title || '未指定主题';
  }

  private getFirstMessage(topic: string, mode: SocraticMode): string {
    if (mode === 'exploratory') {
      return `你好！我注意到你对"${topic}"这个方向感兴趣。让我们一起探索一下——你现在对这个话题有什么初步想法？是什么让你对这个方向产生了兴趣？不用担心还没有清晰的研究问题，我们慢慢来梳理。`;
    }
    return `你好！让我们一起来明确你关于"${topic}"的研究方向。首先，请告诉我——你真正想回答的问题是什么？不是你想"研究"什么，而是你想"知道"什么？`;
  }

  private shouldTriggerCommitmentGate(session: SocraticSession): boolean {
    const layerTurns = session.turns.filter(t => t.layer === session.currentLayer && t.role === 'user');
    const hasInsight = session.turns.some(t => t.layer === session.currentLayer && t.tags.includes('insight'));
    return layerTurns.length >= 2 && hasInsight && session.turnCount % 4 === 0;
  }

  private getCommitmentGateQuestion(layer: SocraticLayer): string {
    const questions: Record<SocraticLayer, string> = {
      1: '在讨论方法论之前，你认为什么方法最适合回答你的研究问题？为什么？',
      2: '基于你的方法论选择，你预期会发现什么样的证据？',
      3: '现在我们讨论了证据——你认为审稿人最可能挑战你工作的哪个方面？',
      4: '你认为你的贡献与现有工作相比有多重要？',
      5: '如果你的研究成功，最直接的影响是什么？',
    };
    return questions[layer];
  }

  private getDivergenceReveal(layer: SocraticLayer, commitment: string, topic: string): string {
    const reveals: Record<SocraticLayer, string> = {
      1: `这是一个有趣的选择。我注意到你倾向于${commitment.slice(0, 30)}... 不过，我见过一些研究从完全不同的角度——比如跨学科视角——得出了令人惊讶的结论。你考虑过这种可能性吗？`,
      2: `你的预期很有道理。不过，实际数据有时会出人意料。如果结果与你的预期相反，你的方法能检测到这种差异吗？`,
      3: `这是一个诚实的自我评估。让我从另一个角度问——如果你的核心假设是错误的，你的研究设计能发现吗？`,
      4: `感谢你的评估。我来提一个可能的挑战：一位持相反观点的学者可能会说你的贡献是增量式的。你会如何回应？`,
      5: `这是很实际的影响。我想补充一点——有时候最大的影响来自我们没有预料到的方向。你的研究有没有可能被用于你没有预想的目的？`,
    };
    return reveals[layer];
  }
}
