import { BaseAgent } from './base.ts';
import type { AgentOptions, ConfirmedFocus, JournalProfile, PaperOutline } from '../types/index.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.ts';

export interface PlannerInput {
  confirmedFocus: ConfirmedFocus;
  journalProfile?: JournalProfile;
}

export class PlannerAgent extends BaseAgent<PlannerInput, PaperOutline> {
  readonly name = 'Planner';

  private router?: LLMRouter;
  constructor(router?: LLMRouter) {
    super();
    this.router = router;
  }

  protected async realExecute(input: PlannerInput): Promise<PaperOutline> {
    if (!this.router) return this.mockExecute(input);
    const topic = input.confirmedFocus.researchTopic;
    const branches = input.confirmedFocus.selectedBranches.join(', ');
    const systemPrompt = `你是一位学术论文规划专家。请根据用户提供的研究主题，生成一份结构化的论文章节大纲。必须以中文输出，支持二至三级层级（章→节→小节）。

严格按以下 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "title": "论文中文标题",
  "sections": [
    {
      "id": "1",
      "title": "第一章标题",
      "coreArgument": "该章核心论点",
      "estimatedPages": 数字,
      "requiredCitations": 数字,
      "parent": null,
      "mustKeep": ["必须保留的关键要素列表"],
      "forbidden": ["禁止做的事"],
      "primaryGoal": "本节核心写作目标"
    }
  ]
}

规则：
- id 用层级编号（如 "1", "1-1", "1-1-1"）。
- parent 指向父级 id，顶级章节 parent 为 null。
- 共5章（引言、相关工作、方法、实验、结论），每章下含2-4节，重要节下可含1-3小节。
- 所有标题和论点务必使用中文。
- 引言章必须包含以下内容：研究背景、学术意义阐述、前人相关研究回顾、前人研究的不足或未解决的问题、本文的主要贡献
- 引言的文献综述应：简洁明了、将重点放在近几年的最新研究上、避免综述与研究无关的文献
- mustKeep 列出该节必须包含的关键要素（如必须引用的文献、必须提及的核心概念）
- forbidden 列出该节不能出现的内容（如方法节不能出现实验结果）
- primaryGoal 用一句话描述该节的核心写作目标

重要：请确保 JSON 格式完整，所有括号和引号都要正确闭合。`;

    const userPrompt = `研究主题：${topic}
选定的研究方向：${branches || '未指定'}
目标期刊：${input.journalProfile?.journalName ?? '通用'}

请生成一份5章的中文学术论文大纲，章节标题、节标题、小节标题和核心论点均使用中文。每章至少2节，核心方法章可到三级。每个章节必须包含 mustKeep、forbidden 和 primaryGoal 字段。`;

    const content = await this.router.complete('planner', systemPrompt, userPrompt);

    // 清理 JSON 内容
    let cleaned = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // 尝试修复不完整的 JSON
    if (!cleaned.endsWith('}')) {
      // 查找最后一个完整的 section
      const lastCompleteSection = cleaned.lastIndexOf('},');
      if (lastCompleteSection > 0) {
        cleaned = cleaned.substring(0, lastCompleteSection + 1) + '\n  ]\n}';
      }
    }

    try {
      return JSON.parse(cleaned) as PaperOutline;
    } catch (parseError) {
      logger.error('[PlannerAgent] JSON parse error:', String(parseError));
      logger.error('[PlannerAgent] Raw content (first 500 chars):', content.substring(0, 500));
      logger.error('[PlannerAgent] Cleaned content (last 500 chars):', cleaned.substring(cleaned.length - 500));
      // ... fallback
      logger.info('[PlannerAgent] Falling back to mock execution');
      logger.info('[PlannerAgent] Falling back to mock execution');
      return this.mockExecute(input);
    }
  }

