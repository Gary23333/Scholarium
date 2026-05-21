// Pipeline Orchestrator — Core writing pipeline
import type {
  PaperOutline,
  OutlineSection,
  Section,
  SectionWriteState,
  PipelineRun,
  PipelinePhase,
  FixInstructions,
  BibleEntry,
} from '../types/index.ts';
import { resolveStateAfterRound } from '../state/machine.ts';
import type { PlannerAgent } from '../agents/planner.ts';
import type { ArchitectAgent } from '../agents/architect.ts';
import type { ComposerAgent } from '../agents/composer.ts';
import type { WriterAgent } from '../agents/writer.ts';
import type { ObserverAgent } from '../agents/observer.ts';
import type { NormalizerAgent } from '../agents/normalizer.ts';
import type { BibleManager } from '../bible/manager.ts';
import type { PipelineStorage } from '../storage/fs-storage.ts';
import { validateCitations } from '../librarian/index.ts';
import { runFullAudit } from '../audit/index.ts';
import { runAntiAI } from '../anti-ai/index.ts';
import { verifyIntegrity } from '../integrity/index.ts';
import type { CitationRecord } from '../types/index.ts';
import type { TaskManager, TaskPhase } from '../task-manager.ts';
import { InputGovernance, buildGovernanceContext } from '../models/input-governance.ts';
import type { LLMRouter } from '../llm/router.ts';

export interface PipelineDeps {
  planner: PlannerAgent;
  architect: ArchitectAgent;
  composer: ComposerAgent;
  writer: WriterAgent;
  observer: ObserverAgent;
  normalizer: NormalizerAgent;
  bible: BibleManager;
  storage: PipelineStorage;
  router?: LLMRouter;
  localCitations?: CitationRecord[];
}

export interface WriteSectionOptions {
  mock?: boolean;
  maxRounds?: number;
  aiThreshold?: number;
  skipAntiAI?: boolean;
  taskId?: string;
  taskManager?: TaskManager;
}

export class PipelineOrchestrator {
  private currentRun?: PipelineRun;
  private deps: PipelineDeps;
  constructor(deps: PipelineDeps) {
    this.deps = deps;
  }

  async runPlanning(
    paperId: string,
    confirmedFocus: any,
    journalProfile?: any,
    options?: { mock?: boolean },
  ): Promise<PaperOutline> {
    const mock = options?.mock ?? false;
    await this.initRun(paperId, 'planning', 'planner');
    const outline = await this.deps.planner.execute({ confirmedFocus, journalProfile }, { mock });
    if (this.deps.storage.saveOutline) await this.deps.storage.saveOutline(outline);
    await this.updateRun('planning', 'planner', 'completed');
    return outline;
  }

