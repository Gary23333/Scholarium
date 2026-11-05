# Nature Template

用于了解 Nature 系列期刊的投稿格式。Nature、Nature Communications、Scientific Reports 等期刊的要求应分别查阅，不能共用一套字数和图表上限。

## 当前状态

本目录目前只有这份说明，没有随仓库提供的 `main.tex`、文档类或样式文件。以下内容是投稿模板参考，不是可直接选用的 Scholarium 内置模板。

[模板注册表](../../src/latex/templates.ts) 当前只包含 `default`（`article` 文档类）。[组装器](../../src/latex/assembler.ts) 不会扫描本目录；使用未注册的模板 ID 会报 `Unknown template`。出版方模板需自行获取并手动适配。

## 稿件组织参考

以下仅为准备稿件时可核对的内容清单，实际章节名称、顺序和是否必需由目标期刊及文章类型决定：

- 摘要
- 引言或研究背景
- 结果、讨论与方法
- 数据可用性与代码可用性
- 参考文献、致谢与作者信息
- 作者贡献与竞争利益声明
- 补充信息

摘要长度、正文篇幅、图表数量及引用格式均以目标期刊的最新指南为准。本目录不把“摘要少于 150 字”“正文 2000–4000 字”或“最多 6 张图”作为 Nature 系列的统一要求。

## 使用建议

1. 从下方官方来源取得目标期刊或会议要求的模板，并保留模板附带的许可说明。
2. 在独立的论文工作目录中整理正文、图片、文档类和参考文献文件，按官方示例调整主文件。不要只替换 `\documentclass`，还需检查作者信息、标题、摘要和参考文献命令。
3. 若复用 Scholarium 生成的章节，保持 `\input{sections/section_1.tex}` 等路径相对于主文件所在目录有效。默认模板使用 `references.bib`；迁移时按出版方模板选择的参考文献工具调整命令和文件路径。
4. 用模板要求的 LaTeX 引擎和参考文献工具完成编译，逐项核对目标刊会的最新投稿指南。Scholarium 不保证自动满足投稿格式要求。

## 资源

- [Nature 作者指南](https://www.nature.com/nature/for-authors)
- [Nature 投稿准备指南](https://www.nature.com/nature/for-authors/preparing-your-submission)

以上链接面向 Nature 本刊；其他 Nature 系列期刊应使用各自的作者指南。
