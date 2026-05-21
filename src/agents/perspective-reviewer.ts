// Perspective Reviewer Agent — Cross-disciplinary connections, practical impact
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import type { ReviewReport } from '../types/index.ts';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

export interface PerspectiveReviewerInput {
  paperContent: string;
  paperTitle: string;
  reviewerConfig: any;
}

export class PerspectiveReviewerAgent extends BaseAgent<PerspectiveReviewerInput, ReviewReport> {
  readonly name = 'PerspectiveReviewer';
  private router?: LLMRouter;
  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: PerspectiveReviewerInput): Promise<ReviewReport> {
    if (!this.router) return this.mockExecute(input);
    const systemPrompt = `你是跨学科评审专家。评审跨学科连接、实际影响和伦理含义。输出 JSON 同 EditorInChief。`;
    try {
      const content = await this.router.complete(
        'perspectiveReviewer',
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
      logger.warn('PerspectiveReviewer LLM failed', String(e));
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: PerspectiveReviewerInput): Promise<ReviewReport> {
    return this.buildReport(
      {
        scores: { crossDisciplinary: 60, practicalImpact: 65, ethicalConsiderations: 70, broaderImplications: 62 },
        strengths: ['关注了实际应用场景', '伦理考量较为充分'],
        weaknesses: ['跨学科视角有限', '政策含义讨论不深'],
        findings: [
          {
            id: randomUUID(),
            dimension: 'practical',
            severity: 'suggestion',
            description: '可以考虑从社会学或经济学视角补充分析',
            suggestion: '探讨与其他学科的交叉点',
          },
        ],
        verdict: 'minor_revision',
        summary: '论文具有一定的实践意义，但跨学科视角和更广泛的影响讨论需要加强。',
      },
      input,
    );
  }

  private buildReport(data: any, input: PerspectiveReviewerInput): ReviewReport {
    return {
      reviewerId: randomUUID(),
      reviewerRole: 'perspective',
      reviewerName: input.reviewerConfig?.name ?? 'R3',
      expertise: input.reviewerConfig?.expertise ?? '跨学科研究',
      scores: data.scores ?? {},
      strengths: data.strengths ?? [],
      weaknesses: data.weaknesses ?? [],
      findings: (data.findings ?? []).map((f: any) => ({ ...f, id: f.id ?? randomUUID() })),
      verdict: data.verdict ?? 'minor_revision',
      confidence: 0.75,
      summary: data.summary ?? '',
      generatedAt: new Date().toISOString(),
    };
  }
}
