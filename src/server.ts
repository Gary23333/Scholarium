// Scholarium Backend — Full API Server
// Covers: LLM, MindMap, Paper Pipeline, Citations, Bible, LaTeX
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CartographerAgent } from './agents/cartographer.ts';
import { LLMClient } from './llm/client.ts';
import { LLMRouter } from './llm/router.ts';
import { loadConfig, saveConfig, validateConfig } from './config/index.ts';
import { PlannerAgent } from './agents/planner.ts';
import { ArchitectAgent } from './agents/architect.ts';
import { ComposerAgent } from './agents/composer.ts';
import { WriterAgent } from './agents/writer.ts';
import { ObserverAgent } from './agents/observer.ts';
import { NormalizerAgent } from './agents/normalizer.ts';
import { PipelineOrchestrator } from './pipeline/orchestrator.ts';
import { BibleManager } from './bible/manager.ts';
import { ScholariumDB } from './db/database.ts';
import { InMemoryStorage } from './storage/fs-storage.ts';
import { runFullAudit } from './audit/index.ts';
import { runAntiAI } from './anti-ai/index.ts';
import { searchSemanticScholar, searchArxiv, searchCrossRef, searchAllSources } from './librarian/adapters.ts';
import { validateCitations } from './librarian/index.ts';
import { parseBibFile } from './librarian/bib-parser.ts';
import { randomUUID } from 'node:crypto';
import { assembleFullPaper } from './latex/assembler.ts';
import { compile } from './latex/compiler.ts';
import { taskManager } from './task-manager.ts';
import { logger } from './utils/logger.js';
import { SocraticMentorAgent } from './agents/socratic-mentor.ts';
import { ResearchQuestionAgent } from './agents/research-question.ts';
import { MethodologyAgent } from './agents/methodology.ts';
import { SocraticOrchestrator } from './pipeline/socratic-orchestrator.ts';
import { FieldAnalystAgent } from './agents/field-analyst.ts';
import { EditorInChiefAgent } from './agents/editor-in-chief.ts';
import { MethodologyReviewerAgent } from './agents/methodology-reviewer.ts';
import { DomainReviewerAgent } from './agents/domain-reviewer.ts';
import { PerspectiveReviewerAgent } from './agents/perspective-reviewer.ts';
import { DevilsAdvocateAgent } from './agents/devils-advocate.ts';
import { EditorialSynthesizerAgent } from './agents/editorial-synthesizer.ts';
import { ReviewOrchestrator } from './review/orchestrator.ts';
import { IntegrityGate } from './integrity/gate.ts';
import { PassportManager } from './pipeline/passport.ts';
import { CheckpointManager } from './pipeline/checkpoint.ts';
import type { MindMapNode, CartographerInput } from './agents/cartographer.ts';
import type { PaperOutline, Section, ConfirmedFocus, ScholariumConfig } from './types/index.ts';

// ─── Helpers ──────────────────────────────────────────
function json(res: http.ServerResponse, data: any, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}
function error(res: http.ServerResponse, msg: string, status = 400) { json(res, { error: msg, code: status }, status); }
function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    req.on('data', (c: Buffer) => { size += c.length; if (size > 1048576) reject(new Error('Body too large')); chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}
async function parseBody(req: any): Promise<any> {
  const raw = await readBody(req);
  if (!raw || raw.trim() === '') return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Invalid JSON in request body');
  }
}
function now() { return new Date().toLocaleTimeString('zh-CN', { hour12: false }); }

/** LaTeX → Markdown 简易转换 */
function latexToMarkdown(tex: string): string {
  return tex
    .replace(/\\subsubsection\{([^}]*)\}/g, '### $1')
    .replace(/\\subsection\{([^}]*)\}/g, '## $1')
    .replace(/\\section\{([^}]*)\}/g, '# $1')
    .replace(/\\textbf\{([^}]*)\}/g, '**$1**')
    .replace(/\\textit\{([^}]*)\}/g, '*$1*')
    .replace(/\\emph\{([^}]*)\}/g, '*$1*')
    .replace(/\\cite\{([^}]*)\}/g, '[$1]')
    .replace(/\\citep\{([^}]*)\}/g, '[$1]')
    .replace(/\\citet\{([^}]*)\}/g, '$1')
    .replace(/\\begin\{equation\*\}/g, '$$\n')
    .replace(/\\end\{equation\*\}/g, '\n$$')
    .replace(/\\begin\{equation\}/g, '$$\n')
    .replace(/\\end\{equation\}/g, '\n$$')
    .replace(/\\begin\{align\*\}/g, '$$\n\\begin{aligned}')
    .replace(/\\end\{align\*\}/g, '\\end{aligned}\n$$')
    .replace(/\\begin\{align\}/g, '$$\n\\begin{aligned}')
    .replace(/\\end\{align\}/g, '\\end{aligned}\n$$')
    .replace(/\\begin\{itemize\}/g, '')
    .replace(/\\end\{itemize\}/g, '')
    .replace(/\\begin\{enumerate\}/g, '')
    .replace(/\\end\{enumerate\}/g, '')
    .replace(/\\item\s*/g, '- ')
    .replace(/\\label\{[^}]*\}/g, '')
    .replace(/\\ref\{[^}]*\}/g, '')
    .replace(/\\%/g, '%')
    .replace(/%[^\n]*/g, '')
    .replace(/\n{4,}/g, '\n\n')
    .trim();
}

