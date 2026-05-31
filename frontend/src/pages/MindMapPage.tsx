import { useState, useEffect } from 'react';
import { Plus, Play, CheckCircle2, Download, Loader2, Trash2, FileText, Map } from 'lucide-react';

interface MindMapNode {
  id: string;
  label: string;
  round: number;
  checked?: boolean;
}

interface Session {
  id: string;
  topic: string;
  round: number;
  nodes: number;
  status: string;
}

/**
 * 思维星图页 (MindMapPage) — Cartographer Agent 的交互界面
 *
 * 工作流（三阶段发散）：
 * 1. 创建星图：输入研究主题 + 关键词 → 调用 POST /api/mindmap/create
 * 2. 三轮发散：
 *    第1轮「广度探索」— 生成宏观研究方向分支
 *    第2轮「深度挖掘」— 对勾选的节点展开子话题
 *    第3轮「空白与创新」— 识别研究空白与创新机会
 * 3. 导出焦点：将勾选节点汇总为研究焦点 JSON，供 Planner 使用
 *
 * 交互要点：
 * - 勾选节点决定下一轮发散的方向
 * - SSE 实时推送发散过程中的新节点（后端通过 /api/mindmap/sse/:sessionId）
 */
export function MindMapPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [targetJournal, setTargetJournal] = useState('');
  const [diverging, setDiverging] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creatingPaper, setCreatingPaper] = useState(false);

  async function loadSessions() {
    try {
      const res = await fetch('/api/mindmap/sessions');
      const data = await res.json();
      setSessions(data);
    } catch (e) {
      console.error('Failed to load mindmap sessions:', e);
    }
  }

  // 组件挂载时自动加载已有会话
  useEffect(() => {
    loadSessions();
  }, []);

  /** 步骤1：创建思维导图会话 */
  async function handleCreate() {
    if (!topic.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/mindmap/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          researchTopic: topic,
          keywords: keywords.split(',').map((s) => s.trim()).filter(Boolean),
          targetJournal: targetJournal.trim() || undefined,
        }),
      });
      const data = await res.json();
      const sid = data.sessionId ?? data.session?.id ?? null;
      if (sid) {
        setCurrentSession(sid);
        setNodes([]);
        setCurrentRound(0);
      }
      await loadSessions();
    } catch (e) {
      console.error('Failed to create mindmap session:', e);
    }
    setCreating(false);
  }

  /** 步骤2：执行一轮发散 (调用 Cartographer Agent) */
  async function handleDiverge() {
    if (!currentSession) return;
    setDiverging(true);
    try {
      const res = await fetch('/api/mindmap/diverge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          round: currentRound + 1,
          selectedNodeIds: nodes.filter((n) => n.checked).map((n) => n.id),
        }),
      });
      const data = await res.json();
      setNodes((prev) => [...prev, ...data.nodes]);
      setCurrentRound(data.round);
    } catch {}
    setDiverging(false);
  }

  /** 勾选/取消节点 — 决定下一轮发散的方向 */
  function toggleNode(id: string) {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, checked: !n.checked } : n)),
    );
  }

  /** 步骤3：导出确认的研究焦点 (JSON 文件下载) */
  async function handleExport() {
    if (!currentSession) return;
    const res = await fetch('/api/mindmap/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSession }),
    });
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindmap-${currentSession}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadSessionDetails(id: string) {
    try {
      const res = await fetch(`/api/mindmap/sessions/${id}`);
      const data = await res.json();
      setNodes(data.nodes || []);
      setCurrentRound(data.currentRound ?? data.round ?? 0);
    } catch (e) {
      console.error('Failed to load session details:', e);
      setNodes([]);
    }
  }

  async function handleDeleteSession(id: string) {
    try {
      await fetch(`/api/mindmap/sessions/${id}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter(s => s.id !== id));
      if (currentSession === id) { setCurrentSession(null); setNodes([]); setCurrentRound(0); }
    } catch {}
    setConfirmDelete(null);
  }

  async function handleCreatePaper() {
    if (!currentSession) return;
    setCreatingPaper(true);
    try {
      const exportRes = await fetch('/api/mindmap/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession }),
      });
      const exportData = await exportRes.json();
      const paperRes = await fetch('/api/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: exportData.researchTopic || exportData.topic || sessions.find(s => s.id === currentSession)?.topic || '未命名论文',
          researchTopic: exportData.researchTopic || exportData.topic || sessions.find(s => s.id === currentSession)?.topic,
          contributionGaps: exportData.contributionGaps || exportData.gaps || [],
        }),
      });
      const paperData = await paperRes.json();
      if (paperData.paperId) {
        alert(`论文已创建，ID: ${paperData.paperId}`);
      }
    } catch (e) {
      console.error('Failed to create paper from mindmap:', e);
    }
    setCreatingPaper(false);
  }

  const roundLabels = ['', '广度探索', '深度挖掘', '空白与创新'];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">思维星图</h1>

      {/* 创建星图面板 — 液态玻璃 */}
      <div className="glass p-4 space-y-3">
        <h2 className="text-sm font-medium text-slate-300">创建星图</h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="研究主题"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="glass-input h-9 px-3 text-sm w-full"
          />
          <input
            placeholder="关键词（逗号分隔）"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="glass-input h-9 px-3 text-sm w-full"
          />
        </div>
        <input
          placeholder="目标期刊（可选）"
          value={targetJournal}
          onChange={(e) => setTargetJournal(e.target.value)}
          className="glass-input h-9 px-3 text-sm w-full"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !topic.trim()}
          className="glass-btn-primary h-9 px-4 inline-flex items-center gap-2 text-sm"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          创建
        </button>
      </div>

      {/* 已有星图列表 */}
      <div className="glass p-4">
        <h2 className="text-sm font-medium mb-3 text-slate-300">已有星图</h2>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <Map className="h-8 w-8 text-slate-700" />
            <span className="text-sm text-slate-500">暂无星图</span>
            <span className="text-xs text-slate-600">创建一个星图开始探索</span>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => { setCurrentSession(s.id); loadSessionDetails(s.id); }}
                    className="group flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.04]"
                    style={
                      currentSession === s.id
                        ? {
                            background: 'rgba(16,185,129,0.08)',
                            border: '1px solid rgba(16,185,129,0.2)',
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-slate-200 truncate">{s.topic}</span>
                      <span className="text-xs text-slate-500 flex-shrink-0">{s.nodes} 节点</span>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">第 {s.round} 轮</span>
                  </div>
                ))}
          </div>
        )}
      </div>

      {/* 发散控制面板 */}
      {currentSession && (
        <div className="glass p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-300">
              发散探索 {currentRound > 0 && `· 当前第 ${currentRound} 轮`}
            </h2>
            <div className="flex gap-2">
              {currentRound < 3 && (
                <button
                  onClick={handleDiverge}
                  disabled={diverging}
                  className="inline-flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(109,40,217,0.9))' }}
                >
                  {diverging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  第 {currentRound + 1} 轮 · {roundLabels[currentRound + 1]}
                </button>
              )}
              {nodes.length > 0 && (
                <>
                  <button
                    onClick={handleExport}
                    className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-2"
                  >
                    <Download className="h-3 w-3" />
                    导出
                  </button>
                  <button
                    onClick={handleCreatePaper}
                    disabled={creatingPaper}
                    className="inline-flex items-center gap-2 h-8 px-3 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(37,99,235,0.9))' }}
                  >
                    {creatingPaper ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                    创建论文
                  </button>
                </>
              )}
              <button
                onClick={() => setConfirmDelete(currentSession)}
                className="h-8 px-3 text-xs inline-flex items-center gap-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除此星图
              </button>
            </div>
          </div>

          {/* 节点展示 — 按轮次分组 */}
          {nodes.length > 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map((round) => {
                const roundNodes = nodes.filter((n) => n.round === round);
                if (roundNodes.length === 0) return null;
                return (
                  <div key={round}>
                    <h3 className="text-xs text-slate-500 mb-2">
                      第 {round} 轮 · {roundLabels[round]}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {roundNodes.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => toggleNode(n.id)}
                          className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all duration-200"
                          style={{
                            background: n.checked
                              ? 'rgba(16,185,129,0.08)'
                              : 'rgba(255,255,255,0.02)',
                            border: n.checked
                              ? '1px solid rgba(16,185,129,0.3)'
                              : '1px solid rgba(255,255,255,0.05)',
                          }}
                        >
                          <CheckCircle2
                            className="h-4 w-4 flex-shrink-0"
                            style={{ color: n.checked ? '#34d399' : '#475569' }}
                          />
                          <span className="text-xs text-slate-300">{n.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <CheckCircle2 className="h-8 w-8 text-slate-700" />
              <span className="text-sm text-slate-500">暂无节点</span>
              <span className="text-xs text-slate-600">点击发散按钮开始探索</span>
            </div>
          )}
        </div>
      )}
      {/* 删除确认弹窗 */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(239,68,68,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)' }}>
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <div className="text-sm text-slate-200 font-medium">确认删除</div>
                <div className="text-xs text-slate-400 mt-1">
                  将永久删除星图「{sessions.find(s => s.id === confirmDelete)?.topic}」及其所有节点，此操作不可撤销。
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={() => handleDeleteSession(confirmDelete)}
                className="h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9))' }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
