import { useEffect, useState, useMemo } from 'react';
import {
  Plus,
  FileText,
  Play,
  Loader2,
  ChevronRight,
  ChevronDown,
  FileCheck,
  AlertCircle,
  Clock,
  BookOpen,
  Edit3,
  Layers,
  Eye,
  Download,
  X,
  Trash2,
  List,
  AlignLeft,
  ArrowUp,
  ArrowDown,
  Save,
  ExternalLink,
  Bookmark,
  Search,
  Sparkles,
  Compass,
  Shield,
  Users,
} from 'lucide-react';
import { revisePassage } from '../lib/api';
import { spliceSegment, offsetInRoot } from '../lib/segments';
import { SmartEditPanel } from '../components/SmartEditPanel';

/* ───────────────────────────────────────────
   类型定义
   ─────────────────────────────────────────── */
interface Paper {
  id: string;
  title: string;
  status: string;
  sections: number;
}

interface OutlineSection {
  id: string;
  title: string;
  coreArgument: string;
  estimatedPages: number;
  requiredCitations: number;
  parent: string | null;
  mustKeep?: string[];
  forbidden?: string[];
  primaryGoal?: string;
}

interface SectionData {
  id: string;
  title: string;
  sectionNumber: number;
  status: string;
  contentTex?: string;
  version: number;
}

interface PaperDetail {
  id: string;
  title: string;
  status: string;
  outline?: { title: string; sections: OutlineSection[] };
  sections?: SectionData[];
  bibleStats?: Record<string, number>;
}

/** 树节点 */
interface OutlineNode {
  section: OutlineSection;
  children: OutlineNode[];
  depth: number;
}

