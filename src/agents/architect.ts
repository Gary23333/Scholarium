import { BaseAgent } from './base.ts';
import type { AgentOptions, OutlineSection, PaperOutline, SectionBlueprint, JournalProfile } from '../types/index.ts';
import type { LLMRouter } from '../llm/router.ts';

export interface ArchitectInput {
  section: OutlineSection;
  outline: PaperOutline;
  journalProfile?: JournalProfile;
}

export class ArchitectAgent extends BaseAgent<ArchitectInput, SectionBlueprint> {
  readonly name = 'Architect';
  private router?: LLMRouter;
  constructor(router?: LLMRouter) { super(); this.router = router; }

  protected async realExecute(input: ArchitectInput): Promise<SectionBlueprint> {
    if (!this.router) return this.mockExecute(input);
    const systemPrompt = `You are an academic paper architect. Design paragraph-level structure for a paper section.
Output ONLY valid JSON:
{
  "sectionId": "string",
  "sectionTitle": "string",
  "paragraphs": [
    {
      "id": "string",
      "order": number,
      "coreSentence": "string describing the paragraph's main point",
      "purpose": "background|motivation|method|result|discussion|transition",
      "requiredCitations": []
    }
  ],
  "estimatedWords": number
}`;

    const sectionId = input.section.id;
    let purposeGuide = '';
    if (sectionId === '1') {
      purposeGuide = '段落目的分布建议：背景介绍由宽泛到具体（background为主）、前人研究综述（background）、研究不足与动机（motivation）、本文贡献与论文结构（transition）。避免开篇直接进入研究问题。';
    } else if (sectionId.startsWith('3')) {
      purposeGuide = '段落目的分布建议：问题形式化定义（method）、方法总述（method）、各子模块详述（method）、理论分析（discussion）。不同方法需分为不同段落/小节。';
    } else if (sectionId.startsWith('4')) {
      purposeGuide = '段落目的分布建议：实验目的回顾（transition）、总体结果概述（result）、各数据集结果（result）、与以往结果对比（discussion）、消融实验（result）、不足分析（discussion）。图和表需构建有效。';
    } else if (sectionId.startsWith('5')) {
      purposeGuide = '段落目的分布建议：全文工作总结（result）、核心贡献（discussion）、方法论局限（discussion）、未来展望（discussion）。必须承认无法解决的问题。';
    }

    const userPrompt = `Section: ${input.section.title}
Core argument: ${input.section.coreArgument}
Estimated pages: ${input.section.estimatedPages}
Required citations: ${input.section.requiredCitations}

Design detailed paragraphs with appropriate purposes for this section. Each paragraph should cover a specific sub-topic with depth.
${purposeGuide}
Paragraph purposes can be: background, motivation, method, result, discussion, transition.
- background: provide background, literature review, definitions (starting broad then narrowing)
- motivation: identify research gaps, limitations of prior work, explain why this study matters
- method: describe approach, algorithms, formal definitions, experimental design
- result: present findings, data, comparisons, observations
- discussion: interpret results, compare with prior work, acknowledge limitations
- transition: connect sections, outline structure, summarize`;

    const content = await this.router.complete('architect', systemPrompt, userPrompt, { maxTokens: 8192, timeout: 600000 });
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as SectionBlueprint;
  }

  protected async mockExecute(input: ArchitectInput): Promise<SectionBlueprint> {
    const { section } = input;
    const purposes: Array<{ purpose: 'background' | 'motivation' | 'method' | 'result' | 'discussion' | 'transition'; sentence: string }> = [
      { purpose: 'background', sentence: `This section introduces the background of ${section.coreArgument}.` },
      { purpose: 'motivation', sentence: 'We identify the research gap addressed in this work.' },
      { purpose: 'transition', sentence: 'The main contributions are outlined as follows.' },
    ];
    if (section.id.includes('method')) {
      purposes.push({ purpose: 'method', sentence: 'Formally, let $X$ denote the input space and $Y$ the output space.' });
      purposes.push({ purpose: 'method', sentence: 'Our model optimizes the objective function via gradient descent.' });
    }
    if (section.id.includes('experiment')) {
      purposes.push({ purpose: 'result', sentence: 'The proposed method achieves competitive accuracy on the test set.' });
      purposes.push({ purpose: 'discussion', sentence: 'Ablation studies validate the contribution of each component.' });
    }
    return {
      sectionId: section.id,
      sectionTitle: section.title,
      paragraphs: purposes.map((p, i) => ({
        id: `${section.id}-p${i + 1}`,
        order: i + 1,
        coreSentence: p.sentence,
        purpose: p.purpose,
      })),
      estimatedWords: section.estimatedPages * 300,
    };
  }
}
