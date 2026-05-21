# 🎓 Scholarium v2.0 — AI 学术论文多智能体写作系统

> 23 个 AI Agent 协同工作，从研究问题到 LaTeX 论文，全流程自动化。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-2.0.0-green)](package.json)

**Scholarium** 是一个 Multi-Agent 学术论文写作引擎。你输入一个研究方向，23 个专用 AI Agent 会在 **5 层苏格拉底对话**中帮你聚焦研究问题，通过**思维导图三轮发散**定位创新点，生成大纲并逐节撰写，经过 **18 维审计** + **6 维 AI 检测** + **7 代理同行评审**后，最终输出可编译的 LaTeX 论文。

---

## ✨ 为什么选择 Scholarium？

| 能力 | 说明 |
|------|------|
| 🧠 **23 个 AI Agent** | 苏格拉底引导层（3）+ 同行评审层（7）+ 写作管道层（12）+ 雷达 Agent |
| 🔍 **18 维质量审计** | 逻辑/引用/术语/数据/数学/结构/格式/语言 + 声明证据链/跨节一致性/叙事流畅/创新对齐/数据保真 + 5 维基础 |
| 🛡️ **反幻觉 7 层防护** | 温度分层 → 引用前置 → 引用强校验 → Bible 记忆 → 输入治理 → 18 维审计 → 受保护内容检查 |
| 📝 **去 AI 化** | 6 维 AI 痕迹检测 + 规则/LLM 双模式智能改写 |
| 👥 **7 代理同行评审** | 主编 + 方法论评审 + 领域评审 + 跨学科评审 + 魔鬼代言人 + 编辑综合决策 |
| 🗺️ **思维导图 3 轮发散** | 广度发散 → 深度挖掘 → 贡献定位 |
| 🔗 **Embedding 语义引擎** | 本地 TF-IDF / OpenAI / DeepSeek 三选一，引用语义匹配 + 内容去重 |
| 📚 **Radar 期刊匹配** | 内置 10 个顶会/顶刊画像 + LLM 投稿分析，推荐最佳投稿目标 |
| 🌐 **外部 API 速率治理** | 令牌桶 + 指数退避 + 本地缓存，安全调用 Semantic Scholar / arXiv / CrossRef |
| 📄 **LaTeX 编译输出** | 支持 IEEE / ACM / Springer / Elsevier / Nature 等模板 |
| 🔄 **Agent Loop 自主编排** | Agent 自主决定写→审→改，循环直到通过 |

---

## 🚀 5 分钟快速启动

```bash
# 1. 克隆项目
git clone https://github.com/Gary23333/Scholarium.git
cd Scholarium

# 2. 安装依赖
npm install

# 3. 配置 API Key（可选，未配置时使用规则模式）
export DEEPSEEK_API_KEY=sk-xxxxxxxx

# 4. 启动服务
npm run serve

# 5. 打开浏览器
open http://localhost:3456
```

**无需 GPU，纯 CPU 运行。** 只依赖 Node.js 22+ 和 LLM API Key。

---

## 🏗️ 系统架构

### 核心流程

```
研究方向输入
  │
  ├─ Stage 0: 苏格拉底 5 层对话引导
  │   └─ 问题框架 → 方法论反思 → 证据推理 → 观点评估 → 影响后果
  │         ↓
  ├─ Stage 1: 思维导图 3 轮发散
  │   └─ Cartographer → 广度分支 → 深度子话题 → Gap/Novelty 定位
  │         ↓
  ├─ Stage 2: 逐节写作管道（10 子阶段）
  │   └─ Planner → Architect → Composer → Writer → Observer
  │       → Normalizer(双向长度治理) → Governance(7规则校验)
  │       → Librarian(引用验证) → Auditor(18维审计)
  │       → Anti-AI(6维检测+改写) → Integrity(受保护内容校验)
  │         ↓
  ├─ Stage 3: 7 代理同行评审
  │   └─ FieldAnalyst → EIC + R1/R2/R3 + DA 并行 → EditorialSynthesizer
  │         ↓
  ├─ Stage 4: 修订 → 复查 → 再修订
  │         ↓
  └─ Stage 5: LaTeX 组装 → PDF 编译
```

### Agent 矩阵

| 层级 | Agent | 一句话职责 |
|------|-------|-----------|
| 🎯 引导 | SocraticMentor | 5 层对话，帮你定义真正的研究问题 |
| 🎯 引导 | ResearchQuestion | FINER 评分，生成精准 RQ Brief |
| 🎯 引导 | Methodology | 从 RQ 推导方法论蓝图 |
| 🗺️ 发散 | Cartographer | 3 轮思维导图，锁定创新贡献点 |
| ✍️ 写作 | Planner | 含约束声明的大纲生成 |
| ✍️ 写作 | Architect | 段落级写作蓝图展开 |
| ✍️ 写作 | Composer | 选择性加载 Bible 上下文 |
| ✍️ 写作 | Writer | LaTeX 正文生成 |
| ✍️ 写作 | Observer | 9 类事实提取，更新 Bible |
| ✍️ 写作 | Normalizer | 双向长度治理（压缩/扩展） |
| ✍️ 写作 | Governor | 7 规则输入校验 |
| ✍️ 写作 | Auditor | 18 维质量审计 |
| ✍️ 写作 | Anti-AI | 6 维检测 + 智能改写 |
| ✍️ 写作 | Librarian | 引用验证 + 多源文献搜索 |
| 🔭 雷达 | Radar | 10 个期刊画像 + 投稿匹配分析 |
| 👥 评审 | FieldAnalyst | 动态配置评审员身份 |
| 👥 评审 | EditorInChief | 主编视角整体评估 |
| 👥 评审 | 3 位 Reviewer | 方法论/领域/跨学科评审 |
| 👥 评审 | DevilsAdvocate | 核心论证攻击 |
| 👥 评审 | EditorialSynthesizer | 综合作出编辑决策 |

