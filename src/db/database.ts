// ScholariumDB — File-based JSON storage with write batching
import * as fs from 'node:fs';
import { logger } from '../utils/logger.ts';
import * as path from 'node:path';
import { randomUUID } from 'crypto';

interface DBData {
  papers: Record<string, any>;
  sections: Record<string, any>;
  bibleEntries: Record<string, any>;
  auditRecords: Record<string, any>;
  citations: Record<string, any>;
  pipelineRuns: Record<string, any>;
  humanReviewTasks: Record<string, any>;
  mindmapSessions: Record<string, any>;
  mindmapNodes: Record<string, any>;
  reviewReports: Record<string, any>;
  revisionHistory: Record<string, any>;
  materialPassports: Record<string, any>;
  socraticSessions: Record<string, any>;
  resetBoundaries: Record<string, any>;
  checkpoints: Record<string, any>;
}

function emptyDB(): DBData {
  return {
    papers: {},
    sections: {},
    bibleEntries: {},
    auditRecords: {},
    citations: {},
    pipelineRuns: {},
    humanReviewTasks: {},
    mindmapSessions: {},
    mindmapNodes: {},
    reviewReports: {},
    revisionHistory: {},
    materialPassports: {},
    socraticSessions: {},
    resetBoundaries: {},
    checkpoints: {},
  };
}

