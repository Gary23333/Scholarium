// Real LLM Audit — Sub-Auditors that call DeepSeek API
// Replaces mock sub-auditors with actual LLM-based audit

import type {
  AuditDimension, AuditFindingFull, AuditInput, SubAuditAssignment, SubAuditReport,
} from '../types/index.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.js';

const DEFAULT_ASSIGNMENTS: SubAuditAssignment[] = [
  {
    subId: 'A', model: 'deepseek-chat',
    primaryDimensions: ['logic_consistency', 'terminology_consistency', 'structure_integrity', 'claim_evidence_chain', 'narrative_flow'],
    secondaryDimensions: ['language_quality', 'math_correctness', 'novelty_alignment'],
    focusHint: 'Check logical chains, terminology consistency, claim-evidence chains, narrative flow, structural completeness.',
  },
  {
    subId: 'B', model: 'deepseek-chat',
    primaryDimensions: ['citation_integrity', 'data_veracity', 'math_correctness', 'data_fidelity', 'inter_section_consistency'],
    secondaryDimensions: ['logic_consistency', 'academic_format'],
    focusHint: 'Check citation validity, numerical claims, data fidelity, cross-section consistency, formula correctness.',
  },
  {
    subId: 'C', model: 'deepseek-chat',
    primaryDimensions: ['language_quality', 'academic_format', 'novelty_alignment'],
    secondaryDimensions: ['citation_integrity', 'terminology_consistency', 'narrative_flow'],
    focusHint: 'Check grammar, academic style, novelty alignment, narrative flow, format compliance.',
  },
];

let findingId = 0;
function nextId(): string { return `f-${++findingId}-${Date.now().toString(36)}`; }

/**
 * Run a single Sub-Auditor with real LLM
 */
export async function runRealSubAuditor(
  assignment: SubAuditAssignment,
  input: AuditInput,
  router: LLMRouter,
): Promise<SubAuditReport> {
  const start = Date.now();

  const pdfGuidelines = `Audit based on Tsinghua University's graduate thesis writing guidelines:
- 摘要：不应包含引用，不应使用公司名称/缩写，应回答"研究是什么/背景意义/做了什么/发现了什么/结果意义"
- 引言：不应开篇提出研究问题或假设，应定义术语，综述应简洁且聚焦近年
- 方法：必须描述清楚以便可重复，不同方法应分节
- 结果：应回顾研究目的并对比以往研究，应指出研究不足
- 讨论：应检验论据的适当性和说服力，应回应替代方案，应承认无法解决的问题
- 全文：避免使用他人文字或想法却不注明出处（抄袭）`;

  const systemPrompt = `You are an academic paper auditor (Sub-${assignment.subId}). Your primary focus: ${assignment.primaryDimensions.join(', ')}.
Secondary focus: ${assignment.secondaryDimensions.join(', ')}.
${assignment.focusHint}

${pdfGuidelines}

Output ONLY valid JSON array of findings:
[{"dimension": "string", "severity": "critical|warning|info", "description": "string", "location": "string or null", "suggestion": "string or null"}]

If no issues found, output: []`;

  const bibleSummary = `Terminology: ${input.bibleSummary.terminology.map(t => t.key).join(', ') || 'none'}
Citations: ${input.bibleSummary.citationMap.map(c => c.key).join(', ') || 'none'}
Data points: ${input.bibleSummary.dataPoints.map(d => `${d.key}=${d.value}`).join(', ') || 'none'}`;

  const userPrompt = `Section: ${input.sectionId}

Draft to audit:
${input.draft.substring(0, 3000)}

Bible context:
${bibleSummary}

Find all issues in this draft.`;

  try {
    const response = await router.complete('auditor', systemPrompt, userPrompt, { temperature: 0, model: assignment.model });
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const rawFindings = JSON.parse(cleaned);

    const findings: AuditFindingFull[] = (Array.isArray(rawFindings) ? rawFindings : []).map((f: any) => ({
      id: nextId(),
      dimension: f.dimension as AuditDimension,
      severity: (f.severity ?? 'warning') as 'critical' | 'warning' | 'info',
      description: f.description ?? '',
      location: f.location ?? undefined,
      foundBy: [assignment.subId],
      consensus: 'possible' as const,
      suggestion: f.suggestion ?? undefined,
      status: 'open' as const,
    }));

    return { subId: assignment.subId, model: assignment.model, findings, elapsedMs: Date.now() - start, mockMode: false };
  } catch (err: any) {
    // Fallback to empty findings on error
    logger.error(`Sub-${assignment.subId} LLM audit failed: ${err.message}`);
    return { subId: assignment.subId, model: assignment.model, findings: [], elapsedMs: Date.now() - start, mockMode: true };
  }
}

/**
 * Run full audit with real LLM sub-auditors
 */
export async function runRealFullAudit(input: AuditInput, router: LLMRouter): Promise<SubAuditReport[]> {
  return Promise.all(DEFAULT_ASSIGNMENTS.map(a => runRealSubAuditor(a, input, router)));
}
