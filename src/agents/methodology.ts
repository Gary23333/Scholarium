// Methodology Agent — Generate methodology blueprint from RQ Brief
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.js';
import type { MethodologyBlueprint, ResearchBrief } from '../types/index.ts';

export interface MethodologyAgentInput {
  topic: string;
  researchBrief: ResearchBrief;
  userPreferences?: {
    paradigm?: string;
    method?: string;
    dataStrategy?: string;
  };
}

export class MethodologyAgent extends BaseAgent<MethodologyAgentInput, MethodologyBlueprint> {
  readonly name = 'Methodology';
  private router?: LLMRouter;

  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: MethodologyAgentInput): Promise<MethodologyBlueprint> {
    if (!this.router) return this.mockExecute(input);

    const { topic, researchBrief } = input;
    const systemPrompt = `你是一位研究方法论设计专家。根据研究问题简报，设计一份方法论蓝图。

严格按以下 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "paradigm": "positivist" | "interpretivist" | "pragmatist",
  "method": "qualitative" | "quantitative" | "mixed",
  "dataStrategy": "primary" | "secondary" | "both",
  "analyticalFramework": "分析框架描述",
  "validityCriteria": ["效度标准1", "效度标准2"],
  "samplingStrategy": "抽样策略描述",
  "dataCollectionMethods": ["方法1", "方法2"],
  "ethicalConsiderations": "伦理考量描述"
}`;

    const userPrompt = `研究主题：${topic}
研究问题：${researchBrief.researchQuestion}
FINER 评分：可行性${researchBrief.finerScore.feasible}/5，新颖性${researchBrief.finerScore.novel}/5
范围：${researchBrief.scopeBoundaries.inScope.join('、')}

请设计方法论蓝图。`;

    try {
      const content = await this.router.complete('methodology', systemPrompt, userPrompt, {
        temperature: 0.2,
        maxTokens: 1024,
      });
      const cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      return { ...parsed, generatedAt: new Date().toISOString() };
    } catch (e) {
      logger.warn('Methodology LLM failed', String(e));
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: MethodologyAgentInput): Promise<MethodologyBlueprint> {
    const { topic } = input;
    return {
      paradigm: 'pragmatist',
      method: 'mixed',
      dataStrategy: 'both',
      analyticalFramework: `采用混合方法研究设计，结合定量数据分析和定性深度访谈，对${topic}进行多维度考察。定量部分使用问卷调查收集大规模数据，定性部分通过半结构化访谈获取深层洞察。`,
      validityCriteria: [
        '内容效度：问卷经过专家评审',
        '结构效度：使用验证性因子分析',
        '信度：Cronbach α > 0.7',
        '生态效度：研究场景贴近实际',
      ],
      samplingStrategy:
        '采用分层随机抽样，确保样本的代表性。定量部分目标样本量 300+，定性部分选取 15-20 名典型个案进行深度访谈。',
      dataCollectionMethods: ['在线问卷调查（Likert 5 点量表）', '半结构化深度访谈', '文献资料分析', '二手数据收集'],
      ethicalConsiderations:
        '研究将遵循知情同意原则，保护受访者隐私，数据匿名化处理。涉及人类受试者的研究需通过 IRB 审批。',
      generatedAt: new Date().toISOString(),
    };
  }
}
