import { randomUUID } from 'crypto';
import { ScholariumDB } from '../db/database.ts';
import type { BibleCategory, BibleEntry, NormalizedChange } from '../types/index.ts';

export interface BibleEntryInput {
  paperId: string;
  category: BibleCategory;
  key: string;
  value: string;
  sourceSectionId?: string;
  sourceType?: 'user' | 'agent' | 'api' | 'import';
  sourceArtifactVersion?: number;
  confidence?: number;
  approvalStatus?: 'approved' | 'needs_human_review' | 'rejected';
  supersedesEntryId?: string;
  immutable?: boolean;
}

export class BibleManager {
  private db: ScholariumDB;
  constructor(db: ScholariumDB) { this.db = db; }

  addEntry(input: BibleEntryInput): string {
    const id = randomUUID();
    const existing = this.db.getBibleEntryByKey(input.paperId, input.category, input.key);
    this.db.createBibleEntry({
      id,
      paperId: input.paperId,
      category: input.category,
      key: input.key,
      value: input.value,
      sourceSectionId: input.sourceSectionId,
      sourceType: input.sourceType ?? 'agent',
      sourceArtifactVersion: existing ? (existing.source_artifact_version ?? 1) + 1 : (input.sourceArtifactVersion ?? 1),
      confidence: input.confidence ?? 1.0,
      approvalStatus: input.approvalStatus ?? 'approved',
      supersedesEntryId: existing?.id ?? input.supersedesEntryId,
      immutable: input.immutable ?? false,
    });
    return id;
  }

  lockEntry(entryId: string): void {
    const entry = this.db.getBibleEntry(entryId);
    if (entry) {
      entry.immutable = 1;
      this.db.flush();
    }
  }

  getEntries(paperId: string, options?: { category?: BibleCategory; sectionId?: string }): BibleEntry[] {
    let rows: any[];
    if (options?.category) {
      rows = this.db.getBibleEntriesByCategory(paperId, options.category);
    } else {
      rows = this.db.getBibleEntriesByPaper(paperId);
    }
    if (options?.sectionId) {
      rows = rows.filter((r: any) => r.source_section_id === options.sectionId);
    }
    return rows.map(this.rowToEntry);
  }

  getNormalizedEntries(paperId: string): BibleEntry[] {
    const all = this.db.getBibleEntriesByPaper(paperId);
    const latest = new Map<string, any>();
    for (const row of all) {
      const compositeKey = `${row.category}:${row.key}`;
      const existing = latest.get(compositeKey);
      if (!existing || (row.source_artifact_version ?? 0) > (existing.source_artifact_version ?? 0)) {
        latest.set(compositeKey, row);
      }
    }
    return Array.from(latest.values()).map(this.rowToEntry);
  }

  syncNormalizedChanges(changes: NormalizedChange[]): void {
    for (const change of changes) {
      const existing = this.db.getBibleEntryByKey('default', change.category, change.key);
      if (existing) {
        existing.value = change.newValue;
      }
    }
    if (changes.length > 0) this.db.flush();
  }

  getVersionHistory(entryId: string): BibleEntry[] {
    const versions: BibleEntry[] = [];
    let currentId: string | null = entryId;
    while (currentId) {
      const row = this.db.getBibleEntry(currentId);
      if (!row) break;
      versions.push(this.rowToEntry(row));
      currentId = row.supersedes_entry_id;
    }
    return versions;
  }

  getStats(paperId: string): { total: number; byCategory: Record<string, number>; byStatus: Record<string, number> } {
    const entries = this.db.getBibleEntriesByPaper(paperId);
    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const e of entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      byStatus[e.approval_status] = (byStatus[e.approval_status] || 0) + 1;
    }
    return { total: entries.length, byCategory, byStatus };
  }

  /**
   * Get context-relevant Bible entries for a specific section.
   * Filters to the most relevant entries to reduce token usage.
   */
  getContextForSection(paperId: string, sectionTitle: string, sectionId: string, sectionCoreArg: string): BibleEntry[] {
    const allEntries = this.getEntries(paperId);
    if (allEntries.length <= 20) return allEntries; // small corpus = no filter needed

    const sectionNum = parseInt(sectionId.split('-')[0]);
    const keywords = new Set([
      ...sectionTitle.toLowerCase().split(/\s+/),
      ...sectionCoreArg.toLowerCase().split(/\s+/),
    ]);

    // Score each entry by relevance
    const scored = allEntries.map(entry => {
      let score = 0;
      const val = entry.value.toLowerCase();
      const key = entry.key.toLowerCase();

      // Exact keyword match
      for (const kw of keywords) {
        if (kw.length < 2) continue;
        if (val.includes(kw) || key.includes(kw)) score += 3;
      }

      // Category-based relevance
      if (entry.category === 'terminology' && sectionNum <= 2) score += 2; // terminology in intro/related
      if (entry.category === 'data' && sectionNum >= 4) score += 2; // data in experiments
      if (entry.category === 'citations' && sectionNum <= 2) score += 1; // citations in intro/related
      if (entry.category === 'formulas' && sectionNum === 3) score += 3; // formulas in method

      // Immutable entries always included
      if (entry.immutable) score += 10;

      return { entry, score };
    });

    // Take top-N entries per category, always keep all immutable
    const immutable = scored.filter(s => s.entry.immutable).map(s => s.entry);
    const mutable = scored.filter(s => !s.entry.immutable)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(s => s.entry);

    // Merge and deduplicate by key
    const seen = new Set<string>();
    return [...immutable, ...mutable].filter(e => {
      const composite = `${e.category}:${e.key}`;
      if (seen.has(composite)) return false;
      seen.add(composite);
      return true;
    });
  }

  private rowToEntry(row: any): BibleEntry {
    return {
      id: row.id,
      paperId: row.paper_id,
      category: row.category,
      key: row.key,
      value: row.value,
      sourceSectionId: row.source_section_id,
      sourceType: row.source_type,
      sourceArtifactVersion: row.source_artifact_version,
      confidence: row.confidence,
      approvalStatus: row.approval_status,
      supersedesEntryId: row.supersedes_entry_id,
      immutable: !!row.immutable,
    };
  }
}
