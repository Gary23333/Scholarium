# Custom Templates

本目录用于记录自定义 LaTeX 模板的使用与适配说明。目前只有这份 README，没有随仓库提供的 `.tex`、`.cls` 或 `.sty` 文件。

## 当前支持范围

- [模板注册表](../../src/latex/templates.ts) 只注册了 `default`，使用 `article` 文档类。
- [组装器](../../src/latex/assembler.ts) 按 `templateId` 查找已注册模板，不会扫描此目录。仅放入 `.cls` / `.sty` 文件不会自动发现或应用模板。
- `latexTemplate: "custom"` 不是已实现的模板选择配置；`templateId: "custom"` 也会因未注册而报 `Unknown template`。
- [默认配置](../../src/config/default.ts) 中的 `paths.templates` 路径不代表目录扫描功能已经实现。

## 手动使用自定义模板

1. 从目标期刊或会议官网取得模板，并确认使用许可。中文信息学报、计算机学报、软件学报和自动化学报等期刊均需自行取得当前模板；这里没有打包这些模板，也未声明逐一验证兼容性。
2. 在独立的论文工作目录中保留官方主文件、文档类、样式文件与其他依赖，再将 Scholarium 生成的正文内容迁入。需要中文排版时，按模板要求选择引擎和字体。
3. 核对章节和图片路径。若保留生成的章节目录，可在主文件中引用 `\input{sections/section_1.tex}`；默认模板的文献文件名为 `references.bib`，迁移后需按自定义模板调整参考文献命令和路径。
4. 按官方模板说明编译并检查输出。不要直接修改唯一一份生成结果后再次运行组装器，以免被重新生成的文件覆盖。

## 开发者扩展入口

若要让 Scholarium 的组装器直接使用新模板，需要按 [LatexTemplate 类型](../../src/types/index.ts) 定义模板，并在 [getBuiltinTemplates()](../../src/latex/templates.ts) 中注册唯一 ID，再通过 [CLI](../../src/cli/index.ts) 的 `--template <id>` 选择。仅添加文档类文件或修改配置不能完成这项扩展。

[Web 论文编译路由](../../src/server/routes/papers.ts) 当前明确使用 `templateId: 'default'`；注册新模板不等于界面已提供选择功能。扩展时还需处理模板依赖、参考文献工具和相关测试，本说明不表示这些扩展已实现。
