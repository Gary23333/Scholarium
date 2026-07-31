import { useEffect, useState } from 'react';
import { FileText, Map, BookOpen, Database, Activity, Clock, Trash2, Compass, Users } from 'lucide-react';

interface Stats {
  papers: number;
  mindmaps: number;
  citations: number;
  bibleEntries: number;
  socraticSessions: number;
  reviewReports: number;
}

/**
 * 总览页 (Dashboard) — Scholarium 项目全局视图
 *
 * 功能：
 * - 顶部统计卡片：论文/星图/引文/圣典 的数量概览
 * - 近期论文列表：快速查看各项目状态 (draft / writing / completed)
 *
 * 数据来源：后端 /api/papers 和 /api/mindmap/sessions
 */
export function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    papers: 0,
    mindmaps: 0,
    citations: 0,
    bibleEntries: 0,
    socraticSessions: 0,
    reviewReports: 0,
  });
  const [recentPapers, setRecentPapers] = useState<
    Array<{ id: string; title: string; status: string; sections: number }>
  >([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [papersRes, mmRes, statsRes] = await Promise.all([
          fetch('/api/papers')
            .then((r) => r.json())
            .catch(() => []),
          fetch('/api/mindmap/sessions')
            .then((r) => r.json())
            .catch(() => []),
          fetch('/api/stats')
            .then((r) => r.json())
            .catch(() => null),
        ]);
        // /api/papers 返回 { papers, total }，兼容纯数组
        setRecentPapers(Array.isArray(papersRes) ? papersRes : (papersRes?.papers ?? []));
        setStats({
          papers: statsRes?.papers ?? papersRes.length,
          mindmaps: statsRes?.mindmaps ?? mmRes.length,
          citations: statsRes?.totalCitations ?? 0,
          bibleEntries: statsRes?.totalBibleEntries ?? 0,
          socraticSessions: statsRes?.socraticSessions ?? 0,
          reviewReports: statsRes?.reviewReports ?? 0,
        });
      } catch {}
    }
    load();
  }, []);

  async function handleDeletePaper(id: string) {
    try {
      await fetch(`/api/papers/${id}`, { method: 'DELETE' });
      setRecentPapers((prev) => prev.filter((p) => p.id !== id));
      setStats((prev) => ({ ...prev, papers: prev.papers - 1 }));
    } catch {}
    setConfirmDelete(null);
  }

  /** 顶部统计卡片 — 液态玻璃风格 */
  const statCards = [
    { label: '论文项目', value: stats.papers, icon: <FileText className="h-5 w-5" />, color: '#60a5fa' },
    { label: '研究引导', value: stats.socraticSessions, icon: <Compass className="h-5 w-5" />, color: '#10b981' },
    { label: '评审报告', value: stats.reviewReports, icon: <Users className="h-5 w-5" />, color: '#a78bfa' },
    { label: '思维星图', value: stats.mindmaps, icon: <Map className="h-5 w-5" />, color: '#f472b6' },
    { label: '引文库', value: stats.citations, icon: <BookOpen className="h-5 w-5" />, color: '#fbbf24' },
    { label: '圣典条目', value: stats.bibleEntries, icon: <Database className="h-5 w-5" />, color: '#34d399' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">总览</h1>
          <p className="text-sm text-slate-500 mt-1">多 Agent 协奏的学术星河</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Clock className="h-3.5 w-3.5" />
          {new Date().toLocaleString('zh-CN')}
        </div>
      </div>

      {/* 统计卡片网格 — 液态玻璃卡片，hover 时浮起 */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="glass-card p-4 !rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{card.label}</span>
              <span style={{ color: card.color }}>{card.icon}</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-100">{card.value}</div>
          </div>
        ))}
      </div>

      {/* 近期论文列表 — 液态玻璃面板 */}
      <div className="glass p-4">
        <h2 className="text-sm font-medium mb-4 flex items-center gap-2 text-slate-300">
          <Activity className="h-4 w-4 text-slate-500" />
          近期论文
        </h2>
        {recentPapers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <FileText className="h-8 w-8 text-slate-700" />
            <span className="text-sm text-slate-500">暂无论文项目</span>
            <span className="text-xs text-slate-600">前往"论文"页面创建</span>
          </div>
        ) : (
          <div className="space-y-2">
            {recentPapers.map((p) => (
              <div
                key={p.id}
                className="group flex items-center justify-between py-2 px-3 rounded-lg transition-colors hover:bg-white/[0.04]"
              >
                <div>
                  <span className="text-sm font-medium text-slate-200">{p.title}</span>
                  <span className="ml-2 text-xs text-slate-500">{p.sections} 章节</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background:
                        p.status === 'completed'
                          ? 'rgba(16,185,129,0.15)'
                          : p.status === 'writing'
                            ? 'rgba(59,130,246,0.15)'
                            : 'rgba(100,116,139,0.15)',
                      color: p.status === 'completed' ? '#34d399' : p.status === 'writing' ? '#60a5fa' : '#94a3b8',
                    }}
                  >
                    {p.status}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(p.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="删除"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.15)' }}
              >
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <div className="text-sm text-slate-200 font-medium">确认删除</div>
                <div className="text-xs text-slate-400 mt-1">
                  将永久删除「{recentPapers.find((p) => p.id === confirmDelete)?.title}」及其所有内容，此操作不可撤销。
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={() => handleDeletePaper(confirmDelete)}
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
