# v2.0.1 Lint 错误与警告修复计划

## 问题总览

共 **10 个 error** 和 **11 个 warning**，涉及 10 个文件。按修复策略分组如下：

---

## 一、`let` → `const` 修复（2 处 error）

### 1. `src/pipeline/orchestrator.ts#L81`
- **问题**：`let section: Section = { ... }` 声明后，`section` 变量本身从未被重新赋值（只修改了属性），应使用 `const`
- **修复**：`let section` → `const section`

### 2. `src/anti-ai/detector.ts#L229`
- **问题**：`let similarStructureCount = 0` 声明后从未被重新赋值，且该变量在整个函数中未被使用
- **修复**：直接删除该变量声明（第 229 行）

---

## 二、空接口继承修复（1 处 error）

### 3. `src/pipeline/agent-loop.ts#L17`
- **问题**：`export interface AgentLoopDeps extends PipelineDeps {}` 空接口等价于其父类型
- **修复**：删除空接口定义，将所有引用 `AgentLoopDeps` 的地方替换为 `PipelineDeps`

---

## 三、空 catch 块修复（1 处 error）

### 4. `src/figures/index.ts#L168`
- **问题**：`catch {}` 空块语句
- **修复**：改为 `catch (_e) {}` 或添加注释说明忽略错误的原因（如清理临时文件失败可安全忽略）

---

## 四、未使用变量/导入修复（6 处 error）

### 5. `src/agents/writer.ts#L76`
- **问题**：`let userPrompt = ''` 初始赋值未被使用，在 if/else 中被覆盖
- **修复**：将 `let userPrompt = ''` + if/else 赋值重构为条件表达式：
  ```ts
  const userPrompt = isRevision
    ? `REVISE based on: ...`
    : `Write section ...`;
  ```

### 6. `src/agents/socratic-mentor.ts#L142`
- **问题**：`let reply = ''` 初始赋值未被使用，在 if/else 中被覆盖
- **修复**：将 `let reply = ''` + if/else 赋值重构为条件表达式：
  ```ts
  let reply = hasInsight
    ? `这是一个很有洞察力的观察。...`
    : `我理解你的想法。让我进一步追问：\n\n`;
  ```

### 7. `src/agents/cartographer.ts#L117`
- **问题**：`let summary = ''` 初始赋值未被使用，在 if/else 中被覆盖
- **修复**：将 `let summary = ''` + if/else 赋值重构为条件表达式（由于 summary 在三个分支中赋值且后续返回，可改为在每个分支内直接声明 `const summary = ...`）

### 8. `src/agents/cartographer.ts#L63`
- **问题**：`let userPrompt = ''` 初始赋值未被使用，在 if/else if/else 中被覆盖
- **修复**：重构为条件表达式或提取函数

### 9. `src/agents/cartographer.ts#L62`
- **问题**：`let systemPrompt = ''` 初始赋值未被使用，在 if/else if/else 中被覆盖
- **修复**：与 userPrompt 一起重构，提取为辅助函数或在每个分支中声明 const

### 10. `src/__tests__/integration/server-routes.test.ts#L38`
- **问题**：`require('node:net')` 是 CJS 风格导入，ESM 中不允许
- **修复**：改为 `import * as net from 'node:net'` 并移到文件顶部导入区

---

## 五、未使用导入修复（3 处 warning）

### 11. `src/agents/cartographer.ts#L4`
- **问题**：`import type { AgentOptions }` 未使用
- **修复**：从导入列表中移除 `AgentOptions`

### 12. `src/agents/architect.ts#L2`
- **问题**：`import type { AgentOptions }` 未使用
- **修复**：从导入列表中移除 `AgentOptions`

### 13. `src/__tests__/unit/rate-limiter.test.ts#L1`
- **问题**：`vi` 从 vitest 导入但未使用
- **修复**：从导入列表中移除 `vi`

### 14. `src/__tests__/unit/middleware.test.ts#L1`
- **问题**：`vi` 从 vitest 导入但未使用
- **修复**：从导入列表中移除 `vi`

### 15. `src/__tests__/unit/helpers.test.ts#L1`
- **问题**：`vi` 从 vitest 导入但未使用
- **修复**：从导入列表中移除 `vi`

---

## 六、`any` 类型修复（4 处 warning）

### 16. `src/__tests__/unit/middleware.test.ts#L30`
- **问题**：`as any` 类型断言
- **修复**：使用更具体的类型，如 `as ServerResponse & { _headers: Record<string, string>; ... }` 或 `as unknown as ServerResponse`

### 17. `src/__tests__/unit/middleware.test.ts#L132`
- **问题**：`(res as any).headersSent = true`
- **修复**：在 mockResponse 返回类型中添加 `headersSent?: boolean` 属性，或使用类型断言 `as unknown as ServerResponse`

### 18. `src/__tests__/integration/server-routes.test.ts#L47`
- **问题**：`Promise<{ status: number; data: any }>` 中 `data` 使用了 `any`
- **修复**：将 `data` 类型改为 `unknown`，在使用处进行类型断言

### 19. `src/__tests__/integration/server-routes.test.ts#L59`
- **问题**：`let data: any`
- **修复**：改为 `let data: unknown`，在 `JSON.parse` 处使用类型断言

---

## 七、CI/CD 警告（非代码问题）

### Node.js 20 弃用警告
- **问题**：GitHub Actions 中 `actions/checkout@v4` 和 `actions/setup-node@v4` 运行在 Node.js 20 上，即将被弃用
- **修复**：更新 workflow 文件，设置 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` 环境变量，或升级 action 版本
- **注意**：此为 CI 配置问题，不在源码修复范围内，可单独处理

---

## 修复执行顺序

1. **第一批**（简单删除/替换）：#1, #2, #4, #11, #12, #13, #14, #15
2. **第二批**（重构 let→const/条件表达式）：#5, #6, #7, #8, #9
3. **第三批**（接口重构）：#3
4. **第四批**（require→import）：#10
5. **第五批**（any 类型修复）：#16, #17, #18, #19
6. **验证**：运行 lint 和 typecheck 确认所有问题已修复
