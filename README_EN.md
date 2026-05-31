# 🎓 Scholarium v2.0.1 — AI-Powered Multi-Agent Academic Paper Writing System

> 23 AI Agents working in concert — from research question to LaTeX paper, fully automated.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-2.0.1-green)](package.json)

**Scholarium** is a multi-agent academic writing engine. Give it a research direction, and 23 specialized AI Agents will guide you through **5-layer Socratic dialogue**, pinpoint your innovation via **3-round mind-map divergence**, generate an outline, write the paper section by section, run it through **18-dimension audits**, **6-dimension AI detection**, and **7-agent peer review**, then output a compilable LaTeX paper.

---

## ✨ Why Scholarium?

| Capability | Description |
|------------|-------------|
| 🧠 **23 AI Agents** | Socratic layer (3) + Peer review layer (7) + Writing pipeline (12) + Radar Agent |
| 🔍 **18-Dim Audit** | Logic, citations, terminology, data, math, structure, format + claim-evidence chains, cross-section consistency, narrative flow, novelty alignment, data fidelity |
| 🛡️ **7-Layer Anti-Hallucination** | Temperature layering → citation preloading → mandatory verification → Bible memory → input governance → 18-dim audit → protected content checks |
| 📝 **De-AI Styling** | 6-dimension AI detection + rule/LLM dual-mode rewriting |
| 👥 **7-Agent Peer Review** | Editor-in-Chief + Methodology/ Domain/ Perspective Reviewers + Devil's Advocate + Editorial Synthesizer |
| 🗺️ **MindMap Divergence** | Breadth branching → depth mining → novelty gap detection |
| 🔗 **Embedding Engine** | Local TF-IDF / OpenAI / DeepSeek — citation matching + deduplication |
| 📚 **Radar Journal Matching** | 10 built-in top venue profiles + LLM fit analysis |
| 🌐 **API Rate Governance** | Token bucket + exponential backoff + local caching for Semantic Scholar / arXiv / CrossRef |
| 📄 **LaTeX Output** | IEEE / ACM / Springer / Elsevier / Nature templates |
| 🔄 **Agent Loop Autonomy** | Agents autonomously decide: write → audit → revise → loop until passing |

---

## 🚀 Quick Start (5 minutes)

```bash
# 1. Clone
git clone https://github.com/Gary23333/Scholarium.git
cd Scholarium

# 2. Install dependencies and build frontend
npm ci
cd frontend && npm ci && npm run build && cd ..

# 3. Set API Key (optional — falls back to rule-based mode)
export DEEPSEEK_API_KEY=sk-xxxxxxxx

# 4. Start
npm run serve

# 5. Open
open http://localhost:3456
```

**No GPU required.** Only Node.js 22+ and an LLM API key.

---

## 🏗️ Architecture

### Core Pipeline

```
Research Topic
  │
  ├─ Stage 0: 5-Layer Socratic Dialogue
  │   └─ Frame → Method Reflect → Evidence → Evaluate → Consequences
  │         ↓
  ├─ Stage 1: 3-Round MindMap Divergence
  │   └─ Cartographer → Breadth → Depth → Gap/Novelty
  │         ↓
  ├─ Stage 2: Section-by-Section Writing (10 sub-stages)
  │   └─ Planner → Architect → Composer → Writer → Observer
  │       → Normalizer → Governance(7 rules) → Librarian
  │       → Auditor(18-dim) → Anti-AI(6-dim) → Integrity
  │         ↓
  ├─ Stage 3: 7-Agent Peer Review
  │   └─ FieldAnalyst → EIC+3 Reviewers+DA → EditorialSynthesizer
  │         ↓
  ├─ Stage 4: Revise → Re-review → Re-revise
  │         ↓
  └─ Stage 5: LaTeX Assembly → PDF Compilation
```

### Agent Matrix

