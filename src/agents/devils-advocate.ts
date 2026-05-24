// Devil's Advocate Agent — Core argument challenges, logical fallacies detection
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import type { DevilsAdvocateReport, ReviewerConfig } from '../types/index.ts';
import { logger } from '../utils/logger.ts';
import { randomUUID } from 'node:crypto';

export interface DevilsAdvocateInput {
  paperContent: string;
  paperTitle: string;
  reviewerConfig: ReviewerConfig;
}

export class DevilsAdvocateAgent extends BaseAgent<DevilsAdvocateInput, DevilsAdvocateReport> {
  readonly name = 'DevilsAdvocate';
  private router?: LLMRouter;
  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: DevilsAdvocateInput): Promise<DevilsAdvocateReport> {
    if (!this.router) return this.mockExecute(input);
    const systemPrompt = `你是魔鬼代言人。只挑战，不评分。找到最强反论点、逻辑谬误和替代解释。输出 JSON: { "strongestCounterArgument":"", "logicalFallacies":[], "alternativeExplanations":[], "stakeholderBlindSpots":[], "soWhatTest":"", "findings":[], "summary":"" }`;
    try {
      const content = await this.router.complete(
        'devilsAdvocate',
        systemPrompt,
        `标题: ${input.paperTitle}\n\n${input.paperContent.slice(0, 4000)}`,
        { temperature: 0.4, maxTokens: 2048 },
      );
      const parsed = JSON.parse(
        content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim(),
      );
      return this.buildReport(parsed, input);
    } catch (e) {
      logger.warn('DevilsAdvocate LLM failed', String(e));
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: DevilsAdvocateInput): Promise<DevilsAdvocateReport> {
    return this.buildReport(
      {
        strongestCounterArgument:
          '论文的核心论点建立在问卷调查数据之上，但问卷的信效度验证不充分，且样本可能存在自选择偏差，这使得结论的外部效度受到质疑。',
        logicalFallacies: ['从相关性推断因果性', '选择性引用支持论点的文献'],
        alternativeExplanations: ['观察到的效果可能源于霍桑效应', '社会期望偏差可能影响问卷回答'],
        stakeholderBlindSpots: ['未考虑持相反立场的利益相关者'],
        soWhatTest: '即使研究结论成立，对实践的直接影响有限，需要更具体的政策建议。',
        findings: [
          {
            id: randomUUID(),
            dimension: 'logic',
            severity: 'major',
            description: '核心论证存在因果推断跳跃',
            suggestion: '明确区分相关性和因果性，或补充因果推断方法',
          },
          {
            id: randomUUID(),
            dimension: 'evidence',
            severity: 'minor',
            description: '部分关键声称缺乏充分证据支撑',
            suggestion: '为每个关键声称提供引用或数据支撑',
          },
        ],
        verdict: 'major_revision',
        confidence: 0.7,
        summary: '论文的核心论证存在逻辑跳跃，需要更强的因果推断证据和更全面的替代解释讨论。',
        concessionRate: 0.3,
      },
      input,
    );
  }

  private buildReport(data: Record<string, unknown>, _input: DevilsAdvocateInput): DevilsAdvocateReport {
    return {
      reviewerId: randomUUID(),
      reviewerRole: 'da',
      reviewerName: '魔鬼代言人',
      expertise: '逻辑分析与论证评估',
      scores: {},
      strengths: [],
      weaknesses: [],
      findings: ((data.findings ?? []) as Record<string, unknown>[]).map((f) => ({ ...f, id: (f.id as string | undefined) ?? randomUUID() })),
      verdict: (data.verdict as string | undefined) ?? 'major_revision',
      confidence: (data.confidence as number | undefined) ?? 0.7,
      summary: (data.summary as string | undefined) ?? '',
      generatedAt: new Date().toISOString(),
      strongestCounterArgument: (data.strongestCounterArgument as string | undefined) ?? '',
      logicalFallacies: (data.logicalFallacies as string[] | undefined) ?? [],
      alternativeExplanations: (data.alternativeExplanations as string[] | undefined) ?? [],
      stakeholderBlindSpots: (data.stakeholderBlindSpots as string[] | undefined) ?? [],
      soWhatTest: (data.soWhatTest as string | undefined) ?? '',
      concessionRate: (data.concessionRate as number | undefined) ?? 0,
    };
  }
}
