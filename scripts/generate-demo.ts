/**
 * Standalone demo generator — calls DeepSeek API directly
 * to produce real paper content for README showcase.
 */
const API_KEY = process.env.DEEPSEEK_API_KEY!;
const BASE_URL = 'https://api.deepseek.com/v1';
const MODEL = 'deepseek-chat';

async function llm(system: string, user: string, temperature = 0.3): Promise<string> {
  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: 8192,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text}`);
  }
  const data = (await resp.json()) as any;
  return data.choices?.[0]?.message?.content ?? '';
}

const TOPIC = '大语言模型在学术写作中的幻觉检测与缓解';

async function main() {
  console.error('=== Step 1: Generate Outline ===');
  const outline = await llm(
    `你是一位学术论文规划专家。请根据用户提供的研究主题，生成一份结构化的论文章节大纲。必须以中文输出。
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
      "parent": null
    }
  ]
}
规则：id 用层级编号。共5章（引言、相关工作、方法、实验、结论），每章下含2-3节。`,
    `研究主题：${TOPIC}\n请生成一份5章的中文学术论文大纲。`,
    0.2,
  );
  console.log('===OUTLINE===');
  console.log(outline);

  console.error('=== Step 2: Write Abstract ===');
  const abstract = await llm(
    `You are an academic paper writer. Write a LaTeX abstract for a research paper.
ABSTRACT RULES:
- 字数严格控制在200-300字以内
- 回答四个关键问题：研究是什么？背景和意义是什么？你做了什么？你发现了什么？
- 不使用公司名称、首字母缩写、缩写或符号
- 不要引用或改写他人的观点
- Output ONLY LaTeX content starting with \\begin{abstract}`,
    `Write the abstract for a paper titled "${TOPIC}".
The paper proposes a multi-agent framework for detecting and mitigating hallucinations in LLM-generated academic text, combining factual grounding, citation verification, and iterative self-correction.`,
    0.1,
  );
  console.log('===ABSTRACT===');
  console.log(abstract);

  console.error('=== Step 3: Write Introduction (excerpt) ===');
  const intro = await llm(
    `You are an academic paper writer. Generate detailed LaTeX content for the Introduction section.
INTRODUCTION RULES:
- 不要开篇提出研究问题或假设
- 需要定义技术术语和概念
- 综述要简洁明了，重点放在近几年最新研究上
- 通过指出前人研究的不足来突出自己研究的学术意义
- Every non-obvious claim MUST have \\cite{} support
- Output ONLY LaTeX content starting with \\section{引言}`,
    `Write the Introduction section for a paper about "${TOPIC}".
Cover: background on LLM hallucination in academic writing, why it matters, limitations of existing approaches, and this paper's contributions (a 3-layer defense: factual grounding → citation verification → iterative self-correction).
Use \\cite{author2024keyword} format for citations (invent plausible citation keys).`,
    0.2,
  );
  console.log('===INTRO===');
  console.log(intro);

  console.error('=== Step 4: 18-Dim Audit ===');
  const audit = await llm(
    `你是一位学术论文质量审计专家。请对以下论文片段进行 18 维质量审计。
审计维度：逻辑连贯性、引用完整性、术语一致性、数据准确性、数学正确性、结构合理性、格式规范、语言质量、声明证据链、跨节一致性、叙事流畅度、创新对齐度、数据保真度、论证完备性、方法论严谨性、结论可靠性、贡献明确性、可读性。
对每个维度给出 1-10 分评分和简要说明。
严格按以下 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "overallScore": 数字,
  "dimensions": [
    {"name": "维度名", "score": 数字, "comment": "简要说明"}
  ],
  "criticalIssues": ["严重问题列表"],
  "suggestions": ["改进建议列表"]
}`,
    `请审计以下论文摘要和引言片段：\n\n${abstract}\n\n${intro}`,
    0,
  );
  console.log('===AUDIT===');
  console.log(audit);

  console.error('=== Step 5: Peer Review ===');
  const review = await llm(
    `你是一位顶级 AI 期刊的主编（Editor-in-Chief）。请对以下论文进行同行评审，给出编辑决策。
评审要求：
1. 总体评价（2-3句）
2. 主要优点（3条）
3. 主要问题（2-3条）
4. 编辑决策：Accept / Minor Revision / Major Revision / Reject
5. 给作者的总结建议（2-3句）
用中文输出，语气专业、严谨。`,
    `论文标题：${TOPIC}\n\n摘要：\n${abstract}\n\n引言（节选）：\n${intro}`,
    0.2,
  );
  console.log('===REVIEW===');
  console.log(review);

  console.error('=== Step 6: Anti-AI Detection ===');
  const antiAI = await llm(
    `你是一位 AI 生成文本检测专家。请对以下学术文本进行 6 维 AI 痕迹检测。
检测维度：
1. 词汇多样性（AI 倾向于使用高频"安全"词汇）
2. 句法复杂度（AI 句子结构过于规整）
3. 语义连贯性（AI 过度使用连接词和过渡句）
4. 信息密度（AI 倾向于稀释信息）
5. 领域特异性（AI 缺乏领域深度术语）
6. 风格一致性（AI 风格过于均匀）
对每个维度给出 0-100 的 AI 概率分数（0=完全人类，100=完全AI），并给出总体判定。
严格按以下 JSON 格式输出（不要包含 markdown 代码块标记）：
{
  "overallAiProbability": 数字,
  "verdict": "human-like / borderline / ai-generated",
  "dimensions": [
    {"name": "维度名", "aiProbability": 数字, "evidence": "具体证据"}
  ],
  "rewriteSuggestions": ["改写建议"]
}`,
    `请检测以下文本：\n\n${abstract}\n\n${intro}`,
    0,
  );
  console.log('===ANTIAI===');
  console.log(antiAI);

  console.error('=== Done ===');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
