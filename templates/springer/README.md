# Springer Template

用于了解 Springer 期刊与会议论文（包括 Lecture Notes in Computer Science，LNCS）的模板。

## 当前状态

本目录目前只有这份说明，没有随仓库提供的 `main.tex`、文档类或样式文件。以下内容是投稿模板参考，不是可直接选用的 Scholarium 内置模板。

[模板注册表](../../src/latex/templates.ts) 当前只包含 `default`（`article` 文档类）。[组装器](../../src/latex/assembler.ts) 不会扫描本目录；使用未注册的模板 ID 会报 `Unknown template`。出版方模板需自行获取并手动适配。

## 文档类参考

既有模板可能使用 `svjour3`，LNCS 模板使用 `llncs`。这些名称是参考示例，不表示本仓库附带相应 `.cls` 文件，也不表示所有 Springer 期刊都采用同一文档类。请从目标刊会的当前投稿指南获取指定版本。

```latex
% 仅在目标期刊指定 svjour3 时采用：
\documentclass[twocolumn]{svjour3}
% LNCS 示例：\documentclass{llncs}
```

引用格式、单栏或双栏、ORCID、伦理声明及数据可用性要求由具体刊会决定；不能统一概括为“期刊使用作者–年份引用”。

## 使用建议

1. 从下方官方来源取得目标期刊或会议要求的模板，并保留模板附带的许可说明。
2. 在独立的论文工作目录中整理正文、图片、文档类和参考文献文件，按官方示例调整主文件。不要只替换 `\documentclass`，还需检查作者信息、标题、摘要和参考文献命令。
3. 若复用 Scholarium 生成的章节，保持 `\input{sections/section_1.tex}` 等路径相对于主文件所在目录有效。默认模板使用 `references.bib`；迁移时按出版方模板选择的参考文献工具调整命令和文件路径。
4. 用模板要求的 LaTeX 引擎和参考文献工具完成编译，逐项核对目标刊会的最新投稿指南。Scholarium 不保证自动满足投稿格式要求。

## 资源

- [Springer LNCS 会议论文指南](https://www.springer.com/gp/computer-science/lncs/conference-proceedings-guidelines)
- [Springer 图书稿件准备指南](https://www.springer.com/gp/authors-editors/book-authors-editors/your-publication-journey/manuscript-preparation)（图书指南，不是所有期刊通用模板；期刊请另查各刊作者指南）
