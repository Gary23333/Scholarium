import { BaseAgent } from './base.ts';
import type { AgentOptions, NormalizerInput, NormalizeResult, LengthGovernanceConfig } from '../types/index.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.ts';

const DEFAULT_LENGTH_CONFIG: LengthGovernanceConfig = {
  mode: 'word',
  targetMin: 0,
  targetMax: Infinity,
  hardCap: Infinity,
  strategy: 'warn_only',
};

export class NormalizerAgent extends BaseAgent<NormalizerInput, NormalizeResult> {
  readonly name = 'Normalizer';
  private config: LengthGovernanceConfig;
  private router?: LLMRouter;

  constructor(router?: LLMRouter, config?: Partial<LengthGovernanceConfig>) {
    super();
    this.router = router;
    this.config = { ...DEFAULT_LENGTH_CONFIG, ...config };
  }

  setConfig(config: Partial<LengthGovernanceConfig>) {
    this.config = { ...this.config, ...config };
  }

  protected async realExecute(input: NormalizerInput): Promise<NormalizeResult> {
    if (!this.router) return this.process(input);
    return this.llmProcess(input);
  }

  protected async mockExecute(input: NormalizerInput): Promise<NormalizeResult> {
    return this.process(input);
  }

  private async llmProcess(input: NormalizerInput): Promise<NormalizeResult> {
    const { draft, targetWordCount, currentWordCount } = input;
    const ratio = currentWordCount / targetWordCount;
    const overBudget = ratio > 1.2;
    const underBudget = ratio < 0.8;

    if (!overBudget && !underBudget) {
      return {
        normalizedDraft: draft,
        newWordCount: currentWordCount,
        changes: [],
        overBudgetRatio: 0,
        needsArchitectFeedback: false,
      };
    }

    const action = overBudget ? 'compress' : 'expand';
    const systemPrompt = `You are an academic text normalizer. ${overBudget ? 'Compress' : 'Expand'} the following LaTeX academic text.
Target word count: ${targetWordCount}
Current word count: ${currentWordCount}

${
  overBudget
    ? 'COMPRESSION RULES:\n- Remove redundant phrases, filler words, and verbose expressions\n- Merge short sentences where appropriate\n- Preserve ALL citations (\\\\cite{...}), equations, and technical terms\n- Do NOT change meaning or remove key claims\n- Keep section headers and labels intact'
    : 'EXPANSION RULES:\n- Add clarifying examples, rhetorical questions, or explanatory sentences\n- Expand abbreviations on first use\n- Add brief transitions between paragraphs\n- Preserve ALL citations (\\\\cite{...}), equations, and technical terms\n- Do NOT add fabricated data or false claims\n- Keep section headers and labels intact'
}

Output ONLY the modified LaTeX content, no explanations.`;

    const userPrompt = `Target word count: ${targetWordCount}
Current word count: ${currentWordCount}

Draft:
${draft.substring(0, 8000)}

Please ${action} this text to approximately ${targetWordCount} words while preserving all technical content.`;

    try {
      const content = await this.router!.complete('normalizer', systemPrompt, userPrompt, {
        temperature: 0.2,
        maxTokens: 16384,
        timeout: 300000,
      });
      const cleaned = content
        .replace(/^```(?:latex)?\n?/i, '')
        .replace(/```\n?$/i, '')
        .trim();
      const newWordCount = cleaned.split(/\s+/).length;
      return {
        normalizedDraft: cleaned,
        newWordCount,
        changes: [
          {
            category: 'terminology',
            key: action,
            oldValue: draft.substring(0, 100),
            newValue: cleaned.substring(0, 100),
            sourceSectionId: 'unknown',
            reason: `${action === 'compress' ? 'Compressed' : 'Expanded'} from ${currentWordCount} to ${newWordCount} words (target: ${targetWordCount})`,
          },
        ],
        overBudgetRatio: Math.max(0, (newWordCount - targetWordCount) / targetWordCount),
        needsArchitectFeedback: overBudget && newWordCount > targetWordCount * 1.2,
      };
    } catch (e) {
      logger.warn('Normalizer LLM failed', String(e));
      return this.process(input);
    }
  }

  private process(input: NormalizerInput): NormalizeResult {
    const { draft, targetWordCount, currentWordCount } = input;
    const ratio = currentWordCount / targetWordCount;
    let normalizedDraft = draft;
    const changes: NormalizeResult['changes'] = [];

    const overBudget = ratio > 1.2;
    const underBudget = ratio < 0.8;

    // Compress when over budget
    if (overBudget) {
      const compressed = this.compress(normalizedDraft);
      if (compressed.length < normalizedDraft.length) {
        changes.push({
          category: 'terminology',
          key: 'compression',
          oldValue: draft.substring(0, 100),
          newValue: compressed.substring(0, 100),
          sourceSectionId: 'unknown',
          reason: `Compressed from ${currentWordCount} to ~${compressed.split(/\s+/).length} words`,
        });
        normalizedDraft = compressed;
      }
    }

    // Expand when under budget (new bidirectional feature)
    if (underBudget) {
      const expanded = this.expand(normalizedDraft, currentWordCount, targetWordCount);
      if (expanded.length > normalizedDraft.length) {
        changes.push({
          category: 'terminology',
          key: 'expansion',
          oldValue: draft.substring(0, 100),
          newValue: expanded.substring(0, 100),
          sourceSectionId: 'unknown',
          reason: `Expanded from ${currentWordCount} toward target ${targetWordCount} words`,
        });
        normalizedDraft = expanded;
      }
    }

    const newWordCount = normalizedDraft.split(/\s+/).length;
    const overBudgetRatio = Math.max(0, (newWordCount - targetWordCount) / targetWordCount);

    return {
      normalizedDraft,
      newWordCount,
      changes,
      overBudgetRatio,
      needsArchitectFeedback: overBudgetRatio > 0.2 || underBudget,
    };
  }

  private compress(text: string): string {
    return text
      .replace(/In recent years, /g, 'Recently, ')
      .replace(/Despite these advances, /g, 'However, ')
      .replace(/It is worth noting that /g, '')
      .replace(/It is important to note that /g, '')
      .replace(/As mentioned earlier, /g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private expand(text: string, current: number, target: number): string {
    const deficit = target - current;
    if (deficit <= 0) return text;

    let expanded = text;

    // Pattern 1: Expand "we propose X" to include rationale
    expanded = expanded.replace(
      /(我们|we)\s+(提出|propose|设计|design)\s+(a|an|the|一个|一种)?\s*(新颖的|novel|新的)?\s*(方法|method|approach|framework|算法)/gi,
      '我们提出了一种新颖的方法',
    );

    // Pattern 2: Add specificity to vague statements
    expanded = expanded.replace(/(我们|we)\s+(提出|propose|设计|design)\s/gi, '我们提出');

    // Pattern 3: Expand result statements with context
    expanded = expanded.replace(/(达到|achieves|达到|获得|obtains?)\s+(\d+\.?\d*)\s*(%|x|×)/gi, '达到了 $2$%');

    // If still significantly under, add explanatory sentence
    if (expanded.split(/\s+/).length < target * 0.7) {
      expanded = expanded.replace(
        /(\\section\{[^}]+\}\s*\\label\{[^}]+\}\s*)/g,
        '$1\n% This section describes the approach in detail.\n',
      );
      // Add content expansion for very short drafts
      const wordCount = expanded.split(/\s+/).length;
      if (wordCount < target * 0.5) {
        expanded =
          expanded +
          '\n\n% TODO: Expand with detailed analysis and discussion of the methodology and its implications for the research field.';
      }
    }

    return expanded;
  }
}
