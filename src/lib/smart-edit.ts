// 智能编辑 Agent (③) — 移植自 HyperFiction-AI 的 smart-edit-agent.ts。
// ① Plan（LLM 定位受影响章节 + 输出精确修改清单）→ ② Edit（逐段局部重写 → 临时文件）
// → ③ Verify（确定性完整性校验）→ ④ Apply（用户确认后落盘 + 备份）。
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Section } from '../types/index.ts';
import type { LLMRouter } from '../llm/router.ts';
import type { PaperProject } from '../server/context.ts';
import type { BibleManager } from '../bible/manager.ts';
import type { ScholariumDB } from '../db/database.ts';
import { revisePassageCore, type RevisePassageCoreDeps } from './revise-passage-core.ts';
import { findPassageInContent, spliceContent, type LocatedPassage } from './segment-locator.ts';
import { verifyIntegrity } from '../integrity/index.ts';
import { extractProtectedSpans } from '../anti-ai/index.ts';

/* ======================== 类型 ======================== */

export interface EditItem {
  sectionId: string;
  passageHint: string;
  originalText: string;
  change: string;
  reason: string;
}

export interface EditPlan {
  analysis: string;
  edits: EditItem[];
  affectedSectionIds: string[];
}

export interface EditResult {
  sectionId: string;
  passageHint: string;
  success: boolean;
  error?: string;
}

export interface VerifyResult {
  sectionId: string;
  issues: string[];
  passed: boolean;
}

export interface SmartEditReport {
  plan: EditPlan;
  results: EditResult[];
  verifyResults: VerifyResult[];
  sectionsModified: number;
  passagesModified: number;
}

export interface SmartEditDeps extends RevisePassageCoreDeps {
  papers: Map<string, PaperProject>;
  router?: LLMRouter;
  bible: Pick<BibleManager, 'getEntries'>;
  db?: Pick<ScholariumDB, 'addRevisionRound'>;
  dataDir: string;
  persistSection: (paperId: string, section: Section) => void;
  onProgress?: (stage: string, data?: unknown) => void;
}

/* ======================== ① Plan ======================== */

/** 解析 Phase 1 输出的章节 id（逗号分隔，过滤无效 id）。 */
export function parseSectionIds(content: string, validIds: string[]): string[] {
  const validSet = new Set(validIds);
  const found: string[] = [];
  const candidates = content.match(/[A-Za-z0-9-]{2,}/g) ?? [];
  for (const c of candidates) {
    if (validSet.has(c) && !found.includes(c)) found.push(c);
  }
  found.sort((a, b) => validIds.indexOf(a) - validIds.indexOf(b));
  return found;
}

/** 解析 Plan 输出的 JSON，多种策略兜底。 */
export function parsePlanOutput(content: string): EditPlan {
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return normalizePlan(JSON.parse(codeBlockMatch[1].trim()));
    } catch {
      /* continue */
    }
  }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return normalizePlan(JSON.parse(content.slice(firstBrace, lastBrace + 1)));
    } catch {
      /* continue */
    }
  }
  const fixed = attemptJsonRepair(content);
  if (fixed) return normalizePlan(fixed);
  return { analysis: '解析失败', edits: [], affectedSectionIds: [] };
}

export function normalizePlan(parsed: unknown): EditPlan {
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const rawEdits = Array.isArray(obj.edits) ? obj.edits : [];
  const edits: EditItem[] = [];
  for (const e of rawEdits) {
    if (e && typeof e === 'object' && (e as { originalText?: unknown }).originalText) {
      const o = e as Record<string, unknown>;
      edits.push({
        sectionId: String(o.sectionId ?? ''),
        passageHint: String(o.passageHint ?? ''),
        originalText: String(o.originalText),
        change: String(o.change ?? ''),
        reason: String(o.reason ?? ''),
      });
    }
  }
  return {
    analysis: String(obj.analysis ?? ''),
    edits,
    affectedSectionIds: [...new Set(edits.map((e) => e.sectionId).filter(Boolean))],
  };
}

