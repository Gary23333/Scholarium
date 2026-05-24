// Domain Reviewer Agent — Literature coverage, theoretical framework, domain contribution
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import type { ReviewReport, ReviewerConfig, ReviewFinding, ReviewVerdict } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { randomUUID } from 'node:crypto';

export interface DomainReviewerInput {
  paperContent: string;
  paperTitle: string;
  reviewerConfig: ReviewerConfig;
}

export class DomainReviewerAgent extends BaseAgent<DomainReviewerInput, ReviewReport> {
  readonly name = 'DomainReviewer';
  private router?: LLMRouter;
  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: DomainReviewerInput): Promise<ReviewReport> {
    if (!this.router) return this.mockExecute(input);
    const systemPrompt = `你是领域专家。评审文献覆盖、理论框架和领域贡献。输出 JSON 同 EditorInChief。`;
    try {
      const content = await this.router.complete(
        'domainReviewer',
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
      logger.warn('DomainReviewer LLM failed', String(e));
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: DomainReviewerInput): Promise<ReviewReport> {
    return this.buildReport(
      {
        scores: { literatureCoverage: 70, theoreticalFramework: 68, domainContribution: 65, citationQuality: 72 },
        strengths: ['相关文献覆盖面较好', '理论框架选择恰当'],
        weaknesses: ['缺少近两年核心文献', '与现有理论的对话不够深入', '领域贡献表述模糊'],
        findings: [
          {
            id: randomUUID(),
            dimension: 'literature',
            severity: 'minor',
            description: '缺少2024-2025年关键文献',
            suggestion: '补充最新的相关研究，特别是顶会和顶刊论文',
          },
        ],
        verdict: 'minor_revision',
        summary: '文献综述基本完整，但需要补充最新研究并加深理论对话。',
      },
      input,
    );
  }

  private buildReport(data: Record<string, unknown>, input: DomainReviewerInput): ReviewReport {
    return {
      reviewerId: randomUUID(),
      reviewerRole: 'domain',
      reviewerName: input.reviewerConfig?.name ?? 'R2',
      expertise: input.reviewerConfig?.expertise ?? '教育政策',
      scores: (data.scores as Record<string, number> | undefined) ?? {},
      strengths: (data.strengths as string[] | undefined) ?? [],
      weaknesses: (data.weaknesses as string[] | undefined) ?? [],
      findings: ((data.findings ?? []) as ReviewFinding[]).map((f) => ({ ...f, id: f.id ?? randomUUID() })),
      verdict: (data.verdict as ReviewVerdict | undefined) ?? 'minor_revision',
      confidence: 0.8,
      summary: (data.summary as string | undefined) ?? '',
      generatedAt: new Date().toISOString(),
    };
  }
}
