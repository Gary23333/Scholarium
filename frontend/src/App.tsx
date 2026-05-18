import { useState } from 'react';
import {
  GraduationCap, Map, FileText, BookOpen, Database, Settings,
  ChevronLeft, ChevronRight, Home, Compass, FileCheck,
} from 'lucide-react';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { MindMapPage } from './pages/MindMapPage';
import { PapersPage } from './pages/PapersPage';
import { CitationsPage } from './pages/CitationsPage';
import { BiblePage } from './pages/BiblePage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import { ResearchGuidePage } from './pages/ResearchGuidePage';
import { ReviewPage } from './pages/ReviewPage';
import { TaskPopup } from './components/TaskPopup';

type Page = 'dashboard' | 'research-guide' | 'mindmap' | 'papers' | 'review' | 'citations' | 'bible' | 'settings' | 'tasks';
type NoTaskPage = Exclude<Page, 'tasks'>;

/**
 * 导航项定义 — 侧边栏的功能入口
 * 每个导航项对应一个 Agent 工作流模块：
 * - 总览：项目全局统计与状态
 * - 星图：Cartographer 思维导图发散
 * - 论文：Planner → Writer → Compiler 论文生成管线
 * - 引文：Librarian 文献检索与验证
 * - 圣典：Bible 知识库管理
 * - 星轨：LLM 模型路由与配置
 * - 任务：任务中心，查看所有 AI 生成任务状态
 */
const NAV_ITEMS: { id: NoTaskPage; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: '总览', icon: <Home className="h-4 w-4" /> },
  { id: 'research-guide', label: '引导', icon: <Compass className="h-4 w-4" /> },
  { id: 'mindmap', label: '星图', icon: <Map className="h-4 w-4" /> },
  { id: 'papers', label: '论文', icon: <FileText className="h-4 w-4" /> },
  { id: 'review', label: '评审', icon: <FileCheck className="h-4 w-4" /> },
  { id: 'citations', label: '引文', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'bible', label: '圣典', icon: <Database className="h-4 w-4" /> },
  { id: 'settings', label: '星轨', icon: <Settings className="h-4 w-4" /> },
];

const LANDING_KEY = 'scholarium-entered';

export function App() {
  const [landingTopic, setLandingTopic] = useState<string | null>(() => {
    // 从 localStorage 恢复进入状态
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LANDING_KEY) ? '' : null;
    }
    return null;
  });
  const [page, setPage] = useState<Page>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  /**
   * Landing 页回调 — 用户输入论文主题后，
   * 保存主题并进入主应用。后续可将其传递给各工作流模块。
   */
  function handleEnter(topic: string) {
    setLandingTopic(topic);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANDING_KEY, '1');
    }
  }

  // 首次访问显示 Landing 页
  if (landingTopic === null) {
    return <Landing onEnter={handleEnter} />;
  }

  const CurrentPage = {
    dashboard: Dashboard,
    'research-guide': ResearchGuidePage,
    mindmap: MindMapPage,
    papers: PapersPage,
    review: ReviewPage,
    citations: CitationsPage,
    bible: BiblePage,
    tasks: TasksPage,
    settings: SettingsPage,
  }[page] ?? Dashboard;

  return (
    <div className="flex h-screen bg-[#06060e] text-slate-100">
      {/* ============================================================
          侧边栏 — 液态玻璃风格
          提供 6 大功能模块的导航入口。
          支持折叠以释放主内容区域空间。
          ============================================================ */}
      <aside
        className={`flex flex-col border-r transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-48'
        }`}
        style={{
          background: 'rgba(10, 10, 22, 0.6)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo 区 */}
        <div
          className="flex items-center gap-2 px-4 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <GraduationCap className="h-6 w-6 text-emerald-400 flex-shrink-0" />
          {!sidebarCollapsed && (
            <span className="text-sm font-semibold bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
              Scholarium 星庐
            </span>
          )}
        </div>

        {/* 导航项 — 当前页高亮为发光选中态 */}
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = page === item.id || (page === 'tasks' && item.id === 'dashboard');
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-200 ${
                  isActive
                    ? 'text-emerald-400'
                    : 'text-slate-500 hover:text-slate-200'
                }`}
                style={
                  isActive
                    ? {
                        background:
                          'linear-gradient(90deg, rgba(16,185,129,0.12) 0%, transparent 100%)',
                        borderRight: '2px solid rgba(16,185,129,0.6)',
                        boxShadow: 'inset 0 0 20px rgba(16,185,129,0.04)',
                      }
                    : undefined
                }
              >
                {item.icon}
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
          {/* 任务按钮 — 悬浮弹窗模式 */}
          <div className="relative">
            <TaskPopup onNavigate={() => setPage('tasks')} collapsed={sidebarCollapsed} />
          </div>
        </nav>

        {/* 折叠按钮 */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex items-center justify-center py-3 border-t text-slate-600 hover:text-slate-300 transition-colors"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </aside>

      {/* ============================================================
          主内容区 — 页面路由渲染
          ============================================================ */}
      <main className="flex-1 overflow-auto">
        <CurrentPage />
      </main>
    </div>
  );
}
