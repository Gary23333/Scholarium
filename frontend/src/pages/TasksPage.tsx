import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  RefreshCw, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle,
  Trash2, Filter, Activity, ChevronDown, ChevronRight,
} from 'lucide-react';
import { PipelineVisualizer } from '../components/PipelineVisualizer';

interface TaskPhase {
  name: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress?: number;
}

interface Task {
  id: string;
  type: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
  progress?: number;
  message?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  metadata?: Record<string, any>;
  phases?: TaskPhase[];
}

interface TaskStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  timeout: number;
  cancelled: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending: { label: '等待中', color: '#94a3b8', bg: 'rgba(100,116,139,0.1)', icon: Clock },
  running: { label: '进行中', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: Loader2 },
  completed: { label: '已完成', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle2 },
  failed: { label: '失败', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: XCircle },
  timeout: { label: '超时', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: AlertTriangle },
  cancelled: { label: '已取消', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: XCircle },
};

const TYPE_LABELS: Record<string, string> = {
  plan: '大纲生成',
  write: '章节写作',
  audit: '审计',
  translate: '翻译',
  'generate-template': '生成模板',
  'from-url': 'URL转引用',
  diverge: '思维导图发散',
  other: '其他',
};

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, _setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      params.set('limit', '50');

      const [tasksRes, statsRes] = await Promise.all([
        fetch(`/api/tasks?${params}`),
        fetch('/api/tasks/stats'),
      ]);
      
      const tasksData = await tasksRes.json();
      const statsData = await statsRes.json();
      
      setTasks(tasksData.tasks || []);
      setStats(statsData);
    } catch {}
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchTasks]);

  async function handleClear() {
    if (!confirm('确定要清空所有任务记录吗？')) return;
    await fetch('/api/tasks/clear', { method: 'POST' });
    fetchTasks();
  }

  function formatDuration(ms?: number): string {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  }

  function formatTime(dateStr?: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">任务中心</h1>
          <p className="text-sm text-slate-500 mt-1">查看所有 AI 生成任务的状态</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5 ${autoRefresh ? 'text-emerald-400' : ''}`}
          >
            <Activity className="h-3.5 w-3.5" />
            {autoRefresh ? '自动刷新' : '手动刷新'}
          </button>
          <button
            onClick={fetchTasks}
            disabled={loading}
            className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={handleClear}
            className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1.5 text-red-400 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '进行中', value: stats.running, color: '#3b82f6' },
            { label: '已完成', value: stats.completed, color: '#22c55e' },
            { label: '失败/超时', value: stats.failed + stats.timeout, color: '#ef4444' },
            { label: '总计', value: stats.total, color: '#94a3b8' },
          ].map((item) => (
            <div
              key={item.label}
              className="glass p-4 rounded-lg"
              style={{ borderLeft: `3px solid ${item.color}` }}
            >
              <div className="text-sm text-slate-500">{item.label}</div>
              <div className="text-2xl font-bold mt-1" style={{ color: item.color }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 筛选器 */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-slate-500" />
        <select
          value={statusFilter ?? ''}
          onChange={(e) => setStatusFilter(e.target.value || null)}
          className="glass-input h-8 px-2 text-xs text-slate-200"
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <select
          value={typeFilter ?? ''}
          onChange={(e) => setTypeFilter(e.target.value || null)}
          className="glass-input h-8 px-2 text-xs text-slate-200"
        >
          <option value="">全部类型</option>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* 任务列表 */}
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 w-6"></th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">状态</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">类型</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">任务名称</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">进度</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">消息</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">开始时间</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-500">耗时</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    暂无任务记录
                  </td>
                </tr>
              ) : (
                tasks.map((task) => {
                  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                  const StatusIcon = statusConfig.icon;
                  const hasPhases = task.phases && task.phases.length > 0;
                  const isExpanded = expandedTask === task.id;
                  return (
                    <Fragment key={task.id}>
                    <tr
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3 px-2">
                        {hasPhases && (
                          <button
                            onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                            className="text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                          style={{ background: statusConfig.bg, color: statusConfig.color }}
                        >
                          <StatusIcon className={`h-3 w-3 ${task.status === 'running' ? 'animate-spin' : ''}`} />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-slate-400">
                          {TYPE_LABELS[task.type] || task.type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-200">{task.name}</span>
                      </td>
                      <td className="py-3 px-4">
                        {task.status === 'running' && task.progress !== undefined ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500">{task.progress}%</span>
                          </div>
                        ) : task.status === 'completed' ? (
                          <span className="text-xs text-emerald-400">100%</span>
                        ) : (
                          <span className="text-xs text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-slate-400 max-w-[200px] truncate block">
                          {task.message || task.error || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-slate-500">{formatTime(task.startedAt || task.createdAt)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-slate-500">{formatDuration(task.duration)}</span>
                      </td>
                    </tr>
                    {/* 展开的子阶段 —— 可视化流水线 */}
                    {isExpanded && hasPhases && (
                      <tr className="border-b border-white/5">
                        <td colSpan={8} className="px-8 py-5">
                          <div className="space-y-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <PipelineVisualizer stages={task.phases!} />
                            </div>
                            {/* 当前阶段消息 */}
                            {task.message && (
                              <div className="text-[11px] text-slate-500 ml-1">{task.message}</div>
                            )}
                            {task.status === 'running' && (
                              <div className="w-full max-w-xs h-1 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                  style={{ width: `${task.progress ?? 0}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
