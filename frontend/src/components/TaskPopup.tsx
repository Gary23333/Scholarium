import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, CheckCircle2, XCircle, Clock, AlertTriangle,
  ListTodo, ChevronRight, ChevronDown,
} from 'lucide-react';

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

export function TaskPopup({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);

  const activeCount = (stats?.running ?? 0) + (stats?.pending ?? 0);

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, statsRes] = await Promise.all([
        fetch('/api/tasks?limit=5'),
        fetch('/api/tasks/stats'),
      ]);
      const tasksData = await tasksRes.json();
      const statsData = await statsRes.json();
      setTasks(tasksData.tasks || []);
      setStats(statsData);
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  function formatTime(dateStr?: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(ms?: number): string {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  }

  // 侧边栏折叠时只显示图标按钮
  if (collapsed) {
    return (
      <button
        onClick={() => onNavigate?.()}
        className="relative w-full flex items-center justify-center px-4 py-2.5 text-sm transition-all duration-200 text-slate-500 hover:text-slate-200"
      >
        <ListTodo className="h-4 w-4" />
        {activeCount > 0 && (
          <span
            className="absolute top-1 right-3 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
          >
            {activeCount > 99 ? '99+' : activeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="w-full">
      {/* 任务按钮 - 作为侧边栏导航项 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-200 text-slate-500 hover:text-slate-200"
      >
        <ListTodo className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">任务</span>
        {activeCount > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
          >
            {activeCount > 99 ? '99+' : activeCount}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-slate-500" />
        ) : (
          <ChevronRight className="h-3 w-3 text-slate-500" />
        )}
      </button>

      {/* 展开的任务面板 - 内嵌在侧边栏中 */}
      {expanded && (
        <div
          className="mx-2 mb-2 rounded-lg overflow-hidden"
          style={{
            background: 'rgba(15, 15, 25, 0.8)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {/* 统计条 */}
          {stats && (
            <div className="flex gap-1 px-2 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex-1 text-center">
                <div className="text-sm font-bold text-blue-400">{stats.running}</div>
                <div className="text-[9px] text-slate-500">进行中</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-sm font-bold text-emerald-400">{stats.completed}</div>
                <div className="text-[9px] text-slate-500">完成</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-sm font-bold text-red-400">{stats.failed + stats.timeout}</div>
                <div className="text-[9px] text-slate-500">失败</div>
              </div>
            </div>
          )}

          {/* 任务列表 */}
          <div className="max-h-[200px] overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="text-center py-4 text-[10px] text-slate-500">暂无任务</div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                {tasks.slice(0, 5).map((task) => {
                  const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                  const Icon = sc.icon;
                  return (
                    <div key={task.id} className="px-3 py-2 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-start gap-2">
                        <Icon 
                          className={`h-3 w-3 flex-shrink-0 mt-0.5 ${task.status === 'running' ? 'animate-spin' : ''}`} 
                          style={{ color: sc.color }} 
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-slate-300 truncate">{task.name}</div>
                          <div className="text-[9px] text-slate-500 mt-0.5">
                            {formatTime(task.startedAt || task.createdAt)}
                            {task.duration ? ` · ${formatDuration(task.duration)}` : ''}
                          </div>
                        </div>
                      </div>
                      {task.status === 'running' && task.progress !== undefined && (
                        <div className="mt-1 flex items-center gap-1">
                          <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-500"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-slate-500">{task.progress}%</span>
                        </div>
                      )}
                      {task.message && (
                        <div className="mt-0.5 text-[9px] text-slate-500 truncate">{task.message}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 查看全部按钮 */}
          <button
            onClick={() => { setExpanded(false); onNavigate?.(); }}
            className="w-full py-2 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] transition-colors flex items-center justify-center gap-1"
            style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
          >
            查看全部任务
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
