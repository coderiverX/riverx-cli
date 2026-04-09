# RiverX — 开发进度跟踪

> 最后更新：2026-04-09（M0.1 + M0.2 + M0.3 + M0.4 已完成）

---

## M0 — 基础骨架

### 0.1 项目初始化

- [x] `pnpm init` 创建 package.json
- [x] 配置 TypeScript（tsconfig.json，strict 模式，target ES2022）
- [x] 配置 vitest（vitest.config.ts）
- [ ] 配置 ESLint + Prettier
- [x] 配置构建脚本（tsc 编译到 dist/）
- [x] 配置 `bin` 字段，使 `riverx` 可作为全局命令执行
- [x] 创建 src/ 目录结构骨架
- [x] 添加 .gitignore（node_modules, dist, .env, .DS_Store）
- [x] `git init` + 首次提交

### 0.2 CLI 入口 (`src/main.ts`)

- [x] 解析命令行参数（process.argv 手动解析，不用第三方库）
  - [x] `riverx "prompt"` — headless 模式
  - [x] `riverx` — 无参数进入 REPL 模式
  - [x] `riverx --help` — 帮助信息
  - [x] `riverx --version` — 版本号
  - [x] `riverx --config` — 打印当前配置
- [x] 加载配置文件（~/.riverx/config.json）
- [x] 检测当前平台（macOS / Linux）和默认 shell
- [x] 根据参数决定进入 headless 或 REPL 路径
- [x] headless 路径：调用 QueryEngine → 输出结果 → process.exit

### 0.3 平台与 Shell 检测 (`src/utils/platform.ts`, `src/utils/shell.ts`)

- [x] 检测 OS 类型（darwin / linux）
- [x] 检测 OS 版本
- [x] 检测当前用户名
- [x] 检测默认 shell（$SHELL 环境变量）
- [x] 验证 shell 可执行（which bash / which zsh）
- [x] 导出 `PlatformInfo` 结构供其他模块使用

### 0.4 配置系统 (`src/config/config.ts`)

- [x] 定义 `RiverXConfig` 类型（llm / security / shell 三个区块）
- [x] 首次运行时自动创建 ~/.riverx/ 目录
- [x] 首次运行时生成默认 config.json
- [x] 加载并校验 config.json
- [x] 支持环境变量覆盖（RIVERX_API_KEY, RIVERX_MODEL 等）
- [x] config 加载失败时给出清晰错误提示

### 0.5 LLM 适配层 (`src/llm/`)

#### 0.5.1 Provider 抽象 (`src/llm/provider.ts`)

- [ ] 定义 `LLMProvider` 接口
  - [ ] `chat(params: ChatParams): AsyncIterable<ChatChunk>`
- [ ] 定义 `ChatParams` 类型（messages, tools, model, temperature 等）
- [ ] 定义 `ChatChunk` 类型（流式返回的增量内容）
- [ ] 定义 `ChatMessage` 类型（role, content, tool_calls, tool_call_id）
- [ ] 定义 `ToolCall` 类型（id, function.name, function.arguments）
- [ ] 定义 `ToolDefinition` 类型（name, description, parameters JSON Schema）

#### 0.5.2 Qwen 实现 (`src/llm/qwen.ts`)

- [ ] 实现 `QwenProvider` 类
- [ ] 使用 `fetch` 调用 Qwen OpenAI 兼容 API（/v1/chat/completions）
- [ ] 请求参数组装（model, messages, tools, stream: true）
- [ ] SSE 流式响应解析（逐行读取 data: {...}）
- [ ] 解析 delta.content（文本内容）
- [ ] 解析 delta.tool_calls（工具调用）
- [ ] 处理 [DONE] 信号
- [ ] API 错误处理（401 无效 key、429 限流、500 服务端错误）
- [ ] 超时处理（默认 60s）
- [ ] 失败自动重试 1 次
- [ ] 单元测试：mock API 响应，验证流式解析正确性

### 0.6 工具抽象 (`src/tool.ts`)

- [ ] 定义 `Tool` 接口
  ```
  name, description, parameters(JSONSchema),
  execute(args, ctx) → ToolResult
  ```
- [ ] 定义 `ToolContext` 类型（cwd, platform, config, abortSignal）
- [ ] 定义 `ToolResult` 类型（success, output, error）
- [ ] 实现工具注册表 `ToolRegistry`
  - [ ] `register(tool: Tool)`
  - [ ] `get(name: string): Tool`
  - [ ] `list(): Tool[]`
  - [ ] `toToolDefinitions(): ToolDefinition[]` — 生成传给 LLM 的 tools 参数

