// Scholarium — Main entry point
// Types
export * from './types/index.ts';

// DB
export { ScholariumDB } from './db/database.ts';

// Bible
export { BibleManager } from './bible/manager.ts';

// LLM
export { LLMClient } from './llm/client.ts';
export type { LLMClientConfig, LLMMessage, LLMResponse } from './llm/client.ts';
export { LLMRouter } from './llm/router.ts';

// Config
export { createDefaultConfig, DEFAULT_AGENT_MODELS, findConfigFile, getAgentRoute, loadConfig, validateConfig, writeDefaultConfig } from './config/index.ts';
export type { ConfigLoadOptions, ConfigValidationResult } from './config/index.ts';

// Agents
export { PlannerAgent } from './agents/planner.ts';
export { ArchitectAgent } from './agents/architect.ts';
export { ComposerAgent } from './agents/composer.ts';
export { WriterAgent } from './agents/writer.ts';
export { ObserverAgent } from './agents/observer.ts';
export { NormalizerAgent } from './agents/normalizer.ts';
export { CartographerAgent } from './agents/cartographer.ts';
export type { MindMapNode, CartographerInput, CartographerOutput } from './agents/cartographer.ts';

// Pipeline
export { PipelineOrchestrator } from './pipeline/orchestrator.ts';
export type { PipelineDeps, WriteSectionOptions } from './pipeline/orchestrator.ts';

// Storage
export { FileSystemStorage, InMemoryStorage } from './storage/fs-storage.ts';
export type { PipelineStorage } from './storage/fs-storage.ts';

// State
export { resolveStateAfterRound, canTransition } from './state/machine.ts';

// Audit
export { runFullAudit, runSubAuditor, masterAudit } from './audit/index.ts';
export { runRealSubAuditor, runRealFullAudit } from './audit/real-audit.ts';

// Anti-AI
export { detect, rewrite, runAntiAI, extractProtectedSpans } from './anti-ai/index.ts';

// Integrity
export { verifyIntegrity } from './integrity/index.ts';

// Librarian
export { validateCitations, extractCiteKeys } from './librarian/index.ts';
export { parseBibFile, deduplicateEntries, entryToBibtex } from './librarian/bib-parser.ts';
export { searchSemanticScholar, searchArxiv, searchCrossRef, searchAllSources } from './librarian/adapters.ts';

// LaTeX
export { assembleFullPaper, createLatexProject, loadProject, writeSectionFile } from './latex/assembler.ts';
export { compile, detectEngine } from './latex/compiler.ts';
export { defaultTemplate, getTemplate, applyTemplateVariables } from './latex/templates.ts';

// MindMap
export { MindMapServer } from './mindmap/server.ts';
export type { MindMapSession, MindMapServerOptions } from './mindmap/server.ts';