/** 去除 LaTeX 标记保留纯文本 */
function stripLatex(tex: string): string {
  return latexToMarkdown(tex)
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/---/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── State ────────────────────────────────────────────
interface MindMapSession { id: string; researchTopic: string; keywords: string[]; targetJournal?: string; nodes: MindMapNode[]; currentRound: number; status: string; createdAt: Date; }
interface PaperProject { id: string; title: string; targetJournal?: string; researchTopic?: string; contributionGaps?: string[]; outline?: PaperOutline; sections: Section[]; status: string; createdAt: string; directives?: Array<{ id: string; paperId: string; sectionId: string | null; directive: string; action: string; priority: string; createdAt: string; applied: boolean }>; }

export class ScholariumAPI {
  private server: http.Server | null = null;
  private mmSessions = new Map<string, MindMapSession>();
  private papers = new Map<string, PaperProject>();
  private sseClients = new Map<string, http.ServerResponse[]>();
  private cartographer: CartographerAgent;
  private planner: PlannerAgent;
  private architect: ArchitectAgent;
  private composer: ComposerAgent;
  private writer: WriterAgent;
  private observer: ObserverAgent;
  private normalizer: NormalizerAgent;
  private socraticMentor: SocraticMentorAgent;
  private researchQuestion: ResearchQuestionAgent;
  private methodology: MethodologyAgent;
  private socraticOrchestrator: SocraticOrchestrator;
  private fieldAnalyst: FieldAnalystAgent;
  private editorInChief: EditorInChiefAgent;
  private methodologyReviewer: MethodologyReviewerAgent;
  private domainReviewer: DomainReviewerAgent;
  private perspectiveReviewer: PerspectiveReviewerAgent;
  private devilsAdvocate: DevilsAdvocateAgent;
  private editorialSynthesizer: EditorialSynthesizerAgent;
  private reviewOrchestrator: ReviewOrchestrator;
  private integrityGate: IntegrityGate;
  private passportManager: PassportManager;
  private checkpointManager: CheckpointManager;
  private db: ScholariumDB;
  private bible: BibleManager;
  private config: ScholariumConfig;
  private router: LLMRouter;
  private dataDir: string;

  private opts: { port: number; dataDir: string; staticDir?: string };
  constructor(opts: { port: number; dataDir: string; staticDir?: string }) {
    this.opts = opts;
    this.dataDir = opts.dataDir;
    fs.mkdirSync(opts.dataDir, { recursive: true });
    this.config = loadConfig({ cwd: process.cwd(), allowMissing: true });
    this.router = new LLMRouter(this.config);
    this.db = new ScholariumDB(path.join(opts.dataDir, 'scholarium.json'));
    this.bible = new BibleManager(this.db);
    this.cartographer = new CartographerAgent(this.router);
    this.planner = new PlannerAgent(this.router);
    this.architect = new ArchitectAgent(this.router);
    this.composer = new ComposerAgent();
    this.writer = new WriterAgent(this.router);
    this.observer = new ObserverAgent(this.router);
    this.normalizer = new NormalizerAgent(this.router);
    this.socraticMentor = new SocraticMentorAgent(this.router);
    this.researchQuestion = new ResearchQuestionAgent(this.router);
    this.methodology = new MethodologyAgent(this.router);
    this.socraticOrchestrator = new SocraticOrchestrator({
      mentor: this.socraticMentor,
      rqAgent: this.researchQuestion,
      methodologyAgent: this.methodology,
      db: this.db,
    });
    this.fieldAnalyst = new FieldAnalystAgent(this.router);
    this.editorInChief = new EditorInChiefAgent(this.router);
    this.methodologyReviewer = new MethodologyReviewerAgent(this.router);
    this.domainReviewer = new DomainReviewerAgent(this.router);
    this.perspectiveReviewer = new PerspectiveReviewerAgent(this.router);
    this.devilsAdvocate = new DevilsAdvocateAgent(this.router);
    this.editorialSynthesizer = new EditorialSynthesizerAgent(this.router);
    this.reviewOrchestrator = new ReviewOrchestrator({
      fieldAnalyst: this.fieldAnalyst,
      eic: this.editorInChief,
      methodology: this.methodologyReviewer,
      domain: this.domainReviewer,
      perspective: this.perspectiveReviewer,
      da: this.devilsAdvocate,
      synthesizer: this.editorialSynthesizer,
      db: this.db,
    });
    this.integrityGate = new IntegrityGate(this.router);
    this.passportManager = new PassportManager(this.db);
    this.checkpointManager = new CheckpointManager(this.db);
    this.loadFromDB(); // 从 DB 恢复所有持久化数据

    logger.setLevel('debug');
    logger.setLogFile(path.join(opts.dataDir, 'server.log'));
    logger.info('server', `Server initialized, restored ${this.papers.size} papers, ${this.mmSessions.size} mindmap sessions`);
  }

  /** 启动时从 ScholariumDB 恢复论文和 MindMap 会话 */
  private loadFromDB(): void {
    // 恢复论文
    for (const paperId of this.db.listPaperIds()) {
      const dbPaper = this.db.getPaper(paperId);
      if (!dbPaper) continue;
      const outline = this.db.getPaperOutline(paperId);
      const dbSections = this.db.getPaperSections(paperId);
      const sections = dbSections.map((s: any) => ({
        id: s.id,
        paperId: s.paper_id,
        sectionNumber: s.section_number,
        title: s.title,
        contentTex: s.content_tex,
        status: s.status,
        version: s.version,
      }));
      this.papers.set(paperId, {
        id: paperId,
        title: dbPaper.title,
        targetJournal: dbPaper.target_journal,
        outline: outline ?? undefined,
        sections,
        status: dbPaper.status || 'draft',
        createdAt: dbPaper.created_at,
      });
    }
    // 恢复 MindMap 会话
    for (const mm of this.db.listMindMapSessions()) {
      const nodes: any[] = this.db.getMindMapNodes(mm.id).map((n: any) => ({
        id: n.id,
        parentId: n.parent_id,
        label: n.label,
        rationale: n.rationale,
        checked: !!n.checked,
        depth: n.depth,
        round: n.round,
        source: n.source ?? 'ai',
        journalMatch: n.journal_match ?? 'match',
      }));
      this.mmSessions.set(mm.id, {
        id: mm.id,
        researchTopic: mm.research_topic,
        keywords: mm.keywords ?? [],
        targetJournal: mm.target_journal ?? undefined,
        currentRound: mm.current_round ?? 0,
        nodes,
        status: mm.status ?? 'active',
        createdAt: new Date(mm.created_at ?? Date.now()),
      });
    }
    logger.info('server', `Restored ${this.papers.size} papers, ${this.mmSessions.size} mindmap sessions from DB`);
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        this.route(req, res).catch(e => {
          if (!res.headersSent) {
            // Return 400 for JSON parse errors
            if (e.message === 'Invalid JSON in request body') {
              error(res, e.message, 400);
            } else {
              error(res, e.message, 500);
            }
          }
        });
      });
      this.server.listen(this.opts.port, '0.0.0.0', () => { logger.info(`[${now()}] API: http://0.0.0.0:${this.opts.port}`); resolve(); });
    });
  }
  stop() { this.server?.close(); this.db.close(); }

  private async route(req: any, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', `http://localhost:${this.opts.port}`);
    const p = url.pathname, m = req.method ?? 'GET';
    const start = Date.now();
    logger.info('api', `${m} ${p}`);

    // Patch res.writeHead to log response
    const origWH = res.writeHead.bind(res);
    res.writeHead = ((statusCode: number, ...args: any[]) => {
      const ms = Date.now() - start;
      if (statusCode >= 400) logger.warn('api', `${m} ${p} → ${statusCode} (${ms}ms)`);
      else logger.debug('api', `${m} ${p} → ${statusCode} (${ms}ms)`);
      return origWH(statusCode, ...args);
    }) as any;

    // ── LLM ──
    if (p === '/api/llm/test' && m === 'POST') return this.llmTest(req, res);
    if (p === '/api/llm/models' && m === 'GET') return this.llmModelsGet(req, res);
    if (p === '/api/llm/config' && m === 'GET') return this.llmConfigGet(res);
    if (p === '/api/llm/config' && m === 'POST') return this.llmConfigUpdate(req, res);
    if (p === '/api/llm/provider-models' && m === 'POST') return this.llmFetchModels(req, res);

    // ── MindMap ──
    if (p === '/api/mindmap/create' && m === 'POST') return this.mmCreate(req, res);
    if (p === '/api/mindmap/diverge' && m === 'POST') return this.mmDiverge(req, res);
    if (p === '/api/mindmap/check' && m === 'POST') return this.mmCheck(req, res);
    if (p === '/api/mindmap/export' && m === 'POST') return this.mmExport(req, res);
    if (p.startsWith('/api/mindmap/sse/')) return this.mmSSE(req, res, p.split('/').pop()!);
    if (p === '/api/mindmap/sessions' && m === 'GET') return json(res, [...this.mmSessions.values()].map(s => ({ id: s.id, topic: s.researchTopic, round: s.currentRound, nodes: s.nodes.length, status: s.status })));
    if (p.match(/^\/api\/mindmap\/sessions\/[^/]+$/) && m === 'GET') return this.mmSessionGet(p.split('/').pop()!, res);
    if (p.match(/^\/api\/mindmap\/sessions\/[^/]+$/) && m === 'DELETE') return this.mmDelete(p.split('/').pop()!, res);

    // ── Papers ──
    if (p === '/api/papers' && m === 'GET') return json(res, [...this.papers.values()].map(p => ({ id: p.id, title: p.title, status: p.status, sections: p.sections.length })));
    if (p === '/api/papers' && m === 'POST') return this.paperCreate(req, res);
    if (p.match(/^\/api\/papers\/[^/]+$/) && m === 'GET') return this.paperGet(p.split('/').pop()!, res);
    if (p.match(/^\/api\/papers\/[^/]+$/) && m === 'DELETE') return this.paperDelete(p.split('/').pop()!, res);
    if (p.match(/^\/api\/papers\/[^/]+\/plan$/) && m === 'POST') return this.paperPlan(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/write$/) && m === 'POST') return this.paperWrite(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/compile$/) && m === 'POST') return this.paperCompile(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/fulltext$/) && m === 'GET') return this.paperFulltext(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/export$/) && m === 'GET') return this.paperExport(req, res, p.split('/')[3]);

    // ── Interactive: Section Status & Audit Report ──
    if (p.match(/^\/api\/papers\/[^/]+\/sections\/[^/]+\/status$/) && m === 'GET') {
      const parts = p.split('/');
      return this.sectionStatusGet(res, parts[3], parts[5]);
    }
    if (p.match(/^\/api\/papers\/[^/]+\/sections\/[^/]+\/audit-report$/) && m === 'GET') {
      const parts = p.split('/');
      return this.sectionAuditReportGet(res, parts[3], parts[5]);
    }

    // ── Paper Outline CRUD ──
    if (p.match(/^\/api\/papers\/[^/]+\/outline\/sections$/) && m === 'POST') return this.outlineAddSection(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/outline\/sections\/[^/]+$/) && m === 'PUT') {
      const parts = p.split('/');
      return this.outlineUpdateSection(req, res, parts[3], parts[6]);
    }
    if (p.match(/^\/api\/papers\/[^/]+\/outline\/sections\/[^/]+$/) && m === 'DELETE') {
      const parts = p.split('/');
      return this.outlineDeleteSection(res, parts[3], parts[6]);
    }
    if (p.match(/^\/api\/papers\/[^/]+\/outline\/reorder$/) && m === 'POST') return this.outlineReorder(req, res, p.split('/')[3]);

    // ── Per-section citations ──
    if (p.match(/^\/api\/papers\/[^/]+\/sections\/[^/]+\/citations$/) && m === 'GET') {
      const parts = p.split('/');
      return this.sectionCitationsList(res, parts[3], parts[5]);
    }

    // ── Generate references section ──
    if (p.match(/^\/api\/papers\/[^/]+\/generate-references$/) && m === 'POST') return this.generateReferences(req, res, p.split('/')[3]);

    // ── Section Rewrite ──
    if (p.match(/^\/api\/papers\/[^/]+\/sections\/[^/]+\/rewrite$/) && m === 'POST') {
      const parts = p.split('/');
      return this.sectionRewrite(req, res, parts[3], parts[5]);
    }

    // ── Section Content Direct Update ──
    if (p.match(/^\/api\/papers\/[^/]+\/sections\/[^/]+\/content$/) && m === 'PUT') {
      const parts = p.split('/');
      return this.sectionContentUpdate(req, res, parts[3], parts[5]);
    }

    // ── Optimize Related Sections ──
    if (p.match(/^\/api\/papers\/[^/]+\/sections\/[^/]+\/optimize-related$/) && m === 'POST') {
      const parts = p.split('/');
      return this.sectionOptimizeRelated(req, res, parts[3], parts[5]);
    }

    // ── 交互式迭代 API ──
    if (p.match(/^\/api\/papers\/[^/]+\/status$/) && m === 'GET') return this.paperStatusGet(res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/directive$/) && m === 'POST') return this.paperDirective(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/rewrite$/) && m === 'POST') return this.paperRewrite(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/audit$/) && m === 'POST') return this.paperAudit(req, res, p.split('/')[3]);

    // ── Paper Citations CRUD ──
    if (p.match(/^\/api\/papers\/[^/]+\/citations$/) && m === 'GET') return this.paperCitationsList(res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/citations$/) && m === 'POST') return this.paperCitationsAdd(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/citations\/lookup$/) && m === 'POST') return this.citationsLookup(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/papers\/[^/]+\/citations\/[^/]+$/) && m === 'PUT') {
      const parts = p.split('/');
      return this.paperCitationsUpdate(req, res, parts[3], parts[6]);
    }
    if (p.match(/^\/api\/papers\/[^/]+\/citations\/[^/]+$/) && m === 'DELETE') {
      const parts = p.split('/');
      return this.paperCitationsDelete(res, parts[3], parts[6]);
    }

    // ── Citations ──
    if (p === '/api/citations/validate' && m === 'POST') return this.citeValidate(req, res);
    if (p === '/api/citations/search' && m === 'POST') return this.citeSearch(req, res);
    if (p === '/api/citations/parse-bib' && m === 'POST') return this.citeParseBib(req, res);
    if (p === '/api/citations/from-url' && m === 'POST') return this.citeFromUrl(req, res);
    if (p === '/api/citations/generate-template' && m === 'POST') return this.citeGenerateTemplate(req, res);
    if (p === '/api/citations/templates' && m === 'GET') return this.citeTemplatesList(res);
    if (p === '/api/citations/templates' && m === 'POST') return this.citeTemplatesSave(req, res);
    if (p.match(/^\/api\/citations\/templates\/[^/]+$/) && m === 'DELETE') return this.citeTemplatesDelete(req, res, p.split('/').pop()!);

    // ── LLM: Translation ──
    if (p === '/api/llm/translate' && m === 'POST') return this.llmTranslate(req, res);

    // ── Bible ──
    if (p.match(/^\/api\/bible\/[^/]+\/entries$/) && m === 'POST') return this.bibleEntryCreate(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/bible\/[^/]+\/entries\/[^/]+$/) && m === 'PUT') {
      const parts = p.split('/');
      return this.bibleEntryUpdate(req, res, parts[3], parts[5]);
    }
    if (p.match(/^\/api\/bible\/[^/]+\/entries\/[^/]+$/) && m === 'DELETE') {
      const parts = p.split('/');
      return this.bibleEntryDelete(res, parts[3], parts[5]);
    }
    if (p.match(/^\/api\/bible\/[^/]+$/) && m === 'GET') return this.bibleGet(p.split('/').pop()!, res);

    // ── Tasks ──
    if (p === '/api/tasks' && m === 'GET') return this.tasksList(req, res);
    if (p === '/api/tasks/stats' && m === 'GET') return this.tasksStats(res);
    if (p.match(/^\/api\/tasks\/[^/]+$/) && m === 'GET') return this.taskGet(p.split('/').pop()!, res);
    if (p === '/api/tasks/clear' && m === 'POST') return this.tasksClear(res);

    // ── Review ──
    if (p.match(/^\/api\/review\/[^/]+\/start$/) && m === 'POST') return this.reviewStart(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/review\/[^/]+$/) && m === 'GET') return this.reviewGet(res, p.split('/')[3]);

    // ── Integrity ──
    if (p.match(/^\/api\/integrity\/[^/]+\/gate$/) && m === 'POST') return this.integrityGateRun(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/integrity\/[^/]+\/audit-claims$/) && m === 'POST') return this.integrityAuditClaims(req, res, p.split('/')[3]);

    // ── Passport ──
    if (p.match(/^\/api\/passport\/[^/]+$/) && m === 'GET') return this.passportGet(res, p.split('/')[3]);
    if (p.match(/^\/api\/passport\/[^/]+$/) && m === 'POST') return this.passportCreate(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/passport\/[^/]+\/resume$/) && m === 'POST') return this.passportResume(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/passport\/[^/]+\/boundary$/) && m === 'POST') return this.passportAddBoundary(req, res, p.split('/')[3]);

    // ── Checkpoint ──
    if (p.match(/^\/api\/checkpoint\/[^/]+$/) && m === 'GET') return this.checkpointGet(res, p.split('/')[3]);
    if (p.match(/^\/api\/checkpoint\/[^/]+\/confirm$/) && m === 'POST') return this.checkpointConfirm(res, p.split('/')[3]);

    // ── Process Summary ──
    if (p.match(/^\/api\/pipeline\/[^/]+\/summary$/) && m === 'GET') return this.processSummaryGet(res, p.split('/')[3]);

    // ── Socratic ──
    if (p === '/api/socratic/start' && m === 'POST') return this.socraticStart(req, res);
    if (p.match(/^\/api\/socratic\/[^/]+\/respond$/) && m === 'POST') return this.socraticRespond(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/socratic\/[^/]+\/summary$/) && m === 'GET') return this.socraticSummary(res, p.split('/')[3]);
    if (p.match(/^\/api\/socratic\/[^/]+\/complete$/) && m === 'POST') return this.socraticComplete(req, res, p.split('/')[3]);
    if (p.match(/^\/api\/socratic\/[^/]+\/commitment$/) && m === 'POST') return this.socraticCommitment(req, res, p.split('/')[3]);

    // ── Stats ──
    if (p === '/api/stats' && m === 'GET') return this.statsGet(res);

    // ── Static ──
    if (m === 'GET' && this.opts.staticDir) return this.static(res, p);

    error(res, 'Not found', 404);
  }

  // ══════════════════════════════════════════
  // LLM
  // ══════════════════════════════════════════
  private async llmTest(req: any, res: http.ServerResponse) {
    const { baseUrl, apiKey, model } = await parseBody(req);
    if (!apiKey) return json(res, { ok: false, error: 'apiKey is required' }, 400);
    try {
      const client = new LLMClient({ apiKey, baseUrl, model, maxTokens: 30, timeout: 15000, maxRetries: 1 });
      const start = Date.now();
      const reply = await client.complete('Reply with exactly one word.', 'What is 2+2?');
      json(res, { ok: true, reply: reply.trim(), tokens: 0, latency: Date.now() - start });
    } catch (e: any) {
      const statusMatch = e.message?.match(/LLM API error (\d+)/);
      const httpStatus = statusMatch ? parseInt(statusMatch[1]) : 500;
      const isAuth = httpStatus === 401 || httpStatus === 403;
      json(res, { ok: false, error: e.message, httpStatus }, isAuth ? 401 : 500);
    }
  }

  private llmConfigGet(res: http.ServerResponse) {
    json(res, {
      config: this.maskConfig(this.config),
      routes: Object.fromEntries(Object.keys(this.config.llm.models).map(agent => [agent, this.router.route(agent)])),
      validation: validateConfig(this.config),
    });
  }

  private async llmConfigUpdate(req: any, res: http.ServerResponse) {
    const body = await parseBody(req);

    // Deep merge providers: preserve existing apiKey/models when incoming is masked or missing
    const mergedProviders: ScholariumConfig['llm']['providers'] = {};
    const allProviderKeys = new Set([
      ...Object.keys(this.config.llm.providers),
      ...Object.keys(body.providers ?? {}),
    ]);
    for (const key of allProviderKeys) {
      const existing = this.config.llm.providers[key] ?? {};
      const incoming = (body.providers ?? {})[key] ?? {};
      mergedProviders[key] = {
        baseUrl: incoming.baseUrl ?? existing.baseUrl ?? '',
        apiKey: (incoming.apiKey !== undefined && incoming.apiKey !== '***configured***')
          ? incoming.apiKey
          : existing.apiKey,
      };
      // Preserve models from incoming if provided, otherwise from existing
      const incomingModels = incoming.models;
      const existingModels = existing.models;
      if (Array.isArray(incomingModels) && incomingModels.length > 0) {
        mergedProviders[key]!.models = incomingModels;
      } else if (Array.isArray(existingModels) && existingModels.length > 0) {
        mergedProviders[key]!.models = existingModels;
      }
    }

    const nextConfig: ScholariumConfig = {
      ...this.config,
      llm: {
        providers: mergedProviders,
        models: { ...this.config.llm.models, ...(body.models ?? {}) },
        fallbacks: { ...this.config.llm.fallbacks, ...(body.fallbacks ?? {}) },
      },
    };
    const validation = validateConfig(nextConfig);
    if (!validation.ok) return json(res, validation, 400);
    this.config = nextConfig;
    this.router.updateConfig(nextConfig);
    saveConfig(nextConfig);
    json(res, { ok: true, config: this.maskConfig(this.config), validation });
  }

  private async llmFetchModels(req: any, res: http.ServerResponse) {
    const { baseUrl, apiKey } = await parseBody(req);
    try {
      const url = baseUrl.replace(/\/+$/, '') + '/models';
      const fetchRes = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      });
      if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status} ${fetchRes.statusText}`);
      const data = await fetchRes.json() as any;
      const models = (data.data ?? data.models ?? []).map((m: any) => m.id ?? m).filter(Boolean);
      json(res, { ok: true, models });
    } catch (e: any) {
      json(res, { ok: false, error: e.message });
    }
  }

  private async llmModelsGet(req: any, res: http.ServerResponse) {
    const defaultModels = ['deepseek-chat', 'deepseek-reasoner', 'gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-20250514'];
    const allModels = new Set<string>(defaultModels);
    const errors: string[] = [];

    for (const [name, provider] of Object.entries(this.config.llm.providers)) {
      if (!provider.apiKey || !provider.baseUrl) continue;
      try {
        const url = provider.baseUrl.replace(/\/+$/, '') + '/models';
        const fetchRes = await fetch(url, {
          headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (fetchRes.ok) {
          const data = await fetchRes.json() as any;
          const models = (data.data ?? data.models ?? []).map((m: any) => m.id ?? m).filter(Boolean);
          for (const m of models) allModels.add(m);
        }
      } catch (e: any) {
        errors.push(`${name}: ${e.message}`);
      }
    }

    json(res, { models: [...allModels], errors: errors.length > 0 ? errors : undefined });
  }

  // ══════════════════════════════════════════
  // MindMap
  // ══════════════════════════════════════════
  private async mmCreate(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    const s: MindMapSession = { id: `mm-${Date.now()}`, researchTopic: b.researchTopic, keywords: b.keywords ?? [], targetJournal: b.targetJournal, nodes: [], currentRound: 0, status: 'active', createdAt: new Date() };
    this.mmSessions.set(s.id, s);
    this.db.createMindMapSession(s);
    json(res, { sessionId: s.id, session: s });
  }

  private async mmDiverge(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    logger.info(`[MindMap] Diverge round ${b.round ?? 'next'} for session ${b.sessionId}`);
    const s = this.mmSessions.get(b.sessionId);
    if (!s) return error(res, 'Session not found', 404);
    const round = Math.min(3, Math.max(1, b.round ?? s.currentRound + 1));
    
    // 创建任务
    const task = taskManager.create('diverge', `思维导图发散 - 第${round}轮`, { sessionId: b.sessionId, round });
    taskManager.start(task.id);
    
    this.mmSSESend(b.sessionId, { type: 'diverge_start', round, ts: now() });
    const input: CartographerInput = { researchTopic: s.researchTopic, keywords: s.keywords, targetJournal: s.targetJournal, existingNodes: s.nodes, selectedNodeIds: b.selectedNodeIds ?? [], currentRound: round };
    try {
      taskManager.updateProgress(task.id, 30, '正在生成节点...');
      const output = await this.cartographer.execute(input, { mock: !this.hasLLMFor('cartographer') });
      logger.info(`[MindMap] Generated ${output.nodes.length} nodes`);
      
      taskManager.updateProgress(task.id, 80, `已生成 ${output.nodes.length} 个节点`);
      for (const n of output.nodes) { s.nodes.push(n); this.db.createMindMapNode({ ...n, sessionId: b.sessionId }); this.mmSSESend(b.sessionId, { type: 'node', node: n, ts: now() }); await new Promise(r => setTimeout(r, 80)); }
      s.currentRound = output.round;
      this.db.updateMindMapSession(b.sessionId, { current_round: output.round });
      this.mmSSESend(b.sessionId, { type: 'diverge_complete', round: output.round, summary: output.summary, ts: now() });
      
      taskManager.complete(task.id, `完成，共 ${output.nodes.length} 个节点`);
      json(res, { nodes: output.nodes, round: output.round, summary: output.summary, totalNodes: s.nodes.length, taskId: task.id });
    } catch (e: any) {
      logger.error('[MindMap] Cartographer failed:', e);
      taskManager.fail(task.id, e.message);
      this.mmSSESend(b.sessionId, { type: 'error', message: e.message, ts: now() });
      throw e;
    }
  }

  private async mmCheck(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    const s = this.mmSessions.get(b.sessionId);
    if (!s) return error(res, 'Session not found', 404);
    const n = s.nodes.find(n => n.id === b.nodeId);
    if (n) { n.checked = !!b.checked; this.db.updateMindMapNode(b.nodeId, { checked: !!b.checked }); }
    this.mmSSESend(b.sessionId, { type: 'check', nodeId: b.nodeId, checked: !!b.checked });
    json(res, { ok: true });
  }

  private async mmExport(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    const s = this.mmSessions.get(b.sessionId);
    if (!s) return error(res, 'Session not found', 404);
    const sel = s.nodes.filter(n => n.checked);
    json(res, {
      researchTopic: s.researchTopic,
      selectedBranches: sel.filter(n => n.round === 1).map(n => n.label),
      confirmedNodes: sel.map(n => ({ id: n.id, label: n.label, depth: n.round })),
      contributionGaps: s.nodes.filter(n => n.round === 3 && n.label.startsWith('[Gap]')).map(n => n.label.replace(/^\[Gap\]\s*/, '')),
      noveltyCandidates: s.nodes.filter(n => n.round === 3 && n.label.startsWith('[Novelty]')).map(n => n.label.replace(/^\[Novelty\]\s*/, '')),
    });
    s.status = 'exported';
    this.db.updateMindMapSession(b.sessionId, { status: 'exported' });
  }

  private mmSSE(req: any, res: http.ServerResponse, sid: string) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write('data: {"type":"connected"}\n\n');
    const arr = this.sseClients.get(sid) ?? []; arr.push(res); this.sseClients.set(sid, arr);
    req.on('close', () => this.sseClients.set(sid, (this.sseClients.get(sid) ?? []).filter(c => c !== res)));
  }
  private mmSSESend(sid: string, data: any) {
    for (const c of this.sseClients.get(sid) ?? []) try { c.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* client disconnected */ }
  }

  private mmDelete(id: string, res: http.ServerResponse) {
    if (!this.mmSessions.has(id)) return error(res, 'Session not found', 404);
    this.mmSessions.delete(id);
    this.db.deleteMindMapSession(id);
    json(res, { ok: true });
  }

  private mmSessionGet(id: string, res: http.ServerResponse) {
    const s = this.mmSessions.get(id);
    if (!s) return error(res, 'Session not found', 404);
    json(res, {
      id: s.id,
      researchTopic: s.researchTopic,
      keywords: s.keywords,
      targetJournal: s.targetJournal,
      currentRound: s.currentRound,
      status: s.status,
      createdAt: s.createdAt,
      nodes: s.nodes,
    });
  }

  // ══════════════════════════════════════════
  // Papers
  // ══════════════════════════════════════════
  private async paperCreate(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    const id = `paper-${Date.now()}`;
    const p: PaperProject = {
      id, title: b.title ?? 'Untitled', targetJournal: b.targetJournal,
      researchTopic: b.researchTopic ?? b.title,
      contributionGaps: b.contributionGaps ?? [],
      sections: [], status: 'draft', createdAt: new Date().toISOString()
    };
    this.papers.set(id, p);
    this.db.createPaper(id, p.title, p.targetJournal);
    // Pre-add citations if provided
    if (Array.isArray(b.citations)) for (const c of b.citations) this.bible.addEntry({ paperId: id, category: 'citations', key: c.key, value: c.bibtex, sourceType: 'user', confidence: 1.0, approvalStatus: 'approved' });
    json(res, { paperId: id, paper: p });
  }

  private paperGet(id: string, res: http.ServerResponse) {
    const p = this.papers.get(id);
    if (!p) return error(res, 'Paper not found', 404);
    const bibleStats = this.bible.getStats(id);
    json(res, { ...p, bibleStats });
  }

  private paperDelete(id: string, res: http.ServerResponse) {
    if (!this.papers.has(id)) return error(res, 'Paper not found', 404);
    this.papers.delete(id);
    this.db.deletePaper(id);
    json(res, { ok: true });
  }

  private async paperPlan(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    
    // 创建任务
    const task = taskManager.create('plan', `生成大纲 - ${p.title}`, { paperId });
    taskManager.start(task.id);
    
    try {
      taskManager.updateProgress(task.id, 20, '正在分析研究主题...');
      const focus: ConfirmedFocus = b.confirmedFocus ?? {
        researchTopic: p.researchTopic ?? p.title,
        selectedBranches: [],
        confirmedNodes: [],
        contributionGaps: p.contributionGaps ?? [],
      };
      
      taskManager.updateProgress(task.id, 50, '正在生成大纲结构...');
      const outline = await this.planner.execute({ confirmedFocus: focus, journalProfile: b.journalProfile }, { mock: !this.hasLLMFor('planner') });
      
      taskManager.updateProgress(task.id, 90, '正在保存大纲...');
      p.outline = outline; p.status = 'planned';
      this.db.savePaperOutline(paperId, outline);
      this.db.updatePaperStatus(paperId, 'planned');
      
      taskManager.complete(task.id, `完成，共 ${outline.sections.length} 个章节`);
      json(res, { outline, taskId: task.id });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      throw e;
    }
  }

  private async paperWrite(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p || !p.outline) return error(res, 'Paper or outline not found', 404);
    const b = await parseBody(req);
    const sectionDef = p.outline.sections[b.sectionIndex ?? 0];
    if (!sectionDef) return error(res, 'Section not found', 404);

    // 创建任务
    const task = taskManager.create('write', `写作章节 - ${sectionDef.title}`, { paperId, sectionId: sectionDef.id, sectionIndex: b.sectionIndex });
    taskManager.start(task.id);

    const storage = new InMemoryStorage();
    const orch = new PipelineOrchestrator({
      planner: this.planner, architect: this.architect, composer: this.composer,
      writer: this.writer, observer: this.observer, normalizer: this.normalizer,
      bible: this.bible, storage,
      localCitations: this.bible.getEntries(paperId, { category: 'citations' }).map(e => ({
        id: e.id, paperId, citeKey: e.key, bibtex: e.value, doi: null, title: null, authors: null, year: null,
        verified: true, approvalStatus: e.approvalStatus, source: 'user', matchConfidence: 1.0, lastVerifiedAt: null, embedding: null, createdAt: '', updatedAt: '',
      })),
    });
    
    try {
      taskManager.updateProgress(task.id, 5, '正在生成写作蓝图...', 'architect');
      const { section, state } = await orch.writeSection(paperId, p.outline, sectionDef, {
        mock: !this.hasLLMFor('writer'),
        skipAntiAI: b.skipAntiAI ?? false,
        taskId: task.id,
        taskManager,
      });
      
      const existingIdx = p.sections.findIndex(s => s.id === section.id);
      if (existingIdx >= 0) p.sections[existingIdx] = section; else p.sections.push(section);
      this.persistSection(paperId, section);
      
      const contentLength = section.contentTex?.length || 0;
      taskManager.complete(task.id, `完成，状态: ${state}，字数: ${contentLength}`);
      json(res, { section, state, taskId: task.id });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      throw e;
    }
  }

  private async paperCompile(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const outDir = path.join(this.dataDir, 'output', paperId);
    fs.mkdirSync(outDir, { recursive: true });
    const sectionContents: Record<string, string> = {};
    for (const s of p.sections) if (s.contentTex) sectionContents[s.id] = s.contentTex;
    const refs = p.sections.filter(s => s.contentTex).map((s, i) => ({ id: s.id, number: i + 1, title: s.title, texPath: `sections/section_${i + 1}.tex`, status: s.status, version: s.version }));
    assembleFullPaper({ title: p.title, authors: ['Scholarium', 'DeepSeek'], sections: refs, sectionContents, bibFilePath: 'references.bib', figures: [], appendices: [], templateId: 'default' }, outDir);
    const bibEntries = this.bible.getEntries(paperId, { category: 'citations' });
    fs.writeFileSync(path.join(outDir, 'references.bib'), bibEntries.map(e => e.value).join('\n\n'), 'utf-8');
    const result = await compile({ workDir: outDir, texFile: 'main.tex' });
    json(res, result);
  }

  /** 组装全文 */
  private paperFulltext(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const url = new URL(req.url ?? '/', `http://localhost:${this.opts.port}`);
    const format = url.searchParams.get('format') ?? 'latex';

    const sections = p.sections
      .filter(s => s.contentTex)
      .sort((a, b) => a.sectionNumber - b.sectionNumber);

    if (format === 'markdown') {
      const md = sections.map(s => {
        const header = '#'.repeat(Math.min(3, s.sectionNumber + 1));
        const title = `${header} ${s.title}`;
        const body = s.contentTex
          ? latexToMarkdown(s.contentTex)
          : '';
        return `${title}\n\n${body}`;
      }).join('\n\n---\n\n');

      json(res, { format: 'markdown', content: md, title: p.title, totalSections: sections.length });
    } else if (format === 'text') {
      const text = sections.map(s => {
        return `${s.title}\n${'='.repeat(s.title.length)}\n\n${stripLatex(s.contentTex ?? '')}`;
      }).join('\n\n');
      json(res, { format: 'text', content: text, title: p.title, totalSections: sections.length });
    } else {
      const latex = sections.map(s => {
        return `% ${s.title}\n${s.contentTex ?? ''}`;
      }).join('\n\n');
      json(res, { format: 'latex', content: latex, title: p.title, totalSections: sections.length });
    }
  }

  /** 导出下载 */
  private paperExport(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const url = new URL(req.url ?? '/', `http://localhost:${this.opts.port}`);
    const format = url.searchParams.get('format') ?? 'md';

    const sections = p.sections
      .filter(s => s.contentTex)
      .sort((a, b) => a.sectionNumber - b.sectionNumber);

    if (format === 'md' || format === 'markdown') {
      const md = sections.map(s => {
        const header = '#'.repeat(Math.min(3, s.sectionNumber + 1));
        const title = `${header} ${s.title}`;
        const body = s.contentTex ? latexToMarkdown(s.contentTex) : '';
        return `${title}\n\n${body}`;
      }).join('\n\n---\n\n');

      const buf = Buffer.from(md);
      const asciiName = p.title.replace(/[^\x20-\x7e]/g, '_').substring(0, 50);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${asciiName}.md"`);
      res.setHeader('Content-Length', buf.length);
      res.writeHead(200);
      res.end(buf);
    } else if (format === 'latex') {
      const latex = sections.map(s => s.contentTex ?? '').join('\n\n');
      const buf = Buffer.from(latex);
      const asciiName = p.title.replace(/[^\x20-\x7e]/g, '_').substring(0, 50);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${asciiName}.tex"`);
      res.setHeader('Content-Length', buf.length);
      res.writeHead(200);
      res.end(buf);
    } else {
      error(res, 'Unsupported format. Use md or latex.', 400);
    }
  }

  // ══════════════════════════════════════════
  // Interactive: Section Status & Audit Report
  // ══════════════════════════════════════════

  /** Get status of a single section */
  private sectionStatusGet(res: http.ServerResponse, paperId: string, sectionId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const section = p.sections.find(s => s.id === sectionId);
    if (!section) return error(res, 'Section not found', 404);
    const outlineSec = p.outline?.sections.find(s => s.id === sectionId);
    json(res, {
      sectionId: section.id,
      title: section.title,
      status: section.status,
      version: section.version,
      wordCount: section.contentTex ? section.contentTex.split(/\s+/).length : 0,
      auditFindings: 0, // would need stored audit report
      aiScore: undefined,
      coreArgument: outlineSec?.coreArgument,
      hasContent: !!section.contentTex && section.contentTex.length > 0,
      contentLength: section.contentTex?.length ?? 0,
    });
  }

  /** Get audit report for a section */
  private async sectionAuditReportGet(res: http.ServerResponse, paperId: string, sectionId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const section = p.sections.find(s => s.id === sectionId);
    if (!section) return error(res, 'Section not found', 404);
    if (!section.contentTex) {
      return json(res, { sectionId, title: section.title, status: section.status, reportAvailable: false, message: 'Section has no content. Write the section first.' });
    }
    // Run real-time audit if content exists
    const bibleEntries = this.bible.getEntries(paperId);
    const auditInput = {
      sectionId,
      draft: section.contentTex,
      bibleSummary: {
        terminology: bibleEntries.filter(e => e.category === 'terminology').map(e => ({ key: e.key, value: e.value })),
        citationMap: bibleEntries.filter(e => e.category === 'citations').map(e => ({ key: e.key, value: e.value })),
        dataPoints: bibleEntries.filter(e => e.category === 'data').map(e => ({ key: e.key, value: e.value })),
      },
      mockMode: !this.hasLLMFor('auditor'),
    };
    try {
      const { runFullAudit } = await import('./audit/index.ts');
      const report = await runFullAudit(auditInput, this.router);
      json(res, { sectionId, title: section.title, status: section.status, reportAvailable: true, report });
    } catch (e: any) {
      json(res, { sectionId, title: section.title, status: section.status, reportAvailable: false, message: `Audit failed: ${e.message}` });
    }
  }

  // ══════════════════════════════════════════
  // Interactive: Paper-Level API (v0.3.0)
  // ══════════════════════════════════════════

  /** GET /api/papers/:id/status — 查看论文实时状态 */
  private paperStatusGet(res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);

    const sections = p.sections.map(s => ({
      id: s.id,
      title: s.title,
      status: s.status,
      version: s.version,
      wordCount: s.contentTex ? s.contentTex.split(/\s+/).length : 0,
      hasContent: !!s.contentTex && s.contentTex.length > 0,
    }));

    const completedSections = sections.filter(s => s.hasContent).length;
    const totalSections = p.outline?.sections.length ?? sections.length;
    const progress = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;

    json(res, {
      id: p.id,
      title: p.title,
      status: p.status,
      targetJournal: p.targetJournal,
      researchTopic: p.researchTopic,
      createdAt: p.createdAt,
      progress,
      completedSections,
      totalSections,
      sections,
      outline: p.outline ? {
        title: p.outline.title,
        sectionCount: p.outline.sections.length,
      } : null,
    });
  }

  /** POST /api/papers/:id/directive — 实时注入指导指令 */
  private async paperDirective(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);

    const b = await parseBody(req);
    const { directive, sectionId, action, priority } = b;

    if (!directive || typeof directive !== 'string') {
      return error(res, 'directive (string) is required', 400);
    }

    const validActions = ['revise_claim', 'add_citation', 'expand_section', 'compress_section', 'rewrite_paragraph', 'fix_terminology', 'user_comment'];
    const actionType = validActions.includes(action) ? action : 'user_comment';

    const directiveRecord = {
      id: randomUUID(),
      paperId,
      sectionId: sectionId ?? null,
      directive,
      action: actionType,
      priority: priority ?? 'normal',
      createdAt: new Date().toISOString(),
      applied: false,
    };

    // Store directive in paper metadata
    if (!p.directives) p.directives = [];
    p.directives.push(directiveRecord);

    // If sectionId specified, apply directive immediately
    if (sectionId) {
      const section = p.sections.find(s => s.id === sectionId);
      if (section) {
        json(res, {
          ok: true,
          directive: directiveRecord,
          message: `Directive recorded for section "${section.title}". The next rewrite of this section will apply: "${directive}"`,
          sectionStatus: section.status,
        });
        return;
      }
    }

    json(res, {
      ok: true,
      directive: directiveRecord,
      message: `Directive recorded for paper "${p.title}". It will be applied to relevant sections on next write/rewrite.`,
    });
  }

  /** POST /api/papers/:id/rewrite — 要求重写某段(支持指定sectionId) */
  private async paperRewrite(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);

    const b = await parseBody(req);
    const { sectionId, instruction, sectionIds } = b;

    const targets: string[] = sectionId ? [sectionId] : (sectionIds ?? []);
    if (targets.length === 0) {
      // If no section specified, rewrite all sections with content
      targets.push(...p.sections.filter(s => s.contentTex).map(s => s.id));
    }

    if (targets.length === 0) {
      return error(res, 'No sections to rewrite. Specify sectionId or ensure sections have content.', 400);
    }

    json(res, {
      ok: true,
      paperId,
      instruction: instruction ?? null,
      targetSections: targets,
      scheduled: targets.length,
      message: `Rewrite scheduled for ${targets.length} section(s). Use the per-section rewrite endpoint to execute: POST /api/papers/${paperId}/sections/{sectionId}/rewrite`,
    });
  }

  /** POST /api/papers/:id/audit — 手动触发审计 */
  private async paperAudit(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);

    const b = await parseBody(req);
    const { sectionId, sectionIds } = b;

    const targets: string[] = sectionId ? [sectionId] : (sectionIds ?? []);
    if (targets.length === 0) {
      targets.push(...p.sections.filter(s => s.contentTex).map(s => s.id));
    }

    if (targets.length === 0) {
      return error(res, 'No sections to audit. Write section content first.', 400);
    }

    // Run audits for target sections
    const results: Record<string, any> = {};
    const bibleEntries = this.bible.getEntries(paperId);

    for (const sid of targets) {
      const section = p.sections.find(s => s.id === sid);
      if (!section?.contentTex) {
        results[sid] = { sectionId: sid, reportAvailable: false, message: 'No content to audit' };
        continue;
      }

      try {
        const auditInput = {
          sectionId: sid,
          draft: section.contentTex,
          bibleSummary: {
            terminology: bibleEntries.filter(e => e.category === 'terminology').map(e => ({ key: e.key, value: e.value })),
            citationMap: bibleEntries.filter(e => e.category === 'citations').map(e => ({ key: e.key, value: e.value })),
            dataPoints: bibleEntries.filter(e => e.category === 'data').map(e => ({ key: e.key, value: e.value })),
          },
          mockMode: !this.hasLLMFor('auditor'),
        };
        const { runFullAudit } = await import('./audit/index.ts');
        const report = await runFullAudit(auditInput, this.router);
        results[sid] = { sectionId: sid, title: section.title, reportAvailable: true, report };
      } catch (e: any) {
        results[sid] = { sectionId: sid, title: section.title, reportAvailable: false, message: `Audit failed: ${e.message}` };
      }
    }

    json(res, {
      ok: true,
      paperId,
      auditedSections: targets.length,
      results,
    });
  }

  // ══════════════════════════════════════════
  // Outline CRUD
  // ══════════════════════════════════════════

  /** 添加大纲章节 */
  private async outlineAddSection(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { id, title, coreArgument, estimatedPages, requiredCitations, parent } = b;
    if (!id || !title) return error(res, 'id and title are required', 400);
    const newSection = { id, title, coreArgument: coreArgument ?? '', estimatedPages: estimatedPages ?? 1, requiredCitations: requiredCitations ?? 0, parent: parent ?? null };
    p.outline?.sections.push(newSection);
    if (p.outline) this.db.savePaperOutline(paperId, p.outline);
    json(res, { section: newSection });
  }

  /** 更新大纲章节（标题、核心论点等） */
  private async outlineUpdateSection(req: any, res: http.ServerResponse, paperId: string, sectionId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { title, coreArgument, estimatedPages, requiredCitations } = b;
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (coreArgument !== undefined) updates.coreArgument = coreArgument;
    if (estimatedPages !== undefined) updates.estimatedPages = estimatedPages;
    if (requiredCitations !== undefined) updates.requiredCitations = requiredCitations;
    this.db.updateOutlineSection(paperId, sectionId, updates);
    // Update in-memory as well
    if (p.outline) {
      const sec = p.outline.sections.find(s => s.id === sectionId);
      if (sec) Object.assign(sec, updates);
    }
    json(res, { ok: true });
  }

  /** 删除大纲章节 */
  private outlineDeleteSection(res: http.ServerResponse, paperId: string, sectionId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    this.db.removeOutlineSection(paperId, sectionId);
    if (p.outline) {
      p.outline.sections = p.outline.sections.filter(s => s.id !== sectionId && s.parent !== sectionId);
    }
    json(res, { ok: true });
  }

  /** 重新排序大纲章节 */
  private async outlineReorder(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { orderedIds } = b;
    if (!Array.isArray(orderedIds)) return error(res, 'orderedIds array is required', 400);
    this.db.reorderOutlineSections(paperId, orderedIds);
    // Update in-memory
    if (p.outline) {
      const sectionMap = new Map(p.outline.sections.map(s => [s.id, s]));
      p.outline.sections = orderedIds.map(id => sectionMap.get(id)).filter(Boolean) as typeof p.outline.sections;
    }
    json(res, { ok: true });
  }

  // ══════════════════════════════════════════
  // Section Rewrite (modify with instructions)
  // ══════════════════════════════════════════

  /** 根据修改意见重写章节 */
  private async sectionRewrite(req: any, res: http.ServerResponse, paperId: string, sectionId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { modificationDirection, requirements, givenContent } = b;
    if (!modificationDirection && !givenContent) return error(res, 'modificationDirection or givenContent is required', 400);
    const section = p.sections.find(s => s.id === sectionId);
    if (!section || !section.contentTex) return error(res, 'Section content not found. Write the section first.', 404);
    const outlineSection = p.outline?.sections.find(s => s.id === sectionId);
    if (!outlineSection) return error(res, 'Outline section not found', 404);

    // 创建任务
    const task = taskManager.create('rewrite', `修改章节 - ${section.title}`, { paperId, sectionId });
    taskManager.start(task.id);

    try {
      taskManager.updateProgress(task.id, 30, '正在组装修改上下文...');
      // Build modification prompt
      const modParts: string[] = [];
      if (modificationDirection) modParts.push(`修改方向：${modificationDirection}`);
      if (requirements) modParts.push(`修改要求：${requirements}`);
      if (givenContent) modParts.push(`给定的内容：${givenContent}`);
      const modificationPrompt = modParts.join('\n');

      const citeKeys = this.bible.getEntries(paperId, { category: 'citations' }).filter(e => e.approvalStatus === 'approved').map(e => e.key);
      const systemPrompt = `You are an academic paper writer. You need to modify an existing section of a paper based on the user's instructions.
RULES:
- Preserve ALL citations (\\cite{...}) unless the instruction says to change them
- Preserve ALL equations and formulas
- Preserve the section structure and labels
- Use ONLY approved citation keys: ${citeKeys.join(', ') || 'none available'}
- Output ONLY the modified LaTeX content, including the section header and label`;

      const userPrompt = `Original section title: ${outlineSection.title}
Original section content:
${section.contentTex}

Modification instructions:
${modificationPrompt}

Please output the modified LaTeX content for this section.`;

      taskManager.updateProgress(task.id, 60, '正在调用模型进行修改...');
      if (!this.hasLLMFor('writer')) {
        // No LLM available — use rule-based mock
        const modified = `% [按修改意见修改] ${modificationPrompt}\n${section.contentTex}`;
        section.contentTex = modified;
        if (p.outline) this.db.updateOutlineSection(paperId, sectionId, {});
        this.persistSection(paperId, section);
        taskManager.complete(task.id, '修改完成 (规则模式)');
        return json(res, { section, modified: true, mockMode: true });
      }

      const content = await this.router.complete('writer', systemPrompt, userPrompt, { temperature: 0.2, maxTokens: 16384, timeout: 600000 });
      const cleaned = content.replace(/^```(?:latex)?\n?/i, '').replace(/```\n?$/i, '').trim();
      section.contentTex = cleaned || section.contentTex;
      section.version++;
      section.status = 'drafting';
      this.persistSection(paperId, section);
      taskManager.complete(task.id, '修改完成');
      json(res, { section, modified: true });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      throw e;
    }
  }

  private async sectionContentUpdate(req: any, res: http.ServerResponse, paperId: string, sectionId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    if (!b.contentTex && b.contentTex !== '') return error(res, 'contentTex is required', 400);
    const section = p.sections.find(s => s.id === sectionId);
    if (!section) return error(res, 'Section not found', 404);
    section.contentTex = b.contentTex;
    section.version++;
    section.status = 'drafting';
    this.persistSection(paperId, section);
    json(res, { section, updated: true });
  }

  private async sectionOptimizeRelated(req: any, res: http.ServerResponse, paperId: string, sectionId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const modifiedSection = p.sections.find(s => s.id === sectionId);
    if (!modifiedSection || !modifiedSection.contentTex) return error(res, 'Modified section not found or has no content', 404);

    const task = taskManager.create('optimize-related', `优化关联章节 - ${modifiedSection.title}`, { paperId, sectionId });
    taskManager.start(task.id);

    try {
      let relatedSections: Section[];
      if (b.targetSectionIds && b.targetSectionIds.length > 0) {
        relatedSections = p.sections.filter(s => b.targetSectionIds.includes(s.id) && s.id !== sectionId && s.contentTex);
      } else {
        const outlineSection = p.outline?.sections.find(s => s.id === sectionId);
        const parent = outlineSection?.parent;
        relatedSections = p.sections.filter(s => {
          if (s.id === sectionId || !s.contentTex) return false;
          const sOutline = p.outline?.sections.find(os => os.id === s.id);
          if (parent && sOutline?.parent === parent) return true;
          if (Math.abs(s.sectionNumber - modifiedSection.sectionNumber) <= 1) return true;
          return false;
        });
      }

      if (relatedSections.length === 0) {
        taskManager.complete(task.id, '没有找到关联章节');
        return json(res, { optimized: [], message: 'No related sections found' });
      }

      taskManager.updateProgress(task.id, 20, `找到 ${relatedSections.length} 个关联章节`);

      const results: any[] = [];
      const citeKeys = this.bible.getEntries(paperId, { category: 'citations' }).filter(e => e.approvalStatus === 'approved').map(e => e.key);

      for (let i = 0; i < relatedSections.length; i++) {
        const relSection = relatedSections[i];
        const progress = 20 + Math.round((i / relatedSections.length) * 70);
        taskManager.updateProgress(task.id, progress, `正在优化 ${relSection.title}...`);

        const systemPrompt = `You are an academic paper editor. You need to optimize a section of a paper to ensure consistency with a recently modified related section.
RULES:
- Preserve ALL citations (\\cite{...})
- Preserve ALL equations and formulas
- Preserve the section structure and labels
- Use ONLY approved citation keys: ${citeKeys.join(', ') || 'none available'}
- Ensure terminology, notation, and argumentation are consistent with the modified section
- Output ONLY the optimized LaTeX content, including the section header and label`;

        const userPrompt = `Recently modified section "${modifiedSection.title}":
${modifiedSection.contentTex}

Section to optimize "${relSection.title}":
${relSection.contentTex}

Please optimize this section to ensure consistency with the modified section. Focus on:
1. Consistent terminology and notation
2. Logical flow between sections
3. Complementary (not redundant) arguments
4. Proper cross-references`;

        if (!this.hasLLMFor('writer')) {
          results.push({ sectionId: relSection.id, title: relSection.title, optimized: false, mockMode: true });
          continue;
        }

        const content = await this.router.complete('writer', systemPrompt, userPrompt, { temperature: 0.2, maxTokens: 16384, timeout: 600000 });
        const cleaned = content.replace(/^```(?:latex)?\n?/i, '').replace(/```\n?$/i, '').trim();

        relSection.contentTex = cleaned || relSection.contentTex;
        relSection.version++;
        relSection.status = 'drafting';
        this.persistSection(paperId, relSection);

        results.push({ sectionId: relSection.id, title: relSection.title, optimized: true, version: relSection.version });
      }

      taskManager.complete(task.id, `优化完成，共 ${results.length} 个章节`);
      json(res, { optimized: results, taskId: task.id });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      throw e;
    }
  }

  // ══════════════════════════════════════════
  // Paper Citations CRUD (with title + url)
  // ══════════════════════════════════════════

  /** 列出论文的所有引用（合并 DB citations + Bible entries） */
  private paperCitationsList(res: http.ServerResponse, paperId: string) {
    const dbCitations = this.db.getPaperCitations(paperId);
    const bibleCitations = this.bible.getEntries(paperId, { category: 'citations' });
    // Deduplicate by citeKey: DB entries take precedence
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const c of dbCitations) {
      seen.add(c.cite_key);
      merged.push({
        id: c.id,
        cite_key: c.cite_key,
        bibtex: c.bibtex ?? '',
        title: c.title ?? '',
        url: c.url ?? '',
        authors: c.authors ?? '',
        year: c.year,
      });
    }
    for (const c of bibleCitations) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      merged.push({
        id: c.id,
        cite_key: c.key,
        bibtex: c.value ?? '',
        title: '',
        url: '',
        authors: '',
        year: null,
      });
    }
    json(res, { citations: merged });
  }

  /** 新增引用 */
  private async paperCitationsAdd(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { citeKey, bibtex, title, url, authors, year } = b;
    if (!citeKey) return error(res, 'citeKey is required', 400);
    const id = `cit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.db.createPaperCitation({ id, paperId, citeKey, bibtex: bibtex ?? '', title: title ?? '', url: url ?? '', authors: authors ?? '', year: year ?? null });
    // Also add to bible
    this.bible.addEntry({ paperId, category: 'citations', key: citeKey, value: bibtex ?? '', sourceType: 'user', confidence: 1.0, approvalStatus: 'approved' });
    json(res, { ok: true, citation: { id, paperId, citeKey, bibtex, title, url, authors, year } });
  }

  /** 更新引用 */
  private async paperCitationsUpdate(req: any, res: http.ServerResponse, paperId: string, citeKey: string) {
    const b = await parseBody(req);
    const existing = this.db.getCitation(paperId, citeKey);
    if (!existing) return error(res, 'Citation not found', 404);
    const updates: any = {};
    if (b.bibtex !== undefined) updates.bibtex = b.bibtex;
    if (b.title !== undefined) updates.title = b.title;
    if (b.url !== undefined) updates.url = b.url;
    if (b.authors !== undefined) updates.authors = b.authors;
    if (b.year !== undefined) updates.year = b.year;
    this.db.updatePaperCitation(existing.id, updates);
    json(res, { ok: true });
  }

  /** 删除引用 */
  private paperCitationsDelete(res: http.ServerResponse, paperId: string, citeKey: string) {
    const existing = this.db.getCitation(paperId, citeKey);
    if (!existing) return error(res, 'Citation not found', 404);
    this.db.deletePaperCitation(existing.id);
    json(res, { ok: true });
  }

  /** 反查引文详细信息（根据 citeKey 搜索学术 API 获取 title/authors/year/url） */
  private async citationsLookup(req: any, res: http.ServerResponse, paperId: string) {
    const b = await parseBody(req);
    let citeKeys: string[] = b.citeKeys;

    if (!citeKeys || citeKeys.length === 0) {
      // 默认反查该论文下所有无标题的引文
      const all = this.db.getPaperCitations(paperId);
      const bible = this.bible.getEntries(paperId, { category: 'citations' });
      const keys = new Set<string>();
      for (const c of all) if (!c.title) keys.add(c.cite_key);
      for (const c of bible) if (!c.value?.startsWith('http')) keys.add(c.key);
      citeKeys = [...keys];
      logger.info(`[lookup] DB citations without title: ${all.filter((c: any) => !c.title).map((c: any) => c.cite_key).join(', ')}`);
      logger.info(`[lookup] Bible citations: ${bible.map((c: any) => `${c.key}=${c.value?.slice(0, 40)}`).join(', ')}`);
      logger.info(`[lookup] Auto-detected keys to look up (${citeKeys.length}): ${citeKeys.join(', ')}`);
    } else {
      logger.info(`[lookup] Requested keys (${citeKeys.length}): ${citeKeys.join(', ')}`);
    }

    if (citeKeys.length === 0) return error(res, 'No citations to look up', 400);

    const results: any[] = [];
    for (const key of citeKeys.slice(0, 20)) { // max 20
      // Build search query from citeKey: "liu2017floatingelderly" → ["liu", "2017", "floating elderly"]
      const query = key
        .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
        .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
        .replace(/[,;:_-]/g, ' ')
        .trim();

      try {
        logger.info(`[lookup] Searching for "${key}" → query: "${query}"`);
        const searchResult = await searchAllSources(query, { maxResults: 3 });
        const best = searchResult.results[0];

        if (best) {
          logger.info(`[lookup] ✓ Found "${key}" → title: "${best.title?.slice(0, 60)}", authors: ${best.authors?.join(', ')?.slice(0, 40)}, source: ${best.source}`);
          const title = best.title;
          const authors = best.authors.join(', ');
          const year = best.year;
          const url = best.url ?? (best.doi ? `https://doi.org/${best.doi}` : '');

          // Update DB citation record
          const existing = this.db.getCitation(paperId, key);
          if (existing) {
            this.db.updatePaperCitation(existing.id, { title, authors, year, url });
          } else {
            this.db.createPaperCitation({
              id: `cit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              paperId, citeKey: key, bibtex: '', title, url, authors, year: year ?? null,
            });
          }

          // Update Bible entry value
          const bibleEntry = this.db.getBibleEntryByKey(paperId, 'citations', key);
          if (bibleEntry) {
            bibleEntry.value = `${authors} (${year ?? 'n.d.'}). ${title}. ${url || ''}`;
            this.db.flush();
          }

          results.push({ citeKey: key, title, authors, year, url, found: true });
        } else {
          logger.info(`[lookup] ✗ Not found "${key}" (query: "${query}")`);
          results.push({ citeKey: key, found: false, error: 'No results from any source' });
        }
      } catch (e: any) {
        logger.info(`[lookup] ✗ Error "${key}": ${e.message}`);
        results.push({ citeKey: key, found: false, error: e.message });
      }
    }

    logger.info(`[lookup] Done: ${results.filter(r => r.found).length}/${results.length} found`);
    json(res, { results, total: citeKeys.length, lookedUp: results.length });
  }

  // ══════════════════════════════════════════
  // Per-Section Citations
  // ══════════════════════════════════════════

  /** 获取某个章节专属的引文（按 sourceSectionId 过滤）+ 合并元数据 */
  private sectionCitationsList(res: http.ServerResponse, paperId: string, sectionId: string) {
    const bibleCites = this.bible.getEntries(paperId, { category: 'citations', sectionId });
    const dbCites = this.db.getPaperCitations(paperId);
    const dbMap = new Map<string, any>();
    for (const c of dbCites) dbMap.set(c.cite_key, c);

    const seen = new Set<string>();
    const merged: any[] = [];
    // Bible citations first (these actually cite the section)
    for (const c of bibleCites) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      const dbEntry = dbMap.get(c.key);
      merged.push({
        id: c.id,
        cite_key: c.key,
        bibtex: dbEntry?.bibtex ?? '',
        title: dbEntry?.title ?? c.key,
        url: dbEntry?.url ?? '',
        authors: dbEntry?.authors ?? '',
        year: dbEntry?.year ?? null,
        source: 'bible',
        hasDetail: !!dbEntry,
      });
    }
    // Also include DB citations not referenced in this section
    for (const c of dbCites) {
      if (seen.has(c.cite_key)) continue;
      seen.add(c.cite_key);
      merged.push({
        id: c.id,
        cite_key: c.cite_key,
        bibtex: c.bibtex ?? '',
        title: c.title ?? c.cite_key,
        url: c.url ?? '',
        authors: c.authors ?? '',
        year: c.year,
        source: 'db',
        hasDetail: true,
      });
    }
    json(res, { citations: merged, total: seen.size });
  }

  // ══════════════════════════════════════════
  // Generate References Section
  // ══════════════════════════════════════════

  /** 根据全部引文 + 可选模板生成参考文献章节 */
  private async generateReferences(req: any, res: http.ServerResponse, paperId: string) {
    const p = this.papers.get(paperId);
    if (!p) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { template } = b;

    // Gather all citations (merge Bible + DB)
    const bibleCites = this.bible.getEntries(paperId, { category: 'citations' });
    const dbCites = this.db.getPaperCitations(paperId);
    const dbMap = new Map<string, any>();
    for (const c of dbCites) dbMap.set(c.cite_key, c);

    const seen = new Set<string>();
    const allCites: any[] = [];
    for (const c of bibleCites) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      const dbEntry = dbMap.get(c.key);
      allCites.push({
        citeKey: c.key,
        bibtex: dbEntry?.bibtex ?? c.value ?? '',
        title: dbEntry?.title ?? '',
        url: dbEntry?.url ?? '',
        authors: dbEntry?.authors ?? '',
        year: dbEntry?.year ?? null,
      });
    }
    // Also include DB-only citations
    for (const c of dbCites) {
      if (seen.has(c.cite_key)) continue;
      seen.add(c.cite_key);
      allCites.push({
        citeKey: c.cite_key,
        bibtex: c.bibtex ?? '',
        title: c.title ?? '',
        url: c.url ?? '',
        authors: c.authors ?? '',
        year: c.year,
      });
    }

    if (allCites.length === 0) return error(res, 'No citations to generate references from', 400);

    // 创建任务
    const task = taskManager.create('write', '生成参考文献章节', { paperId });
    taskManager.start(task.id);

    try {
      taskManager.updateProgress(task.id, 30, '正在生成参考文献...');

      // Format citation list for prompt
      const citeList = allCites.map((c, i) => {
        const parts = [`${i + 1}. Key: ${c.citeKey}`];
        if (c.title) parts.push(`Title: ${c.title}`);
        if (c.authors) parts.push(`Authors: ${c.authors}`);
        if (c.year) parts.push(`Year: ${c.year}`);
        if (c.url) parts.push(`URL: ${c.url}`);
        if (c.bibtex) parts.push(`BibTeX: ${c.bibtex}`);
        return parts.join('\n     ');
      }).join('\n\n');

      const templateInfo = template
        ? `请使用以下引用格式模板生成每条引用（按 {{variable}} 占位符填充）：\n${template}`
        : '请为每条引用生成标准的 GB/T 7714-2015 中文参考文献格式（中国国家标准）。\n格式示例：\n[1] 作者. 标题[M]. 出版地: 出版社, 年份.\n[2] 作者. 标题[J]. 期刊名, 年, 卷(期): 起止页码.\n[3] 作者. 标题[D]. 学位授予单位, 年份.\n[4] 作者. 标题[EB/OL]. (发布日期). URL.';

      const systemPrompt = `You are an academic paper formatter. Generate a references (参考文献) section in LaTeX format.
Use \\bibitem{citeKey} for each entry.
Output ONLY LaTeX content with \\begin{thebibliography}...\\end{thebibliography}.`;

      const userPrompt = `请根据以下 ${allCites.length} 条引文生成参考文献章节。

${templateInfo}

引文列表：
${citeList}

输出 \\begin{thebibliography}{${allCites.length}} 和 \\end{thebibliography} 包裹的 LaTeX 内容。每条使用 \\bibitem{citeKey}。`;

      taskManager.updateProgress(task.id, 60, '正在调用模型格式化引文...');
      let content: string;
      if (!this.hasLLMFor('writer')) {
        // Fallback: template-based format when no LLM
        const items = allCites.map(c =>
          `\\bibitem{${c.citeKey}} ${c.authors || '(author)'} ${c.title ? `\\textit{${c.title}}` : ''} ${c.year ? `(${c.year})` : ''} ${c.url ? `\\url{${c.url}}` : ''}`
        ).join('\n\n');
        content = `\\begin{thebibliography}{${allCites.length}}\n${items}\n\\end{thebibliography}`;
      } else {
        content = await this.router.complete('writer', systemPrompt, userPrompt, { temperature: 0.1, maxTokens: 8192, timeout: 600000 });
      }
      const cleaned = content.replace(/^```(?:latex)?\n?/i, '').replace(/```\n?$/i, '').trim();

      // Create or update the references section
      const refSectionId = 'references';
      let refSection = p.sections.find(s => s.id === refSectionId);
      if (refSection) {
        refSection.contentTex = cleaned;
        refSection.version++;
        refSection.status = 'passed';
        this.persistSection(paperId, refSection);
      } else {
        // Add to outline if not exists
        if (p.outline && !p.outline.sections.find(s => s.id === refSectionId)) {
          p.outline.sections.push({
            id: refSectionId,
            title: '参考文献',
            coreArgument: '本文引用的全部参考文献',
            estimatedPages: Math.ceil(allCites.length / 20),
            requiredCitations: 0,
            parent: null,
          });
          this.db.savePaperOutline(paperId, p.outline);
        }
        const section: any = {
          id: refSectionId, paperId, sectionNumber: 99,
          title: '参考文献', contentTex: cleaned,
          status: 'passed', version: 1,
        };
        p.sections.push(section);
        this.persistSection(paperId, section);
      }

      taskManager.complete(task.id, `生成完成，共 ${allCites.length} 条参考文献`);
      json(res, { ok: true, content: cleaned, total: allCites.length });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      throw e;
    }
  }

  /** 将 Section 持久化到 DB */
  private persistSection(paperId: string, section: { id: string; sectionNumber: number; title: string; contentTex?: string; status: string }): void {
    const existing = this.db.getSection(section.id);
    if (existing) {
      if (section.contentTex) this.db.updateSectionContent(section.id, section.contentTex);
      this.db.updateSectionStatus(section.id, section.status);
    } else {
      this.db.createSection(section.id, paperId, section.sectionNumber, section.title);
      this.db.updateSectionContent(section.id, section.contentTex ?? '');
      this.db.updateSectionStatus(section.id, section.status);
    }
  }

  // ══════════════════════════════════════════
  // Citations
  // ══════════════════════════════════════════
  private async citeValidate(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    const cites = this.bible.getEntries(b.paperId ?? '', { category: 'citations' });
    const report = await validateCitations(b.draft, b.sectionId ?? 'unknown', {
      localCitations: cites.map(e => ({ id: e.id, paperId: e.paperId, citeKey: e.key, bibtex: e.value, doi: null, title: null, authors: null, year: null, verified: true, approvalStatus: e.approvalStatus, source: 'user', matchConfidence: 1.0, lastVerifiedAt: null, embedding: null, createdAt: '', updatedAt: '' })),
      enableExternalSearch: false,
    });
    json(res, report);
  }

  private async citeSearch(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    const page = b.page ?? 1;
    const pageSize = b.pageSize ?? 10;
    const maxResults = b.maxResults ?? Math.min(pageSize * 3, 50);
    const offset = (page - 1) * pageSize;
    const [ss, arxiv, cr] = await Promise.allSettled([
      searchSemanticScholar(b.query, { maxResults }),
      searchArxiv(b.query, { maxResults }),
      searchCrossRef(b.query, { maxResults }),
    ]);
    const allResults: any[] = [];
    const errors: Array<{ source: string; message: string; retryable: boolean }> = [];
    for (const r of [ss, arxiv, cr]) {
      if (r.status === 'fulfilled') { allResults.push(...r.value.results); errors.push(...r.value.errors); }
    }
    // Deduplicate by DOI/title
    const seen = new Set<string>();
    const uniqueResults = allResults.filter(r => {
      const key = r.doi ?? r.title?.substring(0, 50) ?? r.url ?? '';
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const total = uniqueResults.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const paged = uniqueResults.slice(offset, offset + pageSize);
    json(res, { results: paged, total, page, pageSize, totalPages, errors });
  }

  private async citeParseBib(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    json(res, parseBibFile(b.content ?? ''));
  }

  /** 从网页链接生成引用格式 */
  private async citeFromUrl(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    const { url: pageUrl, model, format } = b;
    if (!pageUrl) return error(res, 'url is required', 400);
    
    // 创建任务
    const task = taskManager.create('from-url', `URL 转引用`, { url: pageUrl, format });
    taskManager.start(task.id);
    
    try {
      taskManager.updateProgress(task.id, 20, '正在获取网页内容...');
      const fetchRes = await fetch(pageUrl, { signal: AbortSignal.timeout(15000) });
      const html = await fetchRes.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : pageUrl;
      const cleanText = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ').trim().substring(0, 3000);

      taskManager.updateProgress(task.id, 50, '正在生成引用格式...');
      const isTemplate = format && /\{\{/.test(format);
      const sysPrompt = 'You are a citation format generator. Extract metadata from the webpage content and generate a citation.';
      const userPrompt = isTemplate
        ? `URL: ${pageUrl}\nTitle: ${title}\nContent preview: ${cleanText}\n\nGenerate a citation following this EXACT template format. Replace each {{placeholder}} with the appropriate value from the page:\n\n${format}\n\nOutput ONLY the filled citation text, no other text.`
        : `URL: ${pageUrl}\nTitle: ${title}\nContent preview: ${cleanText}\n\nGenerate a citation in ${format || 'bibtex'} format. Include: author(s), title, publication date/access date, URL. Output ONLY the citation text.`;
      const client = new LLMClient({
        apiKey: this.config.llm.providers[model ? 'deepseek' : 'deepseek']?.apiKey || '',
        baseUrl: this.config.llm.providers[model ? 'deepseek' : 'deepseek']?.baseUrl || 'https://api.deepseek.com/v1',
        model: model || 'deepseek-v4-flash',
        maxTokens: 1000,
        timeout: 60000,
      });
      const citation = await client.complete(sysPrompt, userPrompt);
      
      taskManager.complete(task.id, '引用格式生成完成');
      json(res, { ok: true, citation, title, url: pageUrl, taskId: task.id });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      json(res, { ok: false, error: e.message, citation: `@misc{web,\n  title = {${pageUrl}},\n  howpublished = {\\url{${pageUrl}}},\n  note = {Accessed: ${new Date().toISOString().split('T')[0]}}\n}` });
    }
  }

  /** LLM 生成引用模板 */
  private async citeGenerateTemplate(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    const { userInput, model } = b;
    if (!userInput) return error(res, 'userInput is required', 400);
    
    // 创建任务
    const task = taskManager.create('generate-template', `生成引用模板`, { model });
    taskManager.start(task.id);
    
    try {
      taskManager.updateProgress(task.id, 30, '正在分析需求...');
      const sysPrompt = 'You are a citation template designer. Based on the user\'s description, generate a reusable citation format template. The template should use {{placeholders}} for variable parts. Output as JSON: { "name": string, "format": string, "description": string, "variables": string[] }';
      const userPrompt = `User requirement: ${userInput}\n\nGenerate a citation template that matches this requirement. Use {{variableName}} syntax for placeholders.`;
      
      // 使用配置中的模型，允许前端覆盖
      const agentConfig = this.config.llm.models.citationGenerator;
      const selectedModel = model || agentConfig?.model || 'deepseek-v4-flash';
      const providerName = selectedModel.startsWith('deepseek') ? 'deepseek' : 'deepseek';
      const provider = this.config.llm.providers[providerName];
      
      taskManager.updateProgress(task.id, 60, '正在生成模板...');
      const client = new LLMClient({
        apiKey: provider?.apiKey || '',
        baseUrl: provider?.baseUrl || 'https://api.deepseek.com/v1',
        model: selectedModel,
        maxTokens: 2000,
        timeout: 60000,
      });
      const raw = await client.complete(sysPrompt, userPrompt);
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const template = JSON.parse(cleaned);
      
      taskManager.complete(task.id, `模板 "${template.name}" 生成完成`);
      json(res, { ok: true, template: { id: randomUUID(), ...template, createdAt: new Date().toISOString() }, taskId: task.id });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      json(res, { ok: false, error: e.message });
    }
  }

  /** 列出所有引用模板 */
  private citeTemplatesList(res: http.ServerResponse) {
    const filePath = path.join(this.dataDir, 'citation-templates.json');
    let templates: any[] = [];
    if (fs.existsSync(filePath)) {
      try { templates = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { logger.warn('Failed to parse citation-templates.json, using defaults'); }
    }
    json(res, { templates });
  }

  /** 保存引用模板 */
  private async citeTemplatesSave(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    const filePath = path.join(this.dataDir, 'citation-templates.json');
    let templates: any[] = [];
    if (fs.existsSync(filePath)) {
      try { templates = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { logger.warn('Failed to parse citation-templates.json for save, using defaults'); }
    }
    const incoming = Array.isArray(b) ? b : [b];
    for (const item of incoming) {
      const idx = templates.findIndex((t: any) => t.id === item.id);
      if (idx >= 0) { templates[idx] = { ...templates[idx], ...item, updatedAt: new Date().toISOString() }; }
      else { templates.push({ id: randomUUID(), ...item, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); }
    }
    fs.writeFileSync(filePath, JSON.stringify(templates, null, 2), 'utf-8');
    json(res, { ok: true, templates });
  }

  /** 删除引用模板 */
  private async citeTemplatesDelete(req: any, res: http.ServerResponse, templateId: string) {
    const filePath = path.join(this.dataDir, 'citation-templates.json');
    let templates: any[] = [];
    if (fs.existsSync(filePath)) {
      try { templates = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { logger.warn('Failed to parse citation-templates.json for delete, using defaults'); }
    }
    templates = templates.filter((t: any) => t.id !== templateId);
    fs.writeFileSync(filePath, JSON.stringify(templates, null, 2), 'utf-8');
    json(res, { ok: true });
  }

  /** LLM 翻译 */
  private async llmTranslate(req: any, res: http.ServerResponse) {
    const b = await parseBody(req);
    const { text, targetLang, sourceLang, model } = b;
    if (!text) return error(res, 'text is required', 400);
    
    // 创建任务
    const task = taskManager.create('translate', `翻译文本`, { targetLang, model });
    taskManager.start(task.id);
    
    try {
      taskManager.updateProgress(task.id, 30, '正在翻译...');
      const sysPrompt = `You are a professional translator. Translate the following text from ${sourceLang || 'auto-detect'} to ${targetLang || '中文'}. Output ONLY the translated text, no explanations.`;
      const userPrompt = text;
      const provider = this.config.llm.providers[model?.startsWith('deepseek') ? 'deepseek' : 'deepseek'] || this.config.llm.providers.deepseek;
      const client = new LLMClient({
        apiKey: provider?.apiKey || '',
        baseUrl: provider?.baseUrl || 'https://api.deepseek.com/v1',
        model: model || 'deepseek-v4-flash',
        maxTokens: 4000,
        timeout: 60000,
      });
      const translated = await client.complete(sysPrompt, userPrompt);
      
      taskManager.complete(task.id, '翻译完成');
      json(res, { ok: true, translated, sourceText: text, taskId: task.id });
    } catch (e: any) {
      taskManager.fail(task.id, e.message);
      json(res, { ok: false, error: e.message });
    }
  }

  // ══════════════════════════════════════════
  // Bible
  // ══════════════════════════════════════════
  private bibleGet(paperId: string, res: http.ServerResponse) {
    const entries = this.bible.getEntries(paperId);
    const stats = this.bible.getStats(paperId);
    json(res, { entries, stats });
  }

  private async bibleEntryCreate(req: any, res: http.ServerResponse, paperId: string) {
    if (!this.papers.has(paperId)) return error(res, 'Paper not found', 404);
    const b = await parseBody(req);
    const { category, key, value, confidence, approvalStatus } = b;
    if (!category || !key || value === undefined) return error(res, 'category, key, and value are required', 400);
    const id = this.bible.addEntry({
      paperId,
      category,
      key,
      value,
      sourceType: 'user',
      confidence: confidence ?? 1.0,
      approvalStatus: approvalStatus ?? 'approved',
    });
    const entry = this.bible.getEntries(paperId).find(e => e.id === id);
    json(res, { ok: true, entry }, 201);
  }

  private async bibleEntryUpdate(req: any, res: http.ServerResponse, paperId: string, entryId: string) {
    if (!this.papers.has(paperId)) return error(res, 'Paper not found', 404);
    const existing = this.db.getBibleEntry(entryId);
    if (!existing || existing.paper_id !== paperId) return error(res, 'Bible entry not found', 404);
    const b = await parseBody(req);
    const updates: { key?: string; value?: string; category?: string; confidence?: number; approvalStatus?: string } = {};
    if (b.key !== undefined) updates.key = b.key;
    if (b.value !== undefined) updates.value = b.value;
    if (b.category !== undefined) updates.category = b.category;
    if (b.confidence !== undefined) updates.confidence = b.confidence;
    if (b.approvalStatus !== undefined) updates.approvalStatus = b.approvalStatus;
    this.db.updateBibleEntry(entryId, updates);
    const updated = this.db.getBibleEntry(entryId);
    json(res, { ok: true, entry: { id: updated.id, paperId: updated.paper_id, category: updated.category, key: updated.key, value: updated.value, confidence: updated.confidence, approvalStatus: updated.approval_status } });
  }

  private bibleEntryDelete(res: http.ServerResponse, paperId: string, entryId: string) {
    if (!this.papers.has(paperId)) return error(res, 'Paper not found', 404);
    const existing = this.db.getBibleEntry(entryId);
    if (!existing || existing.paper_id !== paperId) return error(res, 'Bible entry not found', 404);
    this.db.deleteBibleEntry(entryId);
    json(res, { ok: true });
  }

  // ══════════════════════════════════════════
  // Stats
  // ══════════════════════════════════════════
  private statsGet(res: http.ServerResponse) {
    let totalCitations = 0;
    let totalBibleEntries = 0;
    for (const paperId of this.papers.keys()) {
      totalCitations += this.db.getPaperCitations(paperId).length;
      totalBibleEntries += this.bible.getEntries(paperId).length;
    }
    const socraticSessions = this.db.listSocraticSessions().length;
    json(res, {
      papers: this.papers.size,
      mindmaps: this.mmSessions.size,
      totalCitations,
      totalBibleEntries,
      socraticSessions,
      reviewReports: 0,
    });
  }

  // ══════════════════════════════════════════
  // Integrity
  // ══════════════════════════════════════════
  private async integrityGateRun(req: any, res: http.ServerResponse, paperId: string) {
    const paper = this.papers.get(paperId) ?? this.db.getPaper(paperId);
    if (!paper) return error(res, 'Paper not found', 404);

    const sections = this.db.getPaperSections(paperId);
    const paperContent = sections.map((s: any) => s.content_tex).filter(Boolean).join('\n\n');
    if (!paperContent) return error(res, 'Paper has no content', 400);

    const citations = this.db.getPaperCitations(paperId);
    const references = citations.map((c: any) => ({ key: c.cite_key, bibtex: c.bibtex, title: c.title }));

    const body = await parseBody(req).catch(() => ({}));
    const gateType = body.gateType ?? 'pre_review';

    try {
      const result = await this.integrityGate.run({
        paperId,
        paperContent,
        references,
        gateType,
        mockMode: !this.hasLLMFor('auditor'),
      });
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 500);
    }
  }

  private async integrityAuditClaims(req: any, res: http.ServerResponse, paperId: string) {
    const sections = this.db.getPaperSections(paperId);
    const paperContent = sections.map((s: any) => s.content_tex).filter(Boolean).join('\n\n');
    const citations = this.db.getPaperCitations(paperId);
    const references = citations.map((c: any) => ({ key: c.cite_key, bibtex: c.bibtex }));

    try {
      const result = await this.integrityGate.auditClaims(paperContent, references);
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 500);
    }
  }

  // ══════════════════════════════════════════
  // Passport
  // ══════════════════════════════════════════
  private async passportGet(res: http.ServerResponse, paperId: string) {
    const passport = this.passportManager.getPassport(paperId);
    if (!passport) return error(res, 'Passport not found', 404);
    json(res, passport);
  }

  private async passportCreate(req: any, res: http.ServerResponse, paperId: string) {
    try {
      const passport = this.passportManager.createPassport(paperId);
      json(res, passport);
    } catch (e: any) {
      error(res, e.message, 500);
    }
  }

  private async passportResume(req: any, res: http.ServerResponse, paperId: string) {
    const { hash } = await parseBody(req);
    if (!hash) return error(res, 'hash is required', 400);

    const result = this.passportManager.resumeFromPassport(paperId, hash);
    json(res, result);
  }

  private async passportAddBoundary(req: any, res: http.ServerResponse, paperId: string) {
    const { stage, nextStage, pendingDecision } = await parseBody(req);
    if (stage === undefined) return error(res, 'stage is required', 400);

    const boundary = this.passportManager.addResetBoundary(paperId, stage, nextStage, pendingDecision);
    json(res, boundary);
  }

  // ══════════════════════════════════════════
  // Checkpoint
  // ══════════════════════════════════════════
  private async checkpointGet(res: http.ServerResponse, paperId: string) {
    const checkpoint = this.checkpointManager.getActiveCheckpoint(paperId);
    if (!checkpoint) return json(res, { active: false });
    json(res, { active: true, checkpoint, message: this.checkpointManager.generateCheckpointMessage(checkpoint) });
  }

  private async checkpointConfirm(res: http.ServerResponse, checkpointId: string) {
    this.checkpointManager.confirmCheckpoint(checkpointId);
    json(res, { ok: true });
  }

  // ══════════════════════════════════════════
  // Process Summary
  // ══════════════════════════════════════════
  private async processSummaryGet(res: http.ServerResponse, paperId: string) {
    const paper = this.papers.get(paperId) ?? this.db.getPaper(paperId);
    if (!paper) return error(res, 'Paper not found', 404);

    // Generate mock process summary
    const summary = {
      paperId,
      title: paper.title,
      collaborationQuality: {
        directionSetting: 75,
        intellectualContribution: 80,
        qualityGatekeeping: 70,
        iterationDiscipline: 85,
        delegationEfficiency: 65,
        metaLearning: 72,
      },
      aiSelfReflection: {
        sycophancyRisk: 'low' as const,
        frameLockIncidents: 0,
        convergencePattern: '标准收敛',
        concessionRate: 0.25,
        ironyNote: '此自我反思由可能具有谐媚倾向的同一 AI 生成。',
      },
      stageLog: [
        { stage: 0, name: '苏格拉底引导', duration: 120000, status: 'completed' },
        { stage: 1, name: '思维导图', duration: 60000, status: 'completed' },
        { stage: 2, name: '写作管道', duration: 300000, status: 'completed' },
        { stage: 2.5, name: '完整性门控', duration: 30000, status: 'completed' },
        { stage: 3, name: '同行评审', duration: 90000, status: 'completed' },
        { stage: 4, name: '修订', duration: 120000, status: 'completed' },
        { stage: 5, name: '定稿', duration: 15000, status: 'completed' },
      ],
      totalDuration: 735000,
    };

    json(res, summary);
  }

  // ══════════════════════════════════════════
  // Review
  // ══════════════════════════════════════════
  private async reviewStart(req: any, res: http.ServerResponse, paperId: string) {
    const paper = this.papers.get(paperId) ?? this.db.getPaper(paperId);
    if (!paper) return error(res, 'Paper not found', 404);

    // Get paper content from sections
    const sections = this.db.getPaperSections(paperId);
    const paperContent = sections.map((s: any) => s.content_tex).filter(Boolean).join('\n\n');
    if (!paperContent) return error(res, 'Paper has no content to review', 400);

    try {
      const result = await this.reviewOrchestrator.startReview(paperId, paperContent, paper.title);
      json(res, {
        sessionId: result.session.id,
        session: result.session,
        editorialDecision: result.editorialDecision,
      });
    } catch (e: any) {
      error(res, e.message, 500);
    }
  }

  private async reviewGet(res: http.ServerResponse, sessionId: string) {
    const session = this.reviewOrchestrator.getSession(sessionId);
    if (!session) return error(res, 'Review session not found', 404);
    json(res, session);
  }

  // ══════════════════════════════════════════
  // Socratic
  // ══════════════════════════════════════════
  private async socraticStart(req: any, res: http.ServerResponse) {
    const { paperId, mode } = await parseBody(req);
    if (!paperId) return error(res, 'paperId is required', 400);

    const paper = this.papers.get(paperId) ?? this.db.getPaper(paperId);
    if (!paper) return error(res, 'Paper not found', 404);

    const topic = paper.research_topic || paper.researchTopic || paper.title;
    const result = await this.socraticOrchestrator.startSession(paperId, topic, mode);

    // Update paper with socratic session id
    const paperData = this.db.getPaper(paperId);
    if (paperData) {
      paperData.socratic_session_id = result.session.id;
    }

    json(res, {
      sessionId: result.session.id,
      session: result.session,
      firstMessage: result.firstMessage,
    });
  }

  private async socraticRespond(req: any, res: http.ServerResponse, sessionId: string) {
    const { message, skipCommitment } = await parseBody(req);
    if (!message) return error(res, 'message is required', 400);

    try {
      const result = await this.socraticOrchestrator.respond(sessionId, message, skipCommitment);
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  }

  private async socraticSummary(res: http.ServerResponse, sessionId: string) {
    const session = this.socraticOrchestrator.getSession(sessionId);
    if (!session) return error(res, 'Session not found', 404);

    const paper = this.db.getPaper(session.paperId);
    json(res, {
      session,
      insights: session.insights,
      commitments: session.commitments,
      researchBrief: paper?.research_brief ?? null,
      methodology: paper?.methodology ?? null,
    });
  }

  private async socraticComplete(req: any, res: http.ServerResponse, sessionId: string) {
    try {
      const session = this.socraticOrchestrator.getSession(sessionId);
      if (!session) return error(res, 'Session not found', 404);

      // Force complete by advancing to layer 5+ and responding
      const topic = this.db.getPaper(session.paperId)?.title ?? '未指定';
      const result = await this.socraticOrchestrator.respond(sessionId, '我已经准备好总结我的研究想法了。', true);
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  }

  private async socraticCommitment(req: any, res: http.ServerResponse, sessionId: string) {
    const { commitment } = await parseBody(req);
    if (!commitment) return error(res, 'commitment is required', 400);

    try {
      const result = await this.socraticOrchestrator.completeCommitment(sessionId, commitment);
      json(res, result);
    } catch (e: any) {
      error(res, e.message, 400);
    }
  }

  // ══════════════════════════════════════════
  // Static
  // ══════════════════════════════════════════
  private static(res: http.ServerResponse, pathname: string) {
    const dir = path.resolve(this.opts.staticDir!);
    const requestPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const safe = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fp = path.resolve(dir, safe);
    if (!fp.startsWith(dir + path.sep) && fp !== dir) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('Not found'); return; }
    const mimes: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    res.writeHead(200, { 'Content-Type': mimes[path.extname(fp)] ?? 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  }

  private hasLLMFor(agent: string): boolean {
    try {
      this.router.getClient(agent);
      return true;
    } catch {
      return false; /* no LLM client for this agent */
    }
  }

  private maskConfig(config: ScholariumConfig): ScholariumConfig {
    return {
      ...config,
      llm: {
        ...config.llm,
        providers: Object.fromEntries(Object.entries(config.llm.providers).map(([name, provider]) => [
          name,
          { ...provider, apiKey: provider.apiKey ? '***configured***' : '' },
        ])),
      },
    };
  }

  // ══════════════════════════════════════════
  // Tasks
  // ══════════════════════════════════════════
  private tasksList(req: any, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', `http://localhost:${this.opts.port}`);
    const status = url.searchParams.get('status') as any;
    const type = url.searchParams.get('type') as any;
    const limit = parseInt(url.searchParams.get('limit') ?? '50');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');
    const result = taskManager.getAll({ status, type, limit, offset });
    json(res, result);
  }

  private tasksStats(res: http.ServerResponse) {
    json(res, taskManager.getStats());
  }

  private taskGet(taskId: string, res: http.ServerResponse) {
    const task = taskManager.get(taskId);
    if (!task) return error(res, 'Task not found', 404);
    json(res, task);
  }

  private tasksClear(res: http.ServerResponse) {
    taskManager.clear();
    json(res, { ok: true });
  }
}
