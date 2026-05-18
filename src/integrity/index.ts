// Integrity checker
import type { ProtectedContentIntegrityReport, BibleEntryStub } from '../types/index.ts';

export function verifyIntegrity(original: string, rewritten: string, bible: BibleEntryStub[]): ProtectedContentIntegrityReport {
  const violations: ProtectedContentIntegrityReport['violations'] = [];
  let totalChecked = 0; let unchanged = 0; let removed = 0;

  // Check Bible entries
  const protectedEntries = bible.filter(e => ['data', 'formulas', 'citations', 'variables', 'terminology'].includes(e.category));
  for (const entry of protectedEntries) {
    totalChecked++;
    if (original.includes(entry.value) && rewritten.includes(entry.value)) { unchanged++; }
    else if (original.includes(entry.value) && !rewritten.includes(entry.value)) {
      removed++;
      violations.push({ type: mapCat(entry.category), expected: entry.value, actual: '(missing)' });
    }
  }

  // Check cite keys
  const origCites = extractCiteKeys(original);
  const newCites = extractCiteKeys(rewritten);
  for (const key of origCites) {
    totalChecked++;
    if (!newCites.includes(key)) { removed++; violations.push({ type: 'citation', expected: `\\cite{${key}}`, actual: '(missing)' }); }
    else { unchanged++; }
  }

  // Check equation envs
  const origEqs = (original.match(/\\begin\{equation\}/g) || []).length;
  const newEqs = (rewritten.match(/\\begin\{equation\}/g) || []).length;
  if (origEqs !== newEqs) { totalChecked++; violations.push({ type: 'formula', expected: `${origEqs} equations`, actual: `${newEqs} equations` }); }

  return { passed: violations.length === 0, violations, stats: { totalChecked, unchanged, modified: 0, removed, added: 0 } };
}

function extractCiteKeys(text: string): string[] {
  const keys: string[] = [];
  const regex = /\\cite\{([^}]+)\}/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    for (const k of m[1].split(',').map(s => s.trim())) { if (!keys.includes(k)) keys.push(k); }
  }
  return keys;
}

function mapCat(cat: string): 'citation' | 'formula' | 'data' | 'variable' | 'terminology' {
  switch (cat) {
    case 'citations': return 'citation';
    case 'formulas': return 'formula';
    case 'data': return 'data';
    case 'variables': return 'variable';
    default: return 'terminology';
  }
}
