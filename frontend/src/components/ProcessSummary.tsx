import { BarChart3, Brain, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

interface CollaborationQuality {
  directionSetting: number;
  intellectualContribution: number;
  qualityGatekeeping: number;
  iterationDiscipline: number;
  delegationEfficiency: number;
  metaLearning: number;
}

interface AISelfReflection {
  sycophancyRisk: 'low' | 'medium' | 'high';
  frameLockIncidents: number;
  convergencePattern: string;
  concessionRate: number;
  ironyNote: string;
}

interface StageLogEntry {
  stage: number;
  name: string;
  duration: number;
  status: string;
}

interface ProcessSummary {
  paperId: string;
  title: string;
  collaborationQuality: CollaborationQuality;
  aiSelfReflection: AISelfReflection;
  stageLog: StageLogEntry[];
  totalDuration: number;
}

interface ProcessSummaryProps {
  summary: ProcessSummary | null;
  loading: boolean;
}

const DIM_LABELS: Record<string, string> = {
  directionSetting: '方向设定',
  intellectualContribution: '知识贡献',
  qualityGatekeeping: '质量把关',
  iterationDiscipline: '迭代纪律',
  delegationEfficiency: '委托效率',
  metaLearning: '元学习',
};

const RISK_COLORS: Record<string, { color: string; bg: string }> = {
  low: { color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  medium: { color: '#fbbf24', bg: 'rgba(245,158,11,0.15)' },
  high: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

function formatDuration(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}秒`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}分钟`;
  return `${(ms / 3600000).toFixed(1)}小时`;
}

export function ProcessSummary({ summary, loading }: ProcessSummaryProps) {
  if (loading) {
    return <div className="text-xs text-slate-500 p-4 text-center">生成中...</div>;
  }

  if (!summary) {
    return (
      <div className="text-xs text-slate-500 p-4 text-center">
        管道完成后自动生成过程总结
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Title */}
      <div className="text-sm font-medium text-slate-200">{summary.title}</div>

      {/* Collaboration Quality */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wider mb-2">
          <BarChart3 className="h-3 w-3 text-emerald-400" />
          协作质量评估 (6 维)
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(summary.collaborationQuality).map(([key, value]) => (
            <div key={key} className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-[10px] text-slate-500">{DIM_LABELS[key] ?? key}</div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${value}%`,
                      background: value >= 70 ? '#22c55e' : value >= 50 ? '#fbbf24' : '#ef4444',
                    }}
                  />
                </div>
                <span className="text-xs font-bold" style={{ color: value >= 70 ? '#22c55e' : value >= 50 ? '#fbbf24' : '#ef4444' }}>
                  {value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Self Reflection */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wider mb-2">
          <Brain className="h-3 w-3 text-violet-400" />
          AI 自我反思
        </div>
        <div className="p-3 rounded-lg space-y-2" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">谐媚风险</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: RISK_COLORS[summary.aiSelfReflection.sycophancyRisk].bg, color: RISK_COLORS[summary.aiSelfReflection.sycophancyRisk].color }}>
              {summary.aiSelfReflection.sycophancyRisk.toUpperCase()}
            </span>
          </div>
          <div className="flex gap-4 text-[10px] text-slate-400">
            <span>妥协率: {(summary.aiSelfReflection.concessionRate * 100).toFixed(0)}%</span>
            <span>框架锁定: {summary.aiSelfReflection.frameLockIncidents} 次</span>
          </div>
          <div className="text-[10px] text-slate-500 italic">{summary.aiSelfReflection.ironyNote}</div>
        </div>
      </div>

      {/* Stage Log */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wider mb-2">
          <Clock className="h-3 w-3 text-slate-400" />
          阶段日志
        </div>
        <div className="space-y-1">
          {summary.stageLog.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] text-slate-400">
              {entry.status === 'completed' ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />
              )}
              <span className="flex-1">Stage {entry.stage}: {entry.name}</span>
              <span className="text-slate-600">{formatDuration(entry.duration)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Total Duration */}
      <div className="text-xs text-slate-500 text-center pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        总耗时: {formatDuration(summary.totalDuration)}
      </div>
    </div>
  );
}
