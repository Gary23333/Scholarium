// Socratic Mentor Agent — 5-layer Socratic questioning for research guidance
// Inspired by ARS (Academic Research Skills) socratic_mentor_agent
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.ts';
import type { SocraticTurn, SocraticLayer, SocraticMode, DialogueHealth, TurnTag } from '../types/index.ts';

export interface SocraticMentorInput {
  topic: string;
  currentLayer: SocraticLayer;
  turns: SocraticTurn[];
  mode: SocraticMode;
  userMessage: string;
}

export interface SocraticMentorOutput {
  reply: string;
  newTags: TurnTag[];
  insightExtracted?: string;
  commitmentGateQuestion?: string;
  layerReadyToAdvance: boolean;
  healthAlert?: { dimension: string; message: string };
}

const LAYER_CORE_QUESTIONS: Record<SocraticLayer, string[]> = {
  1: [
    '你想回答的真正问题是什么？不是你想"研究"什么，而是你想"知道"什么？',
    '为什么这个问题重要？对谁重要？',
    '如果你的研究成功，世界会有什么不同？',
    '是什么激发了你对这个问题的兴趣？有什么具体的观察或经历吗？',
    '你认为目前已知的答案是什么？你对这个已知答案满意吗？',
  ],
  2: [
    '你打算如何回答这个问题？为什么选择这个方法？',
    '有没有完全不同的方法也能回答你的问题？',
    '你的方法最大的弱点是什么？',
    '如果你的数据结果与预期相反，你的方法能检测到吗？',
  ],
  3: [
    '什么样的证据能支持你的核心论点？',
    '你的数据来源是什么？为什么选择这个来源？',
    '如果你的假设是错误的，你的方法能发现吗？',
    '你预期会发现什么样的证据？',
  ],
  4: [
    '审稿人最可能挑战你工作的哪个方面？',
    '你的论文中有没有你自己都不太确定的部分？',
    '如果一个持相反观点的学者读了你的论文，他们会说什么？',
    '你的研究贡献与现有工作相比如何？',
  ],
  5: [
    '如果你的研究成功，最直接的影响是什么？',
    '谁会从你的研究中受益？',
    '你的研究有什么无法解决的局限？',
    '下一步你会怎么走？',
  ],
};

