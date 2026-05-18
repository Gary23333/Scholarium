import { useState, useEffect } from 'react';
import {
  FileCheck, Loader2, Users,
} from 'lucide-react';

type ReviewerRole = 'eic' | 'methodology' | 'domain' | 'perspective' | 'da';
type ReviewVerdict = 'accept' | 'minor_revision' | 'major_revision' | 'reject';

interface ReviewFinding {
  id: string;
  dimension: string;
  severity: string;
  description: string;
  suggestion?: string;
}

interface ReviewReport {
  reviewerId: string;
  reviewerRole: ReviewerRole;
  reviewerName: string;
  expertise: string;
  scores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  findings: ReviewFinding[];
  verdict: ReviewVerdict;
  summary: string;
}

interface DevilsAdvocateReport extends ReviewReport {
  strongestCounterArgument: string;
  logicalFallacies: string[];
  alternativeExplanations: string[];
}

interface RevisionItem {
  id: string;
  priority: 'P0' | 'P1' | 'P2';
  source: string;
  consensus: string;
  description: string;
  suggestion: string;
  status: string;
}

interface EditorialDecision {
  decision: ReviewVerdict;
  consensusSummary: string;
  revisionRoadmap: RevisionItem[];
  daCriticalIssues: string[];
  editorNotes: string;
}

interface ReviewSession {
  id: string;
  paperId: string;
  reports: ReviewReport[];
  daReport?: DevilsAdvocateReport;
  editorialDecision?: EditorialDecision;
}

const VERDICT_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  accept: { color: '#22c55e', bg: 'rgba(34,197,94,0.15)', label: 'Accept' },
  minor_revision: { color: '#fbbf24', bg: 'rgba(245,158,11,0.15)', label: 'Minor Revision' },
  major_revision: { color: '#f97316', bg: 'rgba(249,115,22,0.15)', label: 'Major Revision' },
  reject: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', label: 'Reject' },
};

const ROLE_LABELS: Record<ReviewerRole, string> = {
  eic: '主编 (EIC)',
  methodology: 'R1 方法论',
  domain: 'R2 领域',
  perspective: 'R3 视角',
  da: '魔鬼代言人',
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: '#ef4444', P1: '#f97316', P2: '#fbbf24',
};

