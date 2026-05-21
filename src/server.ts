import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LLMRouter } from './llm/router.ts';
import { loadConfig } from './config/index.ts';
import { BibleManager } from './bible/manager.ts';
import { ScholariumDB } from './db/database.ts';
import { CartographerAgent } from './agents/cartographer.ts';
import { PlannerAgent } from './agents/planner.ts';
import { ArchitectAgent } from './agents/architect.ts';
import { ComposerAgent } from './agents/composer.ts';
import { WriterAgent } from './agents/writer.ts';
import { ObserverAgent } from './agents/observer.ts';
import { NormalizerAgent } from './agents/normalizer.ts';
import { SocraticMentorAgent } from './agents/socratic-mentor.ts';
import { ResearchQuestionAgent } from './agents/research-question.ts';
import { MethodologyAgent } from './agents/methodology.ts';
import { FieldAnalystAgent } from './agents/field-analyst.ts';
import { EditorInChiefAgent } from './agents/editor-in-chief.ts';
import { MethodologyReviewerAgent } from './agents/methodology-reviewer.ts';
import { DomainReviewerAgent } from './agents/domain-reviewer.ts';
import { PerspectiveReviewerAgent } from './agents/perspective-reviewer.ts';
import { DevilsAdvocateAgent } from './agents/devils-advocate.ts';
import { EditorialSynthesizerAgent } from './agents/editorial-synthesizer.ts';
import { SocraticOrchestrator } from './pipeline/socratic-orchestrator.ts';
import { ReviewOrchestrator } from './review/orchestrator.ts';
import { IntegrityGate } from './integrity/gate.ts';
import { PassportManager } from './pipeline/passport.ts';
import { CheckpointManager } from './pipeline/checkpoint.ts';
import { logger } from './utils/logger.ts';
import type { ServerContext, MindMapSession, PaperProject } from './server/context.ts';
import type { Section } from './types/index.ts';
import type { MindMapNode } from './agents/cartographer.ts';
import { handleRouteError } from './server/middleware/error-handler.ts';
import { corsMiddleware, handlePreflight } from './server/middleware/cors.ts';
import { loggerMiddleware } from './server/middleware/logger.ts';
import { getCorsOrigin } from './server/utils/helpers.ts';
import { registerLlmRoutes } from './server/routes/llm.ts';
import { registerMindmapRoutes } from './server/routes/mindmap.ts';
import { registerPapersRoutes } from './server/routes/papers.ts';
import { registerSectionsRoutes } from './server/routes/sections.ts';
import { registerCitationRoutes } from './server/routes/citations.ts';
import { registerBibleRoutes } from './server/routes/bible.ts';
import { registerReviewRoutes } from './server/routes/review.ts';
import { registerSocraticRoutes } from './server/routes/socratic.ts';
import { registerIntegrityRoutes } from './server/routes/integrity.ts';
import { registerPassportRoutes } from './server/routes/passport.ts';
import { registerCheckpointRoutes } from './server/routes/checkpoint.ts';
import { registerTasksRoutes } from './server/routes/tasks.ts';
import { registerStatsRoutes } from './server/routes/stats.ts';
import { registerStaticRoutes } from './server/routes/static.ts';
import { registerHealthRoutes } from './server/routes/health.ts';

type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
interface RouteEntry {
  method: string;
  pattern: string | RegExp;
  handler: RouteHandler;
}

type MiddlewareFn = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;

function composeMiddleware(
  middlewares: MiddlewareFn[],
  finalHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  return (req, res) => {
    let idx = 0;
    const next = () => {
      if (idx < middlewares.length) {
        const mw = middlewares[idx++];
        mw(req, res, next);
      } else {
        finalHandler(req, res);
      }
    };
    next();
  };
}

export class ScholariumAPI {
  private server: http.Server | null = null;
  private ctx: ServerContext;
  private routes: RouteEntry[] = [];
  private opts: { port: number; dataDir: string; staticDir?: string };