function attemptJsonRepair(content: string): unknown | null {
  try {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;
    let jsonStr = content.slice(firstBrace, lastBrace + 1);
    jsonStr = jsonStr.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
    jsonStr = jsonStr.replace(/'([^']*?)'/g, (m, p1) => `"${String(p1).replace(/"/g, '\\"')}"`);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function extractKeywords(text: string): string[] {
  return text
    .split(/[\s，。；、,.;:：!！?？]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

/** Mock plan：无 LLM 时，取前几个章节中含关键词的句子作为修改目标。 */
export function mockPlan(sections: Section[], request: string): EditPlan {
  const keywords = extractKeywords(request);
  const edits: EditItem[] = [];
  let taken = 0;
  for (const s of sections) {
    if (taken >= 3) break;
    if (!s.contentTex) continue;
    const sentences = s.contentTex
      .split(/(?<=[。；!?])/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 20 && x.length <= 120);
    const target =
      sentences.find((sent) => keywords.some((k) => sent.includes(k))) ??
      sentences.find((sent) => /(模型|方法|实验|结果|分析|数据)/.test(sent));
    if (!target) continue;
    edits.push({
      sectionId: s.id,
      passageHint: `「${s.title}」中第 ${taken + 1} 句`,
      originalText: target,
      change: request,
      reason: '按修改需求定位的段落（规则模式）',
    });
    taken++;
  }
  return {
    analysis: '规则模式：按关键词扫描生成修改清单',
    edits,
    affectedSectionIds: [...new Set(edits.map((e) => e.sectionId))],
  };
}

export async function planEdits(
  deps: SmartEditDeps,
  paperId: string,
  request: string,
  sectionIds?: string[],
): Promise<EditPlan> {
  const paper = deps.papers.get(paperId);
  if (!paper) return { analysis: '论文不存在', edits: [], affectedSectionIds: [] };
  const sections = paper.sections
    .filter((s) => s.contentTex && (!sectionIds || sectionIds.includes(s.id)))
    .sort((a, b) => a.sectionNumber - b.sectionNumber);
  if (sections.length === 0) return { analysis: '暂无已撰写章节', edits: [], affectedSectionIds: [] };
  if (!deps.hasLLMFor('reviser')) return mockPlan(sections, request);

  // ===== Phase 1: 判断受影响章节 =====
  const sectionList = sections.map((s) => `${s.id}（第${s.sectionNumber}节《${s.title}》）`).join('\n');
  const phase1Sys =
    '你是学术论文修改规划师。用户给一条修改需求，你判断哪些章节可能受影响。\n' +
    '只输出受影响的章节 id，用逗号分隔。不要输出其他任何文字。\n' +
    '例如：sec-2,sec-5';
  const phase1Usr = `# 修改需求\n${request}\n\n# 章节列表\n${sectionList}\n\n哪些章节受影响？只输出章节 id（如：sec-2,sec-5）：`;
  const phase1Result = await deps.router!.complete('reviser', phase1Sys, phase1Usr, {
    temperature: 0.1,
    maxTokens: 300,
    timeout: 60000,
  });
  const affectedIds = parseSectionIds(
    phase1Result,
    sections.map((s) => s.id),
  );
  if (affectedIds.length === 0) {
    return { analysis: '未识别到受影响的章节', edits: [], affectedSectionIds: [] };
  }

  // ===== Phase 2: 读受影响章节全文，精确定位 =====
  const affectedSections = sections.filter((s) => affectedIds.includes(s.id));
  const contents = affectedSections.map((s) => {
    const body = (s.contentTex ?? '').trim();
    const trimmed = body.length > 2500 ? body.slice(0, 2500) + '\n…（后续省略）' : body;
    return `=== ${s.id}《${s.title}》===\n${trimmed}`;
  });
  const phase2Sys = [
    '你是学术论文修改规划师。用户给一条修改需求，你已拿到受影响章节的 LaTeX 原文。',
    '精确找出需要改的段落，输出 JSON。',
    '',
    '【约束】',
    '- 只输出确实需要改的段落，不要过度发散',
    '- originalText 必须是原文的精确摘录（一字不差），20-100 字符',
    '- 禁止改动 \\cite{...}、公式、数值数据',
    '- 如果某章不需要改，edits 里就不要包含它',
    '',
    '【输出格式】只输出 JSON，不要其他文字：',
    JSON.stringify(
      {
        analysis: '修改策略说明',
        edits: [
          {
            sectionId: 'sec-2',
            passageHint: '方法章节的开头段',
            originalText: '原文精确摘录',
            change: '改成什么',
            reason: '为什么改',
          },
        ],
      },
      null,
      2,
    ),
  ].join('\n');
  const phase2Usr = `# 修改需求\n${request}\n\n# 受影响章节全文\n${contents.join('\n\n')}\n\n请逐章找出需要修改的段落，只输出 JSON。`;
  const phase2Result = await deps.router!.complete('reviser', phase2Sys, phase2Usr, {
    temperature: 0.3,
    maxTokens: 3000,
    timeout: 120000,
  });
  const plan = parsePlanOutput(phase2Result);
  // 过滤：只保留已知 sectionId 且 originalText 存在于对应章节中的编辑项
  plan.edits = plan.edits.filter((e) => {
    const s = paper.sections.find((x) => x.id === e.sectionId);
    return s?.contentTex?.includes(e.originalText) ?? false;
  });
  plan.affectedSectionIds = [...new Set(plan.edits.map((e) => e.sectionId))];
  return plan;
}