  protected async mockExecute(input: PlannerInput): Promise<PaperOutline> {
    const topic = input.confirmedFocus.researchTopic;
    return {
      title: `${topic}研究`,
      sections: [
        // 第一章：引言
        {
          id: '1',
          title: '引言',
          coreArgument: `阐述${topic}的研究背景、现有挑战及本文的研究动机与贡献`,
          estimatedPages: 2,
          requiredCitations: 8,
          parent: null,
          mustKeep: ['研究背景', '学术意义', '前人研究回顾', '前人不足', '本文贡献'],
          forbidden: ['具体方法论细节', '实验结果数据'],
          primaryGoal: '建立研究背景，定位研究缺口，明确本文贡献',
        },
        {
          id: '1-1',
          title: '研究背景与意义',
          coreArgument: `${topic}领域的宏观背景与学术价值`,
          estimatedPages: 1,
          requiredCitations: 4,
          parent: '1',
          mustKeep: ['领域关键术语定义'],
          forbidden: ['技术细节'],
          primaryGoal: '阐述研究领域的历史脉络与重要性',
        },
        {
          id: '1-2',
          title: '国内外研究现状概述',
          coreArgument: `简述${topic}相关方向的发展脉络`,
          estimatedPages: 0.5,
          requiredCitations: 3,
          parent: '1',
          mustKeep: ['近年最新文献'],
          forbidden: ['冗长综述'],
          primaryGoal: '简洁综述近年相关研究',
        },
        {
          id: '1-3',
          title: '本文贡献与组织架构',
          coreArgument: `列出本文三至四项核心贡献并说明章节安排`,
          estimatedPages: 0.5,
          requiredCitations: 1,
          parent: '1',
          mustKeep: ['贡献列表', '组织结构说明'],
          forbidden: ['夸大性表述'],
          primaryGoal: '列举核心贡献并预告论文结构',
        },

        // 第二章：相关工作
        {
          id: '2',
          title: '相关工作',
          coreArgument: `系统梳理${topic}领域的国内外研究现状，分析现有方法的优势与不足`,
          estimatedPages: 3,
          requiredCitations: 15,
          parent: null,
          mustKeep: ['经典方法', '深度学习进展'],
          forbidden: ['本文方法描述', '实验结果'],
          primaryGoal: '全面综述相关方法，指出研究空白',
        },
        {
          id: '2-1',
          title: '传统方法与经典理论',
          coreArgument: `回顾${topic}方向的基础理论与经典算法`,
          estimatedPages: 1,
          requiredCitations: 6,
          parent: '2',
          mustKeep: ['基础理论', '经典算法'],
          forbidden: ['无关方法'],
          primaryGoal: '建立理论基础',
        },
        {
          id: '2-2',
          title: '基于深度学习的方法',
          coreArgument: `综述近年深度学习在${topic}中的应用`,
          estimatedPages: 1.5,
          requiredCitations: 7,
          parent: '2',
          mustKeep: ['近年深度学习进展'],
          forbidden: ['本文方法'],
          primaryGoal: '综述深度学习方法的最新进展',
        },
        {
          id: '2-3',
          title: '现有方法局限与本文切入点',
          coreArgument: `分析现有工作的不足，引出本文的研究动机`,
          estimatedPages: 0.5,
          requiredCitations: 2,
          parent: '2',
          mustKeep: ['方法局限分析'],
          forbidden: ['模糊表述'],
          primaryGoal: '明确指出现有不足，引出本文动机',
        },

        // 第三章：研究方法
        {
          id: '3',
          title: '研究方法',
          coreArgument: `详细描述本文提出的${topic}方法框架，包括模型架构、算法设计与理论分析`,
          estimatedPages: 4,
          requiredCitations: 5,
          parent: null,
          mustKeep: ['问题形式化定义', '模型架构', '核心算法推导'],
          forbidden: ['实验结果数据', '性能对比'],
          primaryGoal: '详细描述方法确保可重复性',
        },
        {
          id: '3-1',
          title: '问题形式化定义',
          coreArgument: `给出${topic}问题的数学形式化描述`,
          estimatedPages: 0.5,
          requiredCitations: 1,
          parent: '3',
          mustKeep: ['数学符号', '问题形式化'],
          forbidden: ['非形式化描述'],
          primaryGoal: '给出问题的严格数学定义',
        },
        {
          id: '3-2',
          title: '模型整体架构',
          coreArgument: `阐述系统的总体框架与各模块协作关系`,
          estimatedPages: 1.5,
          requiredCitations: 1,
          parent: '3',
          mustKeep: ['架构图描述', '模块职责'],
          forbidden: ['结果数据'],
          primaryGoal: '描述系统框架与模块交互',
        },
        {
          id: '3-2-1',
          title: '编码器设计',
          coreArgument: `描述输入特征的编码方式与网络结构`,
          estimatedPages: 0.5,
          requiredCitations: 1,
          parent: '3-2',
          mustKeep: ['编码器结构'],
          forbidden: ['实验设置'],
          primaryGoal: '详细描述编码器设计',
        },
        {
          id: '3-2-2',
          title: '核心计算模块',
          coreArgument: `详细推导核心算法的计算流程`,
          estimatedPages: 0.5,
          requiredCitations: 1,
          parent: '3-2',
          mustKeep: ['算法伪代码或推导'],
          forbidden: ['非必要细节'],
          primaryGoal: '推导核心算法流程',
        },
        {
          id: '3-3',
          title: '训练策略与优化',
          coreArgument: `介绍模型训练的目标函数、优化器选择与正则化策略`,
          estimatedPages: 1,
          requiredCitations: 1,
          parent: '3',
          mustKeep: ['目标函数', '优化器', '超参数'],
          forbidden: ['具体实验结果'],
          primaryGoal: '描述训练配置确保可重复性',
        },

        // 第四章：实验与分析
        {
          id: '4',
          title: '实验与分析',
          coreArgument: `设计多组对比实验验证方法有效性，包括消融实验与定量对比`,
          estimatedPages: 3,
          requiredCitations: 3,
          parent: null,
          mustKeep: ['主实验对比', '消融实验', '定量分析'],
          forbidden: ['方法描述'],
          primaryGoal: '通过实验验证方法有效性',
        },
        {
          id: '4-1',
          title: '实验设置',
          coreArgument: `描述数据集、评价指标、基线方法与超参数配置`,
          estimatedPages: 0.5,
          requiredCitations: 1,
          parent: '4',
          mustKeep: ['数据集', '评价指标', '基线方法'],
          forbidden: ['结果讨论'],
          primaryGoal: '确保实验可复现',
        },
        {
          id: '4-2',
          title: '主实验结果对比',
          coreArgument: `在各数据集上对比本文方法与基线方法的性能`,
          estimatedPages: 1.5,
          requiredCitations: 1,
          parent: '4',
          mustKeep: ['表格', '对比分析'],
          forbidden: ['新方法引入'],
          primaryGoal: '定量展示方法优势',
        },
        {
          id: '4-3',
          title: '消融实验与分析',
          coreArgument: `逐一验证各模块的贡献`,
          estimatedPages: 0.5,
          requiredCitations: 0,
          parent: '4',
          mustKeep: ['模块贡献分析'],
          forbidden: ['重复主实验'],
          primaryGoal: '验证每个模块的有效性',
        },
        {
          id: '4-4',
          title: '超参数敏感性分析',
          coreArgument: `分析关键超参数对性能的影响`,
          estimatedPages: 0.5,
          requiredCitations: 1,
          parent: '4',
          mustKeep: ['超参数分析'],
          forbidden: ['主观判断'],
          primaryGoal: '分析超参数影响',
        },

        // 第五章：总结与展望
        {
          id: '5',
          title: '总结与展望',
          coreArgument: `总结全文核心贡献，分析方法的局限性并提出未来研究方向`,
          estimatedPages: 1,
          requiredCitations: 2,
          parent: null,
          mustKeep: ['贡献总结', '局限分析', '未来方向'],
          forbidden: ['新结果引入', '新方法引入'],
          primaryGoal: '总结全文，诚实讨论局限，展望未来',
        },
        {
          id: '5-1',
          title: '全文工作总结',
          coreArgument: `回顾本文提出的方法与实验结论`,
          estimatedPages: 0.5,
          requiredCitations: 0,
          parent: '5',
          mustKeep: ['方法回顾', '关键结论'],
          forbidden: ['新数据'],
          primaryGoal: '总结方法及关键发现',
        },
        {
          id: '5-2',
          title: '研究局限与未来展望',
          coreArgument: `诚实讨论方法局限并展望未来改进方向`,
          estimatedPages: 0.5,
          requiredCitations: 2,
          parent: '5',
          mustKeep: ['局限', '未来方向'],
          forbidden: ['回避问题'],
          primaryGoal: '诚实讨论局限，提出建设性未来方向',
        },
      ],
    };
  }
}
