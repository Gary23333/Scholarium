// Librarian — Citation validation and management
import type { CitationValidationReport, CheckedCitation, FabricatedCitation, ValidationSummary, CitationRecord, CitationSemanticMatch } from '../types/index.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.js';

export interface ValidateOptions {
  localCitations: CitationRecord[];
  enableExternalSearch?: boolean;
  contextWindow?: number;
  router?: LLMRouter;
}

export function extractCiteKeys(draft: string): string[] {
  const keys: string[] = [];
  const regex = /\\(?:cite|citep|citet)\{([^}]+)\}/g;
  let m;
  while ((m = regex.exec(draft)) !== null) {
    for (const k of m[1].split(',').map(s => s.trim())) {
      if (!keys.includes(k)) keys.push(k);
    }
  }
  return keys;
}

export async function validateCitations(draft: string, sectionId: string, options: ValidateOptions): Promise<CitationValidationReport> {
  const citeKeys = extractCiteKeys(draft);
  if (citeKeys.length === 0) {
    return { draftSectionId: sectionId, validatedAt: new Date().toISOString(), citationsChecked: [], fabricatedCitations: [], semanticMismatches: [], summary: { totalCitations: 0, approvedCount: 0, pendingCount: 0, fabricatedCount: 0, semanticMismatchCount: 0, criticalCount: 0 } };
  }

  const localByKey = new Map<string, CitationRecord>();
  for (const c of options.localCitations) localByKey.set(c.citeKey, c);

  const checked: CheckedCitation[] = [];
  const fabricated: FabricatedCitation[] = [];
  const semanticMismatches: CitationSemanticMatch[] = [];
  let fabricatedCount = 0;

  for (const citeKey of citeKeys) {
    // Extract context surrounding this citation
    const citeRegex = new RegExp(`\\\\cite\\{[^}]*${escapeRegex(citeKey)}[^}]*\\}`);
    const citeMatch = citeRegex.exec(draft);
    const ctxStart = Math.max(0, (citeMatch?.index ?? 0) - 100);
    const ctxEnd = Math.min(draft.length, (citeMatch?.index ?? 0) + (citeMatch?.[0]?.length ?? 0) + 100);
    const context = draft.substring(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim();

    const local = localByKey.get(citeKey);
    if (local) {
      if (local.approvalStatus === 'approved') {
        checked.push({ citeKey, context, status: 'verified', localRecordId: local.id, externalMatches: [], semanticMatchPassed: null, semanticSimilarity: null });
      } else if (local.approvalStatus === 'needs_human_review') {
        checked.push({ citeKey, context, status: 'pending_approval', localRecordId: local.id, externalMatches: [], semanticMatchPassed: null, semanticSimilarity: null });
      } else {
        checked.push({ citeKey, context, status: 'fabricated', localRecordId: local.id, externalMatches: [], semanticMatchPassed: null, semanticSimilarity: null });
        fabricated.push({ citeKey, context, severity: 'critical', suggestedAction: 'rewrite_with_approved', diagnosis: 'Citation marked as rejected.' });
        fabricatedCount++;
      }
    } else {
      checked.push({ citeKey, context, status: 'fabricated', localRecordId: null, externalMatches: [], semanticMatchPassed: null, semanticSimilarity: null });
      fabricated.push({ citeKey, context, severity: 'critical', suggestedAction: 'rewrite_with_approved', diagnosis: 'Citation not in local library.' });
      fabricatedCount++;
    }
  }

  // LLM-based semantic validation when router is available
  if (options.router && checked.some(c => c.status === 'verified')) {
    try {
      const verifiedKeys = checked.filter(c => c.status === 'verified').map(c => c.citeKey);
      const systemPrompt = `You are a citation semantic validator. For each citation key and its surrounding context, determine if the cited work likely supports the claim being made.
Output ONLY valid JSON array:
[{"citeKey": "string", "semanticMatchPassed": boolean, "similarity": 0.0-1.0, "suggestion": "string or null"}]

Rules:
- 0.0-0.3: likely unrelated — the citation context doesn't match what this paper is about
- 0.3-0.7: partially related — plausible but unclear connection
- 0.7-1.0: well-matched — the cited work directly supports the claim
- semanticMatchPassed = similarity > 0.4`;
      const userPrompt = `Validate these citations from the section "${sectionId}":

${verifiedKeys.map(k => {
  const c = checked.find(c => c.citeKey === k);
  return `Key: ${k}\nContext: "${c?.context ?? ''}"`;
}).join('\n\n')}

Determine if each citation is semantically appropriate for its context.`;
      const content = await options.router.complete('librarian', systemPrompt, userPrompt, { temperature: 0, maxTokens: 4000, timeout: 60000 });
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const semanticResults = JSON.parse(cleaned);
      if (Array.isArray(semanticResults)) {
        for (const sr of semanticResults) {
          const match = checked.find(c => c.citeKey === sr.citeKey);
          if (match) {
            match.semanticMatchPassed = sr.semanticMatchPassed ?? true;
            match.semanticSimilarity = sr.similarity ?? 1.0;
            if (!match.semanticMatchPassed) {
              semanticMismatches.push({
                citeKey: sr.citeKey,
                citeContext: match.context,
                abstractSnippet: '',
                similarity: sr.similarity ?? 0,
                belowThreshold: true,
                suggestion: sr.suggestion ?? 'Consider verifying this citation context.',
              });
            }
          }
        }
      }
    } catch (e) {
      logger.warn('LLM semantic check failed, continuing with static validation', String(e));
      // LLM semantic check is best-effort; don't fail the whole validation
    }
  }

  const summary: ValidationSummary = {
    totalCitations: citeKeys.length,
    approvedCount: checked.filter(c => c.status === 'verified').length,
    pendingCount: checked.filter(c => c.status === 'pending_approval').length,
    fabricatedCount,
    semanticMismatchCount: semanticMismatches.length,
    criticalCount: fabricatedCount + semanticMismatches.length,
  };

  return { draftSectionId: sectionId, validatedAt: new Date().toISOString(), citationsChecked: checked, fabricatedCitations: fabricated, semanticMismatches, summary };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