### 0.7 exec_cmd 工具 (`src/tools/exec-cmd.ts`)

- [ ] 参数定义：`command`(string), `cwd`(string, optional), `timeout_ms`(number, optional)
- [ ] 使用 `child_process.spawn` 执行命令
- [ ] 通过用户默认 shell 执行（spawn(shell, ['-c', command])）
- [ ] 捕获 stdout + stderr
- [ ] 返回 `{ stdout, stderr, exit_code }`
- [ ] 超时处理（kill 子进程，返回超时错误）
- [ ] 输出截断（超长输出截取前后各 N 行，中间省略）
- [ ] 基础安全检查：禁止列表中的命令直接拒绝
- [ ] 单元测试：执行 `echo hello`、超时、非零退出码

### 0.8 查询引擎 — 单轮 (`src/query-engine.ts`)

- [ ] 定义 `QueryEngine` 类
- [ ] 组装 system prompt（注入平台信息、cwd、用户名）
- [ ] 将用户输入构造为 messages 数组
- [ ] 将工具注册表转为 tools 参数
- [ ] 调用 LLMProvider.chat() 获取流式响应
- [ ] 聚合流式响应为完整 assistant message
- [ ] 识别 tool_calls：解析 function name + arguments
- [ ] 在 ToolRegistry 中查找并执行对应工具
- [ ] 将工具结果构造为 tool role message
- [ ] **单轮验证**：user → assistant(tool_call) → tool_result → assistant(text) → 输出

### 0.9 M0 端到端验证

- [ ] `riverx "列出当前目录的文件"` 能正确调用 list_files 或 exec_cmd(ls)
- [ ] `riverx "我是谁"` 能调用 exec_cmd(whoami) 并返回结果
- [ ] API key 缺失时给出清晰报错
- [ ] 不合法参数时显示 help

---

## M1 — 核心工具 + 多轮循环

### 1.1 read_file 工具 (`src/tools/read-file.ts`)

- [ ] 参数定义：`path`(string), `offset`(number, optional), `limit`(number, optional)
- [ ] 读取文件内容，返回带行号的文本
- [ ] 支持 offset + limit 分页读取
- [ ] 文件不存在时返回明确错误
- [ ] 二进制文件检测，拒绝读取并提示
- [ ] 大文件保护（超过 limit 默认值时截断）
- [ ] 单元测试

### 1.2 write_file 工具 (`src/tools/write-file.ts`)

- [ ] 参数定义：`path`(string), `content`(string)
- [ ] 写入文件，自动创建父目录
- [ ] 文件已存在时覆盖（LLM 应提前通过 confirm 征求同意）
- [ ] 写入后返回文件路径和字节数
- [ ] 路径安全检查（不允许写入 / 根目录等敏感位置）
- [ ] 单元测试

### 1.3 patch_file 工具 (`src/tools/patch-file.ts`)

- [ ] 参数定义：`path`(string), `old_string`(string), `new_string`(string)
- [ ] 读取文件 → 字符串替换 → 写回
- [ ] old_string 未找到时返回错误
- [ ] old_string 有多处匹配时返回错误（要求唯一匹配）
- [ ] 替换后返回修改的行号范围
- [ ] 单元测试

### 1.4 list_files 工具 (`src/tools/list-files.ts`)

- [ ] 参数定义：`path`(string, optional), `pattern`(string, optional, glob)
- [ ] 默认列出 cwd 内容
- [ ] 支持 glob 模式匹配（使用 fast-glob 或手写 minimatch）
- [ ] 返回文件名 + 类型（file/dir/symlink）+ 大小
- [ ] 结果数量限制（默认 200 条）
- [ ] 单元测试

### 1.5 grep 工具 (`src/tools/grep.ts`)

- [ ] 参数定义：`pattern`(string, regex), `path`(string, optional), `include`(string, optional, glob)
- [ ] 在指定路径下递归搜索匹配内容
- [ ] 返回匹配的文件路径 + 行号 + 行内容
- [ ] 支持大小写不敏感选项
- [ ] 结果数量限制
- [ ] 使用 Node.js 原生实现（fs + readline），不依赖外部 rg/grep
- [ ] 单元测试

### 1.6 confirm 工具 (`src/tools/confirm.ts`)

- [ ] 参数定义：`message`(string) — 展示给用户的确认信息
- [ ] 在终端显示确认提示：`[RiverX] <message> (Y/n)`
- [ ] 读取用户输入，返回 `{ confirmed: boolean }`
- [ ] headless 模式下默认拒绝（安全优先）
- [ ] 支持超时自动拒绝（默认 30s）
- [ ] 单元测试（mock stdin）