| Layer | Agent | Role |
|-------|-------|------|
| 🎯 Guide | SocraticMentor | 5-layer Socratic questioning |
| 🎯 Guide | ResearchQuestion | FINER-scored research question brief |
| 🎯 Guide | Methodology | Derives methodology blueprint from RQ |
| 🗺️ Diverge | Cartographer | 3-round mind-map with gap detection |
| ✍️ Write | Planner | Outline with constraint declarations |
| ✍️ Write | Architect | Paragraph-level blueprint |
| ✍️ Write | Composer | Context assembly with selective Bible loading |
| ✍️ Write | Writer | LaTeX content generation |
| ✍️ Write | Observer | 9-category fact extraction to Bible |
| ✍️ Write | Normalizer | Bidirectional length governance |
| ✍️ Write | Governor | 7-rule input validation |
| ✍️ Write | Auditor | 18-dimension quality audit |
| ✍️ Write | Anti-AI | 6-dim detection + intelligent rewrite |
| ✍️ Write | Librarian | Citation validation + multi-source search |
| 🔭 Radar | Radar | 10 journal profiles + LLM fit analysis |
| 👥 Review | FieldAnalyst | Dynamic reviewer identity config |
| 👥 Review | EditorInChief | EIC perspective quality assessment |
| 👥 Review | 3 Reviewers | Methodology / Domain / Perspective review |
| 👥 Review | DevilsAdvocate | Core argument attack |
| 👥 Review | EditorialSynthesizer | Synthesizes editorial decision |

---

## 📂 Project Structure

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

## ⚙️ Commands

```bash
npm run serve          # Start dev server
npm run typecheck      # TypeScript type check
npm run test           # Run vitest tests
npm run test:mock      # Mock tests (no network)
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier format
npm run format:check   # Prettier check
```

---

## 📡 Selected API Endpoints

| Endpoint | Function |
|----------|----------|
| `POST /api/papers` | Create paper project |
| `POST /api/papers/:id/plan` | Generate outline |
| `POST /api/papers/:id/write` | Write section by section |
| `GET /api/papers/:id/status` | Real-time progress |
| `POST /api/papers/:id/audit` | Batch 18-dim audit |
| `POST /api/papers/:id/rewrite` | Batch section rewrite |
| `POST /api/papers/:id/directive` | Real-time writing directives |
| `POST /api/socratic/start` | Start Socratic dialogue |
| `POST /api/review/:id/start` | Start peer review |
| `POST /api/citations/search` | Multi-source literature search |
| `GET /api/health` | Health status |
| `GET /api/health/ready` | Readiness probe (DB + LLM check) |

Full API reference: [API Overview](https://github.com/Gary23333/Scholarium#readme)

---

## 🔧 Tech Stack

- **Backend**: Node.js + TypeScript, zero framework, native HTTP
- **Frontend**: React 18 + Vite, pure static SPA
- **LLM**: DeepSeek / OpenAI / Anthropic, pluggable providers
- **Storage**: JSON file persistence, atomic writes
- **Embedding**: Local TF-IDF / OpenAI text-embedding-3 / DeepSeek Embedding
- **Testing**: Vitest
- **Linting**: ESLint 9+ (typescript-eslint)
- **Formatting**: Prettier
- **CI/CD**: GitHub Actions

---

## 🆕 v2.0 Changes

| Change | Description |
|--------|-------------|
| 🏗️ **Modular server architecture** | server.ts reduced from 2276 → 327 lines, split into independent modules |
| 🛣️ **15 route modules** | Clean separation of concerns, each route independently maintainable |
| 🚨 **Unified error handling** | AppError hierarchy with consistent error response format |
| 💚 **Health check endpoints** | `/api/health` + `/api/health/ready` readiness probes |
| 🔍 **ESLint + Prettier** | ESLint 9+ (typescript-eslint) + Prettier for consistent code style |
| 🧪 **Vitest test suite** | 88 test cases covering core logic |
| ⚙️ **GitHub Actions CI/CD** | Automated build, lint, and test pipeline |
| 📐 **TypeScript strict mode** | Strict mode enabled with Node.js type definitions |

---

## 📄 License

MIT © 2026

---

<p align="center">
  <b>Scholarium</b> — Let AI write a real academic paper for you.
</p>
