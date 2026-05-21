// Radar Agent — Journal profile analysis, format requirements
// Scans journal requirements and recommends best-fit target

import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.ts';

export interface JournalProfile {
  name: string;
  publisher: string;
  format: string;
  citationStyle: 'numeric' | 'author-year';
  sectionRequirements: string[];
  wordLimit: { min: number; max: number };
  figureLimit: number;
  referenceLimit: number;
  latexTemplate: string;
  specialRequirements: string[];
  avgReviewTime: string;
  acceptanceRate?: string;
  domainFit: string[];
}

const JOURNAL_DATABASE: JournalProfile[] = [
  {
    name: 'IEEE Transactions on Pattern Analysis and Machine Intelligence',
    publisher: 'IEEE',
    format: 'IEEE',
    citationStyle: 'numeric',
    sectionRequirements: [
      'abstract_250w',
      'introduction',
      'related_work',
      'methodology',
      'experiments',
      'discussion',
      'conclusion',
    ],
    wordLimit: { min: 6000, max: 12000 },
    figureLimit: 15,
    referenceLimit: 50,
    latexTemplate: 'ieee',
    specialRequirements: ['双栏', '强制补充材料', '数据可用性声明'],
    avgReviewTime: '3-6个月',
    acceptanceRate: '~15%',
    domainFit: ['计算机视觉', '机器学习', '模式识别'],
  },
  {
    name: 'ACM Computing Surveys',
    publisher: 'ACM',
    format: 'ACM',
    citationStyle: 'numeric',
    sectionRequirements: [
      'abstract',
      'introduction',
      'taxonomy',
      'detailed_survey',
      'comparison',
      'future_directions',
      'conclusion',
    ],
    wordLimit: { min: 8000, max: 20000 },
    figureLimit: 20,
    referenceLimit: 100,
    latexTemplate: 'acm',
    specialRequirements: ['单栏', '综述类', '强制分类体系'],
    avgReviewTime: '4-8个月',
    domainFit: ['计算机科学综述'],
  },
  {
    name: 'Nature',
    publisher: 'Springer Nature',
    format: 'Nature',
    citationStyle: 'numeric',
    sectionRequirements: [
      'abstract_150w',
      'main_text',
      'methods',
      'references',
      'acknowledgements',
      'author_contributions',
    ],
    wordLimit: { min: 2000, max: 4000 },
    figureLimit: 6,
    referenceLimit: 50,
    latexTemplate: 'nature',
    specialRequirements: ['摘要限制150字', '方法在正文后', '数据可用性声明', '作者贡献声明'],
    avgReviewTime: '2-4个月',
    acceptanceRate: '~8%',
    domainFit: ['自然科学', '生命科学', '物理学', '化学'],
  },
  {
    name: 'Science',
    publisher: 'AAAS',
    format: 'Science',
    citationStyle: 'numeric',
    sectionRequirements: ['abstract_125w', 'main_text', 'supplementary_materials'],
    wordLimit: { min: 2000, max: 4500 },
    figureLimit: 4,
    referenceLimit: 40,
    latexTemplate: 'science',
    specialRequirements: ['摘要限制125字', '强制补充材料', '简报格式', '通讯作者声明'],
    avgReviewTime: '2-3个月',
    acceptanceRate: '~7%',
    domainFit: ['自然科学', '跨学科', '高影响力'],
  },
  {
    name: 'Elsevier Computers & Education',
    publisher: 'Elsevier',
    format: 'Elsevier',
    citationStyle: 'author-year',
    sectionRequirements: [
      'abstract',
      'introduction',
      'literature_review',
      'methodology',
      'results',
      'discussion',
      'conclusion',
    ],
    wordLimit: { min: 5000, max: 8000 },
    figureLimit: 10,
    referenceLimit: 60,
    latexTemplate: 'elsevier',
    specialRequirements: ['双栏', 'APA引用格式', '研究伦理声明'],
    avgReviewTime: '3-5个月',
    domainFit: ['教育技术', '计算机教育', '教育数据挖掘'],
  },
  {
    name: 'Springer Machine Learning',
    publisher: 'Springer',
    format: 'Springer',
    citationStyle: 'author-year',
    sectionRequirements: [
      'abstract',
      'introduction',
      'related_work',
      'method',
      'experiments',
      'discussion',
      'conclusion',
    ],
    wordLimit: { min: 5000, max: 10000 },
    figureLimit: 12,
    referenceLimit: 60,
    latexTemplate: 'springer',
    specialRequirements: ['单栏', 'LaTeX模板', 'ORCID要求'],
    avgReviewTime: '2-4个月',
    acceptanceRate: '~20%',
    domainFit: ['机器学习', '数据挖掘', '人工智能'],
  },
  {
    name: '中文信息学报',
    publisher: '中国中文信息学会',
    format: 'custom',
    citationStyle: 'numeric',
    sectionRequirements: ['中文摘要', '引言', '相关工作', '方法', '实验', '结论', '参考文献'],
    wordLimit: { min: 6000, max: 12000 },
    figureLimit: 10,
    referenceLimit: 30,
    latexTemplate: 'custom',
    specialRequirements: ['中文为主', '中英文摘要', '中图分类号', '基金资助声明'],
    avgReviewTime: '2-4个月',
    domainFit: ['自然语言处理', '中文信息处理', '计算语言学'],
  },
  {
    name: '计算机学报',
    publisher: '中国计算机学会',
    format: 'custom',
    citationStyle: 'numeric',
    sectionRequirements: ['中文摘要', '引言', '相关工作', '算法/方法', '实验与分析', '结论', '参考文献'],
    wordLimit: { min: 8000, max: 15000 },
    figureLimit: 12,
    referenceLimit: 40,
    latexTemplate: 'custom',
    specialRequirements: ['中文', '中英文摘要', '中图分类号', '基金项目'],
    avgReviewTime: '3-6个月',
    acceptanceRate: '~25%',
    domainFit: ['计算机科学', '人工智能', '软件工程'],
  },
  {
    name: 'NeurIPS (Conference)',
    publisher: 'NeurIPS Foundation',
    format: 'NeurIPS',
    citationStyle: 'author-year',
    sectionRequirements: [
      'abstract',
      'introduction',
      'related_work',
      'method',
      'experiments',
      'discussion',
      'conclusion',
      'checklist',
    ],
    wordLimit: { min: 4000, max: 8000 },
    figureLimit: 10,
    referenceLimit: 50,
    latexTemplate: 'neurips',
    specialRequirements: ['匿名投稿', '道德声明', '可复现性检查表', 'broader_impact'],
    avgReviewTime: '3-4个月',
    acceptanceRate: '~25%',
    domainFit: ['机器学习', '深度学习', '强化学习', '计算机视觉', '自然语言处理'],
  },
  {
    name: 'CVPR (Conference)',
    publisher: 'IEEE/CVF',
    format: 'CVPR',
    citationStyle: 'numeric',
    sectionRequirements: ['abstract', 'introduction', 'related_work', 'method', 'experiments', 'conclusion'],
    wordLimit: { min: 4000, max: 8000 },
    figureLimit: 10,
    referenceLimit: 50,
    latexTemplate: 'cvpr',
    specialRequirements: ['匿名投稿', '双栏', '补充材料'],
    avgReviewTime: '3-4个月',
    acceptanceRate: '~25%',
    domainFit: ['计算机视觉', '图像处理', '模式识别'],
  },
];

