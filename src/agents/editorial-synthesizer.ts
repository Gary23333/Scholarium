// Editorial Synthesizer Agent — Synthesizes all reviews into editorial decision
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import type { ReviewReport, EditorialDecision, RevisionItem, ConsensusLevel, DevilsAdvocateReport } from '../types/index.ts';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'node:crypto';

export interface SynthesizerInput {
  reports: ReviewReport[];
  daReport?: DevilsAdvocateReport;
  paperTitle: string;
}

export class EditorialSynthesizerAgent extends BaseAgent<SynthesizerInput, EditorialDecision> {
  readonly name = 'EditorialSynthesizer';
  private router?: LLMRouter;
  constructor(router?: LLMRouter) { super(); this.router = router; }

  protected async realExecute(input: SynthesizerInput): Promise<EditorialDecision> {
    if (!this.router) return this.mockExecute(input);
    const systemPrompt = `你是期刊副主编。综合所有评审报告，识别共识和分歧，做出编辑决策，生成修订路线图。输出 JSON: { "decision":"accept|minor_revision|major_revision|reject", "consensusSummary":"", "revisionRoadmap":[], "daCriticalIssues":[], "editorNotes":"" }`;
    const reportSummary = input.reports.map(r => `${r.reviewerRole}: ${r.verdict} - ${r.summary}`).join('\n');
    try {
      const content = await this.router.complete('editorialSynthesizer', systemPrompt, `论文: ${input.paperTitle}\n\n评审报告摘要:\n${reportSummary}\nDA: ${input.daReport?.summary ?? '无'}`, { temperature: 0.2, maxTokens: 2048 });
      const parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      return this.buildDecision(parsed, input);
    } catch (e) { logger.warn('EditorialSynthesizer LLM failed', String(e)); return this.mockExecute(input); }
  }

  protected async mockExecute(input: SynthesizerInput): Promise<EditorialDecision> {
    // Aggregate findings from all reports
    const allFindings = input.reports.flatMap(r => r.findings);
    const daCriticals = input.daReport?.findings.filter(f => f.severity === 'critical' || f.severity === 'major') ?? [];

    // Determine consensus
    const verdicts = input.reports.map(r => r.verdict);
    const rejectCount = verdicts.filter(v => v === 'reject').length;
    const majorCount = verdicts.filter(v => v === 'major_revision').length;
    const minorCount = verdicts.filter(v => v === 'minor_revision').length;

    let decision: 'accept' | 'minor_revision' | 'major_revision' | 'reject';
    if (rejectCount >= 2) decision = 'reject';
    else if (majorCount >= 2 || daCriticals.length > 0) decision = 'major_revision';
    else if (minorCount >= 2) decision = 'minor_revision';
    else decision = 'accept';

    // Build revision roadmap
    const roadmap: RevisionItem[] = [
      { id: randomUUID(), priority: 'P0', source: 'da', consensus: 'DA_CRITICAL', description: '修复核心论证的逻辑跳跃', suggestion: '补充因果推断方法或弱化因果声称', status: 'pending' },
      { id: randomUUID(), priority: 'P1', source: 'methodology', consensus: 'CONSENSUS_3', description: '加强样本量论证', suggestion: '补充先验功效分析', status: 'pending' },
      { id: randomUUID(), priority: 'P1', source: 'domain', consensus: 'CONSENSUS_3', description: '补充近两年核心文献', suggestion: '检索2024-2025年相关顶刊论文', status: 'pending' },
      { id: randomUUID(), priority: 'P2', source: 'perspective', consensus: 'SPLIT', description: '增加跨学科视角', suggestion: '讨论与社会学/经济学的交叉', status: 'pending' },
    ];

    return {
      decision,
      consensusSummary: `${input.reports.length}位评审员意见：${rejectCount} Reject, ${majorCount} Major, ${minorCount} Minor。DA发现${daCriticals.length}个关键问题。`,
      revisionRoadmap: roadmap,
      traceabilityMatrix: [],
      daCriticalIssues: daCriticals.map(f => f.description),
      editorNotes: decision === 'major_revision' ? '需要在方法论和论证逻辑上进行显著改进后方可考虑接受。' : '请根据修订路线图逐项修改。',
      generatedAt: new Date().toISOString(),
    };
  }

  private buildDecision(data: any, input: SynthesizerInput): EditorialDecision {
    return {
      decision: data.decision ?? 'major_revision',
      consensusSummary: data.consensusSummary ?? '',
      revisionRoadmap: (data.revisionRoadmap ?? []).map((r: any) => ({ ...r, id: r.id ?? randomUUID() })),
      traceabilityMatrix: [],
      daCriticalIssues: data.daCriticalIssues ?? [],
      editorNotes: data.editorNotes ?? '',
      generatedAt: new Date().toISOString(),
    };
  }
}
