// Field Analyst Agent — Identifies paper field and configures reviewer personas
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import type { ReviewerConfigCard, ReviewerConfig } from '../types/index.ts';
import { logger } from '../utils/logger.js';

export interface FieldAnalystInput {
  paperContent: string;
  paperTitle: string;
}

export class FieldAnalystAgent extends BaseAgent<FieldAnalystInput, ReviewerConfigCard> {
  readonly name = 'FieldAnalyst';
  private router?: LLMRouter;
  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: FieldAnalystInput): Promise<ReviewerConfigCard> {
    if (!this.router) return this.mockExecute(input);
    const systemPrompt = `分析论文内容，识别领域并配置评审员身份。输出 JSON：
{ "field":"主学科","subField":"次学科","paradigm":"范式","methodologyType":"方法类型","targetJournalTier":"期刊层级","reviewers":[{"role":"eic","name":"...","expertise":"...","reviewFocus":"..."},...] }`;
    try {
      const content = await this.router.complete(
        'fieldAnalyst',
        systemPrompt,
        `论文标题：${input.paperTitle}\n\n${input.paperContent.slice(0, 3000)}`,
        { temperature: 0.2, maxTokens: 1024 },
      );
      return JSON.parse(
        content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim(),
      );
    } catch (e) {
      logger.warn('FieldAnalyst LLM failed', String(e));
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: FieldAnalystInput): Promise<ReviewerConfigCard> {
    const title = input.paperTitle;
    return {
      field: '教育学',
      subField: '高等教育质量保障',
      paradigm: 'pragmatist',
      methodologyType: 'mixed',
      targetJournalTier: 'Q2',
      reviewers: [
        { role: 'eic', name: '张教授', expertise: '高等教育管理', reviewFocus: '期刊适配度与原创性' },
        { role: 'methodology', name: '李博士', expertise: '研究方法论', reviewFocus: '研究设计与统计效度' },
        { role: 'domain', name: '王研究员', expertise: '教育政策', reviewFocus: '文献覆盖与理论框架' },
        { role: 'perspective', name: '陈教授', expertise: '跨学科研究', reviewFocus: '跨学科连接与实践意义' },
        { role: 'da', name: '魔鬼代言人', expertise: '逻辑分析', reviewFocus: '核心论证挑战' },
      ],
    };
  }
}
