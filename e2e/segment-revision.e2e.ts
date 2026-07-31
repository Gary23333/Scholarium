/**
 * 真实 Chrome 端到端测试 — 片段针对性修改三种能力
 *
 * 运行前需已构建前端（npm run build:frontend），webServer 会自动启动 API 并托管前端。
 * 无 API Key（mock 规则模式）即可跑通全流程。
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const AI_CONTENT =
  '值得注意的是，本文提出的基于大语言模型的多智能体写作方法在多项基准上取得了最优结果。' +
  '实验设置与文献\\cite{smith2020}保持一致，公式见\\begin{equation}E=mc^2\\end{equation}。' +
  '综上所述，该方法具有工程可行性。';

let paperId = '';

async function seedPaper(request: APIRequestContext): Promise<void> {
  const paperRes = await request.post('/api/papers', {
    data: { title: `e2e-${Date.now()}`, researchTopic: '多智能体论文写作' },
  });
  const paper = await paperRes.json();
  paperId = paper.paperId;
  await request.post(`/api/papers/${paperId}/plan`, { data: {} });
  await request.post(`/api/papers/${paperId}/write`, { data: { sectionId: '1' } });
  await request.put(`/api/papers/${paperId}/sections/1/content`, { data: { contentTex: AI_CONTENT } });
}

async function getSection(request: APIRequestContext): Promise<any> {
  const d = await (await request.get(`/api/papers/${paperId}`)).json();
  const p = d.paper ?? d;
  return p.sections.find((s: any) => s.id === '1');
}

/** 加载 UI 并进入论文页，自动选中 seed 的论文。 */
async function openPapersPage(page: Page): Promise<void> {
  await page.addInitScript((pid) => {
    localStorage.setItem('scholarium-entered', '1');
    localStorage.setItem('scholarium-selected-paper', pid);
  }, paperId);
  await page.goto('/');
  // 侧边栏 → 论文；大纲树出现「1. 引言」节点即代表论文已加载
  await page.locator('aside nav').getByText('论文', { exact: true }).click();
  await page.getByText('1. 引言', { exact: true }).first().waitFor({ timeout: 30_000 });
}

/** 在大纲树中选中章节 1（引言），显示右侧内容面板。 */
async function selectSection1(page: Page): Promise<void> {
  await page.getByText('1. 引言', { exact: true }).first().click();
  await page.getByTestId('edit-content-btn').waitFor({ timeout: 15_000 });
}

/** 在全文「分段查看」的章节 <pre> 里以 DOM Range 设置选区并触发 mouseup。 */
async function selectInFulltextPre(page: Page, startText: string, endText: string): Promise<void> {
  await page.evaluate(
    ({ s, e }) => {
      const pre = document.querySelector('[data-testid="fulltext-section-pre"]') as HTMLPreElement;
      const text = pre.textContent ?? '';
      const start = text.indexOf(s);
      const end = text.indexOf(e) + e.length;
      const node = pre.firstChild as Node;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      pre.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    },
    { s: startText, e: endText },
  );
}

/** 在编辑 textarea 里用 setSelectionRange 设置选区并触发 mouseup。 */
async function selectInTextarea(page: Page, startText: string, endText: string): Promise<void> {
  await page.evaluate(
    ({ s, e }) => {
      const ta = document.querySelector('[data-testid="edit-textarea"]') as HTMLTextAreaElement;
      const text = ta.value;
      ta.setSelectionRange(text.indexOf(s), text.indexOf(e) + e.length);
      ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    },
    { s: startText, e: endText },
  );
}

