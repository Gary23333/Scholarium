// Agent Loop Orchestrator -- InkOS autonomous multi-section pipeline
import type {
  PaperOutline,
  OutlineSection,
  Section,
  SectionWriteState,
  AgentLoopAction,
  AgentLoopStep,
  AgentLoopSectionState,
  AgentLoopState,
  AgentLoopOptions,
} from '../types/index.ts';
import type { PipelineDeps } from './orchestrator.ts';
import { PipelineOrchestrator } from './orchestrator.ts';
import { runFullAudit } from '../audit/index.ts';

export type AgentLoopDeps = PipelineDeps;

export class AgentLoopOrchestrator {
  private deps: AgentLoopDeps;
  private loopState: AgentLoopState;

  constructor(deps: AgentLoopDeps) {
    this.deps = deps;
    this.loopState = {
      paperId: '',
      steps: [],
      sectionStates: [],
      currentIteration: 0,
      maxIterations: 0,
      terminated: false,
    };
  }

  async runLoop(
    paperId: string,
    outline: PaperOutline,
    existingSections: Section[],
    options: AgentLoopOptions = {},
  ): Promise<{ sections: Section[]; loopState: AgentLoopState }> {
    const { mock = false, maxIterations = 6, taskId, taskManager, skipAntiAI = false } = options;
    const orch = new PipelineOrchestrator(this.deps);

    this.loopState = {
      paperId,
      steps: [],
      sectionStates: outline.sections.map((s) => {
        const existing = existingSections.find((es) => es.id === s.id);
        return {
          sectionId: s.id,
          status: existing?.status ?? 'pending',
          version: existing?.version ?? 0,
          iterations: 0,
        };
      }),
      currentIteration: 0,
      maxIterations,
      terminated: false,
    };

    if (taskId && taskManager) {
      taskManager.updateProgress(taskId, 0, 'Agent Loop start, analyzing priority...');
    }

    const priorityOrder = [...outline.sections]
      .map((s, i) => ({ section: s, originalIndex: i }))
      .sort((a, b) => b.section.estimatedPages - a.section.estimatedPages);

    while (this.loopState.currentIteration < maxIterations && !this.loopState.terminated) {
      this.loopState.currentIteration++;
      const iterLabel = `Round ${this.loopState.currentIteration}/${maxIterations}`;
      if (taskId && taskManager) {
        taskManager.updateProgress(
          taskId,
          Math.round(((this.loopState.currentIteration - 1) / maxIterations) * 100),
          `${iterLabel} scheduling...`,
        );
      }

      let anyActionTaken = false;

      for (const { section: sectionDef } of priorityOrder) {
        const secState = this.loopState.sectionStates.find((s) => s.sectionId === sectionDef.id)!;
        if (secState.status === 'passed' && this.loopState.currentIteration > 1) continue;

        const action = this.selectNextAction(secState.status, secState.iterations);
        secState.lastAction = action;
        secState.iterations++;

        if (action === 'write_section') {
          if (taskId && taskManager) {
            taskManager.updateProgress(
              taskId,
              Math.round(((this.loopState.currentIteration - 1) / maxIterations) * 100),
              `${iterLabel} writing ${sectionDef.title}...`,
            );
          }
          try {
            const { section, state } = await orch.writeSection(paperId, outline, sectionDef, {
              mock,
              skipAntiAI,
              taskId,
              taskManager,
            });
            secState.status = section.status;
            secState.version = section.version;
            const existingIdx = existingSections.findIndex((es) => es.id === section.id);
            if (existingIdx >= 0) existingSections[existingIdx] = section;
            else existingSections.push(section);
            this.recordStep(
              action,
              sectionDef,
              state === 'passed' || state === 'human_review' ? 'success' : 'failure',
              `state=${state}`,
            );
            anyActionTaken = true;
          } catch (e: any) {
            this.recordStep(action, sectionDef, 'failure', e.message);
            secState.status = 'failed';
          }
        } else if (action === 'audit_section') {
          if (taskId && taskManager) {
            taskManager.updateProgress(
              taskId,
              Math.round(((this.loopState.currentIteration - 1) / maxIterations) * 100),
              `${iterLabel} auditing ${sectionDef.title}...`,
            );
          }
          const existing = existingSections.find((es) => es.id === sectionDef.id);
          const draft = existing?.contentTex ?? '';
          if (!draft) {
            this.recordStep(action, sectionDef, 'skipped', 'no content');
            continue;
          }
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
              dataPoints: bibleEntries
                .filter((e) => e.category === 'data')
                .map((e) => ({ key: e.key, value: e.value })),
            },
            mockMode: mock,
          };
          const auditResult = await runFullAudit(auditInput, this.deps.router);
          if (auditResult.passed) {
            secState.status = 'passed';
            this.recordStep(action, sectionDef, 'success', `passed, ${auditResult.findings.length} findings`);
          } else {
            secState.status = 'needs_fix';
            this.recordStep(action, sectionDef, 'failure', `${auditResult.stats.critical} critical`);
          }
          anyActionTaken = true;
        } else if (action === 'revise_section') {
          if (taskId && taskManager) {
            taskManager.updateProgress(
              taskId,
              Math.round(((this.loopState.currentIteration - 1) / maxIterations) * 100),
              `${iterLabel} revising ${sectionDef.title}...`,
            );
          }
          try {
            const { section, state } = await orch.writeSection(paperId, outline, sectionDef, {
              mock,
              skipAntiAI,
              taskId,
              taskManager,
              maxRounds: 2,
            });
            secState.status = section.status;
            secState.version = section.version;
            const existingIdx = existingSections.findIndex((es) => es.id === section.id);
            if (existingIdx >= 0) existingSections[existingIdx] = section;
            else existingSections.push(section);
            this.recordStep(
              action,
              sectionDef,
              state === 'passed' || state === 'human_review' ? 'success' : 'failure',
              `state=${state}`,
            );
          } catch (e: any) {
            this.recordStep(action, sectionDef, 'failure', e.message);
          }
          anyActionTaken = true;
        } else if (action === 'check_bible') {
          if (taskId && taskManager) {
            taskManager.updateProgress(
              taskId,
              Math.round(((this.loopState.currentIteration - 1) / maxIterations) * 100),
              `${iterLabel} Bible check...`,
            );
          }
          const allEntries = this.deps.bible.getEntries(paperId);
          const issues = this.checkBibleConsistency(allEntries, outline);
          if (issues.length === 0) {
            this.recordStep(action, sectionDef, 'success', 'no conflicts');
          } else {
            this.recordStep(action, sectionDef, 'failure', `${issues.length} conflicts`);
          }
          anyActionTaken = true;
        }
      }

