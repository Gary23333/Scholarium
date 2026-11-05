# ACM Template

用于了解 ACM 会议和期刊的 LaTeX 投稿模板。

## 当前状态

本目录目前只有这份说明，没有随仓库提供的 `main.tex`、文档类或样式文件。以下内容是投稿模板参考，不是可直接选用的 Scholarium 内置模板。

[模板注册表](../../src/latex/templates.ts) 当前只包含 `default`（`article` 文档类）。[组装器](../../src/latex/assembler.ts) 不会扫描本目录；使用未注册的模板 ID 会报 `Unknown template`。出版方模板需自行获取并手动适配。

## 文档类参考

下载并安装所需文件后，官方 `acmart` 文档类可使用如下选项；具体选项应以目标刊会及投稿阶段的要求为准：

```latex
\documentclass[sigconf]{acmart}
% 其他格式示例：acmsmall、acmlarge
```

投稿时核对 CCS 概念分类、引用格式、作者信息与 ORCID、资助声明及匿名审稿要求。图表数量和页数由具体刊会规定，没有在此统一设定的“最多 20 张图表”限制。

## 使用建议

1. 从下方官方来源取得目标期刊或会议要求的模板，并保留模板附带的许可说明。
2. 在独立的论文工作目录中整理正文、图片、文档类和参考文献文件，按官方示例调整主文件。不要只替换 `\documentclass`，还需检查作者信息、标题、摘要和参考文献命令。
3. 若复用 Scholarium 生成的章节，保持 `\input{sections/section_1.tex}` 等路径相对于主文件所在目录有效。默认模板使用 `references.bib`；迁移时按出版方模板选择的参考文献工具调整命令和文件路径。
4. 用模板要求的 LaTeX 引擎和参考文献工具完成编译，逐项核对目标刊会的最新投稿指南。Scholarium 不保证自动满足投稿格式要求。

## 资源

- [ACM 官方模板与说明](https://www.acm.org/publications/proceedings-template)
- [Overleaf ACM 模板](https://www.overleaf.com/latex/templates/association-for-computing-machinery-acm-sig-proceedings-template/bmvfhcdnxfty)