export class RadarAgent {
  private router?: LLMRouter;

  constructor(router?: LLMRouter) {
    this.router = router;
  }

  listJournals(): JournalProfile[] {
    return JOURNAL_DATABASE;
  }

  getJournal(name: string): JournalProfile | undefined {
    const direct = JOURNAL_DATABASE.find((j) => j.name === name);
    if (direct) return direct;

    // Fuzzy match
    const lower = name.toLowerCase();
    return JOURNAL_DATABASE.find(
      (j) => j.name.toLowerCase().includes(lower) || j.publisher.toLowerCase().includes(lower),
    );
  }

  searchJournals(query: string): JournalProfile[] {
    const lower = query.toLowerCase();
    if (!lower) return JOURNAL_DATABASE;
    return JOURNAL_DATABASE.filter(
      (j) =>
        j.name.toLowerCase().includes(lower) ||
        j.publisher.toLowerCase().includes(lower) ||
        j.domainFit.some((d) => d.toLowerCase().includes(lower)) ||
        j.format.toLowerCase().includes(lower),
    );
  }

  recommendJournal(paperDescription: string, domain?: string): JournalProfile[] {
    if (!domain) return JOURNAL_DATABASE.slice(0, 5);

    const lower = domain.toLowerCase();
    const scored = JOURNAL_DATABASE.map((j) => {
      const domainMatch = j.domainFit.filter((d) => lower.includes(d.toLowerCase()) || d.toLowerCase().includes(lower));
      let score = domainMatch.length * 10;

      // Prefer journals that match paper length expectations
      if (lower.includes('综述') || lower.includes('survey') || lower.includes('review')) {
        if (j.name.includes('Survey') || j.name.includes('综述')) score += 5;
      }

      return { journal: j, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => s.journal);
  }

  async analyzeJournalWithLLM(journalName: string, paperAbstract: string): Promise<string> {
    if (!this.router) return this.generateDefaultAnalysis(journalName);

    const journal = this.getJournal(journalName);
    const journalInfo = journal
      ? `期刊: ${journal.name}\n出版社: ${journal.publisher}\n格式: ${journal.format}\n引用风格: ${journal.citationStyle}\n字数限制: ${journal.wordLimit.min}-${journal.wordLimit.max}\n图限制: ${journal.figureLimit}\n引用限制: ${journal.referenceLimit}\n特殊要求: ${journal.specialRequirements.join(', ')}`
      : `期刊: ${journalName} (数据库无此期刊信息)`;

    try {
      const systemPrompt = `你是一位学术期刊投稿顾问。根据论文摘要和期刊要求，分析投稿的匹配度和需要调整的方面。
输出 JSON: {"fitScore": 0-100, "strengths": ["匹配点"], "gaps": ["差距"], "adjustments": ["建议调整"]}`;

      const content = await this.router!.complete(
        'radar',
        systemPrompt,
        `论文摘要: ${paperAbstract}\n\n${journalInfo}`,
        { temperature: 0.2, maxTokens: 1024 },
      );

      const cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      return [
        `## 投稿分析: ${journalName}`,
        `**匹配度**: ${parsed.fitScore}/100`,
        '',
        '### 优势',
        ...parsed.strengths.map((s: string) => `- ${s}`),
        '',
        '### 差距',
        ...parsed.gaps.map((g: string) => `- ${g}`),
        '',
        '### 建议调整',
        ...parsed.adjustments.map((a: string) => `- ${a}`),
      ].join('\n');
    } catch (e) {
      logger.warn('RadarAgent LLM analysis failed', String(e));
      return this.generateDefaultAnalysis(journalName);
    }
  }

  private generateDefaultAnalysis(journalName: string): string {
    const journal = this.getJournal(journalName);
    if (!journal) {
      return `## 期刊分析: ${journalName}\n\n未找到该期刊信息。请使用 \`radar.listJournals()\` 查看支持列表。`;
    }
    return [
      `## ${journal.name}`,
      `- **出版社**: ${journal.publisher}`,
      `- **格式**: ${journal.format}`,
      `- **引用风格**: ${journal.citationStyle}`,
      `- **字数**: ${journal.wordLimit.min}-${journal.wordLimit.max} 字`,
      `- **图表限制**: ${journal.figureLimit} 张`,
      `- **引用限制**: ${journal.referenceLimit} 篇`,
      `- **审稿周期**: ${journal.avgReviewTime}`,
      `- **接收率**: ${journal.acceptanceRate ?? '未知'}`,
      `- **适用领域**: ${journal.domainFit.join(', ')}`,
      `- **特殊要求**: ${journal.specialRequirements.join('; ')}`,
      `- **LaTeX模板**: ${journal.latexTemplate}`,
    ].join('\n');
  }

  exportJournalProfile(journalName: string): JournalProfile | null {
    const journal = this.getJournal(journalName);
    return journal ?? null;
  }
}
