import { useState } from 'react';
import {
  Plus, Trash2, Key, Globe, Cpu, ChevronDown, ChevronRight,
  TestTube2, Check, X, Sparkles, Bot, RotateCcw,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { testLLMConnection, fetchProviderModels } from '../lib/api';

/**
 * LLM 配置面板 (LLMConfigPanel) — Provider 管理 + 默认模型选择
 *
 * 功能区块：
 * 1. 默认星辰 — 设置默认 Provider + Model，作为未单独配置的 Agent 的兜底
 * 2. 源泉治理 — 管理各个 LLM Provider（DeepSeek / OpenAI / Anthropic）
 *    - 添加/删除 Provider
 *    - 配置 baseUrl、apiKey、可用模型列表
 *    - 测试连接 (POST /api/llm/test)
 *
 * 状态管理：通过 Zustand useStore 读写 providers/defaultProvider/defaultModel
 */
export function LLMConfigPanel() {
  const {
    providers, defaultProvider, defaultModel,
    setProviders, setDefaultProvider, setDefaultModel,
    addProvider, removeProvider,
  } = useStore();

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: '', baseUrl: '', apiKey: '' });
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [fetchingModelsFor, setFetchingModelsFor] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, 'success' | 'error'>>({});
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({});

  const currentProvider = providers.find((p) => p.id === defaultProvider);

  /** 添加新 Provider */
  function handleAddProvider() {
    if (!newProvider.name || !newProvider.baseUrl) return;
    addProvider(newProvider.name, newProvider.baseUrl, newProvider.apiKey);
    setNewProvider({ name: '', baseUrl: '', apiKey: '' });
    setShowAddProvider(false);
  }

  /** 提交模型列表编辑 (失焦/回车时触发) */
  function commitProviderModels(providerId: string) {
    const draft = modelDrafts[providerId];
    if (draft === undefined) return;
    const models = draft.split(',').map((s) => s.trim()).filter(Boolean);
    setProviders((prev) => prev.map((p) => (p.id === providerId ? { ...p, models } : p)));
    setModelDrafts((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
  }

  /** 测试 Provider 连接 — 使用该 Provider 的首个模型发送测试请求 */
  async function handleTestConnection(providerId: string) {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    setTestingProvider(providerId);
    setTestResult((prev) => ({ ...prev, [providerId]: undefined as never }));
    try {
      const model = provider.models[0] || 'deepseek-chat';
      const data = await testLLMConnection(provider.baseUrl, provider.apiKey, model);
      setTestResult((prev) => ({ ...prev, [providerId]: data.ok ? 'success' : 'error' }));
    } catch {
      setTestResult((prev) => ({ ...prev, [providerId]: 'error' }));
    } finally {
      setTestingProvider(null);
    }
  }

  /** 从 Provider 服务端拉取可用模型列表 */
  async function handleFetchModels(providerId: string) {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    setFetchingModelsFor(providerId);
    try {
      const data = await fetchProviderModels(provider.baseUrl, provider.apiKey);
      if (data.ok && data.models && data.models.length > 0) {
        setModelDrafts((prev) => ({ ...prev, [providerId]: data.models!.join(', ') }));
        commitProviderModelsImmediate(providerId, data.models!);
      } else {
        alert(data.error || '未能获取到模型列表');
      }
    } catch {
      alert('获取模型列表失败，请检查服务地址和 API Key');
    } finally {
      setFetchingModelsFor(null);
    }
  }

  /** 直接用 models 数组提交 (绕过 draft 读取，供 fetch 成功后使用) */
  function commitProviderModelsImmediate(providerId: string, models: string[]) {
    setProviders((prev) => prev.map((p) => (p.id === providerId ? { ...p, models } : p)));
    setModelDrafts((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部标题栏 */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">LLM 星轨配置</h3>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}
        >
          {providers.length} 方源泉
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          {/* 默认星辰设置 */}
          <div className="glass p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-slate-200">默认星辰</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">源泉</label>
                <select
                  value={defaultProvider}
                  onChange={(e) => {
                    setDefaultProvider(e.target.value);
                    const p = providers.find((pp) => pp.id === e.target.value);
                    if (p?.models[0]) setDefaultModel(p.models[0]);
                  }}
                  className="glass-input w-full h-9 px-3 text-sm text-slate-200"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">星辰</label>
                <select
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  className="glass-input w-full h-9 px-3 text-sm text-slate-200"
                >
                  {(currentProvider?.models || []).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Provider 管理区 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                源泉治理
              </h4>
              <button
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                onClick={() => setShowAddProvider(!showAddProvider)}
              >
                <Plus className="h-3 w-3" />
                添入
              </button>
            </div>

            {/* 添加 Provider 表单 */}
            {showAddProvider && (
              <div
                className="mb-3 rounded-lg p-3 space-y-2"
                style={{
                  border: '1px dashed rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <input
                  placeholder="源泉之名"
                  value={newProvider.name}
                  onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  className="glass-input w-full h-8 px-3 text-xs"
                />
                <input
                  placeholder="服务地址"
                  value={newProvider.baseUrl}
                  onChange={(e) => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
                  className="glass-input w-full h-8 px-3 text-xs"
                />
                <input
                  type="password"
                  placeholder="API 密钥"
                  value={newProvider.apiKey}
                  onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
                  className="glass-input w-full h-8 px-3 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddProvider}
                    className="glass-btn-primary flex-1 h-7 text-xs inline-flex items-center justify-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    落笔为定
                  </button>
                  <button
                    onClick={() => setShowAddProvider(false)}
                    className="glass-btn-secondary h-7 px-3 text-xs"
                  >
                    暂罢
                  </button>
                </div>
              </div>
            )}

            {/* Provider 列表 */}
            <div className="space-y-2">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="rounded-lg transition-all duration-200"
                  style={{
                    border:
                      expandedProvider === provider.id
                        ? '1px solid rgba(16,185,129,0.2)'
                        : '1px solid rgba(255,255,255,0.06)',
                    background:
                      expandedProvider === provider.id
                        ? 'rgba(16,185,129,0.04)'
                        : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div
                    className="flex cursor-pointer items-center justify-between px-3 py-2.5"
                    onClick={() =>
                      setExpandedProvider(expandedProvider === provider.id ? null : provider.id)
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-sm font-medium text-slate-200">{provider.name}</span>
                      {provider.id === defaultProvider && (
                        <span
                          className="text-xs px-1.5 py-0 rounded-full"
                          style={{
                            background: 'rgba(16,185,129,0.12)',
                            color: '#34d399',
                            border: '1px solid rgba(16,185,129,0.2)',
                          }}
                        >
                          默认
                        </span>
                      )}
                      {testResult[provider.id] === 'success' && (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      {testResult[provider.id] === 'error' && (
                        <X className="h-3.5 w-3.5 text-red-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        className="text-xs px-1.5 py-0 rounded-full"
                        style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}
                      >
                        {provider.models.length} 模型
                      </span>
                      {expandedProvider === provider.id ? (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      )}
                    </div>
                  </div>

                  {/* 展开的 Provider 详情编辑 */}
                  {expandedProvider === provider.id && (
                    <div
                      className="space-y-2 p-3"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-500 flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          服务地址
                        </label>
                        <input
                          value={provider.baseUrl}
                          onChange={(e) =>
                            setProviders(
                              providers.map((p) =>
                                p.id === provider.id ? { ...p, baseUrl: e.target.value } : p,
                              ),
                            )
                          }
                          className="glass-input w-full h-8 px-3 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-500 flex items-center gap-1">
                          <Key className="h-3 w-3" />
                          API Key
                        </label>
                        <input
                          type="password"
                          value={provider.apiKey}
                          onChange={(e) =>
                            setProviders(
                              providers.map((p) =>
                                p.id === provider.id ? { ...p, apiKey: e.target.value } : p,
                              ),
                            )
                          }
                          className="glass-input w-full h-8 px-3 text-xs font-mono"
                          placeholder="sk-..."
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-500 flex items-center gap-1">
                          <Cpu className="h-3 w-3" />
                          星辰名录（逗号分隔）
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            value={modelDrafts[provider.id] ?? provider.models.join(', ')}
                            onChange={(e) =>
                              setModelDrafts((prev) => ({ ...prev, [provider.id]: e.target.value }))
                            }
                            onBlur={() => commitProviderModels(provider.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            className="glass-input flex-1 h-8 px-3 text-xs"
                            placeholder="gpt-4o, gpt-4o-mini"
                          />
                          <button
                            onClick={() => handleFetchModels(provider.id)}
                            disabled={fetchingModelsFor === provider.id}
                            className="flex items-center justify-center h-8 w-8 rounded-lg text-xs text-slate-400 hover:text-emerald-400 transition-colors flex-shrink-0 disabled:opacity-50"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                            title="从供应方获取星辰名录"
                          >
                            {fetchingModelsFor === provider.id ? (
                              <RotateCcw className="h-3 w-3 animate-spin" />
                            ) : (
                              <Cpu className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleTestConnection(provider.id)}
                          disabled={testingProvider === provider.id}
                          className="glass-btn-secondary flex-1 h-7 text-xs inline-flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          {testingProvider === provider.id ? (
                            <RotateCcw className="h-3 w-3 animate-spin" />
                          ) : (
                            <TestTube2 className="h-3 w-3" />
                          )}
                          试通星轨
                        </button>
                        <button
                          onClick={() => removeProvider(provider.id)}
                          className="flex items-center justify-center h-7 w-7 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                          style={{ background: 'rgba(255,255,255,0.03)' }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