  constructor(opts: { port: number; dataDir: string; staticDir?: string }) {
    this.opts = opts;
    fs.mkdirSync(opts.dataDir, { recursive: true });

    const config = loadConfig({ cwd: process.cwd(), allowMissing: true });
    const router = new LLMRouter(config);
    const db = new ScholariumDB(path.join(opts.dataDir, 'scholarium.json'));
    const bible = new BibleManager(db);

    const cartographer = new CartographerAgent(router);
    const planner = new PlannerAgent(router);
    const architect = new ArchitectAgent(router);
    const composer = new ComposerAgent();
    const writer = new WriterAgent(router);
    const observer = new ObserverAgent(router);
    const normalizer = new NormalizerAgent(router);
    const socraticMentor = new SocraticMentorAgent(router);
    const researchQuestion = new ResearchQuestionAgent(router);
    const methodology = new MethodologyAgent(router);
    const socraticOrchestrator = new SocraticOrchestrator({
      mentor: socraticMentor,
      rqAgent: researchQuestion,
      methodologyAgent: methodology,
      db,
    });
    const fieldAnalyst = new FieldAnalystAgent(router);
    const editorInChief = new EditorInChiefAgent(router);
    const methodologyReviewer = new MethodologyReviewerAgent(router);
    const domainReviewer = new DomainReviewerAgent(router);
    const perspectiveReviewer = new PerspectiveReviewerAgent(router);
    const devilsAdvocate = new DevilsAdvocateAgent(router);
    const editorialSynthesizer = new EditorialSynthesizerAgent(router);
    const reviewOrchestrator = new ReviewOrchestrator({
      fieldAnalyst,
      eic: editorInChief,
      methodology: methodologyReviewer,
      domain: domainReviewer,
      perspective: perspectiveReviewer,
      da: devilsAdvocate,
      synthesizer: editorialSynthesizer,
      db,
    });
    const integrityGate = new IntegrityGate(router);
    const passportManager = new PassportManager(db);
    const checkpointManager = new CheckpointManager(db);

    this.ctx = {
      db,
      bible,
      config,
      router,
      dataDir: opts.dataDir,
      port: opts.port,
      staticDir: opts.staticDir,
      mmSessions: new Map<string, MindMapSession>(),
      papers: new Map<string, PaperProject>(),
      sseClients: new Map<string, http.ServerResponse[]>(),
      cartographer,
      planner,
      architect,
      composer,
      writer,
      observer,
      normalizer,
      socraticMentor,
      researchQuestion,
      methodology,
      socraticOrchestrator,
      fieldAnalyst,
      editorInChief,
      methodologyReviewer,
      domainReviewer,
      perspectiveReviewer,
      devilsAdvocate,
      editorialSynthesizer,
      reviewOrchestrator,
      integrityGate,
      passportManager,
      checkpointManager,
      persistSection: (
        paperId: string,
        section: { id: string; sectionNumber: number; title: string; contentTex?: string; status: string },
      ) => {
        const existing = db.getSection(section.id);
        if (existing) {
          if (section.contentTex !== undefined) db.updateSectionContent(section.id, section.contentTex);
          db.updateSectionStatus(section.id, section.status);
        } else {
          db.createSection(section.id, paperId, section.sectionNumber, section.title);
          if (section.contentTex !== undefined) db.updateSectionContent(section.id, section.contentTex);
          db.updateSectionStatus(section.id, section.status);
        }
      },
      hasLLMFor: (agent: string): boolean => {
        try {
          router.getClient(agent);
          return true;
        } catch {
          return false;
        }
      },
    };

    this.loadFromDB();
    this.registerAllRoutes();

    logger.setLevel('debug');
    logger.setLogFile(path.join(opts.dataDir, 'server.log'));
    logger.info(
      'server',
      `Server initialized, restored ${this.ctx.papers.size} papers, ${this.ctx.mmSessions.size} mindmap sessions`,
    );
  }

