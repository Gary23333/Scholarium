/* eslint-disable @typescript-eslint/no-explicit-any */
// Methodology Reviewer Agent — Research design, statistical validity, reproducibility
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import type { ReviewReport, ReviewerConfig } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { randomUUID } from 'node:crypto';

export interface MethodologyReviewerInput {
  paperContent: string;
  paperTitle: string;
  reviewerConfig: ReviewerConfig;
}

export class MethodologyReviewerAgent extends BaseAgent<MethodologyReviewerInput, ReviewReport> {
  readonly name = 'MethodologyReviewer';
  private router?: LLMRouter;
  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: MethodologyReviewerInput): Promise<ReviewReport> {
    if (!this.router) return this.mockExecute(input);
    const systemPrompt = `你是方法论评审专家。评审研究设计、统计效度和可重复性。输出 JSON 同 EditorInChief。`;
    try {
      const content = await this.router.complete(
        'methodologyReviewer',
        systemPrompt,
        `标题: ${input.paperTitle}\n\n${input.paperContent.slice(0, 4000)}`,
        { temperature: 0.2, maxTokens: 2048 },
      );
      const parsed = JSON.parse(
        content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim(),
      );
      return this.buildReport(parsed, input);
    } catch (e) {
      logger.warn('MethodologyReviewer LLM failed', String(e));
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: MethodologyReviewerInput): Promise<ReviewReport> {
    return this.buildReport(
      {
        scores: { researchDesign: 65, statisticalValidity: 60, reproducibility: 55, dataTransparency: 62 },
        strengths: ['研究问题明确', '数据收集方法合理'],
        weaknesses: ['样本量论证不充分', '统计方法选择缺乏说明', '可重复性信息不足'],
        findings: [
          {
            id: randomUUID(),
            dimension: 'methodology',
            severity: 'major',
            description: '样本量计算缺乏功效分析支撑',
            suggestion: '补充先验功效分析，说明预期效应量和统计功效',
          },
          {
            id: randomUUID(),
            dimension: 'reproducibility',
            severity: 'minor',
            description: '实验参数记录不完整',
            suggestion: '补充所有超参数和随机种子信息',
          },
        ],
        verdict: 'major_revision',
        summary: '方法论部分需要显著加强，特别是样本量论证和可重复性方面。',
      },
      input,
    );
  }

  private buildReport(data: any, input: MethodologyReviewerInput): ReviewReport {
    return {
      reviewerId: randomUUID(),
      reviewerRole: 'methodology',
      reviewerName: input.reviewerConfig?.name ?? 'R1',
      expertise: input.reviewerConfig?.expertise ?? '研究方法论',
      scores: data.scores ?? {},
      strengths: data.strengths ?? [],
      weaknesses: data.weaknesses ?? [],
      findings: (data.findings ?? []).map((f: any) => ({ ...f, id: f.id ?? randomUUID() })),
      verdict: data.verdict ?? 'major_revision',
      confidence: 0.75,
      summary: data.summary ?? '',
      generatedAt: new Date().toISOString(),
    };
  }
}
