export { detect } from './detector.ts';
export { rewrite } from './rewriter.ts';

import { detect } from './detector.ts';
import { rewrite } from './rewriter.ts';
import type { DetectionConfig, ProtectedSpanForRewrite } from '../types/index.ts';
import { DEFAULT_DETECTION_CONFIG } from '../types/index.ts';
import type { LLMRouter } from '../llm/router.ts';

export async function runAntiAI(
  text: string,
  config?: Partial<DetectionConfig>,
  router?: LLMRouter,
): Promise<{ text: string; score: number; rounds: number }> {
  const cfg = { ...DEFAULT_DETECTION_CONFIG, ...config };
  let current = text;
  let scoreReport = await detect(current, cfg, router);
  let rounds = 0;

  while (scoreReport.overall > cfg.threshold && rounds < cfg.maxRewriteRounds) {
    const protectedSpans: ProtectedSpanForRewrite[] = extractProtectedSpans(current);
    const result = await rewrite({ text: current, highRiskSpans: scoreReport.highRiskSpans, protectedSpans }, router);
    current = result.rewrittenText;
    scoreReport = result.postScore;
    rounds++;
  }

  return { text: current, score: scoreReport.overall, rounds };
}

export function extractProtectedSpans(text: string): ProtectedSpanForRewrite[] {
  const spans: ProtectedSpanForRewrite[] = [];
  let id = 0;
  const citeRegex = /\\cite\{([^}]+)\}/g;
  let m;
  while ((m = citeRegex.exec(text)) !== null) {
    spans.push({
      id: `cite-${++id}`,
      type: 'citation',
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      normalizedKey: m[1],
    });
  }
  const eqRegex = /\\begin\{equation\}[\s\S]*?\\end\{equation\}/g;
  while ((m = eqRegex.exec(text)) !== null) {
    spans.push({
      id: `eq-${++id}`,
      type: 'formula',
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      normalizedKey: m[0].replace(/\s+/g, ' ').trim(),
    });
  }
  return spans;
}
