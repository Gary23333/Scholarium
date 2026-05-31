// External Citation Adapters — Semantic Scholar, arXiv, CrossRef
// All use fetch API, no external dependencies

import type { LiteratureSearchResult } from '../types/index.ts';
import { rateLimiter } from '../utils/rate-limiter.ts';

export interface SearchOptions {
  maxResults?: number;
  yearFrom?: number;
  yearTo?: number;
}

export interface SearchResult {
  results: LiteratureSearchResult[];
  errors: Array<{ source: string; message: string; retryable: boolean }>;
}

// ═══════════════════════════════════════════
// Semantic Scholar
// ═══════════════════════════════════════════

export async function searchSemanticScholar(query: string, options: SearchOptions = {}): Promise<SearchResult> {
  const maxResults = options.maxResults ?? 5;
  const results: LiteratureSearchResult[] = [];
  const errors: SearchResult['errors'] = [];

  try {
    const params = new URLSearchParams({
      query: query.substring(0, 200),
      limit: String(maxResults),
      fields: 'title,authors,year,externalIds,abstract,openAccessPdf',
    });
    const resp = await rateLimiter.fetchWithRetry(
      `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60000) },
      'api.semanticscholar.org',
    );

    if (!resp.ok) {
      errors.push({ source: 'semantic_scholar', message: `HTTP ${resp.status}`, retryable: resp.status >= 500 });
      return { results, errors };
    }

    const data = (await resp.json()) as any;
    for (const paper of data.data ?? []) {
      results.push({
        source: 'semantic_scholar',
        title: paper.title ?? '',
        authors: (paper.authors ?? []).map((a: any) => a.name),
        year: paper.year ?? null,
        doi: paper.externalIds?.DOI ?? null,
        abstract: paper.abstract ?? null,
        url: paper.openAccessPdf?.url ?? null,
        sourceId: paper.paperId ?? '',
        confidence: 0.8,
        bibtex: null,
      });
    }
  } catch (err: any) {
    errors.push({ source: 'semantic_scholar', message: err.message, retryable: true });
  }

  return { results, errors };
}

// ═══════════════════════════════════════════
// arXiv
// ═══════════════════════════════════════════

export async function searchArxiv(query: string, options: SearchOptions = {}): Promise<SearchResult> {
  const maxResults = options.maxResults ?? 5;
  const results: LiteratureSearchResult[] = [];
  const errors: SearchResult['errors'] = [];

  try {
    const params = new URLSearchParams({
      search_query: `all:${query.substring(0, 200)}`,
      start: '0',
      max_results: String(maxResults),
    });
    const resp = await rateLimiter.fetchWithRetry(
      `http://export.arxiv.org/api/query?${params}`,
      { signal: AbortSignal.timeout(60000) },
      'export.arxiv.org',
    );

    if (!resp.ok) {
      errors.push({ source: 'arxiv', message: `HTTP ${resp.status}`, retryable: resp.status >= 500 });
      return { results, errors };
    }

    const xml = await resp.text();
    // Simple XML parsing for arXiv entries
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];
      const title = extractXMLField(entry, 'title')?.replace(/\s+/g, ' ').trim() ?? '';
      const abstract = extractXMLField(entry, 'summary')?.replace(/\s+/g, ' ').trim() ?? '';
      const published = extractXMLField(entry, 'published')?.substring(0, 4) ?? '';
      const arxivId = extractXMLField(entry, 'id')?.match(/abs\/(.+)$/)?.[1] ?? '';
      const authors = [...entry.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]);

      results.push({
        source: 'arxiv',
        title,
        authors,
        year: parseInt(published) || null,
        doi: null,
        abstract,
        url: `https://arxiv.org/abs/${arxivId}`,
        sourceId: arxivId,
        confidence: 0.7,
        bibtex: null,
      });
    }
  } catch (err: any) {
    errors.push({ source: 'arxiv', message: err.message, retryable: true });
  }

  return { results, errors };
}

// ═══════════════════════════════════════════
// CrossRef
// ═══════════════════════════════════════════

export async function searchCrossRef(query: string, options: SearchOptions = {}): Promise<SearchResult> {
  const maxResults = options.maxResults ?? 5;
  const results: LiteratureSearchResult[] = [];
  const errors: SearchResult['errors'] = [];

  try {
    const params = new URLSearchParams({
      query: query.substring(0, 200),
      rows: String(maxResults),
      select: 'DOI,title,author,published-print,abstract,URL',
    });
    const resp = await rateLimiter.fetchWithRetry(
      `https://api.crossref.org/works?${params}`,
      {
        headers: { 'User-Agent': 'Scholarium/1.0 (mailto:scholarium@example.com)' },
        signal: AbortSignal.timeout(60000),
      },
      'api.crossref.org',
    );

    if (!resp.ok) {
      errors.push({ source: 'crossref', message: `HTTP ${resp.status}`, retryable: resp.status >= 500 });
      return { results, errors };
    }

    const data = (await resp.json()) as any;
    for (const item of data.message?.items ?? []) {
      const year = item['published-print']?.['date-parts']?.[0]?.[0] ?? null;
      results.push({
        source: 'crossref',
        title: (item.title ?? [''])[0],
        authors: (item.author ?? []).map((a: any) => `${a.given ?? ''} ${a.family ?? ''}`.trim()),
        year,
        doi: item.DOI ?? null,
        abstract: item.abstract ?? null,
        url: item.URL ?? null,
        sourceId: item.DOI ?? '',
        confidence: 0.85,
        bibtex: null,
      });
    }
  } catch (err: any) {
    errors.push({ source: 'crossref', message: err.message, retryable: true });
  }

  return { results, errors };
}

// ═══════════════════════════════════════════
// Combined search (parallel, multi-source)
// ═══════════════════════════════════════════

export async function searchAllSources(query: string, options: SearchOptions = {}): Promise<SearchResult> {
  const [ss, arxiv, cr] = await Promise.allSettled([
    searchSemanticScholar(query, options),
    searchArxiv(query, options),
    searchCrossRef(query, options),
  ]);

  const allResults: LiteratureSearchResult[] = [];
  const allErrors: SearchResult['errors'] = [];

  for (const result of [ss, arxiv, cr]) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value.results);
      allErrors.push(...result.value.errors);
    } else {
      allErrors.push({ source: 'unknown', message: result.reason?.message ?? 'Unknown error', retryable: true });
    }
  }

  // Deduplicate by DOI or title
  const seen = new Set<string>();
  const deduped: LiteratureSearchResult[] = [];
  for (const r of allResults) {
    const key = r.doi ?? r.title.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  // Sort by confidence
  deduped.sort((a, b) => b.confidence - a.confidence);

  return { results: deduped.slice(0, (options.maxResults ?? 5) * 2), errors: allErrors };
}

function extractXMLField(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : null;
}
