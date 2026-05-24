// Cartographer Agent — 学术制图师（思维导图发散）
// 3轮发散策略：广度发散 → 深度挖掘 → 贡献定位
import { BaseAgent } from './base.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.ts';

// ── Types ──

export interface MindMapNode {
  id: string;
  label: string;
  parentId: string | null;
  round: number;
  checked: boolean;
  journalMatch: 'match' | 'partial' | 'mismatch';
  source: 'ai' | 'user';
  children?: MindMapNode[];
}

export interface CartographerInput {
  researchTopic: string;
  keywords?: string[];
  targetJournal?: string;
  existingNodes?: MindMapNode[];
  selectedNodeIds?: string[]; // User-selected nodes for depth diving
  currentRound: number; // 1=广度, 2=深度, 3=贡献定位
}

export interface CartographerOutput {
  nodes: MindMapNode[];
  round: number;
  summary: string;
}

// ── Agent ──

export class CartographerAgent extends BaseAgent<CartographerInput, CartographerOutput> {
  readonly name = 'Cartographer';
  private router?: LLMRouter;
  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: CartographerInput): Promise<CartographerOutput> {
    if (!this.router) return this.mockExecute(input);
    return this.llmExecute(input);
  }

  protected async mockExecute(input: CartographerInput): Promise<CartographerOutput> {
    return this.mockDiverge(input);
  }

  // ═══════════════════════════════════════
  // Real LLM execution
  // ═══════════════════════════════════════

  private async llmExecute(input: CartographerInput): Promise<CartographerOutput> {
    const { researchTopic, keywords, targetJournal, selectedNodeIds, currentRound, existingNodes } = input;

    let systemPrompt: string;
    let userPrompt: string;

    if (currentRound === 1) {
      systemPrompt = `You are an academic research topic explorer. Generate a mind map of research directions.
Output ONLY valid JSON array of objects: [{"label": "string"}]. Generate 5-8 top-level branches.
Each branch should be a distinct research direction related to the topic. Be specific and academic.`;
      userPrompt = `Research topic: ${researchTopic}
${keywords?.length ? `Keywords: ${keywords.join(', ')}` : ''}
${targetJournal ? `Target journal: ${targetJournal}` : ''}

Generate 5-8 major research branches (one level deep) for this topic.`;
    } else if (currentRound === 2) {
      const selectedLabels = existingNodes?.filter((n) => selectedNodeIds?.includes(n.id)).map((n) => n.label) ?? [];

      systemPrompt = `You are an academic research topic explorer. For each selected branch, generate 3-5 sub-topics.
Output ONLY valid JSON: {"branchName": [{"label": "string"}], ...}`;
      userPrompt = `Research topic: ${researchTopic}
Selected branches to deepen:
${selectedLabels.map((l) => `- ${l}`).join('\n')}

For each branch, generate 3-5 specific sub-topics or research questions.`;
    } else {
      const allLabels = existingNodes?.filter((n) => n.round <= 2).map((n) => `- ${n.label}`) ?? [];

      systemPrompt = `You are an academic research advisor. Identify research gaps and novelty opportunities.
Output ONLY valid JSON: {"gaps": ["string"], "noveltyCandidates": ["string"]}`;
      userPrompt = `Research topic: ${researchTopic}
Current mind map branches:
${allLabels.join('\n')}

Identify: 1) Research gaps (unexplored areas), 2) Novelty candidates (potential contributions).`;
    }

    const response = await this.router!.complete('cartographer', systemPrompt, userPrompt, { temperature: 0.7 });
    const cleaned = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return this.formatLLMOutput(parsed, input);
    } catch (e) {
      logger.warn('Cartographer JSON parse failed', String(e));
      // Fallback to mock if LLM output is unparseable
      return this.mockDiverge(input);
    }
  }

  private formatLLMOutput(parsed: unknown, input: CartographerInput): CartographerOutput {
    const { currentRound, existingNodes, selectedNodeIds } = input;
    const round = currentRound;
    let nodes: MindMapNode[] = [];
    let summary: string;

    if (round === 1) {
      const items: string[] = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]).map((p) => String(p.label ?? p)) : [];
      nodes = items.map((label, i) => ({
        id: `r1-${i}`,
        label,
        parentId: null,
        round: 1,
        checked: false,
        journalMatch: 'partial' as const,
        source: 'ai' as const,
      }));
      summary = `Round 1: Generated ${nodes.length} top-level branches`;
    } else if (round === 2) {
      const parsedObj = parsed as Record<string, unknown>;
      let idx = 0;
      for (const [parentLabel, children] of Object.entries(parsedObj)) {
        if (!Array.isArray(children)) continue;
        const parent = existingNodes?.find((n) => n.label === parentLabel && selectedNodeIds?.includes(n.id));
        if (!parent) continue;
        for (const child of children as Record<string, unknown>[]) {
          nodes.push({
            id: `r2-${idx++}`,
            label: String(child.label ?? child),
            parentId: parent.id,
            round: 2,
            checked: false,
            journalMatch: 'partial' as const,
            source: 'ai' as const,
          });
        }
      }
      summary = `Round 2: Generated ${nodes.length} sub-topics`;
    } else {
      const parsedObj = parsed as Record<string, unknown>;
      const gaps: string[] = (parsedObj.gaps ?? []) as string[];
      const novelty: string[] = (parsedObj.noveltyCandidates ?? []) as string[];
      nodes = [
        ...gaps.map((g, i) => ({
          id: `r3-gap-${i}`,
          label: `[Gap] ${g}`,
          parentId: null,
          round: 3,
          checked: false,
          journalMatch: 'match' as const,
          source: 'ai' as const,
        })),
        ...novelty.map((n, i) => ({
          id: `r3-nov-${i}`,
          label: `[Novelty] ${n}`,
          parentId: null,
          round: 3,
          checked: false,
          journalMatch: 'match' as const,
          source: 'ai' as const,
        })),
      ];
      summary = `Round 3: Identified ${gaps.length} gaps, ${novelty.length} novelty candidates`;
    }

    return { nodes, round, summary };
  }

  // ═══════════════════════════════════════
  // Mock execution (realistic academic content)
  // ═══════════════════════════════════════

  private mockDiverge(input: CartographerInput): CartographerOutput {
    const { researchTopic, currentRound, existingNodes, selectedNodeIds } = input;
    const topic = researchTopic.toLowerCase();

    if (currentRound === 1) {
      const branches = this.getMockBranches(topic);
      const nodes: MindMapNode[] = branches.map((label, i) => ({
        id: `r1-${i}`,
        label,
        parentId: null,
        round: 1,
        checked: false,
        journalMatch: 'partial' as const,
        source: 'ai' as const,
      }));
      return { nodes, round: 1, summary: `Round 1: ${nodes.length} branches for "${researchTopic}"` };
    }

    if (currentRound === 2) {
      const nodes: MindMapNode[] = [];
      let idx = 0;
      const selected = existingNodes?.filter((n) => selectedNodeIds?.includes(n.id)) ?? [];
      for (const parent of selected) {
        const subs = this.getMockSubTopics(parent.label, topic);
        for (const sub of subs) {
          nodes.push({
            id: `r2-${idx++}`,
            label: sub,
            parentId: parent.id,
            round: 2,
            checked: false,
            journalMatch: 'partial' as const,
            source: 'ai' as const,
          });
        }
      }
      return { nodes, round: 2, summary: `Round 2: ${nodes.length} sub-topics` };
    }

    // Round 3: Contribution positioning
    const gaps = this.getMockGaps(topic);
    const novelty = this.getMockNovelty(topic);
    const nodes: MindMapNode[] = [
      ...gaps.map((g, i) => ({
        id: `r3-gap-${i}`,
        label: `[Gap] ${g}`,
        parentId: null,
        round: 3,
        checked: false,
        journalMatch: 'match' as const,
        source: 'ai' as const,
      })),
      ...novelty.map((n, i) => ({
        id: `r3-nov-${i}`,
        label: `[Novelty] ${n}`,
        parentId: null,
        round: 3,
        checked: false,
        journalMatch: 'match' as const,
        source: 'ai' as const,
      })),
    ];
    return { nodes, round: 3, summary: `Round 3: ${gaps.length} gaps, ${novelty.length} novelty candidates` };
  }

  private getMockBranches(topic: string): string[] {
    if (topic.includes('attention') || topic.includes('transformer')) {
      return [
        'Linear Attention Mechanisms',
        'Sparse Attention Patterns',
        'Low-Rank Approximation Methods',
        'Hardware-Aware Attention Optimization',
        'Attention in Long-Context Scenarios',
        'Multi-Modal Attention Fusion',
        'Attention Distillation and Compression',
        'Theoretical Analysis of Attention Expressivity',
      ];
    }
    if (topic.includes('language model') || topic.includes('llm')) {
      return [
        'Scaling Laws and Emergent Abilities',
        'Instruction Tuning and Alignment',
        'Efficient Fine-Tuning Methods',
        'In-Context Learning Mechanisms',
        'Multi-Modal Language Models',
        'Safety and Red-Teaming',
        'Evaluation Benchmarks and Protocols',
        'Deployment and Inference Optimization',
      ];
    }
    // Generic
    return [
      'Theoretical Foundations',
      'Architectural Innovations',
      'Training Methodologies',
      'Evaluation and Benchmarks',
      'Applications and Deployment',
      'Efficiency and Scalability',
      'Safety and Robustness',
    ];
  }

  private getMockSubTopics(parentLabel: string, _topic: string): string[] {
    const map: Record<string, string[]> = {
      'Linear Attention Mechanisms': [
        'Random feature map approximation (Performer)',
        'Kernel-based linear attention (RFA)',
        'Causal linear attention for autoregressive models',
        'Complexity-accuracy tradeoffs in linear attention',
      ],
      'Sparse Attention Patterns': [
        'Fixed patterns (local window, strided, global)',
        'Learned sparse patterns via routing',
        'BigBird and Longformer architectures',
        'Block-sparse attention for structured data',
      ],
      'Low-Rank Approximation Methods': [
        'Nyström approximation for attention',
        'Linformer and random projection',
        'SVD-based attention compression',
        'Adaptive rank selection strategies',
      ],
      'Hardware-Aware Attention Optimization': [
        'FlashAttention and IO-aware computation',
        'Fused attention kernels',
        'Quantized attention (INT8/FP8)',
        'Memory-efficient attention for edge devices',
      ],
      'Attention in Long-Context Scenarios': [
        'Ring attention for distributed long sequences',
        'Memory-augmented attention',
        'Position interpolation for extended context',
        'Evaluation of long-range dependencies',
      ],
    };
    return (
      map[parentLabel] ?? [
        `${parentLabel}: fundamental concepts`,
        `${parentLabel}: recent advances`,
        `${parentLabel}: open challenges`,
        `${parentLabel}: practical applications`,
      ]
    );
  }

  private getMockGaps(_topic: string): string[] {
    return [
      'Lack of unified benchmark comparing all efficient attention families under identical conditions',
      'Limited analysis of attention mechanism interaction with layer normalization and residual connections',
      'Insufficient evaluation on real-world deployment scenarios beyond academic benchmarks',
      'Missing theoretical characterization of when sparse/linear attention preserves full attention expressivity',
    ];
  }

  private getMockNovelty(_topic: string): string[] {
    return [
      'Adaptive attention switching based on input complexity and sequence length',
      'Hardware-software co-design for attention: jointly optimizing algorithm and kernel',
      'Theoretical framework connecting attention sparsity patterns to task performance',
      'Efficient attention for retrieval-augmented generation with dynamic context windows',
    ];
  }
}
