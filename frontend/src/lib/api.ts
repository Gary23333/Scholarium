import type {
  BackendConfigResponse,
  ModelRoute,
  ModelFallback,
  TestResult,
  SocraticStartResponse,
  SocraticRespondResponse,
  SocraticSummaryResponse,
} from './types';

export async function fetchLLMConfig(): Promise<BackendConfigResponse> {
  const res = await fetch('/api/llm/config');
  if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
  return res.json();
}

export async function saveLLMConfig(body: {
  providers: Record<string, { apiKey?: string; baseUrl?: string; models?: string[] }>;
  models: Record<string, ModelRoute>;
  fallbacks?: Record<string, ModelFallback>;
}): Promise<{
  ok: boolean;
  config?: unknown;
  validation?: { ok: boolean; errors: string[]; warnings: string[] };
  error?: string;
}> {
  const res = await fetch('/api/llm/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok && !data.error) {
    data.error = data.errors?.join(', ') || `HTTP ${res.status}`;
  }
  return data;
}

export async function testLLMConnection(baseUrl: string, apiKey: string, model: string): Promise<TestResult> {
  const res = await fetch('/api/llm/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey, model }),
  });
  return res.json();
}

export async function fetchAvailableModels(): Promise<string[]> {
  const res = await fetch('/api/llm/models');
  const data = await res.json();
  return data.models || [];
}

/** 从 Provider 的服务端 API 拉取可用模型列表 */
export async function fetchProviderModels(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  const res = await fetch('/api/llm/provider-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey }),
  });
  return res.json();
}

/** 翻译文本 */
export async function translateText(
  text: string,
  targetLang: string,
  model: string,
  sourceLang?: string,
): Promise<{ ok: boolean; translated?: string; error?: string }> {
  const res = await fetch('/api/llm/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, targetLang, sourceLang, model }),
  });
  return res.json();
}

/** 从 URL 生成引用格式 */
export async function generateCitationFromUrl(
  url: string,
  model: string,
  format?: string,
): Promise<{ ok: boolean; citation?: string; title?: string; error?: string }> {
  const res = await fetch('/api/citations/from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, model, format }),
  });
  return res.json();
}

/** LLM 生成引用模板 */
export async function generateCitationTemplate(
  userInput: string,
  model: string,
): Promise<{ ok: boolean; template?: CitationTemplate; error?: string }> {
  const res = await fetch('/api/citations/generate-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userInput, model }),
  });
  return res.json();
}

/** 获取引用模板列表 */
export async function fetchCitationTemplates(): Promise<{ templates: CitationTemplate[] }> {
  const res = await fetch('/api/citations/templates');
  return res.json();
}

/** 保存引用模板 */
export async function saveCitationTemplates(
  templates: CitationTemplate[],
): Promise<{ ok: boolean; templates?: CitationTemplate[] }> {
  const res = await fetch('/api/citations/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(templates),
  });
  return res.json();
}

/** 删除引用模板 */
export async function deleteCitationTemplate(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/citations/templates/${id}`, { method: 'DELETE' });
  return res.json();
}

export interface CitationTemplate {
  id: string;
  name: string;
  format: string;
  description: string;
  variables: string[];
  createdAt?: string;
  updatedAt?: string;
}

// ═══════════════════════════════════════════
// Socratic Research Guide
// ═══════════════════════════════════════════

export async function startSocraticSession(paperId: string, mode?: string): Promise<SocraticStartResponse> {
  const res = await fetch('/api/socratic/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paperId, mode }),
  });
  return res.json();
}

export async function sendSocraticMessage(
  sessionId: string,
  message: string,
  skipCommitment?: boolean,
): Promise<SocraticRespondResponse> {
  const res = await fetch(`/api/socratic/${sessionId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, skipCommitment }),
  });
  return res.json();
}

export async function getSocraticSummary(sessionId: string): Promise<SocraticSummaryResponse> {
  const res = await fetch(`/api/socratic/${sessionId}/summary`);
  return res.json();
}

export async function completeSocraticSession(sessionId: string): Promise<SocraticRespondResponse> {
  const res = await fetch(`/api/socratic/${sessionId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

export async function submitSocraticCommitment(
  sessionId: string,
  commitment: string,
): Promise<SocraticRespondResponse> {
  const res = await fetch(`/api/socratic/${sessionId}/commitment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commitment }),
  });
  return res.json();
}

export async function revisePassage(
  paperId: string,
  sectionId: string,
  body: { passage: string; note: string; before?: string; after?: string },
): Promise<{
  revised: string;
  warnings?: string[];
  mockMode?: boolean;
  protectedViolated?: boolean;
  taskId?: string;
  error?: string;
}> {
  const res = await fetch(`/api/papers/${paperId}/sections/${sectionId}/revise-passage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
