// ReviserAgent — 划段局部重写（segment-targeted rewrite），移植自 HyperFiction-AI 的 revisePassage 契约。
// 只重写用户划中的那一段；前后文作为不可动的上下文注入；公式/引文/数据/专名逐字保留。
import { BaseAgent } from './base.ts';
import type { ReviserInput, ReviserOutput } from '../types/index.ts';
import type { LLMRouter } from '../llm/router.ts';
import { extractProtectedSpans } from '../anti-ai/index.ts';
import { REPLACEMENTS } from '../anti-ai/rewriter.ts';

export function buildReviseSystemPrompt(input: ReviserInput): string {
  const protectedLines =
    input.protectedBlocks.length > 0
      ? input.protectedBlocks.map((b, i) => `[${i}]: ${b}`).join('\n')
      : '（本段内没有检测到受保护内容）';
  const citeKeys = input.approvedCiteKeys.length > 0 ? input.approvedCiteKeys.join(', ') : '（无可用引文键，不得新增）';

  return `你是学术论文的资深编辑。用户在一段 LaTeX 正文里划出一段，给一条修改意见，你只重写这一段。

【最重要的三条，违反即算失败】
1. 只改划中的这一段。它前后的正文（【上文】【下文】）是已定稿、不能动的；你重写的这段必须和上文顺得上、和下文接得住——术语、时态、指代、行文逻辑全部承接，读者看不出接缝。
2. 严格按【修改意见】改，把意见落到具体的措辞、论证、数据描述上，不要只换几个词敷衍，也不要跑题另写一段。
3. 不改受保护内容：LaTeX 公式（\\begin{equation}…\\end{equation}、$…$）、\\cite{…} 引文、数值数据、专业名词/专有名词一律原样保留，不得增删改字。引文键只能使用【允许使用的引文键】中的键，不得新造引文键。

【学术写作要求】
- 使用规范的学术中文表达（若原文为英文则用学术英文），语气客观严谨，避免口语化与情绪化。
- 删除高度概括和冗余的词句；避免「此外」「值得注意的是」「综上所述」等 AI 高频套话，改成有信息量的具体表达。
- 因果、推论、证据链要清楚，不空降结论。
- 长度与原文相当（可增减三成内），保持 LaTeX 结构合法。

只输出改后的这一段本身——不要解释、不要加引号、不要写"修改后"、不要用\`\`\`包裹、不要把上下文再抄一遍。

# 受保护内容（不可修改，即使它们出现在要重写的段落内部）
${protectedLines}

# 允许使用的引文键
${citeKeys}`;
}

export function buildReviseUserPrompt(input: ReviserInput): string {
  const before = input.before?.trim() || '（段落位于章节开头附近，没有上文）';
  const after = input.after?.trim() || '（段落位于章节末尾附近，没有下文）';
  return `这是「${input.sectionTitle ?? '当前章节'}」里的一段。下面给你紧挨着它的上文和下文（这两块不要改，只用来保证衔接），中间是要重写的那一段。

# 上文（这段之前的正文，保持不变，只用于承接）
${before}

# ★要重写的段落★
${input.passage}

# 下文（这段之后的正文，保持不变，只用于承接）
${after}

# 修改意见
${input.note}

现在按修改意见重写★中间那一段★，让它和上文顺得上、和下文接得住，学术风格与全文一致，受保护内容原样保留。只输出改后的这一段。`;
}

/** Strip markdown code fences and trim, matching the rest of the codebase. */
export function cleanLatexOutput(content: string): string {
  return content
    .replace(/^```(?:latex)?\n?/i, '')
    .replace(/```\n?$/i, '')
    .trim();
}

export class ReviserAgent extends BaseAgent<ReviserInput, ReviserOutput> {
  readonly name = 'Reviser';
  private router?: LLMRouter;

  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: ReviserInput): Promise<ReviserOutput> {
    if (!this.router) return this.mockExecute(input);
    const systemPrompt = buildReviseSystemPrompt(input);
    const userPrompt = buildReviseUserPrompt(input);
    const content = await this.router.complete('reviser', systemPrompt, userPrompt, {
      temperature: 0.3,
      maxTokens: 2000,
      timeout: 120000,
    });
    const revisedPassage = cleanLatexOutput(content);
    const protectedViolated = input.protectedBlocks.some((block) => !revisedPassage.includes(block));
    return { revisedPassage, protectedViolated };
  }

  /**
   * Rule-based fallback for when no API key is configured. Deterministic and
   * never touches protected content.
   */
  protected async mockExecute(input: ReviserInput): Promise<ReviserOutput> {
    const passage = input.passage;
    const protectedRanges = extractProtectedSpans(passage).map((s) => ({ start: s.start, end: s.end }));

    let text = passage;

    // 1) Apply the anti-AI REPLACEMENTS table, skipping protected ranges.
    for (const rule of REPLACEMENTS) {
      const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
      let m;
      while ((m = regex.exec(text)) !== null) {
        if (isInProtected(m.index, m[0].length, protectedRanges)) continue;
        text = text.slice(0, m.index) + rule.replacement + text.slice(m.index + m[0].length);
        regex.lastIndex = m.index + rule.replacement.length;
      }
    }

    // 2) Expand / compress branches derived from the note.
    if (/扩|展开|补充/i.test(input.note)) {
      text += '\n\n上述分析进一步支撑了本节的核心论证，使结论与所引文献的讨论保持一致。';
    } else if (/压缩|精简|删/i.test(input.note)) {
      const removed = removeLongestSentence(text, protectedRanges);
      if (removed) text = removed;
    }

    // 3) Ensure a visible change exists; annotate with a LaTeX comment.
    if (text === passage) {
      text = `% [按修改意见] ${input.note.replace(/\s+/g, ' ').slice(0, 80)}\n${passage}`;
    }

    return { revisedPassage: text, protectedViolated: false };
  }
}

function isInProtected(start: number, length: number, ranges: Array<{ start: number; end: number }>): boolean {
  const end = start + length;
  return ranges.some((r) => start < r.end && end > r.start);
}

/** Remove the longest sentence that does not overlap any protected range; returns null if none is removable. */
function removeLongestSentence(text: string, ranges: Array<{ start: number; end: number }>): string | null {
  const parts = text.split(/(?<=[。！？；\n])/);
  if (parts.length <= 1) return null;
  let best = -1;
  let bestLen = -1;
  parts.forEach((part, i) => {
    const trimmed = part.trim();
    if (trimmed.length === 0) return;
    if (isInProtected(text.indexOf(part, 0), part.length, ranges)) return;
    if (part.length > bestLen) {
      bestLen = part.length;
      best = i;
    }
  });
  if (best === -1) return null;
  const result = parts.filter((_, i) => i !== best).join('');
  return result.length > 0 ? result : null;
}
