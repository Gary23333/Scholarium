import { Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react';

export interface StageData {
  name: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

export function PipelineVisualizer({ stages, compact }: { stages: StageData[]; compact?: boolean }) {
  if (!stages || stages.length === 0) return null;

  return (
    <div className={`flex items-center gap-0 ${compact ? 'flex-wrap' : ''}`}>
      {stages.map((stage, idx) => {
        const isLast = idx === stages.length - 1;
        const isCompleted = stage.status === 'completed';
        const isRunning = stage.status === 'running';
        const isFailed = stage.status === 'failed';
        const isPending = stage.status === 'pending' || stage.status === 'skipped';
        const isActive = isRunning || isFailed;

        const nodeColor = isCompleted ? '#22c55e'
          : isRunning ? '#3b82f6'
          : isFailed ? '#ef4444'
          : '#1e293b';

        const nodeBg = isCompleted ? 'rgba(34,197,94,0.15)'
          : isRunning ? 'rgba(59,130,246,0.15)'
          : isFailed ? 'rgba(239,68,68,0.15)'
          : 'rgba(30,41,59,0.5)';

        const textColor = isCompleted ? '#22c55e'
          : isRunning ? '#60a5fa'
          : isFailed ? '#ef4444'
          : '#475569';

        const borderColor = isCompleted ? 'rgba(34,197,94,0.3)'
          : isRunning ? 'rgba(59,130,246,0.4)'
          : isFailed ? 'rgba(239,68,68,0.3)'
          : 'rgba(51,65,85,0.5)';

        return (
          <div key={stage.name} className="flex items-center gap-0">
            {/* 节点 */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                compact ? 'mb-1' : ''
              } ${isActive ? 'shadow-lg' : ''}`}
              style={{
                background: nodeBg,
                color: textColor,
                border: `1.5px solid ${borderColor}`,
                boxShadow: isRunning ? `0 0 12px ${nodeColor}20` : 'none',
                opacity: isPending ? 0.6 : 1,
              }}
            >
              {/* 图标 */}
              <span className="flex-shrink-0">
                {isCompleted && <CheckCircle2 className="h-3.5 w-3.5" />}
                {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isFailed && <XCircle className="h-3.5 w-3.5" />}
                {isPending && <Circle className="h-3 w-3" />}
              </span>
              {/* 标签 */}
              {compact ? (
                <span className="truncate max-w-[60px]">{stage.label.replace(/^[^\s]+\s/, '')}</span>
              ) : (
                <span>{stage.label}</span>
              )}
            </div>

            {/* 连接箭头 */}
            {!isLast && (
              <div
                className="flex-shrink-0 mx-1"
                style={{ color: isCompleted ? '#22c55e40' : '#1e293b' }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M6 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
