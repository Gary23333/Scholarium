# Elsevier Template

用于了解 Elsevier 期刊论文的 LaTeX 投稿模板，例如 Computers & Education、Pattern Recognition 等刊物的投稿准备。

## 当前状态

本目录目前只有这份说明，没有随仓库提供的 `main.tex`、文档类或样式文件。以下内容是投稿模板参考，不是可直接选用的 Scholarium 内置模板。

[模板注册表](../../src/latex/templates.ts) 当前只包含 `default`（`article` 文档类）。[组装器](../../src/latex/assembler.ts) 不会扫描本目录；使用未注册的模板 ID 会报 `Unknown template`。出版方模板需自行获取并手动适配。

## 文档类参考

`elsarticle` 是可供参考的文档类，实际投稿应采用目标期刊指定的模板：

```latex
\documentclass[review]{elsarticle}
```

`review` 是审稿排版选项，不表示“双栏”；单栏、双栏及最终排版应按模板文档选择，不能把 `final` 一概等同于单栏。引用格式也不统一为 APA 或作者–年份，需使用目标期刊指定的样式。

按期刊要求核对研究亮点（Highlights）、图形摘要（Graphical Abstract）、作者贡献（CRediT）、数据可用性和利益冲突声明，不能把这些项目都视为所有期刊的统一必选项。

## 使用建议

1. 从下方官方来源取得目标期刊或会议要求的模板，并保留模板附带的许可说明。
2. 在独立的论文工作目录中整理正文、图片、文档类和参考文献文件，按官方示例调整主文件。不要只替换 `\documentclass`，还需检查作者信息、标题、摘要和参考文献命令。
3. 若复用 Scholarium 生成的章节，保持 `\input{sections/section_1.tex}` 等路径相对于主文件所在目录有效。默认模板使用 `references.bib`；迁移时按出版方模板选择的参考文献工具调整命令和文件路径。
4. 用模板要求的 LaTeX 引擎和参考文献工具完成编译，逐项核对目标刊会的最新投稿指南。Scholarium 不保证自动满足投稿格式要求。

## 资源

- [Elsevier 官方 LaTeX 投稿说明](https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions)
- [CTAN elsarticle 包与文档](https://ctan.org/pkg/elsarticle)