### 1.7 session 工具 (`src/tools/session.ts`)

- [ ] 参数定义：`action`(string: "info" | "clear")
- [ ] `info`：返回当前会话信息（消息数、工作目录、运行时长）
- [ ] `clear`：清空当前会话上下文
- [ ] 单元测试

### 1.8 查询引擎 — 多轮 tool-use 循环

- [ ] 支持 LLM 在一次响应中返回多个 tool_calls
- [ ] 并行执行多个不相互依赖的工具调用
- [ ] 将所有工具结果注回 messages，再次调用 LLM
- [ ] 循环直到 LLM 返回纯文本（无 tool_calls）或达到最大轮次
- [ ] 最大 tool-use 轮次限制（默认 20 轮）
- [ ] 每轮工具执行前检查是否需要 confirm
- [ ] 集成测试：多步骤任务（如"查找大文件并列出详情"）

### 1.9 命令风险分类 (`src/security/risk-classifier.ts`)

- [ ] 定义四级风险枚举：`safe`, `medium`, `high`, `forbidden`
- [ ] 实现 `classifyCommand(cmd: string): RiskLevel`
- [ ] 安全命令列表：ls, cat, head, tail, wc, pwd, echo, whoami, date, uname, df, du, ps, env, which, file, stat, id
- [ ] 高危命令模式：rm -rf, chmod -R, chown -R, kill -9, sudo, dd, mkfs, fdisk
- [ ] 禁止命令模式：格式化磁盘、>/dev/sda、修改 /etc/shadow、:(){ :|:& };:
- [ ] 中等风险：不在安全和高危列表中的默认归类
- [ ] 支持管道命令分析（`a | b` 取最高风险）
- [ ] 支持 `&&` / `||` / `;` 链式命令分析
- [ ] 单元测试：覆盖各类命令的风险判定

### 1.10 权限检查 (`src/security/permissions.ts`)

- [ ] `checkCommandPermission(cmd, riskLevel, mode)` → allow / deny / need_confirm
- [ ] headless 模式：safe 自动执行，其余拒绝
- [ ] REPL 模式：safe 自动执行，medium 显示后执行，high 触发 confirm，forbidden 拒绝
- [ ] 路径检查：操作路径是否在 workspace_root 范围内
- [ ] 单元测试

### 1.11 流式输出

- [ ] headless 模式：LLM 文本内容实时逐 token 输出到 stdout
- [ ] 工具执行时显示状态提示（⟳ 执行中: `ls -la`）
- [ ] 工具执行完成显示结果摘要（✓ 完成，耗时 0.3s）
- [ ] 工具执行失败显示错误信息（✗ 失败: command not found）

### 1.12 M1 端到端验证

- [ ] `riverx "查看 /tmp 下最大的 5 个文件并显示它们的内容前 10 行"` — 多轮工具调用
- [ ] `riverx "创建一个名为 test.txt 的文件，写入 hello world"` — write_file 工具
- [ ] `riverx "在当前目录搜索包含 TODO 的文件"` — grep 工具
- [ ] 高危命令触发确认流程
- [ ] 禁止命令被拦截

---

## M2 — REPL 与会话

### 2.1 REPL 基础 (`src/repl/repl.ts`)

- [ ] 启动提示信息（版本、模型、工作目录）
- [ ] 提示符显示（`riverx> `）
- [ ] 读取用户输入（readline 接口）
- [ ] 输入为空时跳过
- [ ] Ctrl+C 中断当前操作（不退出 REPL）
- [ ] Ctrl+D / `exit` / `quit` 退出 REPL
- [ ] 输入传递给 QueryEngine 处理

### 2.2 会话上下文管理

- [ ] 维护 messages 数组（完整对话历史）
- [ ] 每次用户输入追加 user message
- [ ] LLM 响应追加 assistant message
- [ ] 工具结果追加 tool message
- [ ] 会话上下文传递给后续 LLM 调用（实现多轮对话）
- [ ] 上下文长度管理：接近 token 上限时截断早期消息（保留 system prompt + 最近 N 轮）

### 2.3 REPL 内置命令

- [ ] `/help` — 显示可用命令列表
- [ ] `/clear` — 清空当前会话上下文
- [ ] `/history` — 查看对话历史（最近 N 条）
- [ ] `/config` — 显示当前配置
- [ ] `/model <name>` — 切换模型
- [ ] `/exit` — 退出

### 2.4 会话历史持久化

