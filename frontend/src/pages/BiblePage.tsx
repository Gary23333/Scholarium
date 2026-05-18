import { useState, useEffect } from 'react';
import { Database, Search, Loader2, Layers, Plus, Edit3, Trash2, Save, X } from 'lucide-react';

interface BibleEntry {
  id: string;
  paperId: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  approvalStatus: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  data: '数据',
  terminology: '术语',
  citations: '引文',
  experiments: '实验',
  formulas: '公式',
  claims: '论断',
  figures: '图表',
  variables: '变量',
  arguments: '论据',
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  data: { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa' },
  terminology: { bg: 'rgba(139,92,246,0.12)', text: '#a78bfa' },
  citations: { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24' },
  experiments: { bg: 'rgba(16,185,129,0.12)', text: '#34d399' },
  formulas: { bg: 'rgba(239,68,68,0.12)', text: '#f87171' },
  claims: { bg: 'rgba(249,115,22,0.12)', text: '#fb923c' },
  figures: { bg: 'rgba(6,182,212,0.12)', text: '#22d3ee' },
  variables: { bg: 'rgba(236,72,153,0.12)', text: '#f472b6' },
  arguments: { bg: 'rgba(99,102,241,0.12)', text: '#818cf8' },
};

const APPROVAL_STATUS_OPTIONS = [
  { value: 'approved', label: 'approved' },
  { value: 'needs_human_review', label: 'needs_human_review' },
  { value: 'rejected', label: 'rejected' },
];

const SELECTED_PAPER_KEY = 'scholarium-selected-paper';

type EntryModalMode = 'add' | 'edit';

interface EntryModalState {
  mode: EntryModalMode;
  entryId?: string;
}

export function BiblePage() {
  const [paperId, setPaperId] = useState<string>('');
  const [paperList, setPaperList] = useState<{ id: string; title: string }[]>([]);
  const [entries, setEntries] = useState<BibleEntry[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const [entryModal, setEntryModal] = useState<EntryModalState | null>(null);
  const [formCategory, setFormCategory] = useState<string>('data');
  const [formKey, setFormKey] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formConfidence, setFormConfidence] = useState<number>(1.0);
  const [formApprovalStatus, setFormApprovalStatus] = useState<string>('approved');
  const [submitting, setSubmitting] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch('/api/papers').then(r => r.json()).then(list => {
      setPaperList(list);
      const saved = typeof window !== 'undefined' ? localStorage.getItem(SELECTED_PAPER_KEY) : null;
      const initial = saved && list.some((p: any) => p.id === saved) ? saved : (list.length > 0 ? list[0].id : '');
      setPaperId(initial);
    }).catch(() => {});
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (!paperId) return;
    setLoading(true);
    fetch(`/api/bible/${paperId}`).then(r => r.json()).then(data => {
      setEntries(data.entries || []);
      setStats(data.stats?.byCategory || {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, [paperId, refreshKey]);

  const filteredEntries = filter ? entries.filter((e) => e.category === filter) : entries;

  function openAddModal() {
    setFormCategory('data');
    setFormKey('');
    setFormValue('');
    setFormConfidence(1.0);
    setFormApprovalStatus('approved');
    setEntryModal({ mode: 'add' });
  }

  function openEditModal(entry: BibleEntry) {
    setFormCategory(entry.category);
    setFormKey(entry.key);
    setFormValue(entry.value);
    setFormConfidence(entry.confidence);
    setFormApprovalStatus(entry.approvalStatus);
    setEntryModal({ mode: 'edit', entryId: entry.id });
  }

  function closeEntryModal() {
    setEntryModal(null);
  }

  async function handleSubmitEntry() {
    if (!paperId || !formKey.trim() || !formValue.trim()) return;
    setSubmitting(true);
    try {
      if (entryModal?.mode === 'add') {
        const res = await fetch(`/api/bible/${paperId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: formCategory,
            key: formKey.trim(),
            value: formValue.trim(),
            confidence: formConfidence,
            approvalStatus: formApprovalStatus,
          }),
        });
        if (!res.ok) throw new Error('创建失败');
      } else if (entryModal?.mode === 'edit' && entryModal.entryId) {
        const res = await fetch(`/api/bible/${paperId}/entries/${entryModal.entryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: formCategory,
            key: formKey.trim(),
            value: formValue.trim(),
            confidence: formConfidence,
            approvalStatus: formApprovalStatus,
          }),
        });
        if (!res.ok) throw new Error('更新失败');
      }
      closeEntryModal();
      setRefreshKey(k => k + 1);
    } catch {
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(entryId: string) {
    if (!paperId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bible/${paperId}/entries/${entryId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      setDeleteConfirm(null);
      setRefreshKey(k => k + 1);
    } catch {
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-100">圣典管理</h1>
          {entries.length > 0 && (
            <span className="text-xs text-slate-500">{entries.length} 个条目</span>
          )}
        </div>
      </div>

      <div className="glass p-4 space-y-3">
        <h2 className="text-sm font-medium flex items-center gap-2 text-slate-300">
          <Database className="h-4 w-4 text-slate-500" />
          加载圣典
        </h2>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            <select
              value={paperId}
              onChange={(e) => setPaperId(e.target.value)}
              className="glass-input w-full h-9 pl-9 pr-3 text-sm appearance-none cursor-pointer"
            >
              {paperList.length === 0 && <option value="">暂无论文</option>}
              {paperList.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <button
            onClick={openAddModal}
            disabled={!paperId}
            className="glass-btn-secondary h-9 px-4 inline-flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            新增条目
          </button>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="glass-btn-primary h-9 px-4 inline-flex items-center gap-2 text-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            刷新
          </button>
        </div>
      </div>

      {Object.keys(stats).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter(null)}
            className="text-xs px-3 py-1.5 rounded-full transition-all duration-200"
            style={{
              background: !filter ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
              color: !filter ? '#34d399' : '#94a3b8',
              border: !filter ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            全部 ({entries.length})
          </button>
          {Object.entries(stats).map(([cat, count]) => {
            const colors = CATEGORY_COLORS[cat] ?? { bg: 'rgba(100,116,139,0.12)', text: '#94a3b8' };
            return (
              <button
                key={cat}
                onClick={() => setFilter(filter === cat ? null : cat)}
                className="text-xs px-3 py-1.5 rounded-full transition-all duration-200"
                style={{
                  background: filter === cat ? colors.bg : 'rgba(255,255,255,0.04)',
                  color: filter === cat ? colors.text : '#94a3b8',
                  border:
                    filter === cat
                      ? `1px solid ${colors.text}33`
                      : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {CATEGORY_LABELS[cat] ?? cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {filteredEntries.length > 0 && (
        <div className="space-y-2">
          {filteredEntries.map((e) => {
            const colors = CATEGORY_COLORS[e.category] ?? { bg: 'rgba(100,116,139,0.12)', text: '#94a3b8' };
            return (
              <div
                key={e.id}
                className="rounded-lg p-3 transition-colors hover:bg-white/[0.02]"
                style={{ border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ background: colors.bg, color: colors.text }}
                  >
                    {CATEGORY_LABELS[e.category] ?? e.category}
                  </span>
                  <span className="text-xs font-mono text-emerald-400">{e.key}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      background:
                        e.approvalStatus === 'approved'
                          ? 'rgba(16,185,129,0.12)'
                          : e.approvalStatus === 'needs_human_review'
                            ? 'rgba(245,158,11,0.12)'
                            : 'rgba(100,116,139,0.12)',
                      color:
                        e.approvalStatus === 'approved'
                          ? '#34d399'
                          : e.approvalStatus === 'needs_human_review'
                            ? '#fbbf24'
                            : '#94a3b8',
                    }}
                  >
                    {e.approvalStatus}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(e)}
                      className="h-6 w-6 inline-flex items-center justify-center rounded transition-colors hover:bg-white/[0.08]"
                      title="编辑"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(e.id)}
                      className="h-6 w-6 inline-flex items-center justify-center rounded transition-colors hover:bg-red-500/10"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400/70" />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-300 mt-1 font-mono">{e.value}</div>
              </div>
            );
          })}
        </div>
      )}

      {entries.length === 0 && paperId && !loading && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Database className="h-8 w-8 text-slate-700" />
          <span className="text-sm text-slate-500">暂无圣典条目</span>
          <span className="text-xs text-slate-600">点击"新增条目"添加</span>
        </div>
      )}

      {entryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={closeEntryModal}
        >
          <div
            className="w-full max-w-lg rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3">
                {entryModal.mode === 'add' ? (
                  <Plus className="h-5 w-5 text-emerald-400" />
                ) : (
                  <Edit3 className="h-5 w-5 text-blue-400" />
                )}
                <span className="text-sm text-slate-200 font-medium">
                  {entryModal.mode === 'add' ? '新增条目' : '编辑条目'}
                </span>
              </div>
              <button onClick={closeEntryModal} className="h-7 w-7 inline-flex items-center justify-center rounded transition-colors hover:bg-white/[0.08]">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">类别 <span className="text-red-400">*</span></label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="glass-input w-full h-8 px-3 text-sm"
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Key <span className="text-red-400">*</span></label>
                <input
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="例如：dataset_name"
                  className="glass-input w-full h-8 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Value <span className="text-red-400">*</span></label>
                <textarea
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  placeholder="条目内容"
                  className="glass-input w-full h-24 px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">置信度</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={formConfidence}
                    onChange={(e) => setFormConfidence(parseFloat(e.target.value) || 0)}
                    className="glass-input w-full h-8 px-3 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">审批状态</label>
                  <select
                    value={formApprovalStatus}
                    onChange={(e) => setFormApprovalStatus(e.target.value)}
                    className="glass-input w-full h-8 px-3 text-sm"
                  >
                    {APPROVAL_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={closeEntryModal} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={handleSubmitEntry}
                disabled={submitting || !formKey.trim() || !formValue.trim()}
                className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.9), rgba(5,150,105,0.9))' }}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {entryModal.mode === 'add' ? '创建' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDeleteConfirm(null)}
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
                  将永久删除条目「{entries.find(e => e.id === deleteConfirm)?.key}」，此操作不可撤销。
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9))' }}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