  async writeSection(
    paperId: string,
    outline: PaperOutline,
    sectionDef: OutlineSection,
    options: WriteSectionOptions = {},
  ): Promise<{ section: Section; state: SectionWriteState }> {
    const { mock = false, maxRounds = 3, aiThreshold = 0.5, skipAntiAI = false, taskId, taskManager } = options;

    let section: Section = {
      id: sectionDef.id,
      paperId,
      sectionNumber: outline.sections.findIndex((s) => s.id === sectionDef.id) + 1,
      title: sectionDef.title,
      status: 'pending',
      version: 1,
    };

    // 初始化子阶段
    if (taskId && taskManager) {
      taskManager.setPhases(taskId, [
        { name: 'architect', label: '🏗 架构设计', status: 'pending' },
        { name: 'composer', label: '📦 上下文组装', status: 'pending' },
        { name: 'writer', label: '✍️ 内容撰写', status: 'pending' },
        { name: 'observer', label: '🔍 内容提取', status: 'pending' },
        { name: 'normalizer', label: '📐 字数规训', status: 'pending' },
        { name: 'governance', label: '🛡 内容治理', status: 'pending' },
        { name: 'citation-check', label: '✅ 引文校验', status: 'pending' },
        { name: 'audit', label: '🔎 质量审计', status: 'pending' },
        { name: 'anti-ai', label: '🤖 去 AI 化', status: 'pending' },
        { name: 'integrity', label: '🔒 完整性校验', status: 'pending' },
      ]);
    }

    // Architect phase
    await this.initRun(paperId, 'architecting', `architect-${sectionDef.id}`);
    if (taskId && taskManager) taskManager.updateProgress(taskId, 5, '正在设计架构...', 'architect');
    let blueprint = this.deps.storage.loadBlueprint ? await this.deps.storage.loadBlueprint(sectionDef.id) : undefined;
    if (!blueprint) {
      blueprint = await this.deps.architect.execute({ section: sectionDef, outline }, { mock });
      if (this.deps.storage.saveBlueprint) await this.deps.storage.saveBlueprint(blueprint, sectionDef.id);
    }
    if (taskId && taskManager) taskManager.updatePhase(taskId, 'architect', { status: 'completed', progress: 100 });

    // Writer ↔ Audit loop
    let round = 0;
    let draft = '';
    let pendingFixes: FixInstructions | undefined;

    while (round < maxRounds) {
      section.status = 'drafting';
      const roundLabel = round > 0 ? ` (第${round + 1}轮)` : '';

      // ① Composer
      if (taskId && taskManager)
        taskManager.updateProgress(taskId, 15 + round * 20, `正在组装上下文${roundLabel}...`, 'composer');
      const contextPackage = await this.deps.composer.execute(
        {
          outline,
          section: sectionDef,
          bible: this.deps.bible,
          paperId,
          fixInstructions: pendingFixes,
          previousDraft: draft || undefined,
        },
        { mock },
      );
      if (taskId && taskManager) taskManager.updatePhase(taskId, 'composer', { status: 'completed', progress: 100 });

      // ② Writer
      if (taskId && taskManager)
        taskManager.updateProgress(taskId, 30 + round * 15, `正在撰写内容${roundLabel}...`, 'writer');
      const writerOutput = await this.deps.writer.execute(
        {
          blueprint,
          context: contextPackage,
          previousDraft: draft || undefined,
        },
        { mock },
      );
      draft = writerOutput.texContent;
      if (taskId && taskManager) taskManager.updatePhase(taskId, 'writer', { status: 'completed', progress: 100 });

      // ③ Observer
      if (taskId && taskManager)
        taskManager.updateProgress(taskId, 45 + round * 10, '正在提取结构化内容...', 'observer');
      const extraction = await this.deps.observer.execute({ draft, section, bible: this.deps.bible }, { mock });
      for (const entry of extraction.entries) {
        this.deps.bible.addEntry({
          paperId,
          category: entry.category,
          key: entry.key,
          value: entry.value,
          sourceSectionId: section.id,
          sourceType: 'agent',
          sourceArtifactVersion: section.version,
          confidence: entry.confidence,
          approvalStatus: 'approved',
          immutable: false,
        });
      }
      if (taskId && taskManager) taskManager.updatePhase(taskId, 'observer', { status: 'completed', progress: 100 });

      // ④ Normalizer
      if (taskId && taskManager) taskManager.updateProgress(taskId, 55 + round * 8, '正在规训字数...', 'normalizer');
      const normalizeResult = await this.deps.normalizer.execute(
        {
          draft,
          targetWordCount: sectionDef.estimatedPages * 800,
          currentWordCount: writerOutput.wordCount,
          bibleEntries: this.deps.bible.getEntries(paperId),
        },
        { mock },
      );
      draft = normalizeResult.normalizedDraft;
      if (taskId && taskManager) taskManager.updatePhase(taskId, 'normalizer', { status: 'completed', progress: 100 });

      // Quality gates
      section.status = 'auditing';

      // Governance validation (InkOS-inspired input governance)
      if (taskId && taskManager)
        taskManager.updateProgress(taskId, 62 + round * 5, '正在执行内容治理...', 'governance');
      const govCtx = buildGovernanceContext(
        this.deps.bible.getEntries(paperId),
        sectionDef,
        outline.sections
          .filter((s) => outline.sections.indexOf(s) < outline.sections.indexOf(sectionDef))
          .map((s) => ({ id: s.id, title: s.title, summary: s.coreArgument })),
      );
      const governance = new InputGovernance();
      const govResult = governance.validate({ blueprint, context: contextPackage, previousDraft: draft }, govCtx);
      if (!govResult.passed) {
        pendingFixes = {
          instruction: `Content governance found ${govResult.stats.critical} critical issues: ${govResult.violations
            .filter((v) => v.severity === 'critical')
            .map((v) => v.message)
            .join('; ')}`,
          round,
          violations: govResult.violations.map((v) => ({
            type: 'terminology' as const,
            expected: v.suggestion ?? '',
            actual: v.message,
            location: v.location ?? '',
          })),
        };
        section.status = 'needs_fix';
        section.version++;
        round++;
        if (taskId && taskManager)
          taskManager.updateProgress(taskId, 62 + round * 5, `内容治理未通过，进入第${round + 1}轮重试`);
        continue;
      }
      if (taskId && taskManager) taskManager.updatePhase(taskId, 'governance', { status: 'completed', progress: 100 });

      // Citation validation
      if (taskId && taskManager)
        taskManager.updateProgress(taskId, 65 + round * 5, '正在校验引文...', 'citation-check');
      const hasCitations = /\\cite\{[^}]+\}/.test(draft);
      if (hasCitations) {
        const citationReport = await validateCitations(draft, sectionDef.id, {
          localCitations: this.deps.localCitations ?? [],
          enableExternalSearch: false,
          router: this.deps.router,
        });
        if (citationReport.fabricatedCitations.length > 0) {
          pendingFixes = {
            instruction: 'Fix fabricated citations; use approved citation pool only.',
            round,
            citationReport: {
              fabricatedCitations: citationReport.fabricatedCitations.map((f) => f.citeKey),
              unverifiedCitations: [],
              suggestedReplacements: [],
            },
          };
          section.status = 'needs_fix';
          section.version++;
          round++;
          if (taskId && taskManager)
            taskManager.updateProgress(taskId, 65 + round * 5, `引文校验失败，进入第${round + 1}轮重试`);
          continue;
        }
      }
      if (taskId && taskManager)
        taskManager.updatePhase(taskId, 'citation-check', { status: 'completed', progress: 100 });

      // Audit
      if (taskId && taskManager) taskManager.updateProgress(taskId, 75 + round * 5, '正在执行质量审计...', 'audit');
      const bibleEntries = this.deps.bible.getEntries(paperId);
      const auditInput = {
        sectionId: sectionDef.id,
        draft,
        bibleSummary: {
          terminology: bibleEntries
            .filter((e) => e.category === 'terminology')
            .map((e) => ({ key: e.key, value: e.value })),
          citationMap: bibleEntries
            .filter((e) => e.category === 'citations')
            .map((e) => ({ key: e.key, value: e.value })),
          dataPoints: bibleEntries.filter((e) => e.category === 'data').map((e) => ({ key: e.key, value: e.value })),
        },
        mockMode: mock,
      };
      const auditResult = await runFullAudit(auditInput, this.deps.router);
      if (!auditResult.passed) {
        pendingFixes = {
          instruction: `Fix ${auditResult.stats.critical} critical issues.`,
          round,
          auditReport: {
            criticals: auditResult.findings
              .filter((f) => f.severity === 'critical')
              .map((f) => ({
                dimension: f.dimension,
                severity: f.severity,
                finding: f.description,
                location: f.location,
              })),
            warnings: [],
            infos: [],
          },
        };
        section.status = 'needs_fix';
        section.version++;
        round++;
        if (taskId && taskManager)
          taskManager.updateProgress(taskId, 75 + round * 5, `审计未通过，进入第${round + 1}轮重试`);
        continue;
      }
      if (taskId && taskManager) taskManager.updatePhase(taskId, 'audit', { status: 'completed', progress: 100 });

      // Anti-AI
      let aiOk = true;
      let aiChangedSignificantly = false;
      if (!skipAntiAI) {
        if (taskId && taskManager) taskManager.updateProgress(taskId, 85 + round * 3, '正在去 AI 化...', 'anti-ai');
        const aiResult = await runAntiAI(draft, { threshold: aiThreshold, mockMode: mock }, this.deps.router);
        if (aiResult.text !== draft) {
          const changeRatio = Math.abs(aiResult.text.length - draft.length) / Math.max(draft.length, 1);
          if (changeRatio > 0.05) aiChangedSignificantly = true;
          draft = aiResult.text;
        }
        aiOk = aiResult.score <= aiThreshold;
        if (!aiOk) {
          pendingFixes = { instruction: 'Reduce AI traces while preserving accuracy.', round };
          section.status = 'needs_fix';
          section.version++;
          round++;
          if (taskId && taskManager)
            taskManager.updateProgress(taskId, 85 + round * 3, `AI 痕迹过高，进入第${round + 1}轮重试`);
          continue;
        }
      }
      if (taskId && taskManager) taskManager.updatePhase(taskId, 'anti-ai', { status: 'completed', progress: 100 });

      // Integrity check
      if (!skipAntiAI) {
        if (taskId && taskManager)
          taskManager.updateProgress(taskId, 90 + round * 3, '正在执行完整性校验...', 'integrity');
        const integrity = verifyIntegrity(
          normalizeResult.normalizedDraft,
          draft,
          bibleEntries.map((e) => ({
            id: e.id,
            category: e.category,
            key: e.key,
            value: e.value,
            immutable: e.immutable,
          })),
        );
        if (!integrity.passed) {
          pendingFixes = {
            instruction: 'Rewriter modified protected content. Restore and re-audit.',
            round,
            violations: integrity.violations.map((v) => ({
              type: v.type,
              expected: v.expected,
              actual: v.actual,
              location: v.location ?? '',
            })),
          };
          section.status = 'needs_fix';
          section.version++;
          round++;
          if (taskId && taskManager)
            taskManager.updateProgress(taskId, 90 + round * 3, `完整性校验失败，进入第${round + 1}轮重试`);
          continue;
        }
      }
      if (taskId && taskManager) taskManager.updatePhase(taskId, 'integrity', { status: 'completed', progress: 100 });

      // Re-audit if significant change
      if (aiChangedSignificantly) {
        pendingFixes = { instruction: 'Anti-AI rewrite exceeded threshold. Full re-audit required.', round };
        section.status = 'needs_fix';
        section.version++;
        round++;
        continue;
      }

      // Determine final state
      const finalState = resolveStateAfterRound({
        round,
        maxRounds,
        auditOk: true,
        crossValOk: true,
        aiOk: true,
        integrityOk: true,
        aiChangedSignificantly: false,
      });

      section.status = finalState;
      section.contentTex = draft;
      if (finalState === 'passed') {
        await this.deps.storage.saveSection(section);
        return { section, state: 'passed' };
      }

      if (round >= maxRounds - 1) {
        section.status = 'human_review';
        await this.deps.storage.saveSection(section);
        return { section, state: 'human_review' };
      }
      section.version++;
      round++;
    }

