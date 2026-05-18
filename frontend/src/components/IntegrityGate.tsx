import { Shield, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

type IntegrityPhase = 'A' | 'B' | 'C' | 'D' | 'E';
type VerificationVerdict = 'verified' | 'not_found' | 'mismatch' | 'suspected_fabrication';

interface VerificationResult {
  target: string;
  verdict: VerificationVerdict;
  details: string;
  confidence: number;
}

interface IntegrityPhaseResult {
  phase: IntegrityPhase;
  checks: VerificationResult[];
  passed: boolean;
  criticalCount: number;
  warningCount: number;
}

interface FailureModeReport {
  modes: Record<string, string>;
  blocked: boolean;
  suspectedModes: string[];
}

interface IntegrityGateResult {
  gateType: string;
  phases: Record<IntegrityPhase, IntegrityPhaseResult>;
  failureModes: FailureModeReport;
  overallPassed: boolean;
  criticalIssues: string[];
  warnings: string[];
  correctionList: string[];
}

const PHASE_LABELS: Record<IntegrityPhase, string> = {
  A: '参考文献验证', B: '引用上下文验证', C: '统计数据验证', D: '原创性验证', E: '声明验证',
};

const VERDICT_LABELS: Record<string, { label: string; color: string }> = {
  verified: { label: '已验证', color: '#22c55e' },
  not_found: { label: '未找到', color: '#ef4444' },
  mismatch: { label: '不匹配', color: '#f97316' },
  suspected_fabrication: { label: '疑似虚构', color: '#ef4444' },
};

interface IntegrityGateProps {
  result: IntegrityGateResult | null;
  loading: boolean;
  onRun: () => void;
}

export function IntegrityGate({ result, loading, onRun }: IntegrityGateProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-orange-400" />
          <span className="text-sm font-medium text-slate-200">完整性门控</span>
          {result && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: result.overallPassed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: result.overallPassed ? '#22c55e' : '#ef4444',
              }}
            >
              {result.overallPassed ? '通过' : '未通过'}
            </span>
          )}
        </div>
        <button
          onClick={onRun}
          disabled={loading}
          className="glass-btn-primary h-7 px-3 text-xs inline-flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
          运行门控
        </button>
      </div>

      {!result && !loading && (
        <div className="text-xs text-slate-500 italic p-4 text-center">
          点击"运行门控"执行 5 阶段完整性验证
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Phase Results */}
          {(Object.entries(result.phases) as [IntegrityPhase, IntegrityPhaseResult][]).map(([phase, data]) => (
            <div
              key={phase}
              className="p-3 rounded-lg"
              style={{
                background: data.passed ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)',
                border: `1px solid ${data.passed ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                {data.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                )}
                <span className="text-xs font-medium text-slate-200">
                  Phase {phase}: {PHASE_LABELS[phase]}
                </span>
                <span className="text-[10px] text-slate-500 ml-auto">
                  {data.criticalCount > 0 && `${data.criticalCount} 关键 `}
                  {data.warningCount > 0 && `${data.warningCount} 警告`}
                </span>
              </div>
              {data.checks.length > 0 && (
                <div className="space-y-1 ml-5">
                  {data.checks.map((check, i) => (
                    <div key={i} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                      <span style={{ color: VERDICT_LABELS[check.verdict]?.color ?? '#94a3b8' }}>
                        {VERDICT_LABELS[check.verdict]?.label ?? check.verdict}
                      </span>
                      <span className="text-slate-500">— {check.details}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Failure Modes */}
          {result.failureModes.blocked && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                <span className="text-xs font-medium text-red-400">AI 研究失败模式阻断</span>
              </div>
              <div className="space-y-1 ml-5">
                {result.failureModes.suspectedModes.map((mode, i) => (
                  <div key={i} className="text-[11px] text-red-300">• {mode}</div>
                ))}
              </div>
            </div>
          )}

          {/* Correction List */}
          {result.correctionList.length > 0 && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
              <div className="text-xs text-amber-400 mb-1">需要修复</div>
              <div className="space-y-1">
                {result.correctionList.map((item, i) => (
                  <div key={i} className="text-[11px] text-slate-300">• {item}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