test.describe('片段针对性修改（真实 Chrome）', () => {
  test('① 划段局部重写 — 全文「分段查看」视图选中段落', async ({ page, request }) => {
    await seedPaper(request);
    await openPapersPage(page);
    await selectSection1(page);

    await page.getByTestId('view-fulltext').click();
    await page.getByTestId('fulltext-toc-1').click();
    await page.getByTestId('fulltext-section-pre').waitFor();

    // 选中包含 \cite 的片段 → 局部重写
    await selectInFulltextPre(page, '实验设置与文献', '保持一致');
    await page.getByTestId('segment-float-btn').click();
    await page.getByTestId('segment-note').fill('请去掉 AI 味，公式与引文必须原样保留');
    await page.getByTestId('segment-confirm').click();

    // 全文弹窗关闭，自动切入编辑态供审阅
    const textarea = page.getByTestId('edit-textarea');
    await textarea.waitFor({ timeout: 30_000 });
    const value = await textarea.inputValue();
    expect(value).toContain('\\cite{smith2020}'); // 引文未被破坏
    expect(value).toContain('\\begin{equation}'); // 公式未被破坏
    expect(value.length).toBeGreaterThan(AI_CONTENT.length - 30);

    await page.getByTestId('save-content').click();
    await page.getByTestId('save-content').waitFor({ state: 'detached', timeout: 30_000 });

    const sec = await getSection(request);
    expect(sec.contentTex).toContain('\\cite{smith2020}');
    expect(sec.contentTex).toContain('\\begin{equation}');
  });

  test('② 划段局部重写 — 手动编辑 textarea 选中文本', async ({ page, request }) => {
    await seedPaper(request);
    await openPapersPage(page);
    await selectSection1(page);

    // 进入编辑态
    await page.getByTestId('edit-content-btn').click();
    const textarea = page.getByTestId('edit-textarea');
    await textarea.waitFor();

    // 选中「综上所述」片段 → 局部重写
    await selectInTextarea(page, '综上所述', '工程可行性');
    await page.getByTestId('segment-float-btn').click();
    await page.getByTestId('segment-note').fill('请删掉 AI 味');
    await page.getByTestId('segment-confirm').click();

    await expect(textarea).toHaveValue(/综上所述|总之/); // 原文保留或已被改写
    const value = await textarea.inputValue();
    expect(value).toContain('\\cite{smith2020}');
    expect(value).toContain('\\begin{equation}');

    await page.getByTestId('save-content').click();
    await page.getByTestId('save-content').waitFor({ state: 'detached', timeout: 30_000 });
    const sec = await getSection(request);
    expect(sec.contentTex).toContain('\\cite{smith2020}');
  });

  test('③ 评审驱动自动定向修订 — 章节面板按钮', async ({ page, request }) => {
    await seedPaper(request);
    await openPapersPage(page);
    await selectSection1(page);

    await page.getByTestId('auto-revise-btn').click();

    // 等待内容更新（mock：值得注意的是 → 需要注意的是，并写入修订标记）
    await expect(async () => {
      const sec = await getSection(request);
      expect(sec.version).toBeGreaterThanOrEqual(6);
      expect(sec.contentTex).toContain('需要注意的是');
      expect(sec.contentTex).toContain('\\cite{smith2020}');
      expect(sec.contentTex).toContain('\\begin{equation}');
    }).toPass({ timeout: 60_000 });
  });

  test('④ 智能编辑 Agent — 分析 → 执行 → 确认落盘', async ({ page, request }) => {
    await seedPaper(request);
    await openPapersPage(page);

    await page.getByTestId('smart-edit-open').click();
    const modal = page.getByTestId('smart-edit-modal');
    await modal.waitFor();

    await page.getByTestId('smart-edit-request').fill('请删除 AI 味，统一全文表达');
    await page.getByTestId('smart-plan').click();

    // 等待修改清单出现
    await page.getByText(/修改清单（\d+ 处/).waitFor({ timeout: 60_000 });
    await page.getByTestId('smart-execute').click();

    // 等待执行结果出现
    await page.getByText(/执行结果（改 \d+ 处/).waitFor({ timeout: 60_000 });
    // 确认落盘（window.confirm）— 需在点击前注册
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('smart-apply').click();
    await page.getByText(/已落盘 \d+ 章/).waitFor({ timeout: 60_000 });

    const sec = await getSection(request);
    expect(sec.contentTex).toContain('\\cite{smith2020}');
    expect(sec.contentTex).toContain('\\begin{equation}');
    expect(sec.version).toBeGreaterThanOrEqual(6);
  });
});
