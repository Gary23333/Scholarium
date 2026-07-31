import { useState, useCallback, useRef } from 'react';
import { Send, Loader2, Sparkles, Save, CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface EditItem {
  sectionId: string;
  passageHint: string;
  originalText: string;
  change: string;
  reason: string;
}

interface EditPlan {
  analysis: string;
  edits: EditItem[];
  affectedSectionIds: string[];
}

interface EditResult {
  sectionId: string;
  passageHint: string;
  success: boolean;
  error?: string;
}

interface VerifyResult {
  sectionId: string;
  issues: string[];
  passed: boolean;
}

interface SmartEditReport {
  plan: EditPlan;
  results: EditResult[];
  verifyResults: VerifyResult[];
  sectionsModified: number;
  passagesModified: number;
}

type Phase = 'idle' | 'planning' | 'planned' | 'executing' | 'done' | 'error';

interface SmartEditPanelProps {
  paperId: string;
  onApplied?: () => void;
  onClose?: () => void;
}

export function SmartEditPanel({ paperId, onApplied, onClose }: SmartEditPanelProps) {
  const [request, setRequest] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [report, setReport] = useState<SmartEditReport | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const sendRequest = useCallback(
    async (action: 'plan' | 'execute' | 'apply', extraBody?: Record<string, unknown>) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setError('');

      try {
        const res = await fetch(`/api/papers/${paperId}/smart-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, request, ...extraBody }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any).error || '请求失败');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('event: ')) continue;
            const event = line.slice(7).trim();
            const dataLine = lines[lines.indexOf(line) + 1];
            if (!dataLine?.startsWith('data: ')) continue;
            const data = JSON.parse(dataLine.slice(6));
            handleEvent(event, data);
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || '执行失败');
        setPhase('error');
      }
    },
    [paperId, request],
  );

  const handleEvent = useCallback(
    (event: string, data: any) => {
      switch (event) {
        case 'stage':
          setProgress(data.message || '');
          break;
        case 'plan':
          setPlan(data.plan);
          setPhase('planned');
          break;
        case 'progress':
          setProgress(
            data.stage === 'edit-done' ? `已改写第 ${(data.data?.index ?? 0) + 1} 处` : data.message || '执行中…',
          );
          break;
        case 'done':
          if (data.action === 'plan') {
            setPhase('planned');
          } else if (data.action === 'execute') {
            setReport(data.report);
            setPhase('done');
          } else if (data.action === 'apply') {
            const result = data.result as { success: string[]; failed: string[] };
            setProgress(`已落盘 ${result.success.length} 章，失败 ${result.failed.length} 章`);
            setPhase('done');
            onApplied?.();
          }
          break;
        case 'error':
          setError(data.message || '执行失败');
          setPhase('error');
          break;
      }
    },
    [onApplied],
  );

  const runPlan = () => {
    setPhase('planning');
    setPlan(null);
    setReport(null);
    sendRequest('plan');
  };
  const runExecute = () => {
    setPhase('executing');
    setReport(null);
    sendRequest('execute');
  };
  const runApply = () => {
    const sectionIds = report?.plan.affectedSectionIds ?? [];
    if (sectionIds.length === 0) return;
    if (!confirm(`确认将 ${sectionIds.length} 个章节的修改写入正式内容？修改前的版本将自动备份。`)) return;
    sendRequest('apply', { sectionIds });
  };

  const busy = phase === 'planning' || phase === 'executing';

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-slate-400 block mb-1">修改需求</label>
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="例如：全文统一术语「深度学习模型」不要出现「神经网络模型」；修正引言里对基线方法的不准确描述"
          className="glass-input w-full h-24 px-3 py-2 text-sm resize-none"
        />
      </div>

      {/* 三步按钮 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runPlan}
          disabled={busy || !request.trim()}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs text-emerald-300 disabled:opacity-50 transition-all hover:opacity-90"
          style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }}
        >
          {phase === 'planning' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          ① 分析范围
        </button>
        <button
          onClick={runExecute}
          disabled={busy || phase !== 'planned' || !plan?.edits.length}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs text-amber-300 disabled:opacity-40 transition-all hover:opacity-90"
          style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)' }}
        >
          {phase === 'executing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}②
          执行修改
        </button>
        <button
          onClick={runApply}
          disabled={busy || phase !== 'done' || !report?.results.some((r) => r.success)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs text-blue-300 disabled:opacity-40 transition-all hover:opacity-90"
          style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)' }}
        >
          <Save className="h-3.5 w-3.5" />③ 确认应用
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> 关闭
          </button>
        )}
      </div>

      {progress && <div className="text-xs text-slate-400">{progress}</div>}
      {error && (
        <div
          className="text-xs px-3 py-2 rounded"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <span className="text-red-400">执行失败：</span>
          <span className="text-slate-300">{error}</span>
        </div>
      )}

      {/* 修改清单 */}
      {plan && (
        <div className="p-3 rounded max-h-64 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <div className="text-xs text-slate-400 mb-2">
            修改清单（{plan.edits.length} 处 · {plan.affectedSectionIds.length} 章）
            {plan.analysis && `：${plan.analysis}`}
          </div>
          <div className="space-y-2">
            {plan.edits.map((e, i) => (
              <div key={i} className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <div className="text-xs text-slate-300 font-mono">
                  {e.sectionId} — {e.passageHint}
                </div>
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">{e.originalText}</div>
                <div className="text-xs text-amber-300/90 mt-1">改：{e.change}</div>
                {e.reason && <div className="text-xs text-slate-600 mt-0.5">原因：{e.reason}</div>}
              </div>
            ))}
            {plan.edits.length === 0 && <div className="text-xs text-slate-500">未识别到需要修改的段落。</div>}
          </div>
        </div>
      )}

      {/* 执行结果 */}
      {report && (
        <div className="p-3 rounded max-h-64 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <div className="text-xs text-slate-400 mb-2">
            执行结果（改 {report.passagesModified} 处 / {report.sectionsModified} 章）
          </div>
          <div className="space-y-2">
            {report.results.map((r, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded" style={{ background: 'rgba(0,0,0,0.2)' }}>
                {r.success ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="text-xs text-slate-300">
                    {r.sectionId} — {r.passageHint}
                  </div>
                  {r.error && <div className="text-xs text-red-400">{r.error}</div>}
                </div>
              </div>
            ))}
            {report.verifyResults.map((v, i) => (
              <div
                key={`v${i}`}
                className="flex items-start gap-2 p-2 rounded"
                style={{ background: 'rgba(0,0,0,0.2)' }}
              >
                {v.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="text-xs text-slate-300">一致性校验 {v.sectionId}</div>
                  {v.issues.map((iss, j) => (
                    <div key={j} className="text-xs text-amber-300/90">
                      {iss}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
