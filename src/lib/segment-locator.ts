// Segment locator — locate a user-selected / LLM-quoted passage inside section content.
// Used by revise-passage (①), auto-revision (②) and smart-edit (③).

export interface LocatedPassage {
  start: number;
  end: number;
  matchedText: string;
}

export type LocateError = 'not-found' | 'ambiguous' | 'too-short';

export type LocateResult = { ok: true; result: LocatedPassage } | { ok: false; error: LocateError };

/**
 * Locate `passage` inside `content`.
 * Strategy: exact match first (must be unique), then whitespace-normalized match (must be unique).
 * Offsets always refer to the raw `content` string.
 */
export function findPassageInContent(content: string, passage: string): LocateResult {
  const trimmed = passage.trim();
  if (trimmed.length < 4) return { ok: false, error: 'too-short' };

  // 1) exact match — must be unique
  const exactIdx = indexOfUnique(content, trimmed);
  if (exactIdx !== -1) {
    return {
      ok: true,
      result: { start: exactIdx, end: exactIdx + trimmed.length, matchedText: trimmed },
    };
  }

  // 2) whitespace-normalized match — map offsets back to the original content
  const { normalized: normContent, map: normMap } = normalizeWhitespaceWithMap(content);
  const normNeedle = normalizeWhitespace(trimmed);
  if (normNeedle.length >= 4) {
    const normIdx = indexOfUnique(normContent, normNeedle);
    if (normIdx !== -1) {
      const start = normMap[normIdx];
      const end = normMap[normIdx + normNeedle.length - 1] + 1;
      return { ok: true, result: { start, end, matchedText: content.slice(start, end) } };
    }
  }

  // exact found but non-unique, or nothing found
  const exactExists = content.includes(trimmed);
  return { ok: false, error: exactExists ? 'ambiguous' : 'not-found' };
}

/** Splice `replacement` into `content` at [start, end) — offsets are raw-content offsets. */
export function spliceContent(content: string, start: number, end: number, replacement: string): string {
  return content.slice(0, start) + replacement + content.slice(end);
}

/** Collapse every whitespace run into a single space. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/**
 * Normalize `content` whitespace while keeping a map from normalized index → original index.
 * A collapsed whitespace run maps to the index of its first whitespace char.
 */
export function normalizeWhitespaceWithMap(content: string): { normalized: string; map: number[] } {
  let normalized = '';
  const map: number[] = [];
  let prevWasSpace = true; // treat string start as a space so there is no leading space
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (/\s/.test(c)) {
      if (!prevWasSpace) {
        normalized += ' ';
        map.push(i);
      }
      prevWasSpace = true;
    } else {
      normalized += c;
      map.push(i);
      prevWasSpace = false;
    }
  }
  return { normalized, map };
}

/** First index of `needle` in `haystack` when it occurs exactly once, else -1. */
export function indexOfUnique(haystack: string, needle: string): number {
  const first = haystack.indexOf(needle);
  if (first === -1) return -1;
  if (haystack.indexOf(needle, first + needle.length) !== -1) return -1;
  return first;
}