---

## 📂 项目结构

```
Scholarium/
├── src/
│   ├── server/             # Modular HTTP server
│   │   ├── context.ts      # Shared server context & types
│   │   ├── middleware/      # CORS, error handler, logger, body parser
│   │   ├── routes/         # Modular route handlers
│   │   │   ├── llm.ts      # LLM config & test routes
│   │   │   ├── mindmap.ts  # MindMap routes
│   │   │   ├── papers.ts   # Paper CRUD routes
│   │   │   ├── sections.ts # Section operation routes
│   │   │   ├── citations.ts# Citation management routes
│   │   │   ├── bible.ts    # Bible routes
│   │   │   ├── review.ts   # Peer review routes
│   │   │   ├── socratic.ts # Socratic dialogue routes
│   │   │   ├── integrity.ts# Integrity check routes
│   │   │   ├── passport.ts # Passport routes
│   │   │   ├── checkpoint.ts # Checkpoint routes
│   │   │   ├── tasks.ts    # Task management routes
│   │   │   ├── stats.ts    # Statistics routes
│   │   │   ├── health.ts   # Health check routes
│   │   │   └── static.ts   # Static file serving
│   │   └── utils/          # Shared utilities
│   │       ├── helpers.ts  # HTTP helpers (json, error, parseBody)
│   │       └── latex-to-md.ts # LaTeX conversion
│   ├── agents/         # 23 AI Agents
│   ├── anti-ai/        # 6-dim AI detection + rewriting
│   ├── audit/          # 18-dim quality audit
│   ├── bible/          # Paper fact Bible
│   ├── embedding/      # Embedding engine
│   ├── figures/        # Chart generation
│   ├── librarian/      # Citation management
│   ├── llm/            # LLM Client + Router
│   ├── mindmap/        # MindMap service
│   ├── models/         # Input governance
│   ├── pipeline/       # Agent orchestration
│   ├── review/         # 7-agent peer review
│   ├── types/          # Shared type system
│   ├── utils/          # Logger + rate limiter
│   ├── __tests__/      # Test suites (vitest)
│   └── server.ts       # Server entry point (modular orchestrator)
├── .github/workflows/  # CI/CD (GitHub Actions)
├── frontend/           # React + Vite workspace
├── templates/          # Journal LaTeX templates
├── scholarium.config.json
└── package.json
```

---

## ⚙️ 常用命令

```bash
npm run serve          # 启动开发服务器（API + 前端）
npm run typecheck      # TypeScript 类型检查
npm run test           # 运行 vitest 测试
npm run test:mock      # Mock 测试（无需网络）
npm run lint           # ESLint 检查
npm run lint:fix       # ESLint 自动修复
npm run format         # Prettier 格式化
npm run format:check   # Prettier 检查
```

---

## 📡 API 精选

| 端点 | 功能 |
|------|------|
| `POST /api/papers` | 创建论文项目 |
| `POST /api/papers/:id/plan` | 生成大纲 |
| `POST /api/papers/:id/write` | 逐节写作 |
| `GET /api/papers/:id/status` | 实时进度 |
| `POST /api/papers/:id/audit` | 批量 18 维审计 |
| `POST /api/papers/:id/rewrite` | 批量章节重写 |
| `POST /api/papers/:id/directive` | 实时注入写作指令 |
| `POST /api/socratic/start` | 启动苏格拉底引导 |
| `POST /api/review/:id/start` | 启动同行评审 |
| `POST /api/citations/search` | 多源文献搜索 |
| `GET /api/health` | 健康状态检查 |
| `GET /api/health/ready` | 就绪探针（DB + LLM 检查） |

完整 API 参见 [API 概览](https://github.com/Gary23333/Scholarium#readme)。

---

## 🔧 技术栈

- **后端**: Node.js + TypeScript, 零外部框架, 原生 HTTP
- **前端**: React 18 + Vite, 纯静态 SPA
- **LLM**: DeepSeek / OpenAI / Anthropic, 可拔插 Provider
- **存储**: JSON 文件持久化, 原子写入
- **嵌入**: 本地 TF-IDF / OpenAI text-embedding-3 / DeepSeek Embedding
- **测试**: Vitest
- **代码检查**: ESLint 9+ (typescript-eslint)
- **格式化**: Prettier
- **CI/CD**: GitHub Actions

---

## 🆕 v2.0 更新

| 变更 | 说明 |
|------|------|
| 🏗️ **模块化服务器架构** | server.ts 从 2276 行精简至 325 行，拆分为独立模块 |
| 🛣️ **14 个路由模块** | 清晰的职责分离，每个路由独立维护 |
| 🚨 **统一错误处理** | AppError 层级体系，一致的错误响应格式 |
| 💚 **健康检查端点** | `/api/health` + `/api/health/ready` 就绪探针 |
| 🔍 **ESLint + Prettier** | ESLint 9+ (typescript-eslint) + Prettier 代码风格统一 |
| 🧪 **Vitest 测试套件** | 72 个测试用例，覆盖核心逻辑 |
| ⚙️ **GitHub Actions CI/CD** | 自动化构建、检查与测试流水线 |
| 📐 **TypeScript 严格模式** | 启用 strict 模式 + Node.js 类型定义 |

---

## 📄 License

MIT © 2026

---

<p align="center">
  <b>Scholarium</b> — 让 AI 帮你写出一篇真正的学术论文。
</p>
