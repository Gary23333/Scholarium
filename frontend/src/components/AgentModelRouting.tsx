import { useState } from 'react';
import { Settings2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { useStore } from '../lib/store';
import { AGENT_DEFINITIONS, AGENT_ORDER } from '../lib/constants';

/**
 * Agent 模型路由表 (AgentModelRouting) — 为每个 Agent 绑定 LLM 模型
 *
 * 功能：
 * - 展示 11 个 Agent 的定义（名称、图标、职责描述）
 * - 每个 Agent 可独立选择 Provider + Model + Temperature
 * - 支持不同 Agent 使用不同模型以平衡成本与品质
 *   例：Writer 用高质模型，Auditor 用快速模型
 *
 * 配置项通过 Zustand store 的 updateAgentModel 持久化
 */
export function AgentModelRouting() {
  const {
    providers, agentModelConfigs, defaultProvider, defaultModel,
    updateAgentModel,
  } = useStore();

  const [expanded, setExpanded] = useState(true);

  /** 获取某个 Agent 的当前配置，若无则使用默认值 */
  function getAgentModel(agentName: string) {
    const config = agentModelConfigs.find((c) => c.agentName === agentName);
    return (
      config || { providerId: defaultProvider, model: defaultModel, temperature: 0.2, taskType: 'factual' }
    );
  }

  return (
    <div>
      <button
        className="flex w-full items-center justify-between mb-3"
        onClick={() => setExpanded(!expanded)}
      >
        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5" />
          Agent 星轨驿站
        </h4>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2">
          {/* 提示信息 */}
          <div
            className="rounded-lg p-2.5 text-xs text-slate-500"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}
          >
            <AlertTriangle className="inline h-3.5 w-3.5 mr-1 text-amber-400" />
            为各 Agent 择选不同的星辰，可在成本与品质间寻得平衡。
            譬如：笔耕者用高质星辰，审阅者用疾速星辰。
          </div>

          {/* Agent 路由表 */}
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {/* 表头 */}
            <div
              className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center px-3 py-2 text-xs text-slate-500 uppercase tracking-wider"
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <span></span>
              <span>Agent</span>
              <span className="w-28">源泉</span>
              <span className="w-36">星辰</span>
              <span className="w-16">炽度</span>
            </div>

            {/* 每一行对应一个 Agent */}
            {AGENT_ORDER.map((agentName) => {
              const def = AGENT_DEFINITIONS[agentName];
              if (!def) return null;
              const config = getAgentModel(agentName);
              const agentProvider = providers.find((p) => p.id === config.providerId);

              return (
                <div
                  key={agentName}
                  className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center px-3 py-2 transition-colors hover:bg-white/[0.02]"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <span className="text-base">{def.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-200">{def.label}</div>
                    <div className="text-xs text-slate-500 truncate">{def.description}</div>
                  </div>
                  {/* Provider 选择 */}
                  <select
                    value={config.providerId}
                    onChange={(e) => {
                      const p = providers.find((pp) => pp.id === e.target.value);
                      updateAgentModel(
                        agentName,
                        e.target.value,
                        p?.models[0] || '',
                        config.temperature,
                        config.taskType,
                      );
                    }}
                    className="glass-input w-28 h-7 px-2 text-xs"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {/* Model 选择 */}
                  <select
                    value={config.model}
                    onChange={(e) =>
                      updateAgentModel(
                        agentName,
                        config.providerId,
                        e.target.value,
                        config.temperature,
                        config.taskType,
                      )
                    }
                    className="glass-input w-36 h-7 px-2 text-xs"
                  >
                    {(agentProvider?.models || []).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {/* Temperature 展示 */}
                  <span className="w-16 text-xs text-slate-500 text-center">
                    {config.temperature}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
