import { CheckCircle2, Loader2 } from 'lucide-react';

type SocraticLayer = 1 | 2 | 3 | 4 | 5;

interface SocraticTurn {
  layer: SocraticLayer;
  role: 'mentor' | 'user';
  tags: string[];
}

const LAYER_NAMES: Record<SocraticLayer, string> = {
  1: '问题框架', 2: '方法论反思', 3: '证据推理', 4: '观点评估', 5: '影响后果',
};

interface LayerProgressProps {
  currentLayer: SocraticLayer;
  turns: SocraticTurn[];
  insights: string[];
}

export function LayerProgress({ currentLayer, turns, insights }: LayerProgressProps) {
  const layers: SocraticLayer[] = [1, 2, 3, 4, 5];

  function getLayerStatus(layer: SocraticLayer): 'completed' | 'active' | 'pending' {
    if (layer < currentLayer) return 'completed';
    if (layer === currentLayer) return 'active';
    return 'pending';
  }

  function getLayerTurnCount(layer: SocraticLayer): number {
    return turns.filter(t => t.layer === layer).length;
  }

  function getLayerInsightCount(layer: SocraticLayer): number {
    return turns.filter(t => t.layer === layer && t.tags.includes('insight')).length;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">对话层级</div>
      {layers.map(layer => {
        const status = getLayerStatus(layer);
        const turnCount = getLayerTurnCount(layer);
        const insightCount = getLayerInsightCount(layer);

        return (
          <div
            key={layer}
            className="relative p-2 rounded-lg transition-all"
            style={{
              background: status === 'active' ? 'rgba(16,185,129,0.08)' : 'transparent',
              border: status === 'active' ? '1px solid rgba(16,185,129,0.2)' : '1px solid transparent',
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                style={{
                  background: status === 'completed' ? 'rgba(34,197,94,0.2)' : status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(30,41,59,0.5)',
                  color: status === 'completed' ? '#22c55e' : status === 'active' ? '#10b981' : '#475569',
                }}
              >
                {status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : status === 'active' ? <Loader2 className="h-3 w-3 animate-spin" /> : layer}
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-medium ${status === 'active' ? 'text-emerald-400' : status === 'completed' ? 'text-slate-300' : 'text-slate-500'}`}>
                  L{layer} · {LAYER_NAMES[layer]}
                </div>
                {turnCount > 0 && (
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    {turnCount}轮{insightCount > 0 && ` · ${insightCount} INSIGHT`}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Total insights */}
      <div className="pt-2 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-4 h-4 rounded bg-amber-500/15 flex items-center justify-center">
            <span className="text-[9px] text-amber-400">{insights.length}</span>
          </span>
          INSIGHT 收集
        </div>
      </div>
    </div>
  );
}