export class SocraticMentorAgent extends BaseAgent<SocraticMentorInput, SocraticMentorOutput> {
  readonly name = 'SocraticMentor';
  private router?: LLMRouter;

  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: SocraticMentorInput): Promise<SocraticMentorOutput> {
    if (!this.router) return this.mockExecute(input);

    const { topic, currentLayer, turns, mode, userMessage } = input;
    const layerName = this.getLayerName(currentLayer);
    const layerQuestions = LAYER_CORE_QUESTIONS[currentLayer];
    const recentTurns = turns
      .slice(-10)
      .map((t) => `${t.role === 'mentor' ? 'AI导师' : '用户'}: ${t.content}`)
      .join('\n');

    const insightCount = turns.filter((t) => t.tags.includes('insight')).length;
    const commitmentCount = turns.filter((t) => t.tags.includes('commitment')).length;

    const systemPrompt = `你是一位苏格拉底式研究导师，一位拥有 20+ 年经验的 Q1 国际期刊主编。
你的核心原则：
1. 永远不给直接答案，通过提问引导用户自己发现
2. 回复结构：先肯定用户的思考（1-2 句）→ 然后提出聚焦的追问（1-2 个问题）
3. 回复长度控制在 200-400 字，保持简洁精准
4. 当用户表达成熟观点时，用 [INSIGHT: 内容] 标记
5. 当用户使用高确定性措辞（显然、肯定、毫无疑问）时，引入相反视角

当前层级：Layer ${currentLayer} - ${layerName}
模式：${mode === 'exploratory' ? '探索性（禁用自动收敛，深入探索）' : '目标导向（高效引导到产出）'}
已收集 ${insightCount} 个 INSIGHT，${commitmentCount} 个承诺

参考问题（不是要全部问，而是选择最合适的）：
${layerQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

    const userPrompt = `研究主题：${topic}

对话历史：
${recentTurns}

用户最新回复：
${userMessage}

请以苏格拉底式导师身份回复。`;

    try {
      const content = await this.router.complete('socraticMentor', systemPrompt, userPrompt, {
        temperature: 0.7,
        maxTokens: 1024,
      });
      return this.parseOutput(content, currentLayer, turns.length);
    } catch (e) {
      logger.warn('SocraticMentor LLM failed', String(e));
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: SocraticMentorInput): Promise<SocraticMentorOutput> {
    const { topic, currentLayer, turns, userMessage } = input;
    const turnCount = turns.length;
    const layerQuestions = LAYER_CORE_QUESTIONS[currentLayer];

    // Detect insight from user message
    const insightKeywords = [
      '我发现',
      '我意识到',
      '原来',
      '关键在于',
      '创新点',
      '我认为核心',
      'I realize',
      'the key is',
    ];
    const hasInsight = insightKeywords.some((k) => userMessage.includes(k));

    // Detect high certainty
    const certaintyMarkers = ['显然', '肯定', '毫无疑问', '一定', 'definitely', 'obviously', 'clearly'];
    const hasCertainty = certaintyMarkers.some((m) => userMessage.toLowerCase().includes(m));

    // Build reply
    let reply: string;
    const newTags: TurnTag[] = [];
    let insightExtracted: string | undefined;

    if (hasInsight) {
      reply = `这是一个很有洞察力的观察。${userMessage.length > 20 ? userMessage.slice(0, 30) + '...' : userMessage}\n\n`;
      newTags.push('insight');
      insightExtracted = userMessage.slice(0, 200);
    } else {
      reply = `我理解你的想法。让我进一步追问：\n\n`;
    }

    // Select next question based on turn count
    const qIdx = turnCount % layerQuestions.length;
    reply += layerQuestions[qIdx];

    if (hasCertainty) {
      reply += `\n\n不过，我见过一些研究从完全相反的角度得出了不同的结论。你如何回应这种可能性？`;
      newTags.push('challenge');
    }

    // Check if ready to advance (after 2+ turns with insights)
    const layerInsights = turns.filter((t) => t.layer === currentLayer && t.tags.includes('insight')).length;
    const layerReadyToAdvance = layerInsights >= 1 && turnCount >= 2 && turnCount % 3 === 0;

    // Health alert (simulated)
    const agreementRatio = turns.filter((t) => t.role === 'user').length > 0 ? 0.3 : 0;
    let healthAlert: { dimension: string; message: string } | undefined;
    if (agreementRatio > 0.8 && turnCount > 6) {
      healthAlert = { dimension: 'persistent_agreement', message: '对话中持续同意的模式过高，建议引入更多挑战' };
    }

    return {
      reply,
      newTags,
      insightExtracted,
      layerReadyToAdvance,
      healthAlert,
    };
  }

  private getLayerName(layer: SocraticLayer): string {
    const names: Record<SocraticLayer, string> = {
      1: '问题框架',
      2: '方法论反思',
      3: '证据推理',
      4: '观点评估',
      5: '影响后果',
    };
    return names[layer];
  }

  private parseOutput(content: string, currentLayer: SocraticLayer, turnCount: number): SocraticMentorOutput {
    const newTags: TurnTag[] = [];
    let insightExtracted: string | undefined;

    // Extract INSIGHT tags
    const insightMatch = content.match(/\[INSIGHT:\s*(.+?)\]/);
    if (insightMatch) {
      newTags.push('insight');
      insightExtracted = insightMatch[1];
    }

    // Detect challenge markers
    if (/相反|但是|然而|however|but|相反的视角/i.test(content)) {
      newTags.push('challenge');
    }

    const layerReadyToAdvance = turnCount >= 4 && turnCount % 3 === 0;

    return {
      reply: content.replace(/\[INSIGHT:\s*.+?\]/g, '').trim(),
      newTags,
      insightExtracted,
      layerReadyToAdvance,
    };
  }
}