export class ScholariumDB {
  private data: DBData;
  private filePath: string;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dbPath: string, autoFlushMs = 2000) {
    this.filePath = dbPath;
    if (fs.existsSync(dbPath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        // Ensure all required fields exist
        const defaults = emptyDB();
        for (const key of Object.keys(defaults) as (keyof DBData)[]) {
          if (!this.data[key]) this.data[key] = defaults[key];
        }
      } catch (e) {
        logger.warn('Database load failed, using empty DB', String(e));
        this.data = emptyDB();
      }
    } else {
      this.data = emptyDB();
      this.saveSync();
    }
    // Auto-flush dirty writes periodically
    if (autoFlushMs > 0) {
      this.flushTimer = setInterval(() => {
        if (this.dirty) this.saveSync();
      }, autoFlushMs);
    }
  }

  /** Atomic write: write to temp file then rename */
  private saveSync(): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmpPath = this.filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(this.data), 'utf-8'); // compact JSON
      fs.renameSync(tmpPath, this.filePath);
      this.dirty = false;
    } catch (err: any) {
      logger.error(`[ScholariumDB] Save failed: ${err.message}`);
    }
  }

  /** Mark dirty (will be flushed by timer or close()) */
  private markDirty(): void {
    this.dirty = true;
  }

  // Paper
  createPaper(
    id: string,
    title: string,
    targetJournal?: string,
    researchTopic?: string,
    contributionGaps?: string[],
  ): void {
    this.data.papers[id] = {
      id,
      title,
      target_journal: targetJournal ?? null,
      status: 'draft',
      research_topic: researchTopic ?? null,
      contribution_gaps: contributionGaps ?? [],
      research_brief: null,
      methodology: null,
      current_stage: 0,
      passport_hash: null,
      socratic_session_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.markDirty();
  }
  getPaper(id: string): any {
    return this.data.papers[id];
  }
  updatePaperStatus(id: string, status: string): void {
    if (this.data.papers[id]) {
      this.data.papers[id].status = status;
      this.data.papers[id].updated_at = new Date().toISOString();
      this.markDirty();
    }
  }

  // Section
  createSection(id: string, paperId: string, sectionNumber: number, title: string): void {
    this.data.sections[id] = {
      id,
      paper_id: paperId,
      section_number: sectionNumber,
      title,
      content_tex: null,
      status: 'pending',
      version: 1,
    };
    this.markDirty();
  }
  getSection(id: string): any {
    return this.data.sections[id];
  }
  getSectionsByPaper(paperId: string): any[] {
    return Object.values(this.data.sections)
      .filter((s: any) => s.paper_id === paperId)
      .sort((a: any, b: any) => a.section_number - b.section_number);
  }
  updateSectionContent(id: string, contentTex: string): void {
    if (this.data.sections[id]) {
      this.data.sections[id].content_tex = contentTex;
      this.data.sections[id].version++;
      this.markDirty();
    }
  }
  updateSectionStatus(id: string, status: string): void {
    if (this.data.sections[id]) {
      this.data.sections[id].status = status;
      this.markDirty();
    }
  }

  // Bible
  createBibleEntry(entry: any): void {
    this.data.bibleEntries[entry.id] = {
      id: entry.id,
      paper_id: entry.paperId,
      category: entry.category,
      key: entry.key,
      value: entry.value,
      source_section_id: entry.sourceSectionId ?? null,
      source_type: entry.sourceType ?? 'agent',
      source_artifact_version: entry.sourceArtifactVersion ?? 1,
      confidence: entry.confidence ?? 1.0,
      approval_status: entry.approvalStatus ?? 'approved',
      supersedes_entry_id: entry.supersedesEntryId ?? null,
      immutable: entry.immutable ? 1 : 0,
    };
    this.markDirty();
  }
  getBibleEntry(id: string): any {
    return this.data.bibleEntries[id];
  }
  getBibleEntriesByPaper(paperId: string): any[] {
    return Object.values(this.data.bibleEntries).filter((e: any) => e.paper_id === paperId);
  }
  getBibleEntriesByCategory(paperId: string, category: string): any[] {
    return Object.values(this.data.bibleEntries).filter((e: any) => e.paper_id === paperId && e.category === category);
  }
  getBibleEntryByKey(paperId: string, category: string, key: string): any {
    const matches = Object.values(this.data.bibleEntries).filter(
      (e: any) => e.paper_id === paperId && e.category === category && e.key === key,
    );
    return matches.sort((a: any, b: any) => (b.source_artifact_version ?? 0) - (a.source_artifact_version ?? 0))[0];
  }
  updateBibleEntry(
    id: string,
    updates: { key?: string; value?: string; category?: string; confidence?: number; approvalStatus?: string },
  ): void {
    if (this.data.bibleEntries[id]) {
      if (updates.key !== undefined) this.data.bibleEntries[id].key = updates.key;
      if (updates.value !== undefined) this.data.bibleEntries[id].value = updates.value;
      if (updates.category !== undefined) this.data.bibleEntries[id].category = updates.category;
      if (updates.confidence !== undefined) this.data.bibleEntries[id].confidence = updates.confidence;
      if (updates.approvalStatus !== undefined) this.data.bibleEntries[id].approval_status = updates.approvalStatus;
      this.markDirty();
    }
  }
  deleteBibleEntry(id: string): void {
    delete this.data.bibleEntries[id];
    this.markDirty();
  }

  // Audit records
  createAuditRecord(record: any): void {
    const id = record.id ?? randomUUID();
    this.data.auditRecords[id] = { id, ...record, created_at: new Date().toISOString() };
    this.markDirty();
  }

  // Citations
  createCitation(citation: any): void {
    this.data.citations[citation.id] = { ...citation, verified: citation.verified ? 1 : 0 };
    this.markDirty();
  }
  getCitation(paperId: string, citeKey: string): any {
    return Object.values(this.data.citations).find((c: any) => c.paper_id === paperId && c.cite_key === citeKey);
  }
  getCitationsByPaper(paperId: string): any[] {
    return Object.values(this.data.citations).filter((c: any) => c.paper_id === paperId);
  }

  // Pipeline runs
  createPipelineRun(run: any): void {
    this.data.pipelineRuns[run.id] = {
      ...run,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.markDirty();
  }
  getPipelineRun(id: string): any {
    return this.data.pipelineRuns[id];
  }
  updatePipelineRun(id: string, updates: any): void {
    if (this.data.pipelineRuns[id]) {
      Object.assign(this.data.pipelineRuns[id], updates, { updated_at: new Date().toISOString() });
      this.markDirty();
    }
  }

  // Human review tasks
  createHumanReviewTask(task: any): void {
    const id = task.id ?? randomUUID();
    this.data.humanReviewTasks[id] = { id, ...task, created_at: new Date().toISOString() };
    this.markDirty();
  }

  deletePaper(paperId: string): void {
    delete this.data.papers[paperId];
    for (const k of Object.keys(this.data.sections)) {
      if (this.data.sections[k].paper_id === paperId) delete this.data.sections[k];
    }
    for (const k of Object.keys(this.data.bibleEntries)) {
      if (this.data.bibleEntries[k].paper_id === paperId) delete this.data.bibleEntries[k];
    }
    for (const k of Object.keys(this.data.citations)) {
      if (this.data.citations[k].paper_id === paperId) delete this.data.citations[k];
    }
    for (const k of Object.keys(this.data.reviewReports)) {
      if (this.data.reviewReports[k].paper_id === paperId) delete this.data.reviewReports[k];
    }
    for (const k of Object.keys(this.data.revisionHistory)) {
      if (this.data.revisionHistory[k].paper_id === paperId) delete this.data.revisionHistory[k];
    }
    for (const k of Object.keys(this.data.materialPassports)) {
      if (this.data.materialPassports[k].paper_id === paperId) delete this.data.materialPassports[k];
    }
    for (const k of Object.keys(this.data.socraticSessions)) {
      if (this.data.socraticSessions[k].paper_id === paperId) delete this.data.socraticSessions[k];
    }
    for (const k of Object.keys(this.data.checkpoints)) {
      if (this.data.checkpoints[k].paper_id === paperId) delete this.data.checkpoints[k];
    }
    this.markDirty();
  }

  // Paper outline persistence
  savePaperOutline(paperId: string, outline: any): void {
    if (this.data.papers[paperId]) {
      this.data.papers[paperId].outline = outline;
      this.data.papers[paperId].updated_at = new Date().toISOString();
      this.markDirty();
    }
  }
  getPaperOutline(paperId: string): any {
    return this.data.papers[paperId]?.outline ?? null;
  }
  listPaperIds(): string[] {
    return Object.keys(this.data.papers);
  }
  getPaperSections(paperId: string): any[] {
    return Object.values(this.data.sections).filter((s: any) => s.paper_id === paperId);
  }

  // Section by outline section id (the section id from the outline, not the DB section id)
  getSectionByOutlineId(paperId: string, outlineSectionId: string): any {
    return (
      Object.values(this.data.sections).find(
        (s: any) => s.paper_id === paperId && s.outline_section_id === outlineSectionId,
      ) ?? null
    );
  }

  // ── Outline Section CRUD ──

  /** 更新大纲中的单个章节 */
  updateOutlineSection(
    paperId: string,
    sectionId: string,
    updates: { title?: string; coreArgument?: string; estimatedPages?: number; requiredCitations?: number },
  ): void {
    const outline = this.getPaperOutline(paperId);
    if (!outline) return;
    const idx = outline.sections.findIndex((s: any) => s.id === sectionId);
    if (idx < 0) return;
    Object.assign(outline.sections[idx], updates);
    this.data.papers[paperId].outline = outline;
    this.data.papers[paperId].updated_at = new Date().toISOString();
    this.markDirty();
  }

  /** 在大纲中新增章节 */
  addOutlineSection(paperId: string, section: any): void {
    const outline = this.getPaperOutline(paperId);
    if (!outline) return;
    outline.sections.push(section);
    this.data.papers[paperId].outline = outline;
    this.data.papers[paperId].updated_at = new Date().toISOString();
    this.markDirty();
  }

  /** 从大纲中删除章节 */
  removeOutlineSection(paperId: string, sectionId: string): void {
    const outline = this.getPaperOutline(paperId);
    if (!outline) return;
    const newSections = outline.sections.filter((s: any) => s.id !== sectionId && s.parent !== sectionId);
    this.data.papers[paperId].outline = { ...outline, sections: newSections };
    this.data.papers[paperId].updated_at = new Date().toISOString();
    this.markDirty();
  }

  /** 重新排序大纲章节（传入完整 sections 数组） */
  reorderOutlineSections(paperId: string, orderedIds: string[]): void {
    const outline = this.getPaperOutline(paperId);
    if (!outline) return;
    const sectionMap = new Map(outline.sections.map((s: any) => [s.id, s]));
    const reordered = orderedIds.map((id: string) => sectionMap.get(id)).filter(Boolean);
    this.data.papers[paperId].outline = { ...outline, sections: reordered };
    this.data.papers[paperId].updated_at = new Date().toISOString();
    this.markDirty();
  }

  // ── Citation CRUD (paper-level, with title + url) ──

  createPaperCitation(citation: {
    id: string;
    paperId: string;
    citeKey: string;
    bibtex: string;
    title: string;
    url: string;
    authors: string;
    year: number | null;
  }): void {
    this.data.citations[citation.id] = {
      id: citation.id,
      paper_id: citation.paperId,
      cite_key: citation.citeKey,
      bibtex: citation.bibtex,
      title: citation.title,
      url: citation.url,
      authors: citation.authors,
      year: citation.year,
      verified: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.markDirty();
  }

  updatePaperCitation(
    id: string,
    updates: { bibtex?: string; title?: string; url?: string; authors?: string; year?: number | null },
  ): void {
    if (this.data.citations[id]) {
      Object.assign(this.data.citations[id], updates, { updated_at: new Date().toISOString() });
      this.markDirty();
    }
  }

  deletePaperCitation(id: string): void {
    delete this.data.citations[id];
    this.markDirty();
  }

  getPaperCitations(paperId: string): any[] {
    return Object.values(this.data.citations).filter((c: any) => c.paper_id === paperId);
  }

  // MindMap sessions
  createMindMapSession(session: any): void {
    this.data.mindmapSessions[session.id] = {
      id: session.id,
      research_topic: session.researchTopic,
      keywords: session.keywords ?? [],
      target_journal: session.targetJournal ?? null,
      current_round: session.currentRound ?? 0,
      status: session.status ?? 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.markDirty();
  }
  getMindMapSession(id: string): any {
    return this.data.mindmapSessions[id];
  }
  listMindMapSessions(): any[] {
    return Object.values(this.data.mindmapSessions);
  }
  updateMindMapSession(id: string, updates: any): void {
    if (this.data.mindmapSessions[id]) {
      Object.assign(this.data.mindmapSessions[id], updates, { updated_at: new Date().toISOString() });
      this.markDirty();
    }
  }
  deleteMindMapSession(id: string): void {
    delete this.data.mindmapSessions[id];
    // Also delete associated nodes
    for (const k of Object.keys(this.data.mindmapNodes)) {
      if (this.data.mindmapNodes[k].session_id === id) delete this.data.mindmapNodes[k];
    }
    this.markDirty();
  }

  // MindMap nodes
  createMindMapNode(node: any): void {
    this.data.mindmapNodes[node.id] = {
      id: node.id,
      session_id: node.sessionId,
      parent_id: node.parentId ?? null,
      label: node.label,
      rationale: node.rationale ?? '',
      checked: node.checked ? 1 : 0,
      depth: node.depth ?? 0,
      round: node.round ?? 0,
      source: node.source ?? 'ai',
      journal_match: node.journalMatch ?? 'match',
      created_at: new Date().toISOString(),
    };
    this.markDirty();
  }
  getMindMapNodes(sessionId: string): any[] {
    return Object.values(this.data.mindmapNodes).filter((n: any) => n.session_id === sessionId);
  }
  updateMindMapNode(id: string, updates: any): void {
    if (this.data.mindmapNodes[id]) {
      if ('checked' in updates) updates.checked = updates.checked ? 1 : 0;
      Object.assign(this.data.mindmapNodes[id], updates);
      this.markDirty();
    }
  }

  // ── Socratic Sessions ──
  createSocraticSession(session: any): void {
    this.data.socraticSessions[session.id] = {
      ...session,
      turns: session.turns ?? [],
      insights: session.insights ?? [],
      commitments: session.commitments ?? [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.markDirty();
  }
  getSocraticSession(id: string): any {
    return this.data.socraticSessions[id];
  }
  getSocraticSessionByPaper(paperId: string): any {
    return Object.values(this.data.socraticSessions).find((s: any) => s.paper_id === paperId && s.status === 'active');
  }
  updateSocraticSession(id: string, updates: any): void {
    if (this.data.socraticSessions[id]) {
      Object.assign(this.data.socraticSessions[id], updates, { updated_at: new Date().toISOString() });
      this.markDirty();
    }
  }
  listSocraticSessions(): any[] {
    return Object.values(this.data.socraticSessions);
  }

  // ── Review Reports ──
  createReviewReport(report: any): void {
    this.data.reviewReports[report.id] = {
      ...report,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.markDirty();
  }
  getReviewReport(id: string): any {
    return this.data.reviewReports[id];
  }
  getReviewReportsByPaper(paperId: string): any[] {
    return Object.values(this.data.reviewReports).filter((r: any) => r.paper_id === paperId);
  }
  updateReviewReport(id: string, updates: any): void {
    if (this.data.reviewReports[id]) {
      Object.assign(this.data.reviewReports[id], updates, { updated_at: new Date().toISOString() });
      this.markDirty();
    }
  }

  // ── Revision History ──
  addRevisionRound(revision: any): void {
    const id = revision.id ?? `rev-${Date.now()}`;
    this.data.revisionHistory[id] = { id, ...revision, created_at: new Date().toISOString() };
    this.markDirty();
  }
  getRevisionHistory(paperId: string): any[] {
    return Object.values(this.data.revisionHistory)
      .filter((r: any) => r.paper_id === paperId)
      .sort((a: any, b: any) => a.round - b.round);
  }

  // ── Material Passports ──
  createPassport(passport: any): void {
    this.data.materialPassports[passport.id] = {
      ...passport,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.markDirty();
  }
  getPassport(paperId: string): any {
    return Object.values(this.data.materialPassports).find((p: any) => p.paper_id === paperId);
  }
  updatePassport(id: string, updates: any): void {
    if (this.data.materialPassports[id]) {
      Object.assign(this.data.materialPassports[id], updates, { updated_at: new Date().toISOString() });
      this.markDirty();
    }
  }

  // ── Reset Boundaries ──
  addResetBoundary(boundary: any): void {
    const id = boundary.id ?? `rb-${Date.now()}`;
    this.data.resetBoundaries[id] = { id, ...boundary, created_at: new Date().toISOString() };
    this.markDirty();
  }
  getResetBoundaries(paperId: string): any[] {
    return Object.values(this.data.resetBoundaries).filter((b: any) => b.paper_id === paperId);
  }

  // ── Checkpoints ──
  createCheckpoint(checkpoint: any): void {
    this.data.checkpoints[checkpoint.id] = {
      ...checkpoint,
      created_at: new Date().toISOString(),
    };
    this.markDirty();
  }
  getCheckpoint(id: string): any {
    return this.data.checkpoints[id];
  }
  getActiveCheckpoint(paperId: string): any {
    return Object.values(this.data.checkpoints).find((c: any) => c.paper_id === paperId && !c.confirmed);
  }
  confirmCheckpoint(id: string): void {
    if (this.data.checkpoints[id]) {
      this.data.checkpoints[id].confirmed = true;
      this.data.checkpoints[id].confirmed_at = new Date().toISOString();
      this.markDirty();
    }
  }

  // ── Paper fields for research guidance ──
  updatePaperResearchBrief(paperId: string, brief: any): void {
    if (this.data.papers[paperId]) {
      this.data.papers[paperId].research_brief = brief;
      this.data.papers[paperId].updated_at = new Date().toISOString();
      this.markDirty();
    }
  }
  updatePaperMethodology(paperId: string, methodology: any): void {
    if (this.data.papers[paperId]) {
      this.data.papers[paperId].methodology = methodology;
      this.data.papers[paperId].updated_at = new Date().toISOString();
      this.markDirty();
    }
  }
  updatePaperStage(paperId: string, stage: number): void {
    if (this.data.papers[paperId]) {
      this.data.papers[paperId].current_stage = stage;
      this.data.papers[paperId].updated_at = new Date().toISOString();
      this.markDirty();
    }
  }

  /** Force flush pending writes and stop timer */
  transaction<T>(fn: () => T): T {
    return fn();
  }
  flush(): void {
    this.saveSync();
  }
  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirty) this.saveSync();
  }
}
