// Anti-AI Detector — 4-layer hybrid engine + LLM
import type { AIScoreReport, DetectionConfig, HighRiskSpan } from '../types/index.ts';
import { DEFAULT_DETECTION_CONFIG } from '../types/index.ts';
import { ZH_PATTERNS, EN_PATTERNS } from './patterns.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.ts';

let spanId = 0;

export async function detect(
  text: string,
  config?: Partial<DetectionConfig>,
  router?: LLMRouter,
): Promise<AIScoreReport> {
  const cfg: DetectionConfig = { ...DEFAULT_DETECTION_CONFIG, ...config };

  // Use LLM when available and not in mock mode
  if (router && !cfg.mockMode) {
    try {
      return await llmDetect(text, cfg, router);
    } catch (e) {
      logger.warn('LLM detection failed, falling back to rule-based', String(e));
      // Fall through to rule-based
    }
  }

  const patternResult = computePatternScore(text);
  const burstiness = computeBurstiness(text);
  const perplexity = computePseudoPerplexity(text);
  const ngram = computeNgramDiversity(text);
  const semanticCons = computeSemanticConsistency(text);
  const styleFp = computeStylisticFingerprint(text);

  const overall = Math.min(
    1,
    Math.max(
      0,
      patternResult.score * cfg.weights.pattern +
        burstiness * cfg.weights.burstiness +
        perplexity * cfg.weights.perplexity +
        ngram * cfg.weights.ngramDiversity +
        semanticCons * cfg.weights.semanticConsistency +
        styleFp * cfg.weights.stylisticFingerprint,
    ),
  );

  const highRiskSpans: HighRiskSpan[] = patternResult.matches
    .filter((m) => m.weight >= 0.3)
    .map((m) => ({
      id: `span-${++spanId}`,
      start: m.start,
      end: m.end,
      text: m.text,
      triggeredBy: ['pattern'],
      localScore: m.weight,
      reason: m.reason,
    }));

  return {
    overall,
    confidence: 0.5 + (1 - overall) * 0.4, // higher AI score → higher confidence
    details: {
      patternScore: patternResult.score,
      burstinessScore: burstiness,
      perplexityScore: perplexity,
      ngramDiversityScore: ngram,
      semanticConsistencyScore: semanticCons,
      stylisticFingerprintScore: styleFp,
    },
    suggestions: generateSuggestions(
      {
        patternScore: patternResult.score,
        burstinessScore: burstiness,
        perplexityScore: perplexity,
        ngramDiversityScore: ngram,
        semanticConsistencyScore: semanticCons,
        stylisticFingerprintScore: styleFp,
      },
      overall,
    ),
    highRiskSpans,
    configSnapshot: cfg,
    mockMode: cfg.mockMode ?? false,
  };
}

async function llmDetect(text: string, cfg: DetectionConfig, router: LLMRouter): Promise<AIScoreReport> {
  const systemPrompt = `You are an AI-text detection expert for academic writing. Analyze the given text and score how likely it is AI-generated.
Output ONLY valid JSON:
{
  "overall": 0.0-1.0,
  "details": {
    "patternScore": 0.0-1.0,
    "burstinessScore": 0.0-1.0,
    "perplexityScore": 0.0-1.0,
    "ngramDiversityScore": 0.0-1.0,
    "semanticConsistencyScore": 0.0-1.0,
    "stylisticFingerprintScore": 0.0-1.0
  },
  "suggestions": ["改写作建议"],
  "highRiskSpans": [
    {"text": "string", "reason": "string"}
  ]
}

Scoring guidelines:
- patternScore: How many AI-typical phrases (furthermore, notably, it is important to) are present
- burstinessScore: How uniform the sentence lengths are (AI text tends to have uniform length)
- perplexityScore: How predictable/repetitive the vocabulary is
- ngramDiversityScore: How repetitive the 4-gram patterns are
- semanticConsistencyScore: Whether paragraph structures are too uniform (AI hallmark), shallow logical connections
- stylisticFingerprintScore: Density of hedging words (may, might, possibly), passive voice patterns, uniform sentence complexity
- overall: Weighted combination reflecting likelihood of AI generation
- highRiskSpans: Specific text spans that strongly indicate AI writing

Threshold: scores > ${cfg.threshold} suggest AI-generated content.`;

  const userPrompt = `Text to analyze:
${text.substring(0, 4000)}

Analyze this academic text and return the AI-detection scores in JSON format.`;
  const content = await router.complete('anti-ai', systemPrompt, userPrompt, {
    temperature: 0,
    maxTokens: 2000,
    timeout: 60000,
  });
  const cleaned = content
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  const highRiskSpans: HighRiskSpan[] = (parsed.highRiskSpans ?? []).map((s: any, i: number) => ({
    id: `span-llm-${++spanId}`,
    start: 0,
    end: 0,
    text: s.text ?? '',
    triggeredBy: ['llm'],
    localScore: 0.8,
    reason: s.reason ?? 'LLM-identified pattern',
  }));
  return {
    overall: parsed.overall ?? 0.5,
    confidence: 0.5 + (1 - (parsed.overall ?? 0.5)) * 0.4,
    details: {
      patternScore: parsed.details?.patternScore ?? 0.5,
      burstinessScore: parsed.details?.burstinessScore ?? 0.5,
      perplexityScore: parsed.details?.perplexityScore ?? 0.5,
      ngramDiversityScore: parsed.details?.ngramDiversityScore ?? 0.5,
      semanticConsistencyScore: parsed.details?.semanticConsistencyScore ?? 0.5,
      stylisticFingerprintScore: parsed.details?.stylisticFingerprintScore ?? 0.5,
    },
    suggestions: parsed.suggestions ?? [],
    highRiskSpans,
    configSnapshot: cfg,
    mockMode: false,
  };
}

