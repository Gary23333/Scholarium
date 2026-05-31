import { useState, useEffect } from 'react';
import {
  Search, Loader2, ExternalLink, BookOpen, Languages,
  Quote, Link, Plus, Trash2, Edit3, Save, ChevronLeft, ChevronRight,
  FileText, Copy, Check, Sparkles, Globe,
} from 'lucide-react';
import { translateText, generateCitationFromUrl, generateCitationTemplate, fetchCitationTemplates, saveCitationTemplates, deleteCitationTemplate, type CitationTemplate } from '../lib/api';

interface SearchResult {
  source: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  abstract: string | null;
  url: string | null;
  bibtex: string | null;
  _translatedTitle?: string;
}

const FORMAT_LABELS: Record<string, string> = {
  bibtex: 'BibTeX',
  apa: 'APA 7th',
  mla: 'MLA 9th',
  chicago: 'Chicago',
  gb7714: 'GB/T 7714',
};

export function CitationsPage() {
  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // BibTeX parse
  const [bibInput, setBibInput] = useState('');
  const [parsedBibs, setParsedBibs] = useState<Array<{ key: string; entry: string }>>([]);

  // Translation
  const [translatingTitle, setTranslatingTitle] = useState<string | null>(null);
  const [translateModel, setTranslateModel] = useState('deepseek-v4-flash');

  // Citation generation — per-result map to avoid showing one citation on all results
  const [generatingCite, setGeneratingCite] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState('bibtex');
  const [generatedCitations, setGeneratedCitations] = useState<Record<string, string>>({});

  // URL to citation
  const [urlInput, setUrlInput] = useState('');
  const [urlProcessing, setUrlProcessing] = useState(false);
  const [urlResult, setUrlResult] = useState<{ citation?: string; title?: string; error?: string } | null>(null);

  // Template management
  const [templates, setTemplates] = useState<CitationTemplate[]>([]);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [newTemplateInput, setNewTemplateInput] = useState('');
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editFormat, setEditFormat] = useState('');
  const [showTemplateForm, setShowTemplateForm] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTemplateConfirm, setDeleteTemplateConfirm] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    try {
      const data = await fetchCitationTemplates();
      setTemplates(data.templates || []);
    } catch {}
  }

  async function handleSearch(p?: number) {
    if (!query.trim()) return;
    const targetPage = p ?? 1;
    setSearching(true);
    setPage(targetPage);
    try {
      const res = await fetch('/api/citations/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, page: targetPage, pageSize: 10 }),
      });
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {}
    setHasSearched(true);
    setSearching(false);
  }

  async function handleTranslate(result: SearchResult, index: number) {
    if (!result.title) return;
    setTranslatingTitle(`${index}`);
    try {
      const data = await translateText(result.title, '中文', translateModel);
      if (data.ok && data.translated) {
        const updated = [...results];
        updated[index] = { ...updated[index], _translatedTitle: data.translated };
        setResults(updated);
      }
    } catch {}
    setTranslatingTitle(null);
  }

  async function handleGenerateCitation(result: SearchResult) {
    const key = result.doi || result.title || result.url || '';
    setGeneratingCite(key);
    try {
      const format = getActiveFormat();
      const meta = `title: ${result.title}\nauthors: ${result.authors?.join(', ')}\nyear: ${result.year}\ndoi: ${result.doi}\nurl: ${result.url}\nsource: ${result.source}`;
      const res = await fetch('/api/llm/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Generate in this format:\n${format}\n\nMetadata:\n${meta}`,
          targetLang: 'citation',
          model: translateModel,
          sourceLang: 'metadata',
        }),
      });
      const data = await res.json();
      if (data.ok && data.translated) {
        setGeneratedCitations(prev => ({ ...prev, [key]: data.translated }));
      } else {
        // Fallback: generate basic citation
        const fallback = `${result.authors?.join(', ')} (${result.year || 'n.d.'}). ${result.title}.${result.doi ? ` https://doi.org/${result.doi}` : ''}${result.url ? ` ${result.url}` : ''}`;
        setGeneratedCitations(prev => ({ ...prev, [key]: fallback }));
      }
    } catch {
      setGeneratedCitations(prev => ({ ...prev, [key]: `${result.authors?.join(', ')} (${result.year || 'n.d.'}). ${result.title}.` }));
    }
    setGeneratingCite(null);
  }

  async function handleUrlToCitation() {
    if (!urlInput.trim()) return;
    setUrlProcessing(true);
    setUrlResult(null);
    try {
      const format = getActiveFormat();
      const data = await generateCitationFromUrl(urlInput, translateModel, format);
      if (data.ok) {
        setUrlResult({ citation: data.citation, title: data.title });
      } else {
        setUrlResult({ error: data.error || 'Failed to generate citation', citation: data.citation });
      }
    } catch (e: any) {
      setUrlResult({ error: e?.message || 'Failed to process URL' });
    }
    setUrlProcessing(false);
  }

  async function handleGenerateTemplate() {
    if (!newTemplateInput.trim()) return;
    setGeneratingTemplate(true);
    setTemplateError(null);
    try {
      const data = await generateCitationTemplate(newTemplateInput, translateModel);
      if (data.ok && data.template) {
        setTemplates(prev => [...prev, data.template!]);
        await saveCitationTemplates([...templates, data.template]);
        setNewTemplateInput('');
        setTemplateError(null);
      } else {
        setTemplateError(data.error || '模板生成失败，请检查网络或 API 配置');
      }
    } catch (e: any) {
      setTemplateError(e?.message || '网络请求失败，请稍后重试');
    }
    setGeneratingTemplate(false);
  }

  async function handleDeleteTemplate(id: string) {
    await deleteCitationTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    setDeleteTemplateConfirm(null);
  }

  async function handleSaveTemplateEdit(template: CitationTemplate) {
    const updated = templates.map(t => t.id === template.id ? { ...template, format: editFormat } : t);
    setTemplates(updated);
    await saveCitationTemplates(updated);
    setEditingTemplate(null);
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function applyTemplate(result: SearchResult, template: CitationTemplate): string {
    let format = template.format;
    const authors = result.authors?.join(', ') || 'Unknown';
    const vars: Record<string, string> = {
      // Singular & plural aliases for common fields
      author: authors,
      authors: authors,
      title: result.title || 'Untitled',
      year: String(result.year || 'n.d.'),
      doi: result.doi || '',
      url: result.url || '',
      journal: result.source || '',
      source: result.source || '',
      abstract: result.abstract?.substring(0, 200) || '',
      // GB/T 7714 & other common template variables
      publicationPlace: '',
      publisher: '',
      edition: '',
      number: '',
      volume: '',
      pages: '',
    };
    for (const [key, val] of Object.entries(vars)) {
      format = format.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    }
    // Clean up any remaining unreplaced placeholders
    format = format.replace(/\{\{\w+\}\}/g, '[?]');
    return format;
  }

  /** Resolve the active format: if a custom template is selected, return its format string; otherwise return the format key */
  function getActiveFormat(): string {
    if (selectedFormat.startsWith('template:')) {
      const templateId = selectedFormat.replace('template:', '');
      const template = templates.find(t => t.id === templateId);
      return template?.format || selectedFormat;
    }
    return selectedFormat;
  }

  /** Get the human-readable display name for the currently selected format */
  function getActiveFormatLabel(): string {
    if (selectedFormat.startsWith('template:')) {
      const templateId = selectedFormat.replace('template:', '');
      const template = templates.find(t => t.id === templateId);
      return template ? `模板: ${template.name}` : selectedFormat;
    }
    return FORMAT_LABELS[selectedFormat] || selectedFormat;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">引文管理</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {templates.length} 个模板
          </span>
          <button
            onClick={() => setShowTemplatePanel(!showTemplatePanel)}
            className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1"
          >
            <BookOpen className="h-3.5 w-3.5" />
            引用模板
          </button>
        </div>
      </div>

      {/* ===== 常驻工具栏：模型选择 + 引用格式 + URL 转引用 ===== */}
      <div className="glass p-3 space-y-3">
        {/* 第一行：模型与格式选择 */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <Globe className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-shrink-0">翻译/引用模型：</span>
          <select
            value={translateModel}
            onChange={(e) => setTranslateModel(e.target.value)}
            className="glass-input h-7 px-2 text-xs text-slate-200"
          >
            <option value="deepseek-v4-flash">deepseek-v4-flash (快速)</option>
            <option value="deepseek-v4-pro">deepseek-v4-pro (精准)</option>
          </select>
          <span className="text-slate-600">|</span>
          <span className="flex-shrink-0">引用格式：</span>
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="glass-input h-7 px-2 text-xs text-slate-200 max-w-[220px]"
          >
            <optgroup label="内置格式">
              {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </optgroup>
            {templates.length > 0 && (
              <optgroup label="自定义模板">
                {templates.map(t => (
                  <option key={t.id} value={`template:${t.id}`}>{t.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* 第二行：URL 转引用 — 常驻输入框 */}
        <div className="flex gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
            <Link className="h-3.5 w-3.5" />
            <span>URL 转引用：</span>
          </div>
          <input
            placeholder="粘贴网页链接，回车即生成引用..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlToCitation()}
            className="glass-input flex-1 h-8 px-3 text-sm"
          />
          <button
            onClick={handleUrlToCitation}
            disabled={urlProcessing}
            className="glass-btn-primary h-8 px-3 inline-flex items-center gap-1.5 text-xs flex-shrink-0"
          >
            {urlProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Quote className="h-3.5 w-3.5" />}
            生成引用
          </button>
        </div>

        {/* URL 引用结果 */}
        {urlResult && (
          <div className="p-2.5 rounded-lg text-xs font-mono" style={urlResult.error
            ? { background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }
            : { background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.15)' }
          }>
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs uppercase tracking-wider ${urlResult.error ? 'text-red-400' : 'text-slate-500'}`}>
                {urlResult.error ? '生成失败' : (urlResult.title || '引用结果')}
              </span>
              {urlResult.citation && (
                <button
                  onClick={() => copyToClipboard(urlResult.citation!, 'url-cite')}
                  className="text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  {copiedId === 'url-cite' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            {urlResult.error ? (
              <span className="text-red-400">{urlResult.error}</span>
            ) : (
              urlResult.citation
            )}
          </div>
        )}
      </div>

      {/* ===== 文献检索区 (带分页) ===== */}
      <div className="glass p-4 space-y-3">
        <h2 className="text-sm font-medium flex items-center gap-2 text-slate-300">
          <Search className="h-4 w-4 text-slate-500" />
          文献检索
        </h2>
        <div className="flex gap-3">
          <input
            placeholder="搜索关键词、标题、DOI..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
            className="glass-input flex-1 h-9 px-3 text-sm"
          />
          <button
            onClick={() => handleSearch(1)}
            disabled={searching}
            className="glass-btn-primary h-9 px-4 inline-flex items-center gap-2 text-sm"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            搜索
          </button>
        </div>

        {results.length > 0 && (
          <>
            <div className="text-xs text-slate-500">共 {total} 条结果</div>
            <div className="space-y-2 mt-3">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg transition-colors hover:bg-white/[0.03]"
                  style={{ border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-200 break-words">
                            {r._translatedTitle || r.title}
                          </div>
                          {r._translatedTitle && (
                            <div className="text-xs text-slate-500 mt-0.5 line-through opacity-50">
                              {r.title}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {r.authors?.join(', ')} {r.year && `(${r.year})`}
                      </div>
                      {r.abstract && (
                        <div className="text-xs text-slate-500 mt-2 line-clamp-2">{r.abstract}</div>
                      )}
                      {/* Generated citation display — per-result, keyed by doi/title/url */}
                      {(() => {
                        const citeKey = r.doi || r.title || r.url || '';
                        const citeText = generatedCitations[citeKey];
                        if (!citeText || generatingCite !== null) return null;
                        return (
                          <div className="mt-2 p-2 rounded text-xs font-mono text-emerald-300 break-all"
                            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-slate-500 uppercase tracking-wider">引用格式</span>
                              <button onClick={() => copyToClipboard(citeText, `cite-${i}`)} className="text-slate-400 hover:text-emerald-400 transition-colors">
                                {copiedId === `cite-${i}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                            {citeText}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(100,116,139,0.2)', color: '#94a3b8' }}>
                        {r.source}
                      </span>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors" title="打开原文">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {/* Translate button */}
                      <button
                        onClick={() => handleTranslate(r, i)}
                        disabled={translatingTitle === `${i}`}
                        className="text-slate-500 hover:text-emerald-400 transition-colors disabled:opacity-40"
                        title="翻译标题为中文"
                      >
                        {translatingTitle === `${i}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
                      </button>
                      {/* Generate citation button */}
                      <button
                        onClick={() => handleGenerateCitation(r)}
                        disabled={generatingCite !== null}
                        className="text-slate-500 hover:text-amber-400 transition-colors disabled:opacity-40"
                        title={`生成 ${getActiveFormatLabel()} 引用`}
                      >
                        <Quote className="h-3.5 w-3.5" />
                      </button>
                      {/* Template shortcuts */}
                      {templates.length > 0 && (
                        <div className="relative group">
                          <button className="text-slate-500 hover:text-violet-400 transition-colors" title="应用模板生成引用">
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                          <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10 min-w-[200px]">
                            <div className="p-1 rounded-lg" style={{ background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
                              {templates.map(t => (
                                <button
                                  key={t.id}
                                  onClick={() => {
                                    const citation = applyTemplate(r, t);
                                    const citeKey = r.doi || r.title || r.url || '';
                                    setGeneratedCitations(prev => ({ ...prev, [citeKey]: citation }));
                                  }}
                                  className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-white/[0.05] rounded transition-colors"
                                >
                                  {t.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {r.bibtex && (
                        <button
                          onClick={() => copyToClipboard(r.bibtex!, `bib-${i}`)}
                          className="text-xs px-1.5 py-0.5 rounded border border-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                          title="复制 BibTeX"
                        >
                          {copiedId === `bib-${i}` ? <Check className="h-3 w-3" /> : 'BibTeX'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-3">
                <button
                  onClick={() => handleSearch(page - 1)}
                  disabled={page <= 1}
                  className="glass-btn-secondary h-7 w-7 inline-flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => handleSearch(p)}
                    className={`h-7 min-w-[28px] px-1.5 text-[11px] rounded-lg transition-all ${
                      p === page
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'text-slate-500 hover:text-slate-300 border border-transparent'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => handleSearch(page + 1)}
                  disabled={page >= totalPages}
                  className="glass-btn-secondary h-7 w-7 inline-flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
        {hasSearched && !searching && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Search className="h-8 w-8 text-slate-700" />
            <span className="text-sm text-slate-500">暂无搜索结果</span>
            <span className="text-xs text-slate-600">尝试更换关键词</span>
          </div>
        )}
      </div>

      {/* ===== BibTeX 解析区 ===== */}
      <div className="glass p-4 space-y-3">
        <h2 className="text-sm font-medium flex items-center gap-2 text-slate-300">
          <BookOpen className="h-4 w-4 text-slate-500" />
          BibTeX 解析
        </h2>
        <textarea
          placeholder="粘贴 BibTeX 内容..."
          value={bibInput}
          onChange={(e) => setBibInput(e.target.value)}
          rows={4}
          className="glass-input w-full px-3 py-2 text-sm font-mono resize-y"
        />
        <button
          onClick={async () => {
            if (!bibInput.trim()) return;
            try {
              const res = await fetch('/api/citations/parse-bib', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: bibInput }),
              });
              const data = await res.json();
              setParsedBibs(data.entries || []);
            } catch {}
          }}
          className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center"
        >
          解析
        </button>
        {parsedBibs.length > 0 && (
          <div className="space-y-1 mt-2">
            {parsedBibs.map((b, i) => (
              <div key={i} className="text-xs p-2 rounded font-mono flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="text-emerald-400">{b.key}</span>
                <button onClick={() => copyToClipboard(b.entry, `parsed-${i}`)} className="text-slate-500 hover:text-emerald-400 transition-colors">
                  {copiedId === `parsed-${i}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== 引用模板管理面板 ===== */}
      {showTemplatePanel && (
        <div className="glass p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium flex items-center gap-2 text-slate-300">
              <BookOpen className="h-4 w-4 text-slate-500" />
              引用模板管理
            </h2>
            <button
              onClick={() => setShowTemplateForm(!showTemplateForm)}
              className="glass-btn-secondary h-7 px-2.5 text-xs inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              新增模板
            </button>
          </div>

          {/* Template creation: user input → LLM generate → editable */}
          {showTemplateForm && (
            <div className="p-3 rounded-lg space-y-2" style={{ border: '1px dashed rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.03)' }}>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>描述你需要的引用格式，AI 将为你生成模板</span>
              </div>
              <textarea
                placeholder="例如：我需要一个中文论文引用格式，包含作者、标题、期刊名、年份、卷期和页码，使用 GB/T 7714 格式..."
                value={newTemplateInput}
                onChange={(e) => setNewTemplateInput(e.target.value)}
                rows={3}
                className="glass-input w-full px-3 py-2 text-sm resize-y"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">生成模型：</span>
                <select
                  value={translateModel}
                  onChange={(e) => setTranslateModel(e.target.value)}
                  className="glass-input h-7 px-2 text-xs text-slate-200"
                >
                  <option value="deepseek-v4-flash">deepseek-v4-flash (快速)</option>
                  <option value="deepseek-v4-pro">deepseek-v4-pro (精准)</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateTemplate}
                  disabled={generatingTemplate || !newTemplateInput.trim()}
                  className="glass-btn-primary h-8 px-3 text-xs inline-flex items-center gap-1 disabled:opacity-50"
                >
                  {generatingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  AI 生成模板
                </button>
                <button
                  onClick={() => { setShowTemplateForm(false); setTemplateError(null); }}
                  className="glass-btn-secondary h-8 px-3 text-xs"
                >
                  取消
                </button>
              </div>
              {templateError && (
                <div className="p-2 rounded text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  {templateError}
                </div>
              )}
            </div>
          )}

          {/* Template list */}
          {templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <BookOpen className="h-8 w-8 text-slate-700" />
              <span className="text-xs text-slate-500">暂无引用模板</span>
              <span className="text-xs text-slate-600">点击"新增模板"让 AI 生成一个</span>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.id} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200">{t.name}</span>
                        <span className="text-xs text-slate-500">{t.variables?.length || 0} 个变量</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{t.description}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingTemplate(editingTemplate === t.id ? null : t.id); setEditFormat(t.format); }}
                        className="text-slate-500 hover:text-emerald-400 transition-colors"
                        title="编辑模板"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { copyToClipboard(t.format, `tpl-${t.id}`); }}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        title="复制格式"
                      >
                        {copiedId === `tpl-${t.id}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => setDeleteTemplateConfirm(t.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                        title="删除模板"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Format preview */}
                  <div className="mt-2 p-2 rounded text-xs font-mono text-slate-400 break-all whitespace-pre-wrap max-h-16 overflow-y-auto"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>
                    {t.format}
                  </div>

                  {/* Variables list */}
                  {t.variables && t.variables.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {t.variables.map(v => (
                        <span key={v} className="text-[9px] px-1 py-0.5 rounded-full text-amber-400/70" style={{ background: 'rgba(245,158,11,0.08)' }}>
                          {'{{'}{v}{'}}'}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Inline editor */}
                  {editingTemplate === t.id && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editFormat}
                        onChange={(e) => setEditFormat(e.target.value)}
                        rows={4}
                        className="glass-input w-full px-3 py-2 text-xs font-mono resize-y"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveTemplateEdit(t)}
                          className="glass-btn-primary h-7 px-3 text-xs inline-flex items-center gap-1"
                        >
                          <Save className="h-3 w-3" />
                          保存
                        </button>
                        <button
                          onClick={() => setEditingTemplate(null)}
                          className="glass-btn-secondary h-7 px-3 text-xs"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {deleteTemplateConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDeleteTemplateConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(239,68,68,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)' }}>
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <div className="text-sm text-slate-200 font-medium">确认删除</div>
                <div className="text-xs text-slate-400 mt-1">
                  将永久删除模板「{templates.find(t => t.id === deleteTemplateConfirm)?.name}」，此操作不可撤销。
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTemplateConfirm(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={() => handleDeleteTemplate(deleteTemplateConfirm)}
                className="h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9))' }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
