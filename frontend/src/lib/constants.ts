export const AGENT_DEFINITIONS: Record<string, { label: string; description: string; icon: string }> = {
  // 写作管道层
  cartographer: { label: '星图师', description: '在思维星空中广渡分支', icon: '🗺️' },
  radar: { label: '探星雷达', description: '扫描学林趋势与空白', icon: '📡' },
  planner: { label: '蓝图师', description: '编织论文章节蓝图', icon: '📋' },
  architect: { label: '筑梦师', description: '雕琢章节蓝图', icon: '🏗️' },
  writer: { label: '笔耕者', description: '依蓝图书写正文', icon: '✍️' },
  observer: { label: '观微者', description: '从正文中萃取事实之珠', icon: '👁️' },
  normalizer: { label: '调律者', description: '调和篇幅与术语之律', icon: '📏' },
  governor: { label: '治理者', description: '内容合规性治理', icon: '🛡️' },
  auditor: { label: '审阅者', description: '多维度品质审阅', icon: '🔍' },
  antiAiDetector: { label: '鉴真者', description: '鉴识AI生成之痕', icon: '🤖' },
  antiAiRewriter: { label: '润色者', description: '淡化AI生成之痕', icon: '🔧' },
  librarian: { label: '书阁守', description: '检索与验证文献', icon: '📚' },
  
  // 苏格拉底引导层
  socraticMentor: { label: '苏格拉底导师', description: '5层对话引导研究问题', icon: '🎓' },
  researchQuestion: { label: '研究问题师', description: '生成 RQ Brief 与 FINER 评分', icon: '❓' },
  methodology: { label: '方法论师', description: '生成方法论蓝图', icon: '📐' },
  
  // 同行评审层
  fieldAnalyst: { label: '领域分析师', description: '识别论文领域配置评审员', icon: '🔬' },
  editorInChief: { label: '主编', description: '期刊适配度与原创性审查', icon: '👨‍💼' },
  methodologyReviewer: { label: '方法论评审', description: '研究设计与统计效度审查', icon: '📊' },
  domainReviewer: { label: '领域评审', description: '文献覆盖与理论框架审查', icon: '📖' },
  perspectiveReviewer: { label: '视角评审', description: '跨学科连接与伦理审查', icon: '🌐' },
  devilsAdvocate: { label: '魔鬼代言人', description: '核心论证挑战与逻辑谬误检测', icon: '😈' },
  editorialSynthesizer: { label: '编辑综合', description: '综合评审报告生成决策', icon: '📝' },
};

export const AGENT_ORDER = [
  // 写作管道层
  'cartographer', 'radar', 'planner', 'architect', 'writer',
  'observer', 'normalizer', 'governor', 'auditor', 'antiAiDetector', 'antiAiRewriter', 'librarian',
  // 苏格拉底引导层
  'socraticMentor', 'researchQuestion', 'methodology',
  // 同行评审层
  'fieldAnalyst', 'editorInChief', 'methodologyReviewer', 'domainReviewer', 
  'perspectiveReviewer', 'devilsAdvocate', 'editorialSynthesizer',
];

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  zhipu: 'Zhipu',
};

export const DEFAULT_PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini'] },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'] },
];

export function inferProvider(model: string): string {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt')) return 'openai';
  if (model.startsWith('deepseek')) return 'deepseek';
  if (model.startsWith('glm')) return 'zhipu';
  return 'deepseek';
}
