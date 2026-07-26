# plan.md — Scholarium 待办汇总

> 最后更新：2026-07-27。汇总 ROADMAP 未完成项、README/文档中的待办与遗留风险。
> 项目惯例：本文件作为未完成工作的唯一索引；长期方向见 [ROADMAP.md](ROADMAP.md)，历史变更见 [CHANGELOG.md](CHANGELOG.md)。

## P0 — 阻塞发布

- 目前无明确阻塞发布项；v2.1.0 已于 2026-06-01 发布（来源：CHANGELOG.md）。

## P1 — 重要（v2.1 短期计划，ROADMAP 未勾选即未完成）

- 引用验证：对接 Semantic Scholar / CrossRef 交叉校验，检测幻觉引用并自动建议替换（来源：ROADMAP.md → Short-term / Citation Verification）。
- 评估指标：论文质量自动评分（可读性/连贯性/论证强度）+ Agent 产出基准测试（来源：ROADMAP.md → Evaluation Metrics）。
- 前端 UX：实时写作进度仪表盘、交互式思维导图编辑器、修订 diff 视图、导出 Word (.docx)（来源：ROADMAP.md → Frontend UX）。
- 文档补齐：OpenAPI/Swagger API 参考、自定义 Agent 开发指南、部署指南（Docker/云平台）（来源：ROADMAP.md → Documentation；README.md「API 精选」一节目前仅链接回仓库首页，无独立 API 文档）。

## P2 — 改进（中长期方向）

- 插件系统：配置化注册自定义 Agent、第三方 LLM Provider 插件、期刊模板市场（来源：ROADMAP.md → Mid-term v2.2）。
- 多语言：完整英文 UI、中英双语论文生成、日韩德学术格式（来源：ROADMAP.md → Multi-language Support；注：README_EN.md 已存在，UI 多语言未完成）。
- 协作能力：多人编辑冲突解决、角色权限（作者/评审/编辑）、共享工作区（来源：ROADMAP.md → Collaboration）。
- 社区生态与高级功能：Agent 市场、Zotero/Mendeley 集成、图表自动生成、同行评审模拟、查重集成（来源：ROADMAP.md → Long-term v3.0）。

## 遗留风险与注意事项

- 运行依赖外部 LLM API Key（DEEPSEEK_API_KEY 等），密钥通过环境变量注入；若曾在文档/日志中明文出现过，需轮换（来源：README.md 快速启动一节；当前仓库未发现明文密钥，但建议发布前复查）。
- 无部署产物：项目为本地 Node 服务，尚无 Docker 镜像或云端部署流程，对外发布前需先完成「部署指南」事项（来源：ROADMAP.md → Documentation）。
- 数据以 JSON 文件持久化（原子写入），多用户/并发场景下的可靠性未经验证（来源：CHANGELOG.md v2.0.0「Database layer migrated to JSON file persistence」）。