/** Section 撰写状态中文映射 */
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待撰写', color: '#94a3b8', bg: 'rgba(100,116,139,0.1)' },
  drafting: { label: '撰写中', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  auditing: { label: '审核中', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  needs_fix: { label: '需修正', color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  passed: { label: '已通过', color: '#34d399', bg: 'rgba(16,185,129,0.12)' },
  failed: { label: '失败', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  human_review: { label: '待人工审', color: '#c084fc', bg: 'rgba(192,132,252,0.1)' },
};

/* ───────────────────────────────────────────
   辅助：扁平分节 → 树
   ─────────────────────────────────────────── */
function buildOutlineTree(sections: OutlineSection[]): OutlineNode[] {
  const map = new Map<string, OutlineNode>();
  const roots: OutlineNode[] = [];

  // 第一遍：创建所有节点
  for (const s of sections) {
    map.set(s.id, { section: s, children: [], depth: 0 });
  }
  // 第二遍：建立父子关系
  for (const node of map.values()) {
    const parentId = node.section.parent;
    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // 第三遍：计算深度
  function setDepth(nodes: OutlineNode[], depth: number) {
    for (const n of nodes) {
      n.depth = depth;
      setDepth(n.children, depth + 1);
    }
  }
  setDepth(roots, 0);
  return roots;
}

/**
 * 论文页 (PapersPage) — 单论文全屏深度写作视图
 *
 * 工作流：
 * 1. 选择/创建论文项目 (顶部下拉框)
 * 2. 生成大纲 → Planner Agent 输出二三级中文层级大纲
 * 3. 大纲树中点击节点展开详情，可逐节撰写
 * 4. 编译 LaTeX → PDF
 */
const SELECTED_PAPER_KEY = 'scholarium-selected-paper';

export function PapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(SELECTED_PAPER_KEY);
    }
    return null;
  });
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newResearchTopic, setNewResearchTopic] = useState('');
  const [newTargetJournal, setNewTargetJournal] = useState('');
  const [newContributionGaps, setNewContributionGaps] = useState('');
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [writingSectionId, setWritingSectionId] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [fulltext, setFulltext] = useState<{ format: string; content: string; title: string } | null>(null);
  const [fulltextSection, setFulltextSection] = useState<string>('all');
  const [fulltextViewMode, setFulltextViewMode] = useState<'segmented' | 'full'>('segmented');
  const [loadingFulltext, setLoadingFulltext] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteSectionConfirm, setDeleteSectionConfirm] = useState<string | null>(null);

  /* 大纲树折叠状态：集合存储已折叠的节点 id */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /* 展开的详情节点 id */
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  /* 右侧原文面板显示的章节 id */
  const [contentSectionId, setContentSectionId] = useState<string | null>(null);

  // ── 修改弹窗状态 ──
  const [rewriteModal, setRewriteModal] = useState<{ sectionId: string; title: string } | null>(null);
  const [rewriteDirection, setRewriteDirection] = useState('');
  const [rewriteRequirements, setRewriteRequirements] = useState('');
  const [rewriteGivenContent, setRewriteGivenContent] = useState('');
  const [rewriting, setRewriting] = useState(false);

  const [editingContent, setEditingContent] = useState(false);
  const [editedContentTex, setEditedContentTex] = useState('');
  const [savingContent, setSavingContent] = useState(false);

  // ── 片段局部重写状态 ──
  const [segmentSel, setSegmentSel] = useState<{
    sectionId: string;
    text: string;
    start: number;
    end: number;
    rect?: DOMRect;
  } | null>(null);
  const [segmentModal, setSegmentModal] = useState(false);
  const [segmentNote, setSegmentNote] = useState('');
  const [segmentRevising, setSegmentRevising] = useState(false);
  const [segmentTarget, setSegmentTarget] = useState<'fulltext' | 'edit'>('fulltext');

  // ── 自动定向修订状态 ──
  const [autoRevising, setAutoRevising] = useState(false);
  const [autoReviseResult, setAutoReviseResult] = useState<{
    sectionId: string;
    adopted: number;
    rejected: number;
  } | null>(null);

  // ── 智能编辑 Agent 弹窗 ──
  const [showSmartEdit, setShowSmartEdit] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizeTargetIds, setOptimizeTargetIds] = useState<string[]>([]);
  const [optimizing, setOptimizing] = useState(false);

  // ── 大纲编辑状态 ──
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCoreArg, setEditCoreArg] = useState('');

  // ── 新增章节 ──
  const [showAddSection, setShowAddSection] = useState(false);
  const [addSecId, setAddSecId] = useState('');
  const [addSecTitle, setAddSecTitle] = useState('');
  const [addSecCoreArg, setAddSecCoreArg] = useState('');
  const [addSecParent, setAddSecParent] = useState('');

  // ── 状态 & 审计报告 ──
  const [statusModal, setStatusModal] = useState<{ sectionId: string; data: any } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [auditReportModal, setAuditReportModal] = useState<{ sectionId: string; data: any } | null>(null);
  const [auditReportLoading, setAuditReportLoading] = useState(false);

  function openStatus(sectionId: string) {
    setStatusLoading(true);
    fetch(`/api/papers/${selectedId}/sections/${sectionId}/status`)
      .then((r) => r.json())
      .then((data) => setStatusModal({ sectionId, data }))
      .catch(() => alert('获取状态失败'))
      .finally(() => setStatusLoading(false));
  }

  function openAuditReport(sectionId: string) {
    setAuditReportLoading(true);
    fetch(`/api/papers/${selectedId}/sections/${sectionId}/audit-report`)
      .then((r) => r.json())
      .then((data) => setAuditReportModal({ sectionId, data }))
      .catch(() => alert('获取审计报告失败'))
      .finally(() => setAuditReportLoading(false));
  }

  // ── 引用管理 ──
  const [showCitations, setShowCitations] = useState(false);
  const [citationSectionId, setCitationSectionId] = useState<string | null>(null);
  const [paperCitations, setPaperCitations] = useState<any[]>([]);
  const [citationTotal, setCitationTotal] = useState(0);
  const [citationModal, setCitationModal] = useState<{ mode: 'add' | 'edit'; key?: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [citKey, setCitKey] = useState('');
  const [citBibtex, setCitBibtex] = useState('');
  const [citTitle, setCitTitle] = useState('');
  const [citUrl, setCitUrl] = useState('');
  const [citAuthors, setCitAuthors] = useState('');
  const [citYear, setCitYear] = useState('');

  // ── 参考文献生成 ──
  const [showRefGen, setShowRefGen] = useState(false);
  const [refGenLoading, setRefGenLoading] = useState(false);
  const [refGenTemplate, setRefGenTemplate] = useState('');

  // ── 数据加载 ──
  async function loadPapers() {
    try {
      const res = await fetch('/api/papers');
      const data = await res.json();
      // /api/papers 返回 { papers, total }，兼容纯数组
      const list: Paper[] = Array.isArray(data) ? data : (data?.papers ?? []);
      setPapers(list);
      const savedId = typeof window !== 'undefined' ? localStorage.getItem(SELECTED_PAPER_KEY) : null;
      if (savedId && list.some((p) => p.id === savedId)) {
        setSelectedId(savedId);
      } else if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
      }
    } catch {
      /* ignore */
    }
  }

  async function loadDetail(id: string) {
    try {
      const res = await fetch(`/api/papers/${id}`);
      setDetail(await res.json());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadPapers();
  }, []);
  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
      if (typeof window !== 'undefined') {
        localStorage.setItem(SELECTED_PAPER_KEY, selectedId);
      }
    }
  }, [selectedId]);

  // ── 大纲树 ──
  const outlineTree = useMemo(
    () => (detail?.outline?.sections ? buildOutlineTree(detail.outline.sections) : []),
    [detail?.outline?.sections],
  );

  /** 查找节点对应已撰写数据 */
  function sectionDataFor(id: string): SectionData | undefined {
    return detail?.sections?.find((s) => s.id === id);
  }

  // ── 操作 ──
  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          researchTopic: newResearchTopic || undefined,
          targetJournal: newTargetJournal || undefined,
          contributionGaps: newContributionGaps ? newContributionGaps.split('\n').filter(Boolean) : undefined,
        }),
      });
      const data = await res.json();
      setPapers((prev) => [...prev, { id: data.paperId, title: newTitle, status: 'draft', sections: 0 }]);
      setNewTitle('');
      setNewResearchTopic('');
      setNewTargetJournal('');
      setNewContributionGaps('');
      setShowCreate(false);
      setSelectedId(data.paperId);
    } catch {
      /* ignore */
    }
    setCreating(false);
  }

  async function handlePlan() {
    if (!selectedId) return;
    setPlanning(true);
    try {
      const res = await fetch(`/api/papers/${selectedId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setDetail((prev) => (prev ? { ...prev, outline: data.outline, status: 'planned' } : prev));
      loadPapers();
    } catch {
      /* ignore */
    }
    setPlanning(false);
  }

  async function handleWrite(sectionId: string) {
    if (!selectedId || !detail?.outline) return;
    const idx = detail.outline.sections.findIndex((s) => s.id === sectionId);
    if (idx < 0) return;
    setWritingSectionId(sectionId);
    try {
      await fetch(`/api/papers/${selectedId}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionIndex: idx }),
      });
      await loadDetail(selectedId);
    } catch {
      /* ignore */
    }
    setWritingSectionId(null);
  }

  async function handleCompile() {
    if (!selectedId) return;
    setCompiling(true);
    try {
      const res = await fetch(`/api/papers/${selectedId}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      alert(data.ok ? `编译成功: ${data.pdfPath}` : `编译失败: ${data.rawLog?.slice(0, 200)}`);
    } catch (e) {
      alert(`编译出错: ${e}`);
    }
    setCompiling(false);
  }

  async function handleIntegrityGate() {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/integrity/${selectedId}/gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateType: 'pre_review' }),
      });
      const data = await res.json();
      if (data.overallPassed) {
        alert('完整性门控通过！');
      } else {
        alert(`完整性门控未通过：\n${data.criticalIssues?.join('\n') ?? '未知问题'}`);
      }
    } catch {
      alert('完整性门控执行失败');
    }
  }

  async function handleStartReview() {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/review/${selectedId}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert(`评审完成！决策：${data.editorialDecision?.decision ?? '未知'}`);
      }
    } catch {
      alert('评审启动失败');
    }
  }

  async function handleViewFulltext() {
    if (!selectedId || !detail?.sections) return;
    setLoadingFulltext(true);
    try {
      const sorted = (detail.sections || [])
        .filter((s) => s.contentTex)
        .sort((a, b) => a.sectionNumber - b.sectionNumber);
      const fullContent = sorted.map((s) => `% ${s.title}\n${s.contentTex}`).join('\n\n');
      setFulltext({ format: 'latex', content: fullContent, title: detail.title });
      setFulltextSection('all');
      setFulltextViewMode('segmented');
    } catch {
      /* ignore */
    }
    setLoadingFulltext(false);
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/papers/${id}`, { method: 'DELETE' });
      setPapers((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
        localStorage.removeItem(SELECTED_PAPER_KEY);
      }
      setDeleteConfirm(null);
    } catch {
      /* ignore */
    }
  }

  async function handleExportMd() {
    if (!selectedId) return;
    const a = document.createElement('a');
    a.href = `/api/papers/${selectedId}/export?format=md`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── 大纲 CRUD ──
  async function handleEditSection(sectionId: string) {
    const sec = detail?.outline?.sections.find((s) => s.id === sectionId);
    if (!sec) return;
    setEditTitle(sec.title);
    setEditCoreArg(sec.coreArgument);
    setEditingSection(sectionId);
  }

  async function handleSaveSection() {
    if (!editingSection || !selectedId) return;
    try {
      await fetch(`/api/papers/${selectedId}/outline/sections/${editingSection}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, coreArgument: editCoreArg }),
      });
      setEditingSection(null);
      await loadDetail(selectedId);
    } catch {
      /* ignore */
    }
  }

  async function handleDeleteSection(sectionId: string) {
    if (!selectedId) return;
    try {
      await fetch(`/api/papers/${selectedId}/outline/sections/${sectionId}`, { method: 'DELETE' });
      await loadDetail(selectedId);
    } catch {
      /* ignore */
    }
    setDeleteSectionConfirm(null);
  }

  async function handleMoveSection(sectionId: string, direction: 'up' | 'down') {
    if (!selectedId || !detail?.outline) return;
    const sections = detail.outline.sections;
    const idx = sections.findIndex((s) => s.id === sectionId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const ids = sections.map((s) => s.id);
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    try {
      await fetch(`/api/papers/${selectedId}/outline/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: ids }),
      });
      await loadDetail(selectedId);
    } catch {
      /* ignore */
    }
  }

  async function handleAddSection() {
    if (!selectedId || !addSecId || !addSecTitle) return;
    try {
      await fetch(`/api/papers/${selectedId}/outline/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: addSecId,
          title: addSecTitle,
          coreArgument: addSecCoreArg,
          estimatedPages: 1,
          requiredCitations: 0,
          parent: addSecParent || null,
        }),
      });
      setShowAddSection(false);
      setAddSecId('');
      setAddSecTitle('');
      setAddSecCoreArg('');
      setAddSecParent('');
      await loadDetail(selectedId);
    } catch {
      /* ignore */
    }
  }

  // ── Section Rewrite ──
  async function handleRewrite() {
    if (!rewriteModal || !selectedId) return;
    setRewriting(true);
    try {
      const res = await fetch(`/api/papers/${selectedId}/sections/${rewriteModal.sectionId}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modificationDirection: rewriteDirection,
          requirements: rewriteRequirements,
          givenContent: rewriteGivenContent,
        }),
      });
      const data = await res.json();
      if (data.section) {
        await loadDetail(selectedId);
      }
    } catch {
      /* ignore */
    }
    setRewriting(false);
    setRewriteModal(null);
    setRewriteDirection('');
    setRewriteRequirements('');
    setRewriteGivenContent('');
  }

  // ── 片段局部重写：选区捕获 ──
  function handleFulltextSelection(
    e: React.MouseEvent<HTMLPreElement> | React.KeyboardEvent<HTMLPreElement>,
    sectionId: string,
  ) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const pre = e.currentTarget;
    if (!pre.contains(range.commonAncestorContainer)) return;
    const start = offsetInRoot(pre, range.startContainer, range.startOffset);
    const end = offsetInRoot(pre, range.endContainer, range.endOffset);
    const text = (pre.textContent ?? '').slice(start, end).trim();
    if (text.length < 4) return;
    setSegmentSel({ sectionId, text, start, end, rect: range.getBoundingClientRect() });
    setSegmentTarget('fulltext');
  }

  function handleEditTextareaSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    if (ta.selectionEnd <= ta.selectionStart) {
      if (segmentSel?.sectionId === contentSectionId && segmentTarget === 'edit') setSegmentSel(null);
      return;
    }
    if (!contentSectionId) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = editedContentTex.slice(start, end).trim();
    if (text.length < 4) return;
    const r = ta.getBoundingClientRect();
    const rect = {
      top: r.bottom - 36,
      bottom: r.bottom - 4,
      left: Math.max(r.left, r.right - 170),
      right: r.right - 4,
      width: 166,
      height: 32,
    } as DOMRect;
    setSegmentSel({ sectionId: contentSectionId, text, start, end, rect });
    setSegmentTarget('edit');
  }

  // ── 片段局部重写：执行 + 拼接 ──
  async function handleSegmentRevise() {
    if (!selectedId || !segmentSel) return;
    const note = segmentNote.trim();
    if (!note) return;
    setSegmentRevising(true);
    try {
      const { sectionId, text: passage, start, end } = segmentSel;
      const source =
        segmentTarget === 'edit'
          ? editedContentTex
          : (detail?.sections?.find((sec) => sec.id === sectionId)?.contentTex ?? '');
      const before = source.slice(Math.max(0, start - 200), start);
      const after = source.slice(end, end + 200);
      const data = await revisePassage(selectedId, sectionId, { passage, note, before, after });
      const newTex = spliceSegment(source, start, end, data.revised);
      if (segmentTarget === 'edit') {
        setEditedContentTex(newTex);
      } else {
        // 立即刷新全文视图，并切入编辑态供审阅
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                sections: prev.sections?.map((s) => (s.id === sectionId ? { ...s, contentTex: newTex } : s)),
              }
            : prev,
        );
        setFulltext(null);
        setContentSectionId(sectionId);
        setEditedContentTex(newTex);
        setEditingContent(true);
      }
      if (data.warnings?.length) alert(data.warnings.join('\n'));
      setSegmentModal(false);
      setSegmentNote('');
      setSegmentSel(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '局部重写失败');
    }
    setSegmentRevising(false);
  }

  // 点击浮动按钮之外关闭选区
  useEffect(() => {
    if (!segmentSel) return;
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement;
      // 浮动按钮与局部重写弹窗内部都不算「点击空白处」
      if (target.closest('[data-segment-float], [data-testid="segment-modal"]')) return;
      setSegmentSel(null);
    }
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [segmentSel]);

  // ── 自动定向修订：整章运行 ──
  async function handleAutoReviseSection(sectionId: string) {
    if (!selectedId) return;
    setAutoRevising(true);
    setAutoReviseResult(null);
    try {
      const res = await fetch(`/api/papers/${selectedId}/sections/${sectionId}/auto-revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '自动定向修订失败');
      const sec = data.report?.sections?.[0];
      setAutoReviseResult({
        sectionId,
        adopted: sec?.adopted ?? 0,
        rejected: sec?.rejected ?? 0,
      });
      await loadDetail(selectedId);
    } catch (err) {
      alert(err instanceof Error ? err.message : '自动定向修订失败');
    }
    setAutoRevising(false);
  }

  /** 客户端定位审计 finding 指向的片段（与后端 locateAuditFinding 逻辑对齐）。 */
  function locateFindingPassageClient(
    content: string,
    finding: any,
  ): { start: number; end: number; text: string } | null {
    const loc = finding.location;
    if (loc && /^\d{1,6}$/.test(String(loc).trim())) {
      const start = Number(String(loc).trim());
      if (start >= 0 && start < content.length) {
        const e = content.indexOf('。', start);
        const end = e === -1 ? content.length : e + 1;
        const text = content.slice(start, end);
        if (text.trim().length >= 4) return { start, end, text };
      }
    }
    const q =
      (finding.suggestion || '').match(/"([^"]{4,})"/)?.[1] || (finding.suggestion || '').match(/「([^」]{4,})」/)?.[1];
    if (q) {
      const idx = content.indexOf(q);
      if (idx !== -1 && q.trim().length >= 4) return { start: idx, end: idx + q.length, text: q };
    }
    return null;
  }

  /** 审计发现 → 打开局部重写弹窗，预填修改意见。 */
  function handleFixAuditFinding(sectionId: string, finding: any) {
    const s = detail?.sections?.find((sec) => sec.id === sectionId);
    if (!s?.contentTex) return;
    const p = locateFindingPassageClient(s.contentTex, finding);
    if (!p) {
      alert('无法自动定位该问题对应的原文片段，请在编辑模式中手动选中后使用「局部重写」。');
      return;
    }
    setAuditReportModal(null);
    setContentSectionId(sectionId);
    setEditedContentTex(s.contentTex);
    setEditingContent(true);
    setSegmentSel({ sectionId, text: p.text, start: p.start, end: p.end });
    setSegmentTarget('edit');
    setSegmentNote(finding.suggestion ?? finding.description ?? '');
    setSegmentModal(true);
  }

  function handleContentSectionChange(newId: string | null) {
    if (editingContent && newId !== contentSectionId) {
      if (!confirm('当前正在编辑，切换章节将丢弃未保存的更改。是否继续？')) {
        return;
      }
      setEditingContent(false);
      setEditedContentTex('');
    }
    setContentSectionId(newId);
  }

  function handleStartEditContent() {
    const s = detail?.sections?.find((sec) => sec.id === contentSectionId);
    if (s?.contentTex) {
      setEditedContentTex(s.contentTex);
      setEditingContent(true);
    }
  }

  async function handleSaveContent() {
    if (!selectedId || !contentSectionId) return;
    setSavingContent(true);
    try {
      const res = await fetch(`/api/papers/${selectedId}/sections/${contentSectionId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentTex: editedContentTex }),
      });
      if (!res.ok) {
        alert('保存失败');
        setSavingContent(false);
        return;
      }
      setEditingContent(false);
      setEditedContentTex('');
      await loadDetail(selectedId);
    } catch {
      alert('保存失败');
    }
    setSavingContent(false);
  }

  function handleCancelEditContent() {
    setEditingContent(false);
    setEditedContentTex('');
  }

  async function handleOptimizeRelated() {
    if (!selectedId || !contentSectionId || optimizeTargetIds.length === 0) return;
    setOptimizing(true);
    try {
      const res = await fetch(`/api/papers/${selectedId}/sections/${contentSectionId}/optimize-related`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSectionIds: optimizeTargetIds }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowOptimizeModal(false);
        await loadDetail(selectedId);
        alert('关联章节优化完成');
      } else {
        alert(data.error || '优化失败');
      }
    } catch {
      alert('优化请求失败');
    }
    setOptimizing(false);
  }

  // ── 引文 CRUD ──
  async function loadCitations(sectionId?: string | null) {
    if (!selectedId) return;
    try {
      const url = sectionId
        ? `/api/papers/${selectedId}/sections/${sectionId}/citations`
        : `/api/papers/${selectedId}/citations`;
      const res = await fetch(url);
      const data = await res.json();
      setPaperCitations(data.citations ?? []);
      setCitationTotal(data.total ?? 0);
    } catch {
      /* ignore */
    }
  }

  async function handleSaveCitation() {
    if (!selectedId || !citationModal) return;
    try {
      if (citationModal.mode === 'add') {
        await fetch(`/api/papers/${selectedId}/citations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            citeKey: citKey,
            bibtex: citBibtex,
            title: citTitle,
            url: citUrl,
            authors: citAuthors,
            year: citYear ? parseInt(citYear) : null,
          }),
        });
      } else if (citationModal.mode === 'edit' && citationModal.key) {
        await fetch(`/api/papers/${selectedId}/citations/${citationModal.key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bibtex: citBibtex,
            title: citTitle,
            url: citUrl,
            authors: citAuthors,
            year: citYear ? parseInt(citYear) : null,
          }),
        });
      }
      setCitationModal(null);
      resetCitationForm();
      await loadCitations(citationSectionId);
    } catch {
      /* ignore */
    }
  }

  async function handleDeleteCitation(citeKey: string) {
    if (!selectedId) return;
    if (!confirm(`确定要删除引用「${citeKey}」吗？`)) return;
    try {
      await fetch(`/api/papers/${selectedId}/citations/${citeKey}`, { method: 'DELETE' });
      await loadCitations(citationSectionId);
    } catch {
      /* ignore */
    }
  }

  function openCitationAddModal() {
    resetCitationForm();
    setCitationModal({ mode: 'add' });
  }

  function openCitationEditModal(c: any) {
    setCitKey(c.cite_key);
    setCitBibtex(c.bibtex ?? '');
    setCitTitle(c.title ?? '');
    setCitUrl(c.url ?? '');
    setCitAuthors(c.authors ?? '');
    setCitYear(c.year?.toString() ?? '');
    setCitationModal({ mode: 'edit', key: c.cite_key });
  }

  function resetCitationForm() {
    setCitKey('');
    setCitBibtex('');
    setCitTitle('');
    setCitUrl('');
    setCitAuthors('');
    setCitYear('');
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── 递归渲染大纲树节点 ──
  function renderNode(node: OutlineNode) {
    const isCollapsed = collapsed.has(node.section.id);
    const hasChildren = node.children.length > 0;
    const isLeaf = !hasChildren;
    const sd = sectionDataFor(node.section.id);
    const statusInfo = sd ? (STATUS_MAP[sd.status] ?? STATUS_MAP.pending) : null;
    const isDetailOpen = expandedDetail === node.section.id;
    const isWriting = writingSectionId === node.section.id;
    const isContentSelected = contentSectionId === node.section.id;
    const hasContent = sd?.contentTex && sd.contentTex.length > 0;
    // 深度对应的缩进
    const indent = node.depth * 20;

    return (
      <div key={node.section.id}>
        {/* 节点行 */}
        <div
          className="flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer transition-all duration-150 group hover:bg-white/[0.03]"
          style={{ paddingLeft: 12 + indent }}
          onClick={() => {
            if (hasChildren) toggleCollapse(node.section.id);
            setExpandedDetail(isDetailOpen ? null : node.section.id);
            if (hasContent) handleContentSectionChange(node.section.id);
          }}
        >
          {/* 展开/折叠图标 */}
          {hasChildren ? (
            isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
            )
          ) : (
            <span className="w-3.5 flex-shrink-0" />
          )}

          {/* 层级指示 */}
          {node.depth === 0 && <BookOpen className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />}
          {node.depth === 1 && <FileText className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />}
          {node.depth >= 2 && <Edit3 className="h-3 w-3 text-slate-500 flex-shrink-0" />}

          {/* 标题 */}
          <span
            className={`text-sm flex-1 truncate ${
              node.depth === 0 ? 'text-slate-100 font-semibold' : node.depth === 1 ? 'text-slate-200' : 'text-slate-400'
            }`}
          >
            {node.section.id}. {node.section.title}
          </span>

          {/* 状态标签 */}
          {statusInfo && (
            <span
              className="text-xs px-1.5 py-0 rounded-full flex-shrink-0"
              style={{ color: statusInfo.color, background: statusInfo.bg, border: `1px solid ${statusInfo.color}20` }}
            >
              {statusInfo.label}
            </span>
          )}

          {/* 页数 */}
          <span className="text-xs text-slate-600 flex-shrink-0 w-10 text-right">{node.section.estimatedPages}页</span>

          {/* 撰写按钮 (仅叶子节点) */}
          {isLeaf && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleWrite(node.section.id);
              }}
              disabled={isWriting}
              className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 h-6 px-2 rounded text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-all flex-shrink-0"
            >
              {isWriting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              撰写
            </button>
          )}
          {/* 查看原文按钮 (有内容的节点) */}
          {hasContent && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleContentSectionChange(isContentSelected ? null : node.section.id);
              }}
              className={`inline-flex items-center gap-1 h-6 px-2 rounded text-xs transition-all flex-shrink-0 ${
                isContentSelected
                  ? 'text-emerald-400 bg-emerald-500/15'
                  : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              <Eye className="h-3 w-3" />
              查看
            </button>
          )}

          {/* 编辑按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditSection(node.section.id);
            }}
            className="opacity-0 group-hover:opacity-100 inline-flex items-center h-6 px-1.5 rounded text-xs text-blue-400 hover:bg-blue-500/10 transition-all flex-shrink-0"
          >
            <Edit3 className="h-3 w-3" />
          </button>

          {/* 删除按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteSectionConfirm(node.section.id);
            }}
            className="opacity-0 group-hover:opacity-100 inline-flex items-center h-6 px-1.5 rounded text-xs text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
          >
            <Trash2 className="h-3 w-3" />
          </button>

          {/* 上移/下移 */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMoveSection(node.section.id, 'up');
              }}
              className="inline-flex items-center h-6 px-1 text-xs text-slate-500 hover:text-slate-300"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleMoveSection(node.section.id, 'down');
              }}
              className="inline-flex items-center h-6 px-1 text-xs text-slate-500 hover:text-slate-300"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* 展开的详情面板 */}
        {isDetailOpen && (
          <div
            className="mt-1 mb-1 p-3 rounded-lg space-y-2"
            style={{
              marginLeft: 12 + indent + 16,
              border: '1px solid rgba(16,185,129,0.15)',
              background: 'rgba(16,185,129,0.03)',
            }}
          >
            {/* 核心论点 */}
            <div className="space-y-1">
              <div className="text-xs text-slate-500 uppercase tracking-wider">核心论点</div>
              <p className="text-xs text-slate-300 leading-relaxed">{node.section.coreArgument}</p>
            </div>

            {/* 约束条件（来自 Planner 增强） */}
            {node.section.primaryGoal && (
              <div className="space-y-1">
                <div className="text-xs text-slate-500 uppercase tracking-wider">写作目标</div>
                <p className="text-xs text-emerald-400/80 leading-relaxed">{node.section.primaryGoal}</p>
              </div>
            )}
            {node.section.mustKeep && node.section.mustKeep.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-slate-500 uppercase tracking-wider">必须保留</div>
                <div className="flex flex-wrap gap-1">
                  {node.section.mustKeep.map((item: string, i: number) => (
                    <span
                      key={i}
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(34,197,94,0.1)', color: 'rgba(34,197,94,0.8)' }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {node.section.forbidden && node.section.forbidden.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-slate-500 uppercase tracking-wider">禁止内容</div>
                <div className="flex flex-wrap gap-1">
                  {node.section.forbidden.map((item: string, i: number) => (
                    <span
                      key={i}
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(239,68,68,0.1)', color: 'rgba(239,68,68,0.8)' }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 元信息 */}
            <div className="flex gap-4 text-xs text-slate-500">
              <span>预计 {node.section.estimatedPages} 页</span>
              <span>需引 {node.section.requiredCitations} 篇文献</span>
              {sd && <span>版本 v{sd.version}</span>}
            </div>

            {/* 撰写状态 */}
            {sd ? (
              <div className="flex items-center gap-2">
                {sd.status === 'passed' && <FileCheck className="h-3 w-3 text-emerald-400" />}
                {sd.status === 'needs_fix' || sd.status === 'failed' ? (
                  <AlertCircle className="h-3 w-3 text-red-400" />
                ) : null}
                {(sd.status === 'drafting' || sd.status === 'auditing') && <Clock className="h-3 w-3 text-amber-400" />}
                <span className="text-xs" style={{ color: statusInfo?.color }}>
                  {statusInfo?.label}
                </span>
                {hasContent && <span className="text-xs text-slate-600 ml-2">共 {sd.contentTex!.length} 字符</span>}
              </div>
            ) : (
              <div className="text-xs text-slate-600 italic">尚未撰写 — 点击上方"撰写"按钮启动 Pipeline 生成</div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleWrite(node.section.id)}
                disabled={isWriting}
                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
              >
                {isWriting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                {sd ? '重新撰写' : '开始撰写'}
              </button>
              {hasContent && (
                <>
                  <button
                    onClick={() => {
                      setRewriteModal({ sectionId: node.section.id, title: node.section.title });
                      setRewriteDirection('');
                      setRewriteRequirements('');
                      setRewriteGivenContent('');
                    }}
                    className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    <Edit3 className="h-3 w-3" />
                    修改
                  </button>
                  <button
                    onClick={() => handleContentSectionChange(isContentSelected ? null : node.section.id)}
                    className={`inline-flex items-center gap-1 h-7 px-3 rounded text-xs transition-colors ${
                      isContentSelected
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    查看原文
                  </button>
                </>
              )}
              <button
                onClick={() => openStatus(node.section.id)}
                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors"
              >
                <Clock className="h-3 w-3" />
                状态
              </button>
              <button
                onClick={() => openAuditReport(node.section.id)}
                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-purple-400 hover:bg-purple-500/10 transition-colors"
              >
                <AlertCircle className="h-3 w-3" />
                审计
              </button>
              <button
                onClick={() => {
                  setCitationSectionId(node.section.id);
                  loadCitations(node.section.id);
                  setShowCitations(true);
                }}
                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-blue-400 hover:bg-blue-500/10 transition-colors"
              >
                <Bookmark className="h-3 w-3" />
                引文
              </button>
            </div>
          </div>
        )}

        {/* 子节点 (非折叠时) */}
        {hasChildren && !isCollapsed && <div>{node.children.map((child) => renderNode(child))}</div>}
      </div>
    );
  }

  // ── 渲染 ──
  const selectedPaper = papers.find((p) => p.id === selectedId);

  return (
    <div className="flex flex-col h-full">
      {/* ============================================================
          顶部栏：项目选择 + 操作按钮
          ============================================================ */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* 项目选择下拉框 */}
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-slate-500" />
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value || null)}
            className="glass-input h-8 px-3 text-sm text-slate-200 min-w-[200px]"
          >
            {papers.length === 0 && <option value="">暂无项目</option>}
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        {/* 新建按钮 */}
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          新建
        </button>

        {/* 研究引导按钮 */}
        <button
          onClick={() => (window.location.hash = '#research-guide')}
          className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1 text-emerald-400"
          title="苏格拉底研究引导"
        >
          <Compass className="h-3.5 w-3.5" />
          引导
        </button>

        {/* 删除按钮 */}
        {selectedPaper && (
          <button
            onClick={() => setDeleteConfirm(selectedId)}
            className="h-8 px-3 text-xs inline-flex items-center gap-1 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
        )}

        <div className="flex-1" />

        {/* 操作按钮组 */}
        {selectedPaper && detail && !detail.outline && (
          <button
            onClick={handlePlan}
            disabled={planning}
            className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(37,99,235,0.9))' }}
          >
            {planning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            生成大纲
          </button>
        )}
        {detail?.outline && (
          <>
            {detail.sections && detail.sections.some((s) => s.contentTex) && (
              <>
                <button
                  data-testid="view-fulltext"
                  onClick={handleViewFulltext}
                  disabled={loadingFulltext}
                  className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1"
                >
                  {loadingFulltext ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                  查看原文
                </button>
                <button
                  data-testid="smart-edit-open"
                  onClick={() => setShowSmartEdit(true)}
                  className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  智能编辑
                </button>
                <button
                  onClick={handleExportMd}
                  className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1"
                >
                  <Download className="h-3.5 w-3.5" />
                  导出 MD
                </button>
                <button
                  onClick={() => handleIntegrityGate()}
                  className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1 text-orange-400"
                  title="完整性门控 (Stage 2.5)"
                >
                  <Shield className="h-3.5 w-3.5" />
                  完整性
                </button>
                <button
                  onClick={() => handleStartReview()}
                  className="glass-btn-secondary h-8 px-3 text-xs inline-flex items-center gap-1 text-violet-400"
                  title="同行评审 (Stage 3)"
                >
                  <Users className="h-3.5 w-3.5" />
                  评审
                </button>
              </>
            )}
            <button
              onClick={handleCompile}
              disabled={compiling}
              className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(109,40,217,0.9))' }}
            >
              {compiling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '编译 LaTeX'}
            </button>
          </>
        )}
      </div>

      {/* 创建表单 */}
      {showCreate && (
        <div
          className="flex flex-col gap-3 p-4 mx-4 mt-2 rounded-lg"
          style={{ border: '1px dashed rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}
        >
          <input
            placeholder="论文标题 *"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="glass-input h-8 px-3 text-sm"
            autoFocus
          />
          <input
            placeholder="研究主题（留空默认使用标题）"
            value={newResearchTopic}
            onChange={(e) => setNewResearchTopic(e.target.value)}
            className="glass-input h-8 px-3 text-sm"
          />
          <input
            placeholder="目标期刊（可选，例如：社会学研究）"
            value={newTargetJournal}
            onChange={(e) => setNewTargetJournal(e.target.value)}
            className="glass-input h-8 px-3 text-sm"
          />
          <textarea
            placeholder="创新点或研究要求（每行一个，可选）"
            value={newContributionGaps}
            onChange={(e) => setNewContributionGaps(e.target.value)}
            className="glass-input h-20 px-3 py-2 text-sm resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="glass-btn-secondary h-8 px-4 text-xs">
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="glass-btn-primary h-8 px-4 text-sm"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : '创建'}
            </button>
          </div>
        </div>
      )}

      {/* 全文预览模态框 — 支持分段查看 */}
      {fulltext && (
        <div
          data-testid="fulltext-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setFulltext(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[88vh] flex flex-col rounded-xl"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div
              className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-slate-200 font-medium">{fulltext.title}</span>
                <span className="text-xs text-slate-500 ml-2">(LaTeX)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFulltextViewMode(fulltextViewMode === 'segmented' ? 'full' : 'segmented')}
                  className={`glass-btn-secondary h-7 px-3 text-xs inline-flex items-center gap-1 ${fulltextViewMode === 'segmented' ? 'text-emerald-400' : ''}`}
                >
                  {fulltextViewMode === 'segmented' ? <AlignLeft className="h-3 w-3" /> : <List className="h-3 w-3" />}
                  {fulltextViewMode === 'segmented' ? '分段查看' : '全文查看'}
                </button>
                <button
                  onClick={handleExportMd}
                  className="glass-btn-secondary h-7 px-3 text-xs inline-flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  导出 MD
                </button>
                <button
                  onClick={() => setFulltext(null)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 主体：分段查看模式 */}
            {fulltextViewMode === 'segmented' ? (
              <div className="flex flex-1 overflow-hidden">
                {/* 左侧目录 */}
                <div
                  className="w-56 flex-shrink-0 overflow-y-auto p-3 space-y-1"
                  style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <button
                    onClick={() => setFulltextSection('all')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                      fulltextSection === 'all'
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    全部章节
                  </button>
                  {detail?.sections
                    ?.filter((s) => s.contentTex)
                    .sort((a, b) => a.sectionNumber - b.sectionNumber)
                    .map((s) => (
                      <button
                        key={s.id}
                        data-testid={`fulltext-toc-${s.id}`}
                        onClick={() => setFulltextSection(s.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                          fulltextSection === s.id
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                        }`}
                      >
                        <span className="text-slate-600 mr-1">{s.sectionNumber}.</span>
                        {s.title}
                      </button>
                    ))}
                </div>
                {/* 右侧内容 */}
                <div className="flex-1 overflow-auto p-5">
                  {fulltextSection === 'all' ? (
                    <pre
                      className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed"
                      style={{ tabSize: 2 }}
                    >
                      {fulltext.content || '（尚无内容）'}
                    </pre>
                  ) : (
                    (() => {
                      const s = detail?.sections?.find((sec) => sec.id === fulltextSection);
                      if (!s || !s.contentTex) return <div className="text-xs text-slate-500">此章节暂无内容</div>;
                      return (
                        <div>
                          <h3 className="text-sm font-semibold text-slate-200 mb-3">
                            {s.sectionNumber}. {s.title}
                          </h3>
                          <pre
                            data-testid="fulltext-section-pre"
                            className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed"
                            style={{ tabSize: 2 }}
                            onMouseUp={(e) => handleFulltextSelection(e, s.id)}
                            onKeyUp={(e) => handleFulltextSelection(e, s.id)}
                          >
                            {s.contentTex}
                          </pre>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            ) : (
              /* 全文查看模式 */
              <div className="flex-1 overflow-auto p-5">
                <pre
                  className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed"
                  style={{ tabSize: 2 }}
                >
                  {fulltext.content || '（尚无内容）'}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
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
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.15)' }}
              >
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <div className="text-sm text-slate-200 font-medium">确认删除</div>
                <div className="text-xs text-slate-400 mt-1">
                  将永久删除「{papers.find((p) => p.id === deleteConfirm)?.title}
                  」及其所有章节内容和圣经条目，此操作不可撤销。
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9))' }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除章节确认对话框 */}
      {deleteSectionConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDeleteSectionConfirm(null)}
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
                  将永久删除章节「{detail?.outline?.sections.find((s) => s.id === deleteSectionConfirm)?.title}
                  」及其所有子章节，此操作不可撤销。
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteSectionConfirm(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={() => handleDeleteSection(deleteSectionConfirm)}
                className="h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9))' }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 修改弹窗 ── */}
      {/* ── 片段局部重写：浮动工具栏 ── */}
      {segmentSel && !segmentModal && (
        <div
          data-segment-float
          className="fixed z-[60] flex items-center gap-1"
          style={{ top: (segmentSel.rect?.bottom ?? 0) + 4, left: Math.max(8, segmentSel.rect?.left ?? 0) }}
        >
          <button
            data-testid="segment-float-btn"
            onClick={() => setSegmentModal(true)}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs text-amber-300 transition-all hover:opacity-90 shadow-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(251,191,36,0.9), rgba(217,119,6,0.9))',
              color: '#0f172a',
            }}
          >
            <Edit3 className="h-3.5 w-3.5" />
            局部重写
          </button>
        </div>
      )}

      {/* ── 片段局部重写：修改意见弹窗 ── */}
      {segmentModal && segmentSel && (
        <div
          data-testid="segment-modal"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSegmentModal(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(251,191,36,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Edit3 className="h-5 w-5 text-amber-400" />
              <div>
                <div className="text-sm text-slate-200 font-medium">局部重写</div>
                <div className="text-xs text-slate-500">只重写选中的这一段，公式与引文保持原样</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-1">选中的内容</div>
              <pre
                className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-black/20 rounded-lg p-2 max-h-32 overflow-auto"
                style={{ tabSize: 2 }}
              >
                {segmentSel.text}
              </pre>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">修改意见</label>
              <textarea
                data-testid="segment-note"
                value={segmentNote}
                onChange={(e) => setSegmentNote(e.target.value)}
                placeholder="例如：这段论证逻辑不清晰，请强化证据链，去掉 AI 味"
                className="glass-input w-full h-20 px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setSegmentModal(false)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                data-testid="segment-confirm"
                onClick={handleSegmentRevise}
                disabled={segmentRevising || !segmentNote.trim()}
                className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.9), rgba(217,119,6,0.9))' }}
              >
                {segmentRevising ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Edit3 className="h-3.5 w-3.5" />}
                {segmentRevising ? '重写中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 智能编辑 Agent 弹窗 ── */}
      {showSmartEdit && selectedId && (
        <div
          data-testid="smart-edit-modal"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowSmartEdit(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(16,185,129,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Sparkles className="h-5 w-5 text-emerald-400" />
              <div>
                <div className="text-sm text-slate-200 font-medium">智能编辑 Agent</div>
                <div className="text-xs text-slate-500">
                  自动定位需要修改的段落 → 逐段局部重写 → 一致性校验 → 确认后落盘（自动备份）
                </div>
              </div>
            </div>
            <SmartEditPanel
              paperId={selectedId}
              onApplied={() => loadDetail(selectedId)}
              onClose={() => setShowSmartEdit(false)}
            />
          </div>
        </div>
      )}

      {rewriteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setRewriteModal(null)}
        >
          <div
            className="w-full max-w-xl rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(251,191,36,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Edit3 className="h-5 w-5 text-amber-400" />
              <div>
                <div className="text-sm text-slate-200 font-medium">修改章节：{rewriteModal.title}</div>
                <div className="text-xs text-slate-500">输入修改意见，模型将根据要求重写</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">修改方向</label>
                <textarea
                  value={rewriteDirection}
                  onChange={(e) => setRewriteDirection(e.target.value)}
                  placeholder="例如：完善逻辑推理链，增强论证强度"
                  className="glass-input w-full h-20 px-3 py-2 text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">修改要求</label>
                <textarea
                  value={rewriteRequirements}
                  onChange={(e) => setRewriteRequirements(e.target.value)}
                  placeholder="例如：增加更多数据支撑，引用最新的研究成果"
                  className="glass-input w-full h-20 px-3 py-2 text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">给定的内容</label>
                <textarea
                  value={rewriteGivenContent}
                  onChange={(e) => setRewriteGivenContent(e.target.value)}
                  placeholder="可选：提供需要补充的具体内容、数据或参考文献"
                  className="glass-input w-full h-20 px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setRewriteModal(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={handleRewrite}
                disabled={rewriting || (!rewriteDirection && !rewriteGivenContent)}
                className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.9), rgba(217,119,6,0.9))' }}
              >
                {rewriting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {rewriting ? '修改中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 编辑大纲章节弹窗 ── */}
      {editingSection &&
        (() => {
          const sec = detail?.outline?.sections.find((s) => s.id === editingSection);
          if (!sec) return null;
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
              onClick={() => setEditingSection(null)}
            >
              <div
                className="w-full max-w-lg rounded-xl p-6 space-y-4"
                style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center gap-3 pb-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <Edit3 className="h-5 w-5 text-blue-400" />
                  <div>
                    <div className="text-sm text-slate-200 font-medium">编辑大纲章节</div>
                    <div className="text-xs text-slate-500">
                      {sec.id}. {sec.title}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">章节标题</label>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="glass-input w-full h-8 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">核心论点</label>
                    <textarea
                      value={editCoreArg}
                      onChange={(e) => setEditCoreArg(e.target.value)}
                      className="glass-input w-full h-24 px-3 py-2 text-sm resize-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={() => setEditingSection(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                    取消
                  </button>
                  <button
                    onClick={handleSaveSection}
                    className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(37,99,235,0.9))' }}
                  >
                    <Save className="h-3.5 w-3.5" />
                    保存
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── 新增章节弹窗 ── */}
      {showAddSection && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowAddSection(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(16,185,129,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Plus className="h-5 w-5 text-emerald-400" />
              <div>
                <div className="text-sm text-slate-200 font-medium">新增章节</div>
                <div className="text-xs text-slate-500">添加新的论文章节</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  章节 ID <span className="text-red-400">*</span>
                </label>
                <input
                  value={addSecId}
                  onChange={(e) => setAddSecId(e.target.value)}
                  placeholder="例如：3-4"
                  className="glass-input w-full h-8 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  标题 <span className="text-red-400">*</span>
                </label>
                <input
                  value={addSecTitle}
                  onChange={(e) => setAddSecTitle(e.target.value)}
                  placeholder="例如：实验设置"
                  className="glass-input w-full h-8 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">核心论点</label>
                <textarea
                  value={addSecCoreArg}
                  onChange={(e) => setAddSecCoreArg(e.target.value)}
                  className="glass-input w-full h-20 px-3 py-2 text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">父级章节 ID（可选）</label>
                <input
                  value={addSecParent}
                  onChange={(e) => setAddSecParent(e.target.value)}
                  placeholder="例如：3"
                  className="glass-input w-full h-8 px-3 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowAddSection(false)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={handleAddSection}
                disabled={!addSecId || !addSecTitle}
                className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.9), rgba(5,150,105,0.9))' }}
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 生成参考文献弹窗 ── */}
      {showRefGen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowRefGen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(217,119,6,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <List className="h-5 w-5 text-amber-400" />
              <div>
                <div className="text-sm text-slate-200 font-medium">生成参考文献章节</div>
                <div className="text-[11px] text-slate-500 mt-0.5">根据全部引文自动生成 thebibliography LaTeX 章节</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">引用格式模板（可选，可覆盖默认 GB/T 7714）</label>
                <textarea
                  value={refGenTemplate}
                  onChange={(e) => setRefGenTemplate(e.target.value)}
                  placeholder="例如：{authors}. {title}[J]. {journal}, {year}, {volume}({issue}): {pages}.&#10;留空使用默认 GB/T 7714-2015 格式"
                  className="glass-input w-full h-28 px-3 py-2 text-sm font-mono resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowRefGen(false)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={async () => {
                  setRefGenLoading(true);
                  try {
                    const res = await fetch(`/api/papers/${selectedId}/generate-references`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ template: refGenTemplate || undefined }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      setShowRefGen(false);
                      await loadDetail(selectedId!);
                    } else {
                      alert(data.error || '生成失败');
                    }
                  } catch {
                    alert('网络错误');
                  }
                  setRefGenLoading(false);
                }}
                disabled={refGenLoading}
                className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, rgba(217,119,6,0.9), rgba(180,83,9,0.9))' }}
              >
                {refGenLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <List className="h-3.5 w-3.5" />}
                {refGenLoading ? '生成中...' : '生成参考文献'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 引文管理弹窗 ── */}
      {showCitations && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCitations(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div
              className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-slate-200 font-medium">
                  {citationSectionId ? `引文 (${citationTotal} 篇)` : '全部引文'}
                </span>
                <span className="text-xs text-slate-500">({paperCitations.length} 条)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openCitationAddModal}
                  className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  新增
                </button>
                <button
                  onClick={async () => {
                    setLookupLoading(true);
                    try {
                      const res = await fetch(`/api/papers/${selectedId}/citations/lookup`, { method: 'POST' });
                      const data = await res.json();
                      if (!res.ok) {
                        alert(data.error || '反查失败');
                        return;
                      }
                      await loadCitations(citationSectionId);
                      const success = data.results?.filter((r: any) => r.found).length ?? 0;
                      alert(`反查完成：共 ${data.lookedUp ?? 0} 条，成功 ${success} 条`);
                    } catch {
                      alert('网络错误');
                    }
                    setLookupLoading(false);
                  }}
                  disabled={lookupLoading}
                  className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                >
                  {lookupLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  {lookupLoading ? '反查中...' : '反查'}
                </button>
                <button
                  onClick={() => setShowCitations(false)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* 引文列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {paperCitations.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-8">暂无引文，点击"新增"添加</div>
              ) : (
                paperCitations.map((c: any) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg space-y-1"
                    style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-300 font-medium truncate">
                          <span className="text-blue-400 text-[10px] mr-1">{c.cite_key}</span>
                          {c.hasDetail ? c.title : <span className="text-slate-500">(无详细信息)</span>}
                        </div>
                        {c.authors && <div className="text-[11px] text-slate-500 truncate mt-0.5">{c.authors}</div>}
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-600">
                          {c.year && <span>{c.year}</span>}
                          {c.url && (
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-400 inline-flex items-center gap-0.5"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                              {c.url.length > 40 ? c.url.slice(0, 40) + '...' : c.url}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => openCitationEditModal(c)}
                          className="h-6 px-1.5 rounded text-xs text-blue-400 hover:bg-blue-500/10"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteCitation(c.cite_key)}
                          className="h-6 px-1.5 rounded text-xs text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {c.bibtex && (
                      <pre
                        className="text-[10px] text-slate-600 mt-1 p-2 rounded overflow-x-auto"
                        style={{ background: 'rgba(0,0,0,0.2)' }}
                      >
                        {c.bibtex}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 状态弹窗 ── */}
      {statusModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setStatusModal(null)}
        >
          <div
            className="w-full max-w-md rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Clock className="h-5 w-5 text-slate-400" />
              <div>
                <div className="text-sm text-slate-200 font-medium">章节状态</div>
                <div className="text-xs text-slate-500">{statusModal.data.title}</div>
              </div>
            </div>
            {statusLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">状态</span>
                  <span className="text-slate-200">
                    {STATUS_MAP[statusModal.data.status]?.label ?? statusModal.data.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">版本</span>
                  <span className="text-slate-200">{statusModal.data.version}</span>
                </div>
                {statusModal.data.wordCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">字数</span>
                    <span className="text-slate-200">{statusModal.data.wordCount}</span>
                  </div>
                )}
                {statusModal.data.contentLength > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">字符数</span>
                    <span className="text-slate-200">{statusModal.data.contentLength}</span>
                  </div>
                )}
                {statusModal.data.coreArgument && (
                  <div>
                    <div className="text-slate-400 mb-1">核心论点</div>
                    <div className="text-slate-300 p-2 rounded" style={{ background: 'rgba(0,0,0,0.2)' }}>
                      {statusModal.data.coreArgument}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button onClick={() => setStatusModal(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 审计报告弹窗 ── */}
      {auditReportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setAuditReportModal(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between pb-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-purple-400" />
                <div>
                  <div className="text-sm text-slate-200 font-medium">审计报告</div>
                  <div className="text-xs text-slate-500">{auditReportModal.data.title}</div>
                </div>
              </div>
              <button
                onClick={() => handleAutoReviseSection(auditReportModal.sectionId)}
                disabled={autoRevising}
                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-purple-300 hover:bg-purple-500/10 disabled:opacity-50 transition-colors"
              >
                {autoRevising ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {autoRevising ? '修订中...' : '自动定向修订'}
              </button>
            </div>
            {auditReportLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">当前状态</span>
                  <span className="text-slate-200">
                    {STATUS_MAP[auditReportModal.data.status]?.label ?? auditReportModal.data.status}
                  </span>
                </div>
                {autoReviseResult && autoReviseResult.sectionId === auditReportModal.sectionId && (
                  <div
                    className="text-xs px-3 py-2 rounded"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
                  >
                    自动定向修订完成：已采纳 <span className="text-emerald-400">{autoReviseResult.adopted}</span>{' '}
                    处，拒绝 <span className="text-slate-400">{autoReviseResult.rejected}</span> 处。
                  </div>
                )}
                <div className="p-3 rounded" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <div className="text-slate-400 mb-2">审计发现（可逐条修复）</div>
                  {(auditReportModal.data.report?.findings ?? []).length > 0 ? (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {auditReportModal.data.report.findings.map((f: any) => (
                        <div key={f.id} className="p-2 rounded" style={{ background: 'rgba(0,0,0,0.2)' }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-slate-300">{f.dimension}</span>
                            <span
                              style={{
                                color:
                                  f.severity === 'critical'
                                    ? '#f87171'
                                    : f.severity === 'warning'
                                      ? '#fbbf24'
                                      : '#94a3b8',
                              }}
                            >
                              {f.severity === 'critical' ? '严重' : f.severity === 'warning' ? '警告' : '提示'}
                            </span>
                          </div>
                          <div className="text-slate-300 mt-1">{f.description}</div>
                          {f.suggestion && <div className="text-slate-500 mt-1">建议：{f.suggestion}</div>}
                          <div className="flex justify-end mt-1">
                            <button
                              onClick={() => handleFixAuditFinding(auditReportModal.sectionId, f)}
                              className="inline-flex items-center gap-1 h-6 px-2 rounded text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
                            >
                              <Edit3 className="h-3 w-3" />
                              修复此问题
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : auditReportModal.data.reportAvailable ? (
                    <div className="text-slate-300">无具体发现（审计报告已生成，可在 Pipeline 运行详情中查看）。</div>
                  ) : (
                    <div className="text-slate-500">{auditReportModal.data.message}</div>
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button onClick={() => setAuditReportModal(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 新增/编辑引文弹窗 ── */}
      {citationModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setCitationModal(null)}
        >
          <div
            className="w-full max-w-xl rounded-xl p-6 space-y-4"
            style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(59,130,246,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Bookmark className="h-5 w-5 text-blue-400" />
              <div>
                <div className="text-sm text-slate-200 font-medium">
                  {citationModal.mode === 'add' ? '新增引文' : '编辑引文'}
                </div>
              </div>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {citationModal.mode === 'add' && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    引用 Key <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={citKey}
                    onChange={(e) => setCitKey(e.target.value)}
                    placeholder="例如：vaswani2017attention"
                    className="glass-input w-full h-8 px-3 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1">标题</label>
                <input
                  value={citTitle}
                  onChange={(e) => setCitTitle(e.target.value)}
                  placeholder="文献标题"
                  className="glass-input w-full h-8 px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">URL</label>
                <input
                  value={citUrl}
                  onChange={(e) => setCitUrl(e.target.value)}
                  placeholder="https://..."
                  className="glass-input w-full h-8 px-3 text-sm"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">作者</label>
                  <input
                    value={citAuthors}
                    onChange={(e) => setCitAuthors(e.target.value)}
                    placeholder="作者姓名"
                    className="glass-input w-full h-8 px-3 text-sm"
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-slate-400 block mb-1">年份</label>
                  <input
                    value={citYear}
                    onChange={(e) => setCitYear(e.target.value)}
                    placeholder="2024"
                    className="glass-input w-full h-8 px-3 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">BibTeX</label>
                <textarea
                  value={citBibtex}
                  onChange={(e) => setCitBibtex(e.target.value)}
                  placeholder="@article{key, ...}"
                  className="glass-input w-full h-24 px-3 py-2 text-sm font-mono resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setCitationModal(null)} className="glass-btn-secondary h-8 px-4 text-xs">
                取消
              </button>
              <button
                onClick={handleSaveCitation}
                disabled={citationModal.mode === 'add' && !citKey}
                className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(37,99,235,0.9))' }}
              >
                <Save className="h-3.5 w-3.5" />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 优化关联章节弹窗 ── */}
      {showOptimizeModal &&
        (() => {
          const currentSec = detail?.outline?.sections.find((s) => s.id === contentSectionId);
          const siblings =
            detail?.outline?.sections.filter(
              (s) => s.id !== contentSectionId && s.parent === (currentSec?.parent ?? null),
            ) ?? [];
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
              onClick={() => setShowOptimizeModal(false)}
            >
              <div
                className="w-full max-w-lg rounded-xl p-6 space-y-4"
                style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(168,85,247,0.3)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center gap-3 pb-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <Sparkles className="h-5 w-5 text-purple-400" />
                  <div>
                    <div className="text-sm text-slate-200 font-medium">优化关联章节</div>
                    <div className="text-xs text-slate-500">基于当前章节的修改，优化相关联的章节</div>
                  </div>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {siblings.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center py-4">没有找到关联章节</div>
                  ) : (
                    siblings.map((sec) => (
                      <label
                        key={sec.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/[0.03]"
                        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <input
                          type="checkbox"
                          checked={optimizeTargetIds.includes(sec.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setOptimizeTargetIds((prev) => [...prev, sec.id]);
                            } else {
                              setOptimizeTargetIds((prev) => prev.filter((id) => id !== sec.id));
                            }
                          }}
                          className="rounded border-slate-600"
                        />
                        <span className="text-xs text-slate-300">
                          {sec.id}. {sec.title}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button onClick={() => setShowOptimizeModal(false)} className="glass-btn-secondary h-8 px-4 text-xs">
                    取消
                  </button>
                  <button
                    onClick={handleOptimizeRelated}
                    disabled={optimizing || optimizeTargetIds.length === 0}
                    className="inline-flex items-center gap-2 h-8 px-4 rounded-lg text-xs text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.9), rgba(126,34,206,0.9))' }}
                  >
                    {optimizing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {optimizing ? '优化中...' : '开始优化'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ============================================================
            主体：左右平铺 — 架构(大纲树) | 原文
            ============================================================ */}
      <div className="flex-1 flex overflow-hidden">
        {!selectedPaper ? (
          <div className="flex flex-col items-center justify-center w-full h-full gap-3">
            <FileText className="h-10 w-10 text-slate-700" />
            <span className="text-sm text-slate-500">暂无论文项目</span>
            <span className="text-xs text-slate-600">选择或创建一个论文项目开始写作</span>
          </div>
        ) : !detail?.outline ? (
          <div className="flex flex-col items-center justify-center w-full h-full gap-3">
            <BookOpen className="h-10 w-10 text-slate-700" />
            <span className="text-sm text-slate-500">暂无大纲</span>
            <span className="text-xs text-slate-600">点击上方"生成大纲"按钮开始</span>
          </div>
        ) : (
          <>
            {/* 左侧：大纲树 */}
            <div
              className="w-[45%] flex-shrink-0 overflow-y-auto p-4"
              style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-base font-bold text-slate-100">{detail.outline.title}</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setCitationSectionId(null);
                      loadCitations(null);
                      setShowCitations(true);
                    }}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs text-blue-400 hover:bg-blue-500/10 transition-colors"
                    title="管理引文"
                  >
                    <Bookmark className="h-3 w-3" />
                    引文
                  </button>
                  <button
                    onClick={() => setShowRefGen(true)}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title="生成参考文献章节"
                  >
                    <List className="h-3 w-3" />
                    参考文献
                  </button>
                  <button
                    onClick={() => setShowAddSection(true)}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    title="新增章节"
                  >
                    <Plus className="h-3 w-3" />
                    章节
                  </button>
                </div>
              </div>
              <div className="space-y-0.5">{outlineTree.map((node) => renderNode(node))}</div>
            </div>

            {/* 右侧：原文内容 */}
            <div className="flex-1 flex flex-col overflow-hidden p-4">
              {contentSectionId ? (
                (() => {
                  const s = detail?.sections?.find((sec) => sec.id === contentSectionId);
                  if (!s || !s.contentTex) {
                    return <div className="text-sm text-slate-500 text-center mt-20">此章节暂无内容</div>;
                  }
                  return (
                    <div className="flex flex-col flex-1 min-h-0">
                      <div
                        className="flex items-center justify-between mb-4 pb-3 flex-shrink-0"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <div>
                          <h3 className="text-base font-semibold text-slate-100">
                            {s.sectionNumber}. {s.title}
                          </h3>
                          <span className="text-xs text-slate-500 mt-1">
                            共 {s.contentTex.length} 字符 · 版本 v{s.version}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {editingContent ? (
                            <>
                              <button
                                data-testid="save-content"
                                onClick={handleSaveContent}
                                disabled={savingContent}
                                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
                              >
                                {savingContent ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3" />
                                )}
                                保存
                              </button>
                              <button
                                onClick={handleCancelEditContent}
                                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors"
                              >
                                <X className="h-3 w-3" />
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              {s.status && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={{
                                    color: STATUS_MAP[s.status]?.color,
                                    background: STATUS_MAP[s.status]?.bg,
                                    border: `1px solid ${STATUS_MAP[s.status]?.color}20`,
                                  }}
                                >
                                  {STATUS_MAP[s.status]?.label}
                                </span>
                              )}
                              <button
                                onClick={() => handleWrite(s.id)}
                                disabled={writingSectionId === s.id}
                                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
                              >
                                {writingSectionId === s.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                                重新撰写
                              </button>
                              <button
                                onClick={() => {
                                  setRewriteModal({ sectionId: s.id, title: s.title });
                                  setRewriteDirection('');
                                  setRewriteRequirements('');
                                  setRewriteGivenContent('');
                                }}
                                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
                              >
                                <Edit3 className="h-3 w-3" />
                                修改
                              </button>
                              <button
                                data-testid="edit-content-btn"
                                onClick={handleStartEditContent}
                                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-blue-400 hover:bg-blue-500/10 transition-colors"
                              >
                                <Edit3 className="h-3 w-3" />
                                编辑
                              </button>
                              <button
                                onClick={() => {
                                  const currentSec = detail?.outline?.sections.find(
                                    (sec) => sec.id === contentSectionId,
                                  );
                                  const siblings =
                                    detail?.outline?.sections.filter(
                                      (sec) =>
                                        sec.id !== contentSectionId && sec.parent === (currentSec?.parent ?? null),
                                    ) ?? [];
                                  setOptimizeTargetIds(siblings.map((sec) => sec.id));
                                  setShowOptimizeModal(true);
                                }}
                                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-purple-400 hover:bg-purple-500/10 transition-colors"
                              >
                                <Sparkles className="h-3 w-3" />
                                优化关联章节
                              </button>
                              <button
                                data-testid="auto-revise-btn"
                                onClick={() => handleAutoReviseSection(contentSectionId!)}
                                disabled={autoRevising}
                                className="inline-flex items-center gap-1 h-7 px-3 rounded text-xs text-fuchsia-400 hover:bg-fuchsia-500/10 disabled:opacity-50 transition-colors"
                              >
                                {autoRevising ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Shield className="h-3 w-3" />
                                )}
                                {autoRevising ? '修订中...' : '自动定向修订'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {editingContent ? (
                        <textarea
                          data-testid="edit-textarea"
                          value={editedContentTex}
                          onChange={(e) => setEditedContentTex(e.target.value)}
                          onMouseUp={handleEditTextareaSelect}
                          onKeyUp={handleEditTextareaSelect}
                          className="flex-1 min-h-0 w-full px-3 py-2 text-xs text-slate-300 font-mono leading-relaxed resize-none rounded-lg"
                          style={{
                            tabSize: 2,
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            outline: 'none',
                          }}
                        />
                      ) : (
                        <div className="flex-1 min-h-0 overflow-y-auto">
                          <pre
                            className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed"
                            style={{ tabSize: 2 }}
                          >
                            {s.contentTex}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-3">
                  <BookOpen className="h-8 w-8 text-slate-700" />
                  <span>在左侧大纲中点击章节即可查看原文</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