    section.status = 'human_review';
    section.contentTex = draft;
    await this.deps.storage.saveSection(section);
    return { section, state: 'human_review' };
  }

  async writeAllSections(
    paperId: string,
    outline: PaperOutline,
    options: WriteSectionOptions = {},
  ): Promise<Section[]> {
    const sections: Section[] = [];
    for (const sectionDef of outline.sections) {
      const { section } = await this.writeSection(paperId, outline, sectionDef, options);
      sections.push(section);
    }
    return sections;
  }

  /** Resume an interrupted section from storage */
  async resumeSection(
    paperId: string,
    outline: PaperOutline,
    sectionId: string,
    options: WriteSectionOptions = {},
  ): Promise<{ section: Section; state: SectionWriteState }> {
    const existing = this.deps.storage.loadSection ? await this.deps.storage.loadSection(sectionId) : undefined;
    if (!existing) throw new Error(`Section ${sectionId} not found; cannot resume.`);
    if (existing.status === 'passed' || existing.status === 'failed' || existing.status === 'human_review') {
      return { section: existing, state: existing.status };
    }
    const sectionDef = outline.sections.find((s) => s.id === sectionId);
    if (!sectionDef) throw new Error(`Section ${sectionId} not found in outline.`);
    return this.writeSection(paperId, outline, sectionDef, options);
  }

  /** Get pipeline status summary */
  async getStatus(
    paperId: string,
  ): Promise<{ run: PipelineRun | undefined; sections: Array<{ id: string; status: string; version: number }> }> {
    const run = this.deps.storage.loadPipelineRun ? await this.deps.storage.loadPipelineRun(paperId) : undefined;
    return { run, sections: [] };
  }

  private async initRun(paperId: string, phase: PipelinePhase, step: string): Promise<void> {
    const existing = this.deps.storage.loadPipelineRun ? await this.deps.storage.loadPipelineRun(paperId) : undefined;
    const run: PipelineRun = existing ?? {
      id: `run-${paperId}`,
      paperId,
      currentPhase: phase,
      currentStep: step,
      status: 'running',
      currentStage: 0,
      artifactVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    run.currentPhase = phase;
    run.currentStep = step;
    run.updatedAt = new Date();
    this.currentRun = run;
    if (this.deps.storage.savePipelineRun) await this.deps.storage.savePipelineRun(run);
  }

  private async updateRun(phase: PipelinePhase, step: string, status: PipelineRun['status']): Promise<void> {
    if (this.currentRun) {
      Object.assign(this.currentRun, { currentPhase: phase, currentStep: step, status, updatedAt: new Date() });
      if (this.deps.storage.savePipelineRun) await this.deps.storage.savePipelineRun(this.currentRun);
    }
  }
}