export function ReviewPage() {
  const [papers, setPapers] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ReviewerRole | 'synthesis'>('synthesis');

  useEffect(() => {
    fetch('/api/papers').then(r => r.json()).then(setPapers).catch(() => {});
  }, []);

  async function handleStartReview() {
    if (!selectedPaperId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/review/${selectedPaperId}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setSession(data.session);
      setActiveTab('synthesis');
    } catch { alert('评审启动失败'); }
    setLoading(false);
  }

  const reports: ReviewReport[] = session?.reports ?? [];
  const daReport = session?.daReport;
  const decision = session?.editorialDecision;
  const allReports = daReport ? [...reports, daReport] : reports;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <FileCheck className="h-5 w-5 text-violet-400" />
        <span className="text-sm font-semibold text-slate-200">同行评审</span>
        {decision && (
          <span className="px-2 py-0.5 rounded text-xs" style={{ background: VERDICT_COLORS[decision.decision].bg, color: VERDICT_COLORS[decision.decision].color }}>
            {VERDICT_COLORS[decision.decision].label}
          </span>
        )}
        <div className="flex-1" />
        {!session && (
          <>
            <select value={selectedPaperId ?? ''} onChange={e => setSelectedPaperId(e.target.value || null)} className="glass-input h-7 px-2 text-xs text-slate-200 w-48">
              <option value="">选择论文...</option>
              {papers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <button onClick={handleStartReview} disabled={!selectedPaperId || loading} className="glass-btn-primary h-7 px-3 text-xs inline-flex items-center gap-1.5">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
              启动评审
            </button>
          </>
        )}
      </div>

      {/* Content */}
      {!session ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <Users className="h-8 w-8 text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">同行评审系统</h2>
            <p className="text-sm text-slate-400 max-w-md">7 代理多视角评审：主编 + 方法论 + 领域 + 视角 + 魔鬼代言人</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Tabs */}
          <div className="w-48 flex-shrink-0 overflow-y-auto p-3 space-y-1" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => setActiveTab('synthesis')} className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${activeTab === 'synthesis' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'}`}>
              编辑综合
            </button>
            {allReports.map(r => (
              <button key={r.reviewerRole} onClick={() => setActiveTab(r.reviewerRole)} className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${activeTab === r.reviewerRole ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'}`}>
                {ROLE_LABELS[r.reviewerRole]}
                <span className="ml-1 text-[10px]" style={{ color: VERDICT_COLORS[r.verdict]?.color }}>{VERDICT_COLORS[r.verdict]?.label}</span>
              </button>
            ))}
          </div>

          {/* Right: Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'synthesis' && decision && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                  <div className="text-sm font-medium text-slate-200 mb-2">编辑决策</div>
                  <div className="text-xs text-slate-400">{decision.consensusSummary}</div>
                  {decision.editorNotes && <div className="text-xs text-slate-300 mt-2">{decision.editorNotes}</div>}
                </div>

                {decision.daCriticalIssues.length > 0 && (
                  <div className="p-4 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <div className="text-sm font-medium text-red-400 mb-2">DA 关键问题</div>
                    {decision.daCriticalIssues.map((issue, i) => (
                      <div key={i} className="text-xs text-slate-300 mb-1">• {issue}</div>
                    ))}
                  </div>
                )}

                <div>
                  <div className="text-sm font-medium text-slate-200 mb-2">修订路线图</div>
                  <div className="space-y-2">
                    {decision.revisionRoadmap.map(item => (
                      <div key={item.id} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${PRIORITY_COLORS[item.priority]}20`, color: PRIORITY_COLORS[item.priority] }}>{item.priority}</span>
                          <span className="text-[10px] text-slate-500">{item.consensus}</span>
                        </div>
                        <div className="text-xs text-slate-200">{item.description}</div>
                        <div className="text-xs text-slate-400 mt-1">→ {item.suggestion}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab !== 'synthesis' && (() => {
              const report = allReports.find(r => r.reviewerRole === activeTab);
              if (!report) return null;
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-medium text-slate-200">{ROLE_LABELS[report.reviewerRole]}</span>
                    <span className="text-xs text-slate-500">{report.expertise}</span>
                    <span className="px-2 py-0.5 rounded text-xs" style={{ background: VERDICT_COLORS[report.verdict].bg, color: VERDICT_COLORS[report.verdict].color }}>{VERDICT_COLORS[report.verdict].label}</span>
                  </div>

                  {report.summary && <div className="text-xs text-slate-300 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>{report.summary}</div>}

                  {report.strengths.length > 0 && (
                    <div>
                      <div className="text-xs text-emerald-400 mb-1">优点</div>
                      {report.strengths.map((s, i) => <div key={i} className="text-xs text-slate-300 mb-1">+ {s}</div>)}
                    </div>
                  )}

                  {report.weaknesses.length > 0 && (
                    <div>
                      <div className="text-xs text-red-400 mb-1">不足</div>
                      {report.weaknesses.map((w, i) => <div key={i} className="text-xs text-slate-300 mb-1">- {w}</div>)}
                    </div>
                  )}

                  {report.findings.length > 0 && (
                    <div>
                      <div className="text-xs text-slate-400 mb-2">具体发现</div>
                      {report.findings.map(f => (
                        <div key={f.id} className="p-2 rounded-lg mb-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] px-1 py-0.5 rounded ${f.severity === 'critical' ? 'bg-red-500/15 text-red-400' : f.severity === 'major' ? 'bg-orange-500/15 text-orange-400' : 'bg-slate-500/15 text-slate-400'}`}>{f.severity}</span>
                          </div>
                          <div className="text-xs text-slate-200">{f.description}</div>
                          {f.suggestion && <div className="text-xs text-slate-400 mt-1">→ {f.suggestion}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* DA-specific sections */}
                  {'strongestCounterArgument' in report && (
                    <div className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                      <div className="text-xs text-red-400 mb-1">最强反论点</div>
                      <div className="text-xs text-slate-300">{(report as DevilsAdvocateReport).strongestCounterArgument}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
