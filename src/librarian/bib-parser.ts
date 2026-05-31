// BibTeX Parser — 解析 .bib 文件为结构化条目
// 不依赖外部库，纯正则实现

export interface BibEntry {
  citeKey: string;
  entryType: string;
  fields: Record<string, string>;
  rawBibtex: string;
}

export interface BibParseResult {
  success: boolean;
  entries: BibEntry[];
  errors: Array<{ line: number; message: string; citeKey: string | null }>;
  stats: { totalEntries: number; withDOI: number; withoutDOI: number; duplicateKeys: string[] };
}

/**
 * 解析 BibTeX 文件内容
 */
export function parseBibFile(content: string): BibParseResult {
  const entries: BibEntry[] = [];
  const errors: BibParseResult['errors'] = [];
  const seenKeys = new Set<string>();
  const duplicateKeys: string[] = [];

  // Remove comments
  const cleaned = content.replace(/(^|\n)\s*%[^\n]*/g, '$1');

  // Match @type{key, ...}
  const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\s*\}/g;
  let match;
  let lineNum = 1;

  while ((match = entryRegex.exec(cleaned)) !== null) {
    const entryType = match[1].toLowerCase();
    const citeKey = match[2].trim();
    const body = match[3];

    if (seenKeys.has(citeKey)) {
      duplicateKeys.push(citeKey);
      errors.push({ line: lineNum, message: `Duplicate cite key: ${citeKey}`, citeKey });
    }
    seenKeys.add(citeKey);

    const fields = parseFields(body);
    entries.push({
      citeKey,
      entryType,
      fields,
      rawBibtex: match[0],
    });

    lineNum += match[0].split('\n').length;
  }

  const withDOI = entries.filter((e) => e.fields.doi).length;

  return {
    success: errors.filter((e) => e.message.includes('Parse error')).length === 0,
    entries,
    errors,
    stats: { totalEntries: entries.length, withDOI, withoutDOI: entries.length - withDOI, duplicateKeys },
  };
}

function parseFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldRegex = /(\w+)\s*=\s*\{([^}]*)\}/g;
  let m;
  while ((m = fieldRegex.exec(body)) !== null) {
    fields[m[1].toLowerCase()] = m[2].trim();
  }
  // Also handle quoted values
  const quotedRegex = /(\w+)\s*=\s*"([^"]*)"/g;
  while ((m = quotedRegex.exec(body)) !== null) {
    fields[m[1].toLowerCase()] = m[2].trim();
  }
  return fields;
}

/**
 * 去重 BibTeX 条目
 */
export function deduplicateEntries(entries: BibEntry[]): BibEntry[] {
  const seen = new Map<string, BibEntry>();
  for (const entry of entries) {
    const existing = seen.get(entry.citeKey);
    if (!existing || Object.keys(entry.fields).length > Object.keys(existing.fields).length) {
      seen.set(entry.citeKey, entry);
    }
  }
  return Array.from(seen.values());
}

/**
 * 将 BibEntry 转回 BibTeX 字符串
 */
export function entryToBibtex(entry: BibEntry): string {
  const fields = Object.entries(entry.fields)
    .map(([k, v]) => `  ${k} = {${v}}`)
    .join(',\n');
  return `@${entry.entryType}{${entry.citeKey},\n${fields}\n}`;
}