- [ ] 每次会话生成唯一 session_id（timestamp + random）
- [ ] 会话结束时保存到 ~/.riverx/sessions/{session_id}.json
- [ ] 保存内容：messages, 开始时间, 结束时间, 工具调用统计
- [ ] 自动清理超过 30 天的会话文件

### 2.5 配置系统完善

- [ ] ~/.riverx/config.json 完整读写
- [ ] 首次运行引导流程
  - [ ] 检测到无 config.json 时提示用户
  - [ ] 引导输入 API key
  - [ ] 引导选择模型
  - [ ] 写入 config.json
- [ ] 支持 `riverx --config` 打印当前配置
- [ ] 支持环境变量覆盖
  - [ ] `RIVERX_API_KEY`
  - [ ] `RIVERX_MODEL`
  - [ ] `RIVERX_BASE_URL`

### 2.6 操作日志 (`src/utils/logger.ts`)

- [ ] 所有工具调用写入 ~/.riverx/logs/YYYY-MM-DD.log
- [ ] 日志格式：`[timestamp] [tool_name] [args_summary] [result_status] [duration_ms]`
- [ ] 日志文件按天滚动
- [ ] 自动清理超过 7 天的日志文件

### 2.7 M2 端到端验证

- [ ] 启动 REPL → 多轮对话 → 上下文正确保持
- [ ] REPL 中执行高危命令 → 确认流程正常
- [ ] `/clear` 后上下文重置
- [ ] 退出后会话保存到 sessions/
- [ ] 日志正常写入

---

## M3 — 打磨与发布

### 3.1 错误处理

- [ ] LLM API 网络错误 → 友好提示 + 重试建议
- [ ] LLM API key 无效 → 明确提示如何配置
- [ ] LLM API 限流 → 提示等待
- [ ] LLM 返回格式异常 → 降级为纯文本输出
- [ ] 工具执行异常 → 错误信息返回给 LLM 让其决策
- [ ] 文件权限不足 → 明确提示
- [ ] 磁盘空间不足 → 写文件前检查

### 3.2 平台适配测试

- [ ] macOS (zsh) — 全流程测试
- [ ] macOS (bash) — 全流程测试
- [ ] Ubuntu 22.04 (bash) — 全流程测试
- [ ] Ubuntu 22.04 (zsh) — 全流程测试
- [ ] 不同 Node.js 版本测试（20, 22）
- [ ] shell 特殊字符处理（引号、转义、管道、重定向）
- [ ] 中文路径和文件名支持
- [ ] 长命令输出处理

### 3.3 首次运行体验

- [ ] 无配置时自动进入引导流程
- [ ] 引导流程：欢迎信息 → 选择 LLM provider → 输入 API key → 验证连通性 → 写入配置
- [ ] 验证 API key 有效性（发送测试请求）
- [ ] 引导完成后自动进入 REPL

### 3.4 输出体验优化

- [ ] LLM 文本响应支持 Markdown 渲染（终端基础格式：粗体、代码块、列表）
- [ ] 工具执行进度动画（spinner）
- [ ] 命令输出语法高亮（可选）
- [ ] 错误信息用红色显示
- [ ] 成功信息用绿色显示

### 3.5 npm 发布准备

- [ ] package.json 完善（name, version, description, keywords, author, license, repository）
- [ ] `bin` 字段指向编译后的 dist/main.js
- [ ] `files` 字段只包含 dist/
- [ ] README.md — 项目介绍、安装方式、快速开始、配置说明
- [ ] LICENSE 文件
- [ ] CHANGELOG.md
- [ ] `npm pack` 验证打包内容
- [ ] `npm publish --dry-run` 验证发布流程

### 3.6 测试覆盖

- [ ] 工具单元测试覆盖率 > 80%
- [ ] LLM 适配层测试（mock API）
- [ ] 风险分类器测试（边界情况）
- [ ] 配置加载测试
- [ ] 端到端集成测试（至少 5 个典型场景）

### 3.7 M3 最终验证

- [ ] 全新机器上 `npm install -g riverx` → 首次引导 → 正常使用
- [ ] macOS + Linux 各跑通 3 个典型任务
- [ ] 错误场景不崩溃、不挂起
- [ ] README 示例全部可运行

---

## 总计

| 里程碑 | 任务数 | 状态 |
|--------|--------|------|
| M0 — 基础骨架 | 46 | 🔄 进行中（0.1 + 0.2 + 0.3 + 0.4 已完成） |
| M1 — 核心工具 + 多轮 | 48 | 🔲 未开始 |
| M2 — REPL 与会话 | 30 | 🔲 未开始 |
| M3 — 打磨与发布 | 33 | 🔲 未开始 |
| **合计** | **157** | |
