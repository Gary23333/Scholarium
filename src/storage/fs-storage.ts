import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import type { PaperOutline, Section, SectionBlueprint, PipelineRun } from '../types/index.ts';

export interface PipelineStorage {
  saveSection(section: Section): Promise<void>;
  loadSection(id: string): Promise<Section | undefined>;
  savePipelineRun(run: PipelineRun): Promise<void>;
  loadPipelineRun(paperId: string): Promise<PipelineRun | undefined>;
  saveOutline?(outline: PaperOutline): Promise<void>;
  loadOutline?(): Promise<PaperOutline | undefined>;
  saveBlueprint?(blueprint: SectionBlueprint, sectionId: string): Promise<void>;
  loadBlueprint?(sectionId: string): Promise<SectionBlueprint | undefined>;
}

export class FileSystemStorage implements PipelineStorage {
  private baseDir: string;
  constructor(baseDir: string) { this.baseDir = baseDir; }

  private path(...segments: string[]): string { return join(this.baseDir, ...segments); }

  async saveOutline(outline: PaperOutline): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.path('paper_outline.json'), JSON.stringify(outline, null, 2), 'utf-8');
  }

  async loadOutline(): Promise<PaperOutline | undefined> {
    try { return JSON.parse(await readFile(this.path('paper_outline.json'), 'utf-8')); } catch (e) { logger.warn('Failed to load outline', String(e)); return undefined; }
  }

  async saveBlueprint(blueprint: SectionBlueprint, sectionId: string): Promise<void> {
    await mkdir(this.path('blueprints'), { recursive: true });
    await writeFile(this.path('blueprints', `${sectionId}_blueprint.json`), JSON.stringify(blueprint, null, 2), 'utf-8');
  }

  async loadBlueprint(sectionId: string): Promise<SectionBlueprint | undefined> {
    try { return JSON.parse(await readFile(this.path('blueprints', `${sectionId}_blueprint.json`), 'utf-8')); } catch (e) { logger.warn(`Failed to load blueprint ${sectionId}`, String(e)); return undefined; }
  }

  async saveSection(section: Section): Promise<void> {
    await mkdir(this.path('sections'), { recursive: true });
    await writeFile(this.path('sections', `${section.id}.json`), JSON.stringify(section, null, 2), 'utf-8');
    if (section.contentTex) {
      await writeFile(this.path('sections', `${section.id}.tex`), section.contentTex, 'utf-8');
    }
  }

  async loadSection(id: string): Promise<Section | undefined> {
    try { return JSON.parse(await readFile(this.path('sections', `${id}.json`), 'utf-8')); } catch (e) { logger.warn(`Failed to load section ${id}`, String(e)); return undefined; }
  }

  async savePipelineRun(run: PipelineRun): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.path('pipeline_run.json'), JSON.stringify(run, null, 2), 'utf-8');
  }

  async loadPipelineRun(_paperId: string): Promise<PipelineRun | undefined> {
    try { return JSON.parse(await readFile(this.path('pipeline_run.json'), 'utf-8')); } catch (e) { logger.warn('Failed to load pipeline run', String(e)); return undefined; }
  }
}

export class InMemoryStorage implements PipelineStorage {
  private sections = new Map<string, Section>();
  private runs = new Map<string, PipelineRun>();
  private outlines = new Map<string, PaperOutline>();
  private blueprints = new Map<string, SectionBlueprint>();

  async saveSection(s: Section): Promise<void> { this.sections.set(s.id, { ...s }); }
  async loadSection(id: string): Promise<Section | undefined> { return this.sections.get(id); }
  async savePipelineRun(r: PipelineRun): Promise<void> { this.runs.set(r.paperId, { ...r }); }
  async loadPipelineRun(paperId: string): Promise<PipelineRun | undefined> { return this.runs.get(paperId); }
  async saveOutline(o: PaperOutline): Promise<void> { this.outlines.set('default', { ...o }); }
  async loadOutline(): Promise<PaperOutline | undefined> { return this.outlines.get('default'); }
  async saveBlueprint(b: SectionBlueprint, sectionId: string): Promise<void> { this.blueprints.set(sectionId, { ...b }); }
  async loadBlueprint(sectionId: string): Promise<SectionBlueprint | undefined> { return this.blueprints.get(sectionId); }
}
