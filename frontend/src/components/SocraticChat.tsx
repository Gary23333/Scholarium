interface ChatMessage {
  role: 'mentor' | 'user';
  content: string;
  tags?: string[];
}

interface SocraticChatProps {
  messages: ChatMessage[];
}

export function SocraticChat({ messages }: SocraticChatProps) {
  return (
    <div className="space-y-4">
      {messages.map((msg, idx) => (
        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'text-slate-200'
                : 'text-slate-200'
            }`}
            style={
              msg.role === 'user'
                ? { background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.08)' }
                : { background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }
            }
          >
            {/* Tags */}
            {msg.tags && msg.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {msg.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={
                      tag === 'insight'
                        ? { background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }
                        : tag === 'commitment'
                          ? { background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }
                          : tag === 'divergence'
                            ? { background: 'rgba(236,72,153,0.15)', color: '#f472b6' }
                            : tag === 'challenge'
                              ? { background: 'rgba(239,68,68,0.15)', color: '#f87171' }
                              : { background: 'rgba(100,116,139,0.15)', color: '#94a3b8' }
                    }
                  >
                    {tag === 'insight' ? 'INSIGHT' : tag === 'commitment' ? '承诺' : tag === 'divergence' ? '发散揭示' : tag === 'challenge' ? '挑战' : tag}
                  </span>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="whitespace-pre-wrap">{msg.content}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
