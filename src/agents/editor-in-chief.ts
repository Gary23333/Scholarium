// Editor-in-Chief Agent — Journal fit, originality, overall quality
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import type { ReviewReport, ReviewerConfig, ReviewFinding, ReviewVerdict } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { randomUUID } from 'node:crypto';

export interface EICInput {
  paperContent: string;
  paperTitle: string;
  field: string;
  reviewerConfig: ReviewerConfig;
}

export class EditorInChiefAgent extends BaseAgent<EICInput, ReviewReport> {
  readonly name = 'EditorInChief';
  private router?: LLMRouter;
  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: EICInput): Promise<ReviewReport> {
    if (!this.router) return this.mockExecute(input);
    const systemPrompt = `你是期刊主编。评审论文的期刊适配度、原创性、意义和整体质量。输出 JSON: { "scores":{...}, "strengths":[], "weaknesses":[], "findings":[], "verdict":"accept|minor_revision|major_revision|reject", "summary":"" }`;
    try {
      const content = await this.router.complete(
        'editorInChief',
        systemPrompt,
        `标题: ${input.paperTitle}\n\n${input.paperContent.slice(0, 4000)}`,
        { temperature: 0.3, maxTokens: 2048 },
      );
      const parsed = JSON.parse(
        content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim(),
      );
      return this.buildReport(parsed, input);
    } catch (e) {
      logger.warn('EditorInChief LLM failed', String(e));
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: EICInput): Promise<ReviewReport> {
    return this.buildReport(
      {
        scores: { originality: 72, significance: 68, clarity: 75, journalFit: 70 },
        strengths: ['研究主题具有现实意义', '文献综述较为全面', '结构清晰'],
        weaknesses: ['创新性有待加强', '方法论描述不够详细', '讨论部分深度不足'],
        findings: [
          {
            id: randomUUID(),
            dimension: 'originality',
            severity: 'minor',
            description: '创新点表述不够突出',
            suggestion: '在引言中更明确地列出核心贡献',
          },
        ],
        verdict: 'major_revision',
        summary: '论文提出了一个有意义的研究方向，但在创新性和方法论严谨性上需要改进。',
      },
      input,
    );
  }

  private buildReport(data: Record<string, unknown>, input: EICInput): ReviewReport {
    return {
      reviewerId: randomUUID(),
      reviewerRole: 'eic',
      reviewerName: input.reviewerConfig?.name ?? 'EIC',
      expertise: input.reviewerConfig?.expertise ?? '高等教育管理',
      scores: (data.scores as Record<string, number> | undefined) ?? {},
      strengths: (data.strengths as string[] | undefined) ?? [],
      weaknesses: (data.weaknesses as string[] | undefined) ?? [],
      findings: ((data.findings ?? []) as ReviewFinding[]).map((f) => ({ ...f, id: f.id ?? randomUUID() })),
      verdict: (data.verdict as ReviewVerdict | undefined) ?? 'major_revision',
      confidence: 0.8,
      summary: (data.summary as string | undefined) ?? '',
      generatedAt: new Date().toISOString(),
    };
  }
}