/* ======================== ② Edit ======================== */

/** 计算两段文本的字符集 Jaccard 相似度（0-1）。 */
export function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const aSet = new Set(a.replace(/\s/g, ''));
  const bSet = new Set(b.replace(/\s/g, ''));
  let intersection = 0;
  for (const c of aSet) {
    if (bSet.has(c)) intersection++;
  }
  const union = aSet.size + bSet.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function locateEditPassage(content: string, originalText: string): LocatedPassage | null {
  const exact = findPassageInContent(content, originalText);
  if (exact.ok) return exact.result;
  // Jaccard 段落级模糊匹配
  const paragraphs = content.split(/\n{2,}/).filter((p) => p.trim().length > 10);
  let best: LocatedPassage | null = null;
  let bestScore = 0;
  for (const p of paragraphs) {
    const score = similarityScore(p, originalText);
    if (score > bestScore && score > 0.4) {
      bestScore = score;
      const idx = content.indexOf(p);
      best = { start: idx, end: idx + p.length, matchedText: p };
    }
  }
  return best;
}

export async function applyEdit(
  deps: SmartEditDeps,
  paperId: string,
  section: Section,
  edit: EditItem,
): Promise<EditResult> {
  try {
    const baseContent = readTemp(deps, paperId, section.id) ?? section.contentTex ?? '';
    if (!baseContent.trim())
      return { sectionId: section.id, passageHint: edit.passageHint, success: false, error: '章节正文为空' };

    // Locate against the working copy so multiple edits to the same section compose.
    const passage = locateEditPassage(baseContent, edit.originalText);
    if (!passage) {
      return {
        sectionId: section.id,
        passageHint: edit.passageHint,
        success: false,
        error: `无法定位原文: "${edit.originalText.slice(0, 30)}…"`,
      };
    }

    const parts = [baseContent.slice(0, passage.start), baseContent.slice(passage.end)];
    const before = parts[0]
      .split(/\n{2,}/)
      .slice(-2)
      .join('\n\n');
    const after = (parts[1] ?? '')
      .split(/\n{2,}/)
      .slice(0, 2)
      .join('\n\n');

    const result = await revisePassageCore(deps, paperId, section, {
      passage: passage.matchedText,
      note: edit.change,
      before,
      after,
      content: baseContent,
    });
    if (!result.ok)
      return { sectionId: section.id, passageHint: edit.passageHint, success: false, error: result.reason };
    if (result.protectedViolated) {
      return {
        sectionId: section.id,
        passageHint: edit.passageHint,
        success: false,
        error: '受保护内容被改动，已跳过',
      };
    }
    if (result.revised.trim().length < 5) {
      return { sectionId: section.id, passageHint: edit.passageHint, success: false, error: '改写返回为空' };
    }

    const newContent = spliceContent(baseContent, passage.start, passage.end, result.revised);
    if (newContent === baseContent) {
      return { sectionId: section.id, passageHint: edit.passageHint, success: false, error: '替换失败（原文未变化）' };
    }

    writeTemp(deps, paperId, section.id, newContent);
    return { sectionId: section.id, passageHint: edit.passageHint, success: true };
  } catch (err) {
    return { sectionId: section.id, passageHint: edit.passageHint, success: false, error: (err as Error).message };
  }
}

/* ======================== ③ Verify ======================== */

export function verifySection(deps: SmartEditDeps, paperId: string, section: Section, useTemp = true): VerifyResult {
  const temp = useTemp ? readTemp(deps, paperId, section.id) : null;
  const edited = temp ?? section.contentTex ?? '';
  const original = section.contentTex ?? '';
  const issues: string[] = [];
  if (!edited.trim()) return { sectionId: section.id, issues: [], passed: true };

  const stubs = deps.bible
    .getEntries(paperId)
    .filter((e) => ['data', 'formulas', 'citations', 'variables', 'terminology'].includes(e.category))
    .map((e) => ({ id: e.id, category: e.category, key: e.key, value: e.value, immutable: e.immutable }));

  const report = verifyIntegrity(original, edited, stubs);
  for (const v of report.violations) {
    issues.push(`${v.type} 缺失/变动: ${String(v.expected).slice(0, 60)}`);
  }
  // 受保护 span 仍在原文中
  for (const span of extractProtectedSpans(original)) {
    if (!edited.includes(span.text)) issues.push(`受保护内容被改动: ${span.text.slice(0, 60)}`);
  }
  return { sectionId: section.id, issues, passed: issues.length === 0 };
}

/* ======================== ④ 完整流程编排 ======================== */

