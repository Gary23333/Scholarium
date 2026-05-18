import { Lightbulb, FileText, Target, ChevronRight } from 'lucide-react';

interface ResearchBrief {
  researchQuestion: string;
  finerScore: Record<string, number>;
  scopeBoundaries: { inScope: string[]; outOfScope: string[] };
  subQuestions: string[];
  summary: string;
}

interface InsightPanelProps {
  insights: string[];
  commitments: string[];
  researchBrief: ResearchBrief | null;
  sessionComplete: boolean;
}

export function InsightPanel({ insights, commitments, researchBrief, sessionComplete }: InsightPanelProps) {
  return (
    <div className="p-3 space-y-4">
      {/* INSIGHT Collection */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wider mb-2">
          <Lightbulb className="h-3 w-3 text-amber-400" />
          INSIGHT 收集 ({insights.length})
        </div>
        {insights.length === 0 ? (
          <div className="text-xs text-slate-600 italic p-2">对话中表达成熟观点时会自动标记</div>
        ) : (
          <div className="space-y-1.5">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className="p-2 rounded-lg text-xs text-slate-300 leading-relaxed"
                style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}
              >
                {insight}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commitments */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wider mb-2">
          <Target className="h-3 w-3 text-violet-400" />
          承诺记录 ({commitments.length})
        </div>
        {commitments.length === 0 ? (
          <div className="text-xs text-slate-600 italic p-2">层转换时会收集你的预测</div>
        ) : (
          <div className="space-y-1.5">
            {commitments.map((c, idx) => (
              <div
                key={idx}
                className="p-2 rounded-lg text-xs text-slate-300 leading-relaxed"
                style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}
              >
                {c}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Research Brief */}
      {researchBrief && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wider mb-2">
            <FileText className="h-3 w-3 text-emerald-400" />
            RQ Brief
          </div>
          <div className="p-3 rounded-lg space-y-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">研究问题</div>
              <div className="text-xs text-slate-200 mt-1">{researchBrief.researchQuestion}</div>
            </div>

            {/* FINER Score */}
            <div>
              <div className="text-[10px] text-slate-500 uppercase mb-1">FINER 评分</div>
              <div className="grid grid-cols-5 gap-1">
                {Object.entries(researchBrief.finerScore).map(([key, value]) => (
                  <div key={key} className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase">{key.slice(0, 3)}</div>
                    <div className="text-xs font-bold text-emerald-400">{value}/5</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sub Questions */}
            {researchBrief.subQuestions.length > 0 && (
              <div>
                <div className="text-[10px] text-slate-500 uppercase mb-1">子问题</div>
                <div className="space-y-1">
                  {researchBrief.subQuestions.map((q, i) => (
                    <div key={i} className="text-xs text-slate-400 flex items-start gap-1">
                      <ChevronRight className="h-3 w-3 flex-shrink-0 mt-0.5 text-emerald-500/50" />
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sessionComplete && (
              <button
                onClick={() => window.location.hash = '#papers'}
                className="glass-btn-primary w-full h-7 text-xs inline-flex items-center justify-center gap-1.5 mt-2"
              >
                <FileText className="h-3 w-3" />
                前往创建论文
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
