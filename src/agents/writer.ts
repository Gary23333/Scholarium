import { BaseAgent } from './base.ts';
import type { AgentOptions, WriterInput, WriterOutput, ParagraphBlueprint } from '../types/index.ts';
import type { LLMRouter } from '../llm/router.ts';

export class WriterAgent extends BaseAgent<WriterInput, WriterOutput> {
  readonly name = 'Writer';
  private router?: LLMRouter;
  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: WriterInput): Promise<WriterOutput> {
    if (!this.router) return this.mockExecute(input);
    const { blueprint, context } = input;
    const isRevision = !!input.previousDraft && !!context.fixInstructions;
    const approvedCites = context.citationPool.filter((c) => c.approvalStatus === 'approved');
    const citePoolInfo =
      approvedCites.length > 0
        ? `Approved citation keys: ${approvedCites.map((c) => c.citeKey).join(', ')}`
        : 'No approved citations available.';
    const bibleTerms = context.bibleSnapshot
      .filter((e) => e.category === 'terminology')
      .map((e) => `${e.key}: ${e.value}`)
      .join('\n');
    const previousContext = context.previousSections?.map((s) => `Section "${s.title}": ${s.summary}`).join('\n') ?? '';
    const sectionId = blueprint.sectionId ?? '';
    const isAbstract = sectionId.includes('abstract') || blueprint.sectionTitle?.includes('摘要');
    const wordLimit = isAbstract ? '200-300' : '200-600';
    const abstractRule = isAbstract
      ? `\nABSTRACT RULES (严格遵循):
- 字数严格控制在${wordLimit}字以内
- 回答四个关键问题：研究是什么？背景和意义是什么？你做了什么？你发现了什么？
- 删除高度概括和冗余词句，少用鲜为人知的技术词汇
- 不使用公司名称、首字母缩写、缩写或符号
- 不要引用或改写他人的观点，不要在摘要中出现引用
- 强调你自己的想法，而不是强调别人的想法`
      : '';

    const sectionSpecificRules = sectionId.startsWith('1')
      ? `\nINTRODUCTION RULES (严格遵循):
- 不要开篇提出研究问题或假设
- 需要定义技术术语和概念
- 综述要简洁明了，重点放在近几年最新研究上
- 避免综述与你研究并无直接关联的文献
- 通过指出前人研究的不足与不确定来突出你自己研究的学术意义`
      : sectionId.startsWith('3')
        ? `\nMETHOD RULES (严格遵循):
- 方法必须描述清楚，以便研究或实验可以被其他研究人员重复
- 在适当的位置引用在该领域中已经建立的方法
- 不同方法需分为不同小节
- 描述不常见的专用设备或用品（不包括试管、烧杯等标准实验室设备）`
        : sectionId.startsWith('4')
          ? `\nRESULTS RULES (严格遵循):
- 回顾研究的目的，提供对结果的总体概述
- 将研究结果与以往的研究结果进行比较
- 陈述研究结果的不足、问题和缺陷
- 图和表必须构建有效：图例简洁独立、足够放大清晰
- 大量无法避免的重复数据应压缩放在表中`
          : sectionId.startsWith('5')
            ? `\nDISCUSSION RULES (严格遵循):
- 确保观点明确且有重要意义
- 检验论据：该论据是正确的且有适当限定条件吗？对读者而言是否适当且有说服力？
- 回应替代方案和反对理由
- 诚实承认在本论文中无法解决的问题
- 不要简单地说"研究的结果将会被讨论"，需要写下结果以及为什么重要`
            : '';

    const systemPrompt = `You are an academic paper writer. Generate detailed and comprehensive LaTeX content for a paper section.${abstractRule}${sectionSpecificRules}
RULES:
- Every non-obvious claim MUST have \\cite{} support. Use ONLY approved citation keys.
- Do NOT fabricate data. Use \\begin{equation}...\\end{equation} for equations.
- Write with precision: avoid filler phrases, be specific, be concise.
- 强调你自己的想法，而不是强调别人的想法
- Output ONLY LaTeX content.`;
    let userPrompt: string;
    if (isRevision) {
      userPrompt = `REVISE based on: ${context.fixInstructions!.instruction}\n\nDraft:\n${input.previousDraft}\n\n${citePoolInfo}`;
    } else {
      const paraDesc = blueprint.paragraphs.map((p) => `- ${p.order}. [${p.purpose}]: ${p.coreSentence}`).join('\n');
      userPrompt = `Write section "${blueprint.sectionTitle}".\n\nStructure:\n${paraDesc}\n\n${previousContext ? `Context:\n${previousContext}\n` : ''}${citePoolInfo}`;
    }
    const content = await this.router.complete('writer', systemPrompt, userPrompt, {
      temperature: 0.1,
      maxTokens: 16384,
      timeout: 600000,
    });
    const wordCount = content.split(/\s+/).length;
    const usedCitations: string[] = [];
    const citeRegex = /\\cite\{([^}]+)\}/g;
    let match;
    while ((match = citeRegex.exec(content)) !== null) {
      for (const k of match[1].split(',').map((s) => s.trim())) {
        if (!usedCitations.includes(k)) usedCitations.push(k);
      }
    }
    return { texContent: content, wordCount, usedCitations };
  }

  protected async mockExecute(input: WriterInput): Promise<WriterOutput> {
    const { blueprint, context, previousDraft } = input;
    const isRevision = !!previousDraft && !!context.fixInstructions;
    let texContent: string;
    if (isRevision) {
      texContent = this.generateRevision(previousDraft!, context.fixInstructions!);
    } else {
      texContent = this.generateSmartDraft(blueprint, context);
    }
    const usedCitations: string[] = [];
    const citeRegex = /\\cite\{([^}]+)\}/g;
    let match;
    while ((match = citeRegex.exec(texContent)) !== null) {
      usedCitations.push(match[1]);
    }
    return { texContent, wordCount: texContent.split(/\s+/).length, usedCitations };
  }

  private generateSmartDraft(blueprint: WriterInput['blueprint'], context: WriterInput['context']): string {
    const topic = context.outline.title;
    const sectionTitle = blueprint.sectionTitle;
    const coreArg = context.currentSection.coreArgument;
    const pool = context.citationPool.filter((c) => c.approvalStatus === 'approved');
    const citeKeys = pool.length > 0 ? pool.map((c) => c.citeKey) : this.getDefaultCitations(sectionTitle);
    const sectionId = blueprint.sectionId;
    const st = sectionTitle.toLowerCase();
    const lines: string[] = [`\\section{${sectionTitle}}`, `\\label{sec:${sectionId.replace(/^\d+-/, '')}}`, ''];
    const purposeCount: Record<string, number> = {};
    for (const para of blueprint.paragraphs) {
      const count = (purposeCount[para.purpose] ?? 0) + 1;
      purposeCount[para.purpose] = count;
      lines.push(this.generateParagraph(para, sectionTitle, coreArg, citeKeys, topic, count, st));
      lines.push('');
    }
    return lines.join('\n');
  }

  private getDefaultCitations(sectionTitle: string): string[] {
    const st = sectionTitle.toLowerCase();
    if (st.includes('introduction')) return ['vaswani2017attention', 'devlin2019bert', 'brown2020language'];
    if (st.includes('related'))
      return [
        'vaswani2017attention',
        'radford2019language',
        'devlin2019bert',
        'raffel2020exploring',
        'touvron2023llama',
      ];
    if (st.includes('method')) return ['vaswani2017attention', 'he2016deep', 'ba2016layer'];
    if (st.includes('experiment') || st.includes('result'))
      return ['wang2019superglue', 'rajkumar2022evaluating', 'liang2022holistic'];
    if (st.includes('conclusion')) return ['vaswani2017attention', 'brown2020language'];
    return ['vaswani2017attention', 'devlin2019bert'];
  }

  private generateParagraph(
    para: ParagraphBlueprint,
    sectionTitle: string,
    coreArg: string,
    citeKeys: string[],
    topic: string,
    nthOfPurpose: number,
    st: string,
  ): string {
    const c1 = citeKeys[0] ?? 'vaswani2017attention';
    const c2 = citeKeys[1] ?? 'devlin2019bert';
    const c3 = citeKeys[2] ?? 'brown2020language';
    const c4 = citeKeys[3] ?? 'raffel2020exploring';
    const c5 = citeKeys[4] ?? 'touvron2023llama';
    const topicShort = this.extractTopic(topic);

    switch (para.purpose) {
      case 'background':
        if (st.includes('introduction'))
          return `The field of ${topicShort} has undergone significant transformation in recent years, driven largely by advances in deep learning and large-scale pre-training paradigms \\cite{${c1}, ${c2}}. The introduction of the transformer architecture \\cite{${c1}} marked a pivotal moment, establishing a foundation upon which modern natural language processing systems are built. These developments have not only improved performance on established benchmarks but have also opened new avenues for research in areas previously considered intractable.`;
        if (st.includes('related'))
          return `Research on ${topicShort} can be broadly categorized into three streams: architectural innovations, training methodology improvements, and application-specific adaptations. The foundational work on attention mechanisms \\cite{${c1}} established the core computational primitive, while subsequent efforts \\cite{${c2}, ${c3}} demonstrated the effectiveness of scaling both model capacity and training data. More recent investigations have focused on efficiency improvements, with approaches ranging from sparse attention patterns to knowledge distillation techniques.`;
        if (st.includes('method'))
          return `This section presents our proposed approach for ${topicShort}. We begin by formalizing the computational framework underlying standard self-attention, then introduce our modifications that reduce complexity while preserving representational capacity. Our design draws inspiration from recent work on efficient transformers \\cite{${c1}, ${c2}}, but introduces several key innovations that we detail below.`;
        if (st.includes('experiment'))
          return `We evaluate our proposed approach on a suite of established benchmarks spanning both long-document understanding and standard language modeling tasks. Our experimental design follows the evaluation protocol outlined in \\cite{${c1}}, with additional metrics to capture efficiency gains. All experiments were conducted using a standardized training pipeline to ensure reproducibility.`;
        if (st.includes('conclusion'))
          return `In this paper, we investigated ${topicShort} and proposed a novel sparse attention mechanism that reduces computational complexity from $O(n^2)$ to $O(n \\log n)$. Our approach combines learned sparse routing with a hybrid dense-sparse architecture, achieving competitive accuracy with significant efficiency gains across multiple benchmark tasks \\cite{${c1}, ${c2}}.`;
        return `The study of ${topicShort} builds upon a rich body of prior work \\cite{${c1}, ${c2}}.`;

      case 'motivation':
        if (st.includes('introduction'))
          return `Despite remarkable progress, several critical challenges remain unaddressed. First, the computational demands of current models scale unfavorably with sequence length, limiting their applicability to long-document understanding tasks \\cite{${c2}}. Second, the opacity of learned representations raises concerns about reliability and interpretability in high-stakes domains. Third, existing evaluation methodologies often fail to capture the nuanced capabilities required for genuine language understanding, as evidenced by systematic performance gaps on adversarial and out-of-distribution benchmarks \\cite{${c3}}.`;
        if (st.includes('method'))
          return `The primary challenge in efficient attention design lies in balancing two competing objectives: reducing the $O(n^2)$ memory and compute requirements of full self-attention, while retaining the modeling capacity that enables transformers to capture long-range dependencies. Existing approaches \\cite{${c1}} typically sacrifice one for the other---sparse attention loses global context, while linear attention loses the ability to model sharp, localized interactions. Our method addresses this tension through a hybrid architecture that dynamically allocates compute between sparse and dense attention paths.`;
        if (st.includes('experiment'))
          return `We design our experimental evaluation to answer three key questions: (1)~Does our sparse attention mechanism achieve competitive accuracy compared to full attention? (2)~What are the concrete efficiency gains in terms of memory and throughput? (3)~How does the approach scale to longer sequences where efficiency matters most?`;
        if (st.includes('conclusion'))
          return `Our key contributions are threefold: (1)~a learned sparse routing mechanism that selects relevant context with $O(n \\log n)$ complexity, (2)~a hybrid dense-sparse architecture that preserves global attention where needed, and (3)~a comprehensive empirical evaluation demonstrating $3$--$9\\times$ speedups with less than $2\\%$ accuracy degradation on standard benchmarks.`;
        return `However, existing approaches exhibit notable limitations that constrain their practical utility. The quadratic complexity of standard self-attention \\cite{${c1}} becomes prohibitive for long sequences, motivating our investigation into more efficient alternatives.`;

      case 'method':
        if (nthOfPurpose === 1 && st.includes('method'))
          return `We formalize the problem setting as follows. Given an input sequence $\\mathbf{x} = (x_1, x_2, \\ldots, x_n) \\in \\mathcal{V}^n$ where $\\mathcal{V}$ denotes the vocabulary, our objective is to learn a mapping $f_\\theta: \\mathcal{V}^n \\rightarrow \\mathcal{Y}$ that minimizes the expected loss:\n\n\\begin{equation}\n\\mathcal{L}(\\theta) = \\mathbb{E}_{(\\mathbf{x}, y) \\sim \\mathcal{D}} \\left[ \\ell(f_\\theta(\\mathbf{x}), y) \\right]\n\\label{eq:objective}\n\\end{equation}\n\nwhere $\\ell$ denotes the cross-entropy loss and $\\mathcal{D}$ represents the underlying data distribution. The standard self-attention mechanism computes:\n\n\\begin{equation}\n\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V\n\\label{eq:attention}\n\\end{equation}\n\nwhere $Q$, $K$, $V$ are the query, key, and value projections respectively, and $d_k$ is the key dimension.`;
        if (nthOfPurpose === 2 && st.includes('method'))
          return `Our proposed sparse attention mechanism replaces the full $n \\times n$ attention matrix with a learned sparse pattern. Specifically, we introduce a routing function $g_\\phi: \\mathbb{R}^{d} \\rightarrow \\{0,1\\}^{n}$ that selects the top-$k$ most relevant key positions for each query:\n\n\\begin{equation}\n\\text{SparseAttn}(q_i, K, V) = \\frac{\\sum_{j \\in \\mathcal{S}_i} \\exp\\left(\\frac{q_i \\cdot k_j}{\\sqrt{d_k}}\\right) v_j}{\\sum_{j \\in \\mathcal{S}_i} \\exp\\left(\\frac{q_i \\cdot k_j}{\\sqrt{d_k}}\\right)}\n\\label{eq:sparse-attn}\n\\end{equation}\n\nwhere $\\mathcal{S}_i = \\text{TopK}(g_\\phi(q_i), k)$ and $k = O(\\log n)$. This reduces both memory and compute from $O(n^2)$ to $O(n \\log n)$ while maintaining the ability to attend to any position in the sequence.`;
        if (st.includes('method'))
          return `We incorporate two additional components to stabilize training and improve convergence. First, we apply layer normalization \\cite{${c3}} before each sub-layer rather than after, following the pre-norm variant that has shown improved training dynamics in deep transformers. Second, we introduce a residual scaling factor $\\alpha = 1/\\sqrt{2L}$ where $L$ is the number of layers, which prevents gradient magnitudes from growing unboundedly in deep configurations \\cite{${c2}}.`;
        return `Our approach introduces three key modifications to the standard transformer architecture \\cite{${c1}}: a linearized attention variant, multi-scale feature aggregation, and curriculum-based training.`;

      case 'result':
        if (st.includes('experiment'))
          return `Table~\\ref{tab:main-results} summarizes our experimental findings across five benchmark datasets. Our method achieves state-of-the-art performance on three of five tasks, with particularly notable gains on long-document understanding ($+4.2\\%$ over the strongest baseline) and low-resource settings ($+6.8\\%$ with only 1\\% of training data). The improvements are consistent across different model scales, suggesting that our architectural modifications provide genuine representational advantages rather than merely benefiting from increased capacity.`;
        if (st.includes('conclusion'))
          return `Experimental results confirm the practical value of our approach. On the LongBench benchmark, our method achieves $91.4\\%$ of full-attention accuracy while requiring only $12\\%$ of the memory and processing sequences $8.7\\times$ faster at length 16,384. These efficiency gains make our approach particularly suitable for resource-constrained deployment scenarios.`;
        return `Empirical evaluation demonstrates the effectiveness of our approach, with a $3.7\\%$ improvement over the baseline \\cite{${c2}} ($p < 0.01$).`;

      case 'discussion':
        if (st.includes('method'))
          return `The proposed architecture has a time complexity of $O(n \\log n)$ and space complexity of $O(n)$, compared to $O(n^2)$ for both in standard self-attention. In practice, this translates to a $3.2\\times$ speedup for sequences of length 4,096 and $8.7\\times$ for sequences of length 16,384 on a single A100 GPU. The learned routing function adds negligible overhead ($<2\\%$ of total compute) and can be pre-computed for inference.`;
        if (st.includes('experiment'))
          return `Ablation studies further validate that each component contributes to the overall performance. Removing the sparse attention mechanism reduces accuracy by $1.9\\%$, while replacing the learned routing with random top-$k$ selection drops performance by $3.4\\%$. The curriculum training strategy accounts for an additional $1.2\\%$ gain, particularly on long-sequence tasks where the model must learn to allocate attention efficiently.`;
        if (st.includes('conclusion'))
          return `Several directions merit further investigation. First, extending our sparse routing mechanism to cross-attention layers in encoder-decoder architectures could yield additional efficiency gains for sequence-to-sequence tasks. Second, the interaction between sparse attention and other efficiency techniques such as quantization and knowledge distillation remains underexplored. Third, adapting the routing mechanism to domain-specific tasks could unlock further performance improvements in specialized applications.`;
        return `The experimental results suggest several important conclusions about the effectiveness of our approach.`;

      case 'transition':
        if (st.includes('introduction'))
          return `The remainder of this paper is organized as follows. Section~\\ref{sec:related-work} reviews the relevant literature on attention mechanisms and efficient transformers. Section~\\ref{sec:methodology} presents our proposed method in detail. Section~\\ref{sec:experiments} describes our experimental setup and results, and Section~\\ref{sec:conclusion} concludes with a discussion of implications and future directions.`;
        if (st.includes('related'))
          return `In the following section, we describe our proposed method that addresses the limitations identified above.`;
        if (st.includes('conclusion') || st.includes('experiment')) return ''; // No transition in final sections
        return ''; // Skip generic transitions

      default:
        return `${para.coreSentence} This represents a key aspect of ${topicShort} that warrants careful investigation \\cite{${c1}}.`;
    }
  }

  private extractTopic(title: string): string {
    return (
      title
        .replace(/^(Research on|A Study of|An Analysis of|Towards|Exploring)\s+/i, '')
        .replace(/\s*:\s*.+$/, '')
        .trim() || 'the proposed approach'
    );
  }

  private generateRevision(draft: string, fixes: any): string {
    let revised = draft;
    if (fixes.instruction?.includes('引用') || fixes.instruction?.includes('citation')) {
      if (fixes.citationReport?.fabricatedCitations?.length) {
        for (const bad of fixes.citationReport.fabricatedCitations) {
          revised = revised.replace(new RegExp(`\\\\cite\\{[^}]*${bad}[^}]*\\}`, 'g'), '\\cite{placeholder2024}');
        }
      }
    }
    if (fixes.instruction?.includes('AI') || fixes.instruction?.includes('降低')) {
      revised = revised
        .replace(/Furthermore,/g, 'In addition,')
        .replace(/Moreover,/g, 'What is more,')
        .replace(/significant attention/g, 'considerable interest');
    }
    return revised;
  }
}
