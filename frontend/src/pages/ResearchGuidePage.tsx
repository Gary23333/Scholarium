import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Compass, Send, Loader2,
  Target, MessageSquare, AlertTriangle,
} from 'lucide-react';
import { LayerProgress } from '../components/LayerProgress';
import { SocraticChat } from '../components/SocraticChat';
import { InsightPanel } from '../components/InsightPanel';
import { CommitmentGate } from '../components/CommitmentGate';

type SocraticLayer = 1 | 2 | 3 | 4 | 5;
type SocraticMode = 'exploratory' | 'goal_oriented';

interface SocraticTurn {
  id: string;
  layer: SocraticLayer;
  role: 'mentor' | 'user';
  content: string;
  tags: string[];
  timestamp: string;
}

interface SocraticSession {
  id: string;
  paperId: string;
  currentLayer: SocraticLayer;
  mode: SocraticMode;
  turns: SocraticTurn[];
  insights: string[];
  commitments: string[];
  status: string;
  turnCount: number;
  maxTurns: number;
}

interface ResearchBrief {
  researchQuestion: string;
  finerScore: Record<string, number>;
  scopeBoundaries: { inScope: string[]; outOfScope: string[] };
  subQuestions: string[];
  summary: string;
}

const LAYER_NAMES: Record<SocraticLayer, string> = {
  1: '问题框架', 2: '方法论反思', 3: '证据推理', 4: '观点评估', 5: '影响后果',
};

