/* eslint-disable @typescript-eslint/no-explicit-any */
// Review Orchestrator — Manages the peer review flow
import type { FieldAnalystAgent } from '../agents/field-analyst.ts';
import type { EditorInChiefAgent } from '../agents/editor-in-chief.ts';
import type { MethodologyReviewerAgent } from '../agents/methodology-reviewer.ts';
import type { DomainReviewerAgent } from '../agents/domain-reviewer.ts';
import type { PerspectiveReviewerAgent } from '../agents/perspective-reviewer.ts';
import type { DevilsAdvocateAgent } from '../agents/devils-advocate.ts';
import type { EditorialSynthesizerAgent } from '../agents/editorial-synthesizer.ts';
import type { ScholariumDB } from '../db/database.ts';
import type { ReviewSession, ReviewReport, EditorialDecision } from '../types/index.ts';
import { randomUUID } from 'node:crypto';

export interface ReviewOrchestratorDeps {
  fieldAnalyst: FieldAnalystAgent;
  eic: EditorInChiefAgent;
  methodology: MethodologyReviewerAgent;
  domain: DomainReviewerAgent;
  perspective: PerspectiveReviewerAgent;
  da: DevilsAdvocateAgent;
  synthesizer: EditorialSynthesizerAgent;
  db: ScholariumDB;
}

export interface StartReviewResult {
  session: ReviewSession;
  editorialDecision: EditorialDecision;
}

export class ReviewOrchestrator {
  private deps: ReviewOrchestratorDeps;

  constructor(deps: ReviewOrchestratorDeps) {
    this.deps = deps;
  }

  async startReview(
    paperId: string,
    paperContent: string,
    paperTitle: string,
    round: number = 1,
  ): Promise<StartReviewResult> {
    // Phase 0: Field Analysis
    const config = await this.deps.fieldAnalyst.execute({ paperContent, paperTitle });

    // Phase 1: Parallel reviews
    const [eicReport, methodologyReport, domainReport, perspectiveReport, daReport] = await Promise.all([
      this.deps.eic.execute({
        paperContent,
        paperTitle,
        field: config.field,
        reviewerConfig: config.reviewers.find((r) => r.role === 'eic')!,
      }),
      this.deps.methodology.execute({
        paperContent,
        paperTitle,
        reviewerConfig: config.reviewers.find((r) => r.role === 'methodology')!,
      }),
      this.deps.domain.execute({
        paperContent,
        paperTitle,
        reviewerConfig: config.reviewers.find((r) => r.role === 'domain')!,
      }),
      this.deps.perspective.execute({
        paperContent,
        paperTitle,
        reviewerConfig: config.reviewers.find((r) => r.role === 'perspective')!,
      }),
      this.deps.da.execute({
        paperContent,
        paperTitle,
        reviewerConfig: config.reviewers.find((r) => r.role === 'da')!,
      }),
    ]);

    const reports: ReviewReport[] = [eicReport, methodologyReport, domainReport, perspectiveReport];

    // Phase 2: Synthesis
    const editorialDecision = await this.deps.synthesizer.execute({ reports, daReport, paperTitle });

    // Build session
    const session: ReviewSession = {
      id: randomUUID(),
      paperId,
      stage: 'completed',
      round,
      fieldAnalystConfig: config,
      reports,
      daReport,
      editorialDecision,
      revisionHistory: [],
      traceabilityMatrix: editorialDecision.revisionRoadmap.map((item) => ({
        issueId: item.id,
        reviewerComment: item.description,
        reviewerRole: item.source as any,
        consensus: item.consensus as any,
        authorClaim: '',
        verified: false,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to DB
    this.deps.db.createReviewReport({
      id: session.id,
      paper_id: paperId,
      round,
      reports: JSON.stringify(reports),
      da_report: JSON.stringify(daReport),
      editorial_decision: JSON.stringify(editorialDecision),
      traceability_matrix: JSON.stringify(session.traceabilityMatrix),
    });

    return { session, editorialDecision };
  }

  async reReview(paperId: string, revisedContent: string, originalSession: ReviewSession): Promise<StartReviewResult> {
    const paper = this.deps.db.getPaper(paperId);
    const paperTitle = paper?.title ?? '未命名';

    // Run re-review focusing on whether issues were addressed
    return this.startReview(paperId, revisedContent, paperTitle, originalSession.round + 1);
  }

  getSession(sessionId: string): ReviewSession | null {
    const dbReport = this.deps.db.getReviewReport(sessionId);
    if (!dbReport) return null;
    return this.dbToSession(dbReport);
  }

  getSessionsByPaper(paperId: string): ReviewSession[] {
    return this.deps.db.getReviewReportsByPaper(paperId).map((r) => this.dbToSession(r));
  }

  private dbToSession(db: any): ReviewSession {
    const reports = typeof db.reports === 'string' ? JSON.parse(db.reports) : (db.reports ?? []);
    const daReport = typeof db.da_report === 'string' ? JSON.parse(db.da_report) : db.da_report;
    const decision =
      typeof db.editorial_decision === 'string' ? JSON.parse(db.editorial_decision) : db.editorial_decision;
    const matrix =
      typeof db.traceability_matrix === 'string' ? JSON.parse(db.traceability_matrix) : (db.traceability_matrix ?? []);

    return {
      id: db.id,
      paperId: db.paper_id,
      stage: 'completed',
      round: db.round ?? 1,
      reports,
      daReport,
      editorialDecision: decision,
      revisionHistory: [],
      traceabilityMatrix: matrix,
      createdAt: db.created_at,
      updatedAt: db.updated_at,
    };
  }
}
