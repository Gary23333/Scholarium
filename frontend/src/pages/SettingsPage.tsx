import { useEffect } from 'react';
import { Save, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { LLMConfigPanel } from '../components/LLMConfigPanel';
import { AgentModelRouting } from '../components/AgentModelRouting';

/**
 * 星轨配置页 (SettingsPage) — LLM 路由与模型配置
 *
 * 核心职责：
 * 1. LLM Provider 管理 — 配置 DeepSeek / OpenAI / Anthropic 等 API 端点
 *    - 添加/删除 Provider
 *    - 填写 baseUrl + apiKey
 *    - 测试连接 (POST /api/llm/test)
 *
 * 2. Agent → Model 路由 — 为每个 Agent 指定使用的模型和参数
 *    - 11 个 Agent（星图师→书阁守）各绑定一个模型
 *    - 参数：model + temperature + taskType (creative/factual/audit/extraction)
 *
 * 3. 配置持久化 — "落印"保存到 scholarium.config.json 和后端运行时
 *    - 前端 Zustand store (localStorage 缓存)
 *    - 后端 POST /api/llm/config 写入配置文件
 *
 * 数据流：
 * SettingsPage → useStore (Zustand) → loadFromBackend/saveToBackend → /api/llm/config
 */
export function SettingsPage() {
  const { configLoaded, loadFromBackend, saveToBackend, saveStatus, saveError } = useStore();

  useEffect(() => {
    if (!configLoaded) {
      loadFromBackend();
    }
  }, [configLoaded, loadFromBackend]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">星轨配置</h1>
          <p className="text-sm text-slate-500 mt-1">LLM 模型与 Agent 路由</p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'success' && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已落印
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <XCircle className="h-3.5 w-3.5" />
              {saveError}
            </span>
          )}
          <button
            onClick={saveToBackend}
            disabled={saveStatus === 'saving'}
            className="glass-btn-primary h-9 px-4 inline-flex items-center gap-2 text-sm"
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            落印配置
          </button>
        </div>
      </div>

      {/* LLM Provider 配置面板 */}
      <div className="glass overflow-hidden" style={{ height: 600 }}>
        <LLMConfigPanel />
      </div>

      {/* Agent → Model 路由配置表 */}
      <div className="glass p-4">
        <AgentModelRouting />
      </div>
    </div>
  );
}
