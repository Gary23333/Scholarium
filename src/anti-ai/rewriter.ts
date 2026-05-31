// Anti-AI Rewriter — rule-based + LLM rewrite
import type {
  RewriterInput,
  RewriteResult,
  RewriteDiffReport,
  TextChange,
  ProtectedSpanForRewrite,
} from '../types/index.ts';
import { detect } from './detector.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.ts';

// Based on Tsinghua PDF guidelines: "删除高度概括和冗余的词句"
// Replace vague AI filler phrases with more direct academic expressions
const REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bfurthermore\b/gi, replacement: 'in addition' },
  { pattern: /\bmoreover\b/gi, replacement: 'besides' },
  { pattern: /\bnotably\b/gi, replacement: 'particularly' },
  { pattern: /\bit is important to note\b/gi, replacement: 'note that' },
  { pattern: /\bin conclusion\b/gi, replacement: 'to conclude' },
  { pattern: /\badditionally\b/gi, replacement: 'also' },
  { pattern: /\bconsequently\b/gi, replacement: 'as a result' },
  { pattern: /综上所述/g, replacement: '总之' },
  { pattern: /值得注意的是/g, replacement: '需要注意的是' },
  { pattern: /不难发现/g, replacement: '可以看出' },
  { pattern: /显而易见/g, replacement: '显然' },
  { pattern: /不言而喻/g, replacement: '' },
  { pattern: /研究的结果将会被讨论/g, replacement: '' },
  { pattern: /it is worth noting that /gi, replacement: '' },
];

export async function rewrite(input: RewriterInput, router?: LLMRouter): Promise<RewriteResult> {
  // Use LLM when available
  if (router) {
    try {
      return await llmRewrite(input, router);
    } catch (e) {
      logger.warn('LLM rewrite failed, falling back to rule-based', String(e));
      // Fall through to rule-based
    }
  }

  let text = input.text;
  const protectedRanges = input.protectedSpans.map((s) => ({ start: s.start, end: s.end }));
  const changes: TextChange[] = [];

  for (const rule of REPLACEMENTS) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (isInProtected(m.index, m[0].length, protectedRanges)) continue;
      const before = text.slice(0, m.index);
      const after = text.slice(m.index + m[0].length);
      text = before + rule.replacement + after;
      changes.push({
        type: 'modified',
        start: m.index,
        end: m.index + rule.replacement.length,
        oldText: m[0],
        newText: rule.replacement,
      });
      regex.lastIndex = m.index + rule.replacement.length;
    }
  }

  const postScore = await detect(text, { mockMode: false }, router);
  const textChangeRatio = Math.abs(text.length - input.text.length) / Math.max(input.text.length, 1);

  const diff: RewriteDiffReport = {
    textChangeRatio,
    protectedContentChanged: false,
    changes,
    protectedChanges: [],
  };

  return { rewrittenText: text, diff, round: 1, postScore, passed: postScore.overall <= 0.5 };
}

async function llmRewrite(input: RewriterInput, router: LLMRouter): Promise<RewriteResult> {
  const protectedTexts = input.protectedSpans.map((s) => s.text);
  const systemPrompt = `You are an academic writing style improver. Rewrite the given text to reduce AI-generated patterns while preserving:
- ALL citations (\\\\cite{...}) exactly as-is
- ALL equations and formulas
- ALL technical terms and data points
- The original meaning and arguments

Make the writing more varied and natural:
- Vary sentence structures and lengths
- Replace repetitive transition words (furthermore, moreover, notably) with alternatives or remove them
- Add occasional natural pauses and varied connectors
- Keep the academic tone but make it read like human-written text

Output ONLY the rewritten LaTeX content, no explanations.`;

  const userPrompt = `Protected content (do NOT modify these):
${protectedTexts.map((t, i) => `[${i}]: ${t}`).join('\n')}

Text to rewrite:
${input.text.substring(0, 6000)}

Rewrite this text to reduce AI patterns while preserving all protected content and meaning.`;
  const content = await router.complete('anti-ai', systemPrompt, userPrompt, {
    temperature: 0.3,
    maxTokens: 16384,
    timeout: 120000,
  });
  const cleaned = content
    .replace(/^```(?:latex)?\n?/i, '')
    .replace(/```\n?$/i, '')
    .trim();
  const postScore = await detect(cleaned, { mockMode: false }, router);
  const changeRatio = Math.abs(cleaned.length - input.text.length) / Math.max(input.text.length, 1);
  return {
    rewrittenText: cleaned,
    diff: { textChangeRatio: changeRatio, protectedContentChanged: false, changes: [], protectedChanges: [] },
    round: 1,
    postScore,
    passed: postScore.overall <= 0.5,
  };
}

function isInProtected(start: number, length: number, ranges: Array<{ start: number; end: number }>): boolean {
  const end = start + length;
  return ranges.some((r) => start < r.end && end > r.start);
}