  private loadFromDB(): void {
    for (const paperId of this.ctx.db.listPaperIds()) {
      const dbPaper = this.ctx.db.getPaper(paperId);
      if (!dbPaper) continue;
      const outline = this.ctx.db.getPaperOutline(paperId);
      const dbSections = this.ctx.db.getPaperSections(paperId);
      const sections = dbSections.map((s: Record<string, unknown>) => ({
        id: s.id as string,
        paperId: s.paper_id as string,
        sectionNumber: s.section_number as number,
        title: s.title as string,
        contentTex: s.content_tex as string | undefined,
        status: s.status as Section['status'],
        version: s.version as number,
      }));
      this.ctx.papers.set(paperId, {
        id: paperId,
        title: dbPaper.title,
        targetJournal: dbPaper.target_journal,
        researchTopic: dbPaper.research_topic ?? undefined,
        contributionGaps: dbPaper.contribution_gaps ?? undefined,
        outline: outline ?? undefined,
        sections,
        status: dbPaper.status || 'draft',
        createdAt: dbPaper.created_at,
      });
    }
    for (const mm of this.ctx.db.listMindMapSessions()) {
      const nodes: MindMapNode[] = this.ctx.db.getMindMapNodes(mm.id).map((n: Record<string, unknown>) => ({
        id: n.id as string,
        parentId: n.parent_id as string | null,
        label: n.label as string,
        rationale: n.rationale as string | undefined,
        checked: !!n.checked,
        depth: n.depth as number,
        round: n.round as number,
        source: (n.source ?? 'ai') as 'ai' | 'user',
        journalMatch: (n.journal_match ?? 'match') as 'match' | 'partial' | 'mismatch',
      }));
      this.ctx.mmSessions.set(mm.id, {
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
    logger.info(
      'server',
      `Restored ${this.ctx.papers.size} papers, ${this.ctx.mmSessions.size} mindmap sessions from DB`,
    );
  }

  private registerAllRoutes(): void {
    const reg = (method: string, pattern: string | RegExp, handler: RouteHandler) => {
      this.routes.push({ method, pattern, handler });
    };

    registerLlmRoutes(this.ctx, reg);
    registerMindmapRoutes(this.ctx, reg);
    registerPapersRoutes(this.ctx, reg);
    registerSectionsRoutes(this.ctx, reg);
    registerCitationRoutes(this.ctx, reg);
    registerBibleRoutes(this.ctx, reg);
    registerReviewRoutes(this.ctx, reg);
    registerSocraticRoutes(this.ctx, reg);
    registerIntegrityRoutes(this.ctx, reg);
    registerPassportRoutes(this.ctx, reg);
    registerCheckpointRoutes(this.ctx, reg);
    registerTasksRoutes(this.ctx, reg);
    registerStatsRoutes(this.ctx, reg);
    registerHealthRoutes(this.ctx, reg);
    if (this.ctx.staticDir) {
      registerStaticRoutes({ staticDir: this.ctx.staticDir }, reg);
    }
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      const chain = composeMiddleware(
        [corsMiddleware, loggerMiddleware],
        (req, res) => {
          if (handlePreflight(req, res)) return;
          this.dispatch(req, res).catch((e: Error) => {
            handleRouteError(e, res);
          });
        },
      );
      this.server = http.createServer(chain);
      this.server.listen(this.opts.port, '0.0.0.0', () => {
        logger.info(`API: http://0.0.0.0:${this.opts.port}`);
        resolve();
      });
    });
  }

  stop() {
    this.server?.close();
    this.ctx.db.close();
  }

  private async dispatch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://localhost:${this.opts.port}`);
    const pathname = url.pathname;

    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (typeof route.pattern === 'string') {
        if (route.pattern === '*' || route.pattern === pathname) {
          return route.handler(req, res);
        }
      } else {
        if (route.pattern.test(pathname)) {
          return route.handler(req, res);
        }
      }
    }

    const CORS_ORIGIN = getCorsOrigin();
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN });
    res.end(JSON.stringify({ error: 'Not found', code: 404 }));
  }
}
