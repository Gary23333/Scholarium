import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BibleManager } from '../../bible/manager.ts';
import { ScholariumDB } from '../../db/database.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tmpDir: string;
let dbPath: string;

function createDB(): ScholariumDB {
  return new ScholariumDB(dbPath, 0);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scholarium-test-'));
  dbPath = path.join(tmpDir, 'test.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('BibleManager', () => {
  describe('addEntry()', () => {
    it('should add an entry and return an id', () => {
      const db = createDB();
      const bible = new BibleManager(db);
      const id = bible.addEntry({
        paperId: 'paper-1',
        category: 'terminology',
        key: 'LLM',
        value: 'Large Language Model',
      });
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
      db.close();
    });

    it('should increment version when adding entry with same key', () => {
      const db = createDB();
      const bible = new BibleManager(db);
      bible.addEntry({
        paperId: 'paper-1',
        category: 'terminology',
        key: 'LLM',
        value: 'Large Language Model',
      });
      const id2 = bible.addEntry({
        paperId: 'paper-1',
        category: 'terminology',
        key: 'LLM',
        value: 'Large Language Model v2',
      });
      const entries = bible.getEntries('paper-1');
      expect(entries.length).toBe(2);
      const v2 = entries.find(e => e.id === id2);
      expect(v2?.sourceArtifactVersion).toBe(2);
      db.close();
    });
  });

  describe('getEntries()', () => {
    it('should return all entries for a paper', () => {
      const db = createDB();
      const bible = new BibleManager(db);
      bible.addEntry({ paperId: 'paper-1', category: 'terminology', key: 'A', value: 'Alpha' });
      bible.addEntry({ paperId: 'paper-1', category: 'data', key: 'B', value: 'Beta' });
      bible.addEntry({ paperId: 'paper-2', category: 'terminology', key: 'C', value: 'Gamma' });

      const entries = bible.getEntries('paper-1');
      expect(entries.length).toBe(2);
      db.close();
    });

    it('should filter entries by category', () => {
      const db = createDB();
      const bible = new BibleManager(db);
      bible.addEntry({ paperId: 'paper-1', category: 'terminology', key: 'A', value: 'Alpha' });
      bible.addEntry({ paperId: 'paper-1', category: 'data', key: 'B', value: 'Beta' });

      const entries = bible.getEntries('paper-1', { category: 'terminology' });
      expect(entries.length).toBe(1);
      expect(entries[0].category).toBe('terminology');
      db.close();
    });

    it('should filter entries by sectionId', () => {
      const db = createDB();
      const bible = new BibleManager(db);
      bible.addEntry({ paperId: 'paper-1', category: 'terminology', key: 'A', value: 'Alpha', sourceSectionId: 'sec-1' });
      bible.addEntry({ paperId: 'paper-1', category: 'terminology', key: 'B', value: 'Beta', sourceSectionId: 'sec-2' });

      const entries = bible.getEntries('paper-1', { sectionId: 'sec-1' });
      expect(entries.length).toBe(1);
      expect(entries[0].key).toBe('A');
      db.close();
    });

    it('should return empty array for paper with no entries', () => {
      const db = createDB();
      const bible = new BibleManager(db);
      const entries = bible.getEntries('nonexistent');
      expect(entries).toEqual([]);
      db.close();
    });
  });

  describe('getStats()', () => {
    it('should return correct stats', () => {
      const db = createDB();
      const bible = new BibleManager(db);
      bible.addEntry({ paperId: 'paper-1', category: 'terminology', key: 'A', value: 'Alpha' });
      bible.addEntry({ paperId: 'paper-1', category: 'terminology', key: 'B', value: 'Beta' });
      bible.addEntry({ paperId: 'paper-1', category: 'data', key: 'C', value: 'Gamma' });

      const stats = bible.getStats('paper-1');
      expect(stats.total).toBe(3);
      expect(stats.byCategory.terminology).toBe(2);
      expect(stats.byCategory.data).toBe(1);
      expect(stats.byStatus.approved).toBe(3);
      db.close();
    });

    it('should return zero stats for paper with no entries', () => {
      const db = createDB();
      const bible = new BibleManager(db);
      const stats = bible.getStats('nonexistent');
      expect(stats.total).toBe(0);
      expect(stats.byCategory).toEqual({});
      expect(stats.byStatus).toEqual({});
      db.close();
    });
  });
});