      const allPassed = this.loopState.sectionStates.every((s) => s.status === 'passed');
      if (allPassed) {
        this.loopState.terminated = true;
        this.loopState.terminationReason = 'All sections passed audit';
        if (taskId && taskManager) taskManager.complete(taskId, 'Agent Loop complete: all sections passed');
        break;
      }
      if (!anyActionTaken) {
        this.loopState.terminated = true;
        this.loopState.terminationReason = 'No actions available';
        if (taskId && taskManager) taskManager.complete(taskId, 'Agent Loop complete: no remaining actions');
        break;
      }
    }

    if (!this.loopState.terminated) {
      this.loopState.terminated = true;
      this.loopState.terminationReason = `Max iterations reached (${maxIterations})`;
      if (taskId && taskManager) taskManager.complete(taskId, 'Agent Loop complete: max iterations');
    }

    const finalSections: Section[] = outline.sections.map((s) => {
      const existing = existingSections.find((es) => es.id === s.id);
      const state = this.loopState.sectionStates.find((st) => st.sectionId === s.id)!;
      return (
        existing ?? {
          id: s.id,
          paperId,
          sectionNumber: outline.sections.findIndex((sec) => sec.id === s.id) + 1,
          title: s.title,
          status: state.status,
          version: state.version,
        }
      );
    });

    return { sections: finalSections, loopState: this.loopState };
  }

  getLoopState(): AgentLoopState {
    return this.loopState;
  }

  private selectNextAction(status: SectionWriteState, iterations: number): AgentLoopAction {
    if (status === 'pending' || status === 'drafting' || iterations === 0) return 'write_section';
    if (status === 'needs_fix') return 'revise_section';
    if (status === 'auditing' || status === 'human_review') return 'audit_section';
    if (status === 'passed') return 'check_bible';
    return 'get_status';
  }

  private recordStep(
    action: AgentLoopAction,
    sectionDef: OutlineSection,
    result: 'success' | 'failure' | 'skipped',
    detail?: string,
  ) {
    this.loopState.steps.push({
      action,
      sectionId: sectionDef.id,
      sectionTitle: sectionDef.title,
      round: this.loopState.currentIteration,
      timestamp: new Date().toISOString(),
      result,
      detail,
    });
  }

  private checkBibleConsistency(allEntries: any[], outline: PaperOutline): string[] {
    const issues: string[] = [];
    const termMap = new Map<string, string[]>();
    for (const entry of allEntries) {
      if (entry.category === 'terminology') {
        const existing = termMap.get(entry.key.toLowerCase());
        if (existing) {
          if (!existing.includes(entry.value)) existing.push(entry.value);
        } else {
          termMap.set(entry.key.toLowerCase(), [entry.value]);
        }
      }
    }
    for (const [term, values] of termMap) {
      if (values.length > 1) {
        issues.push(`Term conflict: "${term}" has ${values.length} different definitions`);
      }
    }
    const claims = allEntries.filter((e) => e.category === 'claims').map((e) => e.value);
    for (const sec of outline.sections) {
      const hasClaim = claims.some((c) => c.toLowerCase().includes(sec.title.toLowerCase().slice(0, 10)));
      if (!hasClaim && sec.estimatedPages > 2) {
        issues.push(`Section "${sec.title}" has no corresponding claim in Bible`);
      }
    }
    return issues;
  }
}
