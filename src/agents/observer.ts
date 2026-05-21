import { BaseAgent } from './base.ts';
import type { AgentOptions, ObserverExtraction, ProtectedSpan, BibleEntryInput, Section } from '../types/index.ts';
import type { BibleManager } from '../bible/manager.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.js';

export interface ObserverInput {
  draft: string;
  section: Section;
  bible: BibleManager;
}

export class ObserverAgent extends BaseAgent<ObserverInput, ObserverExtraction> {
  readonly name = 'Observer';
  private router?: LLMRouter;

  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: ObserverInput): Promise<ObserverExtraction> {
    if (!this.router) return this.mockExecute(input);
    const { draft, section } = input;
    const systemPrompt = `You are an academic paper content extractor. Analyze the given LaTeX draft and extract structured information.
Output ONLY valid JSON with this exact structure:
{
  "entries": [
    {
      "category": "formulas|citations|data|terminology|claims",
      "key": "unique_key_string",
      "value": "the extracted text",
      "confidence": 0.0-1.0
    }
  ],
  "protectedSpans": [
    {
      "type": "formula|data|citation|variable",
      "start": number,
      "end": number,
      "content": "exact matched text"
    }
  ]
}

Rules:
- Extract ALL \\\\begin{equation}...\\\\end{equation} and inline $...$ formulas
- Extract ALL \\\\cite{...} citation keys
- Extract ALL numerical data points with units (%, x, ×, percentage points)
- Extract ALL capitalized terminology phrases (2+ words)
- Extract ALL performance/contribution claims containing achieves/outperforms/demonstrates/proposes
- protectedSpans should cover formulas, citations, and data points that must not be altered`;

    const userPrompt = `Section: ${section.id} - ${section.title}

Draft:
${draft.substring(0, 6000)}

Extract all structured elements from this draft following the JSON schema above.`;

    const content = await this.router.complete('observer', systemPrompt, userPrompt, {
      temperature: 0,
      maxTokens: 8192,
      timeout: 120000,
    });
    const cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    try {
      return JSON.parse(cleaned) as ObserverExtraction;
    } catch (e) {
      logger.warn('Observer JSON parse failed', String(e));
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: ObserverInput): Promise<ObserverExtraction> {
    const { draft, section } = input;
    const entries: BibleEntryInput[] = [];
    const protectedSpans: ProtectedSpan[] = [];
    let idx = 0;

    // Formulas
    const formulaRegex = /\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g;
    let match;
    while ((match = formulaRegex.exec(draft)) !== null) {
      entries.push({
        category: 'formulas',
        key: `${section.id}-formula-${idx++}`,
        value: match[1].trim(),
        confidence: 1.0,
      });
      protectedSpans.push({
        type: 'formula',
        start: match.index,
        end: match.index + match[0].length,
        content: match[0],
      });
    }

    // Inline formulas
    const inlineRegex = /\$([^$]+)\$/g;
    while ((match = inlineRegex.exec(draft)) !== null) {
      entries.push({
        category: 'formulas',
        key: `${section.id}-inline-${idx++}`,
        value: match[1].trim(),
        confidence: 1.0,
      });
      protectedSpans.push({
        type: 'formula',
        start: match.index,
        end: match.index + match[0].length,
        content: match[0],
      });
    }

    // Citations
    const citeRegex = /\\cite\{([^}]+)\}/g;
    while ((match = citeRegex.exec(draft)) !== null) {
      for (const key of match[1].split(',').map((k) => k.trim())) {
        entries.push({ category: 'citations', key, value: `Citation ${key} in ${section.id}`, confidence: 1.0 });
      }
      protectedSpans.push({
        type: 'citation',
        start: match.index,
        end: match.index + match[0].length,
        content: match[0],
      });
    }

    // Data points
    const dataRegex = /(\d+\.?\d*)\s*(%|percentage points|points)/g;
    while ((match = dataRegex.exec(draft)) !== null) {
      entries.push({ category: 'data', key: `${section.id}-data-${idx++}`, value: match[0], confidence: 0.9 });
      protectedSpans.push({ type: 'data', start: match.index, end: match.index + match[0].length, content: match[0] });
    }

    // Terminology
    const termRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    const seen = new Set<string>();
    while ((match = termRegex.exec(draft)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        entries.push({
          category: 'terminology',
          key: match[1].toLowerCase().replace(/\s+/g, '-'),
          value: match[1],
          confidence: 0.8,
        });
      }
    }

    // Claims
    if (/\b(achieves|outperforms|demonstrates|proves)\b/i.test(draft)) {
      entries.push({
        category: 'claims',
        key: `${section.id}-main-claim`,
        value: 'Performance or contribution claims found',
        confidence: 0.85,
      });
    }

    return { entries, protectedSpans };
  }

  verifyIntegrity(
    before: string,
    after: string,
    spans: ProtectedSpan[],
  ): { ok: boolean; violations: Array<{ type: string; expected: string; actual: string; location: string }> } {
    const violations: Array<{ type: string; expected: string; actual: string; location: string }> = [];
    for (const span of spans) {
      if (!after.includes(span.content)) {
        violations.push({
          type: span.type,
          expected: span.content,
          actual: '[not found]',
          location: `span-${span.start}-${span.end}`,
        });
      }
    }
    return { ok: violations.length === 0, violations };
  }
}