function computePatternScore(text: string): {
  score: number;
  matches: Array<{ start: number; end: number; text: string; weight: number; reason: string }>;
} {
  const matches: Array<{ start: number; end: number; text: string; weight: number; reason: string }> = [];
  for (const p of [...ZH_PATTERNS, ...EN_PATTERNS]) {
    const regex = new RegExp(p.matchType === 'exact' ? escapeRe(p.pattern as string) : (p.pattern as string), 'gi');
    let m;
    while ((m = regex.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, text: m[0], weight: p.weight, reason: p.reason });
    }
  }
  const raw = matches.reduce((s, m) => s + m.weight, 0);
  return { score: Math.min(1, raw / 5), matches };
}

function computeBurstiness(text: string): number {
  const sentences = text
    .replace(/([.!?。！？])\s+/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length < 3) return 0.3;
  const lengths = sentences.map((s) => s.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((s, l) => s + Math.pow(l - mean, 2), 0) / lengths.length;
  const cv = mean === 0 ? 0 : Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(1, 1 - cv * 2));
}

function computePseudoPerplexity(text: string): number {
  const words = text.toLowerCase().match(/\b[a-z\u4e00-\u9fa5]+\b/g) || [];
  if (words.length < 10) return 0.3;
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / words.length;
    entropy -= p * Math.log2(p);
  }
  return Math.max(0, Math.min(1, 1 - (entropy - 3) / 5));
}

function computeNgramDiversity(text: string): number {
  const words = text.toLowerCase().match(/\b[a-z\u4e00-\u9fa5]+\b/g) || [];
  if (words.length < 4) return 0.3;
  const ngrams = new Set<string>();
  let total = 0;
  for (let i = 0; i <= words.length - 4; i++) {
    ngrams.add(words.slice(i, i + 4).join(' '));
    total++;
  }
  const diversity = total === 0 ? 0 : ngrams.size / total;
  return Math.max(0, Math.min(1, 1 - diversity * 2));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════
// NEW: Semantic Consistency — how well ideas connect across sentences
// AI text tends to have high surface coherence but shallow logical depth
// ═══════════════════════════════════════════

function computeSemanticConsistency(text: string): number {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 50);
  if (paragraphs.length < 2) return 0.4;

  // Check for uniform paragraph structure (AI hallmark)
  const paraStats = paragraphs.map((p) => ({
    sentences: p.split(/[.!?。！？]\s+/).length,
    words: p.split(/\s+/).length,
    avgWordLen: p.replace(/\s+/g, '').length / Math.max(1, p.split(/\s+/).length),
  }));

  // Measure structural uniformity
  const sentenceCounts = paraStats.map((p) => p.sentences);
  const meanSent = sentenceCounts.reduce((a, b) => a + b, 0) / sentenceCounts.length;
  const sentVariance = sentenceCounts.reduce((s, c) => s + Math.pow(c - meanSent, 2), 0) / sentenceCounts.length;
  const sentCV = meanSent === 0 ? 0 : Math.sqrt(sentVariance) / meanSent;

  // Uniform structure = higher AI likelihood
  // CV < 0.3 means very uniform (AI-like), CV > 0.8 means human-like variety
  const structureScore = Math.max(0, Math.min(1, 1 - sentCV));

  // Check repetition of paragraph-opening patterns
  const openers = paragraphs.map((p) => p.substring(0, 20).toLowerCase());
  const uniqueOpeners = new Set(openers);
  const openerDiversity = uniqueOpeners.size / openers.length;

  // Combined score: uniform structure + repetitive openers → high AI risk
  return 0.6 * structureScore + 0.4 * (1 - openerDiversity);
}

