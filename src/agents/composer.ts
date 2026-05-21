import { BaseAgent } from './base.ts';
import type {
  AgentOptions,
  BibleEntry,
  ContextPackage,
  FixInstructions,
  OutlineSection,
  PaperOutline,
} from '../types/index.ts';
import type { BibleManager } from '../bible/manager.ts';

export interface ComposerInput {
  outline: PaperOutline;
  section: OutlineSection;
  bible: BibleManager;
  paperId: string;
  fixInstructions?: FixInstructions;
  previousDraft?: string;
}

export class ComposerAgent extends BaseAgent<ComposerInput, ContextPackage> {
  readonly name = 'Composer';

  protected async realExecute(input: ComposerInput): Promise<ContextPackage> {
    return this.assemble(input);
  }
  protected async mockExecute(input: ComposerInput): Promise<ContextPackage> {
    return this.assemble(input);
  }

  private assemble(input: ComposerInput): ContextPackage {
    const { outline, section, bible, paperId, fixInstructions, previousDraft } = input;
    const bibleSnapshot = bible.getContextForSection(paperId, section.title, section.id, section.coreArgument);
    const citationPool = bibleSnapshot
      .filter((e) => e.category === 'citations' && e.approvalStatus === 'approved')
      .map((e) => ({ citeKey: e.key, bibtex: e.value, verified: true, approvalStatus: 'approved' as const }));
    const currentIndex = outline.sections.findIndex((s) => s.id === section.id);
    const previousSections = outline.sections
      .slice(0, currentIndex)
      .map((s) => ({ id: s.id, title: s.title, summary: s.coreArgument }));
    return {
      outline,
      currentSection: section,
      bibleSnapshot,
      citationPool,
      previousSections: previousSections.length > 0 ? previousSections : undefined,
      fixInstructions,
      previousDraft,
    };
  }
}
