// Research Question Agent — Generate RQ Brief with FINER scoring
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.js';
import type { ResearchBrief, FinerScore, SocraticTurn } from '../types/index.ts';

export interface RQAgentInput {
  topic: string;
  insights: string[];
  commitments: string[];
  turns: SocraticTurn[];
}

export class ResearchQuestionAgent extends BaseAgent<RQAgentInput, ResearchBrief> {
  readonly name = 'ResearchQuestion';
  private router?: LLMRouter;

  constructor(router?: LLMRouter) { super(); this.router = router; }

  protected async realExecute(input: RQAgentInput): Promise<ResearchBrief> {
    if (!this.router) return this.mockExecute(input);

    const { topic, insights, commitments } = input;
    const systemPrompt = `你是一位学术研究问题设计专家。根据用户提供的研究主题和苏格拉底对话中收集的洞察，生成一份结构化的研究问题简报（RQ Brief）。

严格按以下 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "researchQuestion": "一个清晰、具体、可回答的研究问题",
  "finerScore": {
    "feasible": 1-5,
    "interesting": 1-5,
    "novel": 1-5,
    "ethical": 1-5,
    "relevant": 1-5
  },
  "scopeBoundaries": {
    "inScope": ["包含的范围"],
    "outOfScope": ["排除的范围"]
  },
  "subQuestions": ["子问题1", "子问题2", "子问题3"],
  "summary": "一段话总结研究问题的核心"
}`;

    const userPrompt = `研究主题：${topic}

收集的洞察：
${insights.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

用户承诺/预测：
${commitments.map((c, idx) => `${idx + 1}. ${c}`).join('\n')}

请生成 RQ Brief。`;

    try {
      const content = await this.router.complete('researchQuestion', systemPrompt, userPrompt, {
        temperature: 0.2, maxTokens: 1024,
      });
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return { ...parsed, generatedAt: new Date().toISOString() };
    } catch (e) {
      logger.warn('ResearchQuestion LLM failed', String(e));
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: RQAgentInput): Promise<ResearchBrief> {
    const { topic, insights } = input;
    const insightContext = insights.length > 0 ? insights[0] : topic;

    return {
      researchQuestion: `${topic}的核心机制是什么？如何通过实证研究验证其影响因素和作用路径？`,
      finerScore: {
        feasible: 4,
        interesting: 4,
        novel: 3,
        ethical: 5,
        relevant: 4,
      },
      scopeBoundaries: {
        inScope: [
          `${topic}的理论分析`,
          '相关实证数据的收集与分析',
          '与现有研究的对比',
        ],
        outOfScope: [
          '跨文化比较研究',
          '长期纵向追踪',
          '政策建议的具体实施',
        ],
      },
      subQuestions: [
        `${topic}的现有研究有哪些主要发现和局限？`,
        `影响${topic}的关键因素有哪些？`,
        `如何设计一个可行的研究方案来验证这些因素？`,
      ],
      summary: `本研究聚焦于${topic}，旨在通过系统的文献分析和实证研究，揭示其核心机制和影响因素。${insightContext}`,
      generatedAt: new Date().toISOString(),
    };
  }
}