export async function runSmartEdit(deps: SmartEditDeps, paperId: string, request: string): Promise<SmartEditReport> {
  const report: SmartEditReport = {
    plan: { analysis: '', edits: [], affectedSectionIds: [] },
    results: [],
    verifyResults: [],
    sectionsModified: 0,
    passagesModified: 0,
  };
  deps.onProgress?.('plan', { message: '分析修改需求，定位受影响段落…' });
  const plan = await planEdits(deps, paperId, request);
  report.plan = plan;
  deps.onProgress?.('plan-done', { plan });
  if (plan.edits.length === 0) {
    deps.onProgress?.('done', { report });
    return report;
  }

  const paper = deps.papers.get(paperId);
  const modifiedSections = new Set<string>();
  for (let i = 0; i < plan.edits.length; i++) {
    const edit = plan.edits[i];
    deps.onProgress?.('edit-start', { index: i, total: plan.edits.length, edit });
    const section = paper?.sections.find((s) => s.id === edit.sectionId);
    let result: EditResult;
    if (!section?.contentTex) {
      result = { sectionId: edit.sectionId, passageHint: edit.passageHint, success: false, error: '章节无内容' };
    } else {
      result = await applyEdit(deps, paperId, section, edit);
    }
    report.results.push(result);
    if (result.success) {
      modifiedSections.add(edit.sectionId);
      report.passagesModified++;
    }
    deps.onProgress?.('edit-done', { index: i, result });
  }
  report.sectionsModified = modifiedSections.size;

  for (const sectionId of modifiedSections) {
    const section = paper?.sections.find((s) => s.id === sectionId);
    if (!section) continue;
    deps.onProgress?.('verify-start', { sectionId });
    const verifyResult = verifySection(deps, paperId, section, true);
    report.verifyResults.push(verifyResult);
    deps.onProgress?.('verify-done', { sectionId, result: verifyResult });
  }

  deps.onProgress?.('done', { report });
  return report;
}

/* ======================== Apply（确认落盘） ======================== */

export async function applyChangesToDisk(
  deps: SmartEditDeps,
  paperId: string,
  sectionIds: string[],
): Promise<{ success: string[]; failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];
  const paper = deps.papers.get(paperId);
  if (!paper) return { success, failed: sectionIds };

  for (const sectionId of sectionIds) {
    const section = paper.sections.find((s) => s.id === sectionId);
    const temp = readTemp(deps, paperId, sectionId);
    try {
      if (!temp || !temp.trim()) {
        failed.push(sectionId + '（临时文件为空）');
        continue;
      }
      if (!section) {
        failed.push(sectionId + '（章节不存在）');
        continue;
      }
      // 备份当前内容
      writeBackup(deps, paperId, sectionId, section.contentTex ?? '');
      const before = section.contentTex ?? '';
      section.contentTex = temp;
      section.version++;
      section.status = 'drafting';
      deps.persistSection(paperId, section);
      deps.db?.addRevisionRound({
        paper_id: paperId,
        section_id: sectionId,
        kind: 'smart_edit',
        before,
        after: temp,
      });
      removeTemp(deps, paperId, sectionId);
      success.push(sectionId);
    } catch (err) {
      failed.push(sectionId + `（${(err as Error).message}）`);
    }
  }
  return { success, failed };
}

/* ======================== 临时文件 IO ======================== */

export function smartEditDir(deps: SmartEditDeps, paperId: string): string {
  return path.join(deps.dataDir, 'smart-edit', paperId);
}

function tempPath(deps: SmartEditDeps, paperId: string, sectionId: string): string {
  return path.join(smartEditDir(deps, paperId), `tmp-${sectionId}.tex`);
}

function backupPath(deps: SmartEditDeps, paperId: string, sectionId: string): string {
  return path.join(smartEditDir(deps, paperId), `bak-${sectionId}.tex`);
}

export function writeTemp(deps: SmartEditDeps, paperId: string, sectionId: string, content: string): void {
  const dir = smartEditDir(deps, paperId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tempPath(deps, paperId, sectionId), content, 'utf8');
}

export function readTemp(deps: SmartEditDeps, paperId: string, sectionId: string): string | null {
  try {
    return fs.readFileSync(tempPath(deps, paperId, sectionId), 'utf8');
  } catch {
    return null;
  }
}

export function writeBackup(deps: SmartEditDeps, paperId: string, sectionId: string, content: string): void {
  const dir = smartEditDir(deps, paperId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(backupPath(deps, paperId, sectionId), content, 'utf8');
}

export function removeTemp(deps: SmartEditDeps, paperId: string, sectionId: string): void {
  try {
    fs.unlinkSync(tempPath(deps, paperId, sectionId));
  } catch {
    /* ignore */
  }
}