export function ResearchGuidePage() {
  const [papers, setPapers] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [session, setSession] = useState<SocraticSession | null>(null);
  const [messages, setMessages] = useState<Array<{ role: 'mentor' | 'user'; content: string; tags?: string[] }>>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<SocraticMode>('goal_oriented');
  const [commitmentGate, setCommitmentGate] = useState<{ question: string; layer: SocraticLayer } | null>(null);
  const [researchBrief, setResearchBrief] = useState<ResearchBrief | null>(null);
  const [healthAlert, setHealthAlert] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load papers
  useEffect(() => {
    fetch('/api/papers').then(r => r.json()).then(setPapers).catch(() => {});
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  async function handleStart() {
    if (!selectedPaperId) return;
    setStarting(true);
    try {
      const res = await fetch('/api/socratic/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId: selectedPaperId, mode }),
      });
      const data = await res.json();
      setSession(data.session);
      setMessages([{ role: 'mentor', content: data.firstMessage }]);
      setResearchBrief(null);
      scrollToBottom();
    } catch { alert('启动失败'); }
    setStarting(false);
  }

  async function handleSend() {
    if (!session || !inputText.trim() || sending) return;
    const msg = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setSending(true);
    scrollToBottom();

    try {
      const res = await fetch(`/api/socratic/${session.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();

      if (data.commitmentGate) {
        setCommitmentGate(data.commitmentGate);
      } else if (data.reply) {
        setMessages(prev => [...prev, { role: 'mentor', content: data.reply, tags: data.newInsights?.length ? ['insight'] : undefined }]);
      }

      if (data.layerChanged) {
        setSession(data.session);
      }
      if (data.healthAlert) {
        setHealthAlert(data.healthAlert.message);
        setTimeout(() => setHealthAlert(null), 5000);
      }
      if (data.sessionComplete && data.researchBrief) {
        setResearchBrief(data.researchBrief);
        setSession(prev => prev ? { ...prev, status: 'completed' } : null);
      } else {
        setSession(data.session);
      }
      scrollToBottom();
    } catch { alert('发送失败'); }
    setSending(false);
  }

  async function handleCommitmentSubmit(commitment: string) {
    if (!session || !commitmentGate) return;
    setCommitmentGate(null);
    setMessages(prev => [...prev, { role: 'user', content: `[预测] ${commitment}`, tags: ['commitment'] }]);
    setSending(true);
    scrollToBottom();

    try {
      const res = await fetch(`/api/socratic/${session.id}/commitment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitment }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'mentor', content: data.reply, tags: ['divergence'] }]);
      }
      setSession(data.session);
      scrollToBottom();
    } catch { alert('提交失败'); }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isActive = session && session.status === 'active';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Compass className="h-5 w-5 text-emerald-400" />
        <span className="text-sm font-semibold text-slate-200">苏格拉底研究引导</span>
        {isActive && (
          <div className="flex items-center gap-3 ml-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              Layer {session.currentLayer}/5 · {LAYER_NAMES[session.currentLayer]}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {session.turnCount}/{session.maxTurns} 轮
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${session.mode === 'exploratory' ? 'text-violet-400 bg-violet-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>
              {session.mode === 'exploratory' ? '探索性' : '目标导向'}
            </span>
          </div>
        )}
        <div className="flex-1" />
        {!isActive && (
          <select value={mode} onChange={e => setMode(e.target.value as SocraticMode)} className="glass-input h-7 px-2 text-xs text-slate-200 w-32">
            <option value="goal_oriented">目标导向</option>
            <option value="exploratory">探索性</option>
          </select>
        )}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Layer Progress */}
        <div className="w-44 flex-shrink-0 overflow-y-auto p-3 space-y-2" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          {!isActive ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 uppercase tracking-wider">选择论文项目</div>
              <select
                value={selectedPaperId ?? ''}
                onChange={e => setSelectedPaperId(e.target.value || null)}
                className="glass-input h-8 px-2 text-xs text-slate-200 w-full"
              >
                <option value="">请选择...</option>
                {papers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <button
                onClick={handleStart}
                disabled={!selectedPaperId || starting}
                className="glass-btn-primary w-full h-8 text-xs inline-flex items-center justify-center gap-1.5"
              >
                {starting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Compass className="h-3 w-3" />}
                开始引导
              </button>
            </div>
          ) : (
            <LayerProgress
              currentLayer={session.currentLayer}
              turns={session.turns}
              insights={session.insights}
            />
          )}
        </div>

        {/* Center: Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!isActive && !session ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Compass className="h-8 w-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-200 mb-2">苏格拉底研究引导</h2>
                <p className="text-sm text-slate-400 max-w-md">
                  通过 5 层苏格拉底式对话，从模糊的研究兴趣逐步明确为具体的研究问题和方法论蓝图。
                </p>
              </div>
              <div className="flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-[10px] font-bold">1</span> 问题框架</span>
                <span className="flex items-center gap-1"><span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-[10px] font-bold">2</span> 方法论反思</span>
                <span className="flex items-center gap-1"><span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-[10px] font-bold">3</span> 证据推理</span>
                <span className="flex items-center gap-1"><span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-[10px] font-bold">4</span> 观点评估</span>
                <span className="flex items-center gap-1"><span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-[10px] font-bold">5</span> 影响后果</span>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <SocraticChat messages={messages} />
                {sending && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> 正在思考...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Area */}
              {isActive && (
                <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex gap-2">
                    <textarea
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="输入你的思考..."
                      rows={2}
                      className="glass-input flex-1 px-3 py-2 text-sm resize-none"
                      disabled={sending}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!inputText.trim() || sending}
                      className="glass-btn-primary px-4 self-end h-10"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Insight Panel */}
        {isActive && (
          <div className="w-72 flex-shrink-0 overflow-y-auto" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
            <InsightPanel
              insights={session.insights}
              commitments={session.commitments}
              researchBrief={researchBrief}
              sessionComplete={session.status === 'completed'}
            />
          </div>
        )}
      </div>

      {/* Health Alert Toast */}
      {healthAlert && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-xs text-amber-300 flex items-center gap-2"
          style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <AlertTriangle className="h-3 w-3" /> {healthAlert}
        </div>
      )}

      {/* Commitment Gate Modal */}
      {commitmentGate && (
        <CommitmentGate
          question={commitmentGate.question}
          layer={commitmentGate.layer}
          onSubmit={handleCommitmentSubmit}
          onSkip={() => {
            setCommitmentGate(null);
            if (session) {
              fetch(`/api/socratic/${session.id}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: '跳过预测', skipCommitment: true }),
              }).then(r => r.json()).then(data => {
                if (data.reply) setMessages(prev => [...prev, { role: 'mentor', content: data.reply }]);
                setSession(data.session);
              });
            }
          }}
        />
      )}
    </div>
  );
}
