/* eslint-disable @typescript-eslint/no-explicit-any */
// Material Passport Manager — Cross-session state recovery
import { createHash } from 'node:crypto';
import type { ScholariumDB } from '../db/database.ts';
import type { MaterialPassport, ResetBoundary } from '../types/index.ts';
import { randomUUID } from 'node:crypto';

export class PassportManager {
  private db: ScholariumDB;

  constructor(db: ScholariumDB) {
    this.db = db;
  }

  createPassport(paperId: string): MaterialPassport {
    const paper = this.db.getPaper(paperId);
    const outline = this.db.getPaperOutline(paperId);
    const bible = this.db.getBibleEntriesByPaper(paperId);
    const citations = this.db.getPaperCitations(paperId);

    const passport: MaterialPassport = {
      paperId,
      currentStage: paper?.current_stage ?? 0,
      researchBrief: paper?.research_brief ?? undefined,
      methodology: paper?.methodology ?? undefined,
      outline: outline ?? undefined,
      bible: bible.map((b: any) => ({
        id: b.id,
        paperId: b.paper_id,
        category: b.category,
        key: b.key,
        value: b.value,
        sourceSectionId: b.source_section_id,
        sourceType: b.source_type,
        sourceArtifactVersion: b.source_artifact_version,
        confidence: b.confidence,
        approvalStatus: b.approval_status,
        immutable: !!b.immutable,
      })),
      citations: citations.map((c: any) => ({
        id: c.id,
        paperId: c.paper_id,
        citeKey: c.cite_key,
        bibtex: c.bibtex,
        doi: c.doi,
        title: c.title,
        authors: c.authors,
        year: c.year,
        verified: !!c.verified,
        approvalStatus: c.approval_status ?? 'approved',
        source: c.source ?? 'user',
        matchConfidence: c.match_confidence ?? 1.0,
        lastVerifiedAt: c.last_verified_at,
        embedding: null,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
      resetBoundaries: this.db.getResetBoundaries(paperId),
      hash: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    passport.hash = this.computeHash(passport);

    // Save to DB
    const existing = this.db.getPassport(paperId);
    if (existing) {
      this.db.updatePassport(existing.id, {
        current_stage: passport.currentStage,
        research_brief: passport.researchBrief,
        methodology: passport.methodology,
        outline: passport.outline,
        bible: passport.bible,
        citations: passport.citations,
        reset_boundaries: passport.resetBoundaries,
        hash: passport.hash,
      });
    } else {
      this.db.createPassport({
        id: randomUUID(),
        paper_id: paperId,
        current_stage: passport.currentStage,
        research_brief: passport.researchBrief,
        methodology: passport.methodology,
        outline: passport.outline,
        bible: passport.bible,
        citations: passport.citations,
        reset_boundaries: passport.resetBoundaries,
        hash: passport.hash,
      });
    }

    return passport;
  }

  getPassport(paperId: string): MaterialPassport | null {
    const dbPassport = this.db.getPassport(paperId);
    if (!dbPassport) return null;

    return {
      paperId: dbPassport.paper_id,
      currentStage: dbPassport.current_stage ?? 0,
      researchBrief: dbPassport.research_brief,
      methodology: dbPassport.methodology,
      outline: dbPassport.outline,
      bible: dbPassport.bible ?? [],
      citations: dbPassport.citations ?? [],
      resetBoundaries: dbPassport.reset_boundaries ?? [],
      hash: dbPassport.hash ?? '',
      createdAt: dbPassport.created_at,
      updatedAt: dbPassport.updated_at,
    };
  }

  addResetBoundary(paperId: string, stage: number, nextStage?: number, pendingDecision?: string): ResetBoundary {
    const boundary: ResetBoundary = {
      id: randomUUID(),
      kind: 'boundary',
      stage,
      hash: this.computeBoundaryHash(paperId, stage),
      nextStage,
      pendingDecision,
      timestamp: new Date().toISOString(),
    };

    this.db.addResetBoundary({
      id: boundary.id,
      paper_id: paperId,
      kind: boundary.kind,
      stage: boundary.stage,
      hash: boundary.hash,
      next_stage: boundary.nextStage,
      pending_decision: boundary.pendingDecision,
    });

    return boundary;
  }

  resumeFromPassport(paperId: string, hash: string): { success: boolean; stage: number; message: string } {
    const passport = this.getPassport(paperId);
    if (!passport) {
      return { success: false, stage: 0, message: '未找到 Material Passport' };
    }

    const boundaries = this.db.getResetBoundaries(paperId);
    const matchingBoundary = boundaries.find((b: any) => b.hash === hash && b.kind === 'boundary');

    if (!matchingBoundary) {
      return { success: false, stage: 0, message: '未找到匹配的重置边界' };
    }

    // Check if already resumed
    const resumeEntries = boundaries.filter((b: any) => b.kind === 'resume' && b.stage === matchingBoundary.stage);
    if (resumeEntries.length > 0) {
      return { success: false, stage: matchingBoundary.stage, message: '此边界已被恢复过' };
    }

    // Add resume entry
    this.db.addResetBoundary({
      id: randomUUID(),
      paper_id: paperId,
      kind: 'resume',
      stage: matchingBoundary.stage,
      hash: this.computeBoundaryHash(paperId, matchingBoundary.stage),
    });

    const nextStage = matchingBoundary.next_stage ?? matchingBoundary.stage + 1;
    return { success: true, stage: nextStage, message: `从阶段 ${matchingBoundary.stage} 恢复，进入阶段 ${nextStage}` };
  }

  updateStage(paperId: string, stage: number): void {
    this.db.updatePaperStage(paperId, stage);
  }

  private computeHash(passport: MaterialPassport): string {
    const canonical = JSON.stringify({
      paperId: passport.paperId,
      currentStage: passport.currentStage,
      outline: passport.outline,
      bibleCount: passport.bible.length,
      citationCount: passport.citations.length,
    });
    return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  }

  private computeBoundaryHash(paperId: string, stage: number): string {
    const canonical = JSON.stringify({ paperId, stage, timestamp: Date.now() });
    return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  }
}
