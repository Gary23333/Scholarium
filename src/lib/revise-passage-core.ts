// Shared core for segment-targeted rewrite (片段的针对性修改).
// Used by: revise-passage route (①), auto-revision runner (②), smart-edit applyEdit (③).
import type { ReviserAgent } from '../agents/reviser.ts';
import { findPassageInContent, type LocatedPassage } from './segment-locator.ts';
import { extractProtectedSpans } from '../anti-ai/index.ts';
import type { BibleManager } from '../bible/manager.ts';

export interface RevisePassageCoreDeps {
  bible: Pick<BibleManager, 'getEntries'>;
  reviser: ReviserAgent;
  hasLLMFor: (agent: string) => boolean;
}

export interface RevisePassageCoreSuccess {
  ok: true;
  revised: string;
  passage: LocatedPassage;
  warnings: string[];
  mockMode: boolean;
  protectedViolated: boolean;
}

export interface RevisePassageCoreFailure {
  ok: false;
  reason: string;
}

export type RevisePassageCoreResult = RevisePassageCoreSuccess | RevisePassageCoreFailure;

export async function revisePassageCore(
  deps: RevisePassageCoreDeps,
  paperId: string,
  section: { id: string; title: string; contentTex?: string },
  body: { passage: string; note: string; before?: string; after?: string; content?: string },
): Promise<RevisePassageCoreResult> {
  // `content` overrides the section content when locating the passage — used by
  // auto-revision to splice into a working copy that already contains earlier edits.
  const contentTex = body.content ?? section.contentTex ?? '';
  const loc = findPassageInContent(contentTex, body.passage);
  if (!loc.ok) {
    if (loc.error === 'too-short') return { ok: false, reason: '选中文本太短，请多选一些内容' };
    if (loc.error === 'ambiguous')
      return { ok: false, reason: '选中文本在文中出现多次，请多选一些上下文以唯一确定位置' };
    return { ok: false, reason: '选中文本不在该章节内容中' };
  }
  const { start, end, matchedText } = loc.result;

  // Protected spans fully inside the passage must be preserved verbatim.
  const protectedBlocks = extractProtectedSpans(contentTex)
    .filter((s) => s.start >= start && s.end <= end)
    .map((s) => s.text);

  const approvedCiteKeys = deps.bible
    .getEntries(paperId, { category: 'citations' })
    .filter((e) => e.approvalStatus === 'approved')
    .map((e) => e.key);

  const mockMode = !deps.hasLLMFor('reviser');

  const buildInput = (note: string) => ({
    passage: matchedText,
    note,
    before: body.before,
    after: body.after,
    protectedBlocks,
    approvedCiteKeys,
    sectionTitle: section.title,
  });

  let out = await deps.reviser.execute(buildInput(body.note), { mock: mockMode });
  const warnings: string[] = [];

  // One repair retry with a stricter note when protected content was broken.
  if (out.protectedViolated) {
    const stricterNote = `${body.note}\n\n【重要】上一步改写破坏了受保护内容。请逐字还原以下内容（一字不差），只重写其余部分：\n${protectedBlocks
      .map((b, i) => `[${i}]: ${b}`)
      .join('\n')}`;
    const retry = await deps.reviser.execute(buildInput(stricterNote), { mock: mockMode });
    if (retry.protectedViolated) {
      warnings.push('受保护内容被改动，已放弃本次修改');
      out = { revisedPassage: matchedText, protectedViolated: true };
    } else {
      warnings.push('已自动修正受保护内容');
      out = retry;
    }
  }

  return {
    ok: true,
    revised: out.revisedPassage,
    passage: loc.result,
    warnings,
    mockMode,
    protectedViolated: out.protectedViolated,
  };
}
