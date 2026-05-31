import { useState } from 'react';
import { Target, Send, SkipForward } from 'lucide-react';

type SocraticLayer = 1 | 2 | 3 | 4 | 5;

interface CommitmentGateProps {
  question: string;
  layer: SocraticLayer;
  onSubmit: (commitment: string) => void;
  onSkip: () => void;
}

export function CommitmentGate({ question, layer, onSubmit, onSkip }: CommitmentGateProps) {
  const [commitment, setCommitment] = useState('');

  function handleSubmit() {
    if (!commitment.trim()) return;
    onSubmit(commitment.trim());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-lg rounded-xl p-6 space-y-4"
        style={{
          background: 'rgba(15,23,42,0.95)',
          border: '1px solid rgba(139,92,246,0.3)',
          boxShadow: '0 0 40px rgba(139,92,246,0.1)',
        }}
      >
        <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.15)' }}>
            <Target className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <div className="text-sm text-slate-200 font-medium">承诺门控 · 准备进入 Layer {layer + 1}</div>
            <div className="text-xs text-slate-500">在进入下一层之前，请分享你的预测</div>
          </div>
        </div>

        <div className="p-3 rounded-lg text-sm text-slate-300 leading-relaxed" style={{ background: 'rgba(139,92,246,0.06)' }}>
          {question}
        </div>

        <textarea
          value={commitment}
          onChange={e => setCommitment(e.target.value)}
          placeholder="写下你的预测..."
          rows={3}
          className="glass-input w-full px-3 py-2 text-sm resize-none"
          autoFocus
        />

        <div className="flex gap-2 justify-end">
          <button
            onClick={onSkip}
            className="glass-btn-secondary h-8 px-4 text-xs inline-flex items-center gap-1.5"
          >
            <SkipForward className="h-3 w-3" />
            跳过本轮预测
          </button>
          <button
            onClick={handleSubmit}
            disabled={!commitment.trim()}
            className="glass-btn-primary h-8 px-4 text-xs inline-flex items-center gap-1.5"
          >
            <Send className="h-3 w-3" />
            提交预测
          </button>
        </div>
      </div>
    </div>
  );
}