// ═══════════════════════════════════════════
// NEW: Stylistic Fingerprint — sentence-level stylistic patterns
// AI text tends to show consistent stylistic traits (passive voice, hedging)
// while human text has more varied stylistic fingerprints
// ═══════════════════════════════════════════

function computeStylisticFingerprint(text: string): number {
  const sentences = text
    .replace(/([.!?。！？])\s+/g, '$1\n')
    .split('\n')
    .filter((s) => s.trim().length > 10);
  if (sentences.length < 5) return 0.4;

  // AI indicators: high density of hedging, formal connectors, uniform sentence complexity
  const hedgingWords =
    /\b(may|might|could|possibly|potentially|perhaps|likely|typically|generally|usually|often|tend|suggest|indicate|appear|seem|suggests|indicates|appears|seems|significant|significantly|notable|notably|furthermore|moreover|additionally|consequently|therefore|thus|hence|however|nevertheless|nonetheless|whereas|whilst|whereby|thereby|therein|thereof|hereby|hereinafter|notwithstanding)\b/gi;
  const passiveVoice =
    /\b(is|are|was|were|been|being|has been|have been|had been|will be|would be|can be|could be|may be|might be|should be|must be) (also |often |typically |usually )?[a-z]+(ed|ted|ded|ied)\b/gi;

  let hedgingCount = 0;
  let passiveCount = 0;
  let totalWords = 0;

  for (const sent of sentences) {
    const words = sent.toLowerCase().match(/\b[a-z]+\b/g) || [];
    totalWords += words.length;

    const hedgingMatches = sent.match(hedgingWords);
    if (hedgingMatches) hedgingCount += hedgingMatches.length;

    const passiveMatches = sent.match(passiveVoice);
    if (passiveMatches) passiveCount += passiveMatches.length;
  }

  const hedgingDensity = hedgingCount / Math.max(1, totalWords);
  const passiveDensity = passiveCount / Math.max(1, totalWords);

  // High hedging + high passive = AI-like style
  // Normalize: typical hedging density ~2-5% in AI, ~1-3% in human
  const hedgingScore = Math.min(1, hedgingDensity / 0.06);
  const passiveScore = Math.min(1, passiveDensity / 0.04);

  // Sentence complexity uniformity
  const complexities = sentences.map((s) => {
    const words = s.split(/\s+/).length;
    const clauses = (s.match(/[,;:，；：]/g) || []).length;
    return { words, complexity: clauses / Math.max(1, words) };
  });

  const meanComp = complexities.reduce((s, c) => s + c.complexity, 0) / complexities.length;
  const compVariance = complexities.reduce((s, c) => s + Math.pow(c.complexity - meanComp, 2), 0) / complexities.length;
  const compCV = meanComp === 0 ? 0 : Math.sqrt(compVariance) / meanComp;
  const uniformityScore = Math.max(0, Math.min(1, 1 - compCV * 2));

  return 0.35 * hedgingScore + 0.35 * passiveScore + 0.3 * uniformityScore;
}

// ═══════════════════════════════════════════
// NEW: Suggestion generator based on dimension scores
// ═══════════════════════════════════════════

function generateSuggestions(
  details: {
    patternScore: number;
    burstinessScore: number;
    perplexityScore: number;
    ngramDiversityScore: number;
    semanticConsistencyScore: number;
    stylisticFingerprintScore: number;
  },
  overall: number,
): string[] {
  const suggestions: string[] = [];

  if (details.patternScore > 0.6) {
    suggestions.push('减少「此外」「值得注意的是」「综上所述」等AI常用短语，改用更自然的表达');
  }
  if (details.burstinessScore > 0.6) {
    suggestions.push('句式长度过于均匀，尝试增加长短句交替，打破AI写作的节奏模式');
  }
  if (details.perplexityScore > 0.6) {
    suggestions.push('词汇多样性偏低，尝试使用更多领域特定术语和变体表达');
  }
  if (details.ngramDiversityScore > 0.6) {
    suggestions.push('短语模式重复度高，避免同一短语结构在文中反复出现');
  }
  if (details.semanticConsistencyScore > 0.6) {
    suggestions.push('段落结构过于整齐，尝试打破均匀的段落模式，增加论证的逻辑深度');
  }
  if (details.stylisticFingerprintScore > 0.6) {
    suggestions.push('学术被动语态和模糊限定词密度偏高（AI写作特征），尝试增加主动语态和明确断言');
  }

  if (overall > 0.7) {
    suggestions.push('整体AI痕迹较重，建议大幅度改写核心段落，增加个人研究经验和具体数据细节');
  }

  return suggestions;
}
