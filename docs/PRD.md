# RiverX — 开发需求文档

> 版本：v0.1.0 (MVP)
> 最后更新：2026-04-09

---

## 1. 产品定位

RiverX 是一个**基于 LLM 的系统操作助手**。用户在终端通过自然语言描述意图，RiverX 将其转化为结构化的工具调用（shell 命令、文件操作等），在本地系统上安全执行。

**一句话定义**：用自然语言操作你的 Linux / macOS 系统。

**不是什么**：
- 不是代码编辑器 / IDE agent
- 不是通用聊天机器人
- 不是远程运维平台（SSH 仅为可选扩展）

---

## 2. 目标用户

- 开发者、运维人员、系统管理员
- 熟悉终端但希望减少记忆命令负担的用户
- 需要快速完成文件管理、环境配置、日志排查等日常系统任务的用户

---

## 3. 目标平台

| 优先级 | 平台 | Shell |
|--------|------|-------|
| P0 | macOS | zsh (默认), bash |
| P0 | Linux (Ubuntu/Debian) | bash (默认), zsh |
| P2 | Windows (WSL) | 后续考虑 |

---

## 4. 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 运行时 | Node.js >= 20 | |
| 语言 | TypeScript (strict) | |
| LLM | Qwen（通义千问）优先 | 通过 OpenAI 兼容 API 对接，后续可扩展其他模型 |
| 包管理 | pnpm | |
| 测试 | vitest | |
| CLI 框架 | 自建（参考 Claude Code） | 轻量入口，不依赖 commander/yargs |

### 第三方依赖

| 包 | 用途 |
|----|------|
| `openai` | LLM 调用（Qwen 兼容 OpenAI 协议，省掉 SSE 解析 + tool_call 拼装 + 重试） |
| `chalk` | 终端彩色输出 |
| `ora` | 工具执行时的 loading spinner |
| `fast-glob` | list_files 工具的 glob 匹配 |
| `zod` | 配置校验、工具参数校验 |
| `marked` + `marked-terminal` | LLM 输出的 Markdown 终端渲染 |

---

## 5. 交互模型

### 5.1 启动方式

```bash
# 单次执行模式（headless）
riverx "查看当前目录下最大的 10 个文件"

# 交互模式（REPL）
riverx
> 帮我清理 /tmp 下超过 7 天的文件
```

### 5.2 执行流程

```
用户输入 → 意图解析 → 生成计划(plan) → 用户确认(如需) → 执行工具调用 → 输出结果
```

核心原则：**先 plan 再 run**。LLM 产出结构化工具调用序列，而非直接生成 shell 脚本。

### 5.3 执行模式

| 模式 | 说明 |
|------|------|
| headless | 单次输入 → 执行 → 输出 → 退出 |
| REPL | 交互式会话，支持多轮对话和上下文持续 |

---

## 6. 系统架构

```
┌─────────────────────────────────────────────┐
│                   CLI 入口                    │
│              (参数解析, 模式选择)               │
├─────────────┬───────────────────────────────┤
│  REPL 交互层 │       Headless 执行层          │
│  (输入/输出)  │    (单次查询/输出/退出)          │
├─────────────┴───────────────────────────────┤
│                 查询引擎 (QueryEngine)         │
│     意图解析 → 计划生成 → 工具调度 → 结果聚合     │
├─────────────────────────────────────────────┤
│                  工具系统 (Tools)              │
│   exec_cmd | read_file | write_file | ...    │
├─────────────────────────────────────────────┤
│                 LLM 适配层                    │
│           Qwen API (OpenAI 兼容协议)           │
├─────────────────────────────────────────────┤
│              安全与权限控制层                    │
│      工作区限定 | 危险命令确认 | 操作审计          │
└─────────────────────────────────────────────┘
```

---

## 7. 核心模块

### 7.1 CLI 入口 (`src/main.ts`)

- 解析命令行参数
- 加载配置
- 初始化工具池
- 决定进入 REPL 或 headless 模式

### 7.2 查询引擎 (`src/query-engine.ts`)

- 组装 system prompt + 用户消息 + 工具定义
- 调用 LLM API（流式）
- 解析 LLM 返回的 tool_call
- 调度工具执行
- 将工具结果回注对话循环，驱动多轮 tool-use

### 7.3 工具系统 (`src/tools/`)

每个工具是一个独立模块，统一接口：

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
```

#### MVP 工具清单

| 工具 | 说明 | 风险等级 |
|------|------|----------|
| `exec_cmd` | 执行 shell 命令，返回 stdout/stderr/exitCode | **高** — 需确认策略 |
| `read_file` | 读取文件内容（支持分页/行号范围） | 低 |
| `write_file` | 创建或覆盖文件 | 中 |
| `patch_file` | 对文件做局部编辑（基于字符串匹配替换） | 中 |
| `list_files` | 列出目录内容，支持 glob 模式 | 低 |
| `grep` | 在文件/目录中搜索内容，支持正则 | 低 |
| `confirm` | 向用户发起确认请求（用于高风险操作前） | 无 |
| `session` | 会话信息查看/管理 | 低 |

### 7.4 LLM 适配层 (`src/llm/`)

- 对接 Qwen API（OpenAI 兼容的 `/v1/chat/completions`）
- 支持 function calling / tool_call 格式
- 流式响应处理
- 模型配置管理（model name, base_url, api_key）
- 预留 provider 抽象，后续扩展其他模型

```typescript
interface LLMProvider {
  chat(params: ChatParams): AsyncIterable<ChatChunk>;
  models(): Promise<string[]>;
}
```

### 7.5 安全与权限 (`src/security/`)

#### 原则

1. **工作区限定**：默认操作范围为 `cwd` 及其子目录，跨目录操作需明确授权
2. **先 plan 再 run**：LLM 输出计划 → 用户审阅 → 确认后执行
3. **危险操作确认**：高风险命令（rm -rf, chmod, kill, sudo 等）触发 `confirm` 工具
4. **操作审计**：所有工具调用记录到日志

#### 命令风险分类

| 等级 | 示例 | 策略 |
|------|------|------|
| 安全 | ls, cat, pwd, echo, whoami | 自动执行 |
| 中等 | cp, mv, mkdir, touch, pip install | 显示计划后执行 |
| 高危 | rm -rf, chmod -R, kill, sudo, dd | 必须用户确认 |
| 禁止 | 格式化磁盘、修改 /etc/passwd 等 | 拒绝执行 |

### 7.6 配置系统 (`src/config/`)

```
~/.riverx/
├── config.json        # 全局配置
├── sessions/          # 会话历史
└── logs/              # 操作日志
```

`config.json` 结构：

```json
{
  "llm": {
    "provider": "qwen",
    "model": "qwen-plus",
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "api_key": ""
  },
  "security": {
    "workspace_root": "cwd",
    "auto_confirm_safe_commands": true,
    "confirm_medium_risk": false
  },
  "shell": {
    "default": "auto",
    "timeout_ms": 30000
  }
}
```

### 7.7 REPL 交互层 (`src/repl/`)

- 提示符输入
- 流式输出 LLM 响应
- 工具执行过程展示（命令、输出、状态）
- 确认交互（Y/n）
- 会话上下文管理
- 历史记录

---

## 8. 目录结构

```
riverx/
├── src/
│   ├── main.ts              # CLI 入口
│   ├── query-engine.ts      # 查询引擎
│   ├── tool.ts              # 工具抽象定义
│   ├── tools/
│   │   ├── exec-cmd.ts
│   │   ├── read-file.ts
│   │   ├── write-file.ts
│   │   ├── patch-file.ts
│   │   ├── list-files.ts
│   │   ├── grep.ts
│   │   ├── confirm.ts
│   │   └── session.ts
│   ├── llm/
│   │   ├── provider.ts      # LLM provider 抽象
│   │   └── qwen.ts          # Qwen 实现
│   ├── security/
│   │   ├── permissions.ts   # 权限检查
│   │   └── risk-classifier.ts  # 命令风险分类
│   ├── config/
│   │   └── config.ts        # 配置加载与管理
│   ├── repl/
│   │   └── repl.ts          # REPL 交互
│   └── utils/
│       ├── shell.ts         # Shell 检测与适配
│       ├── platform.ts      # 平台检测
│       └── logger.ts        # 日志
├── tests/
├── docs/
│   └── PRD.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── CLAUDE.md
```

---

## 9. System Prompt 设计

```
你是 RiverX，一个系统操作助手。你通过调用工具来帮用户完成系统管理任务。

规则：
1. 只使用提供的工具，不要输出原始 shell 命令让用户自己执行。
2. 对于高风险操作，先用 confirm 工具征求用户同意。
3. 操作范围默认限定在当前工作目录，除非用户明确指定其他路径。
4. 优先用最简单的方式完成任务。一步能做完的不要拆成多步。
5. 输出简洁直接，不要废话。

当前环境：
- OS: {{os_type}} {{os_version}}
- Shell: {{shell}}
- CWD: {{cwd}}
- User: {{username}}
```

---

## 10. MVP 里程碑

### M0 — 基础骨架 (Week 1)

- [ ] 项目初始化（TypeScript + pnpm + vitest）
- [ ] CLI 入口，支持 headless 单次执行
- [ ] LLM 适配层：对接 Qwen API，支持 tool_call
- [ ] 工具抽象定义 + 工具注册机制
- [ ] 实现 `exec_cmd` 工具（含基础安全检查）
- [ ] 查询引擎：单轮 user → LLM → tool_call → execute → result

### M1 — 核心工具 (Week 2)

- [ ] 实现全部 MVP 工具（read_file, write_file, patch_file, list_files, grep, confirm, session）
- [ ] 多轮 tool-use 循环（LLM 多次调用工具后汇总回答）
- [ ] 命令风险分类 + confirm 联动
- [ ] 流式输出

### M2 — REPL 与会话 (Week 3)

- [ ] REPL 交互模式
- [ ] 会话上下文管理（多轮对话）
- [ ] 配置系统（~/.riverx/config.json）
- [ ] 会话历史持久化

### M3 — 打磨与发布 (Week 4)

- [ ] 平台适配测试（macOS + Ubuntu）
- [ ] 错误处理与边界情况
- [ ] 首次运行引导（配置 API key）
- [ ] npm 发布准备
- [ ] README 与使用文档

---

## 11. 非功能需求

| 项目 | 要求 |
|------|------|
| 首次响应延迟 | < 2s（取决于 LLM API） |
| 命令执行超时 | 默认 30s，可配置 |
| 单次会话消息上限 | 暂不限制，LLM 上下文窗口为自然边界 |
| 日志 | 所有工具调用写入 ~/.riverx/logs/ |
| 错误恢复 | LLM API 失败自动重试 1 次；工具执行失败返回错误信息给 LLM 决策 |

---

## 12. 后续扩展（非 MVP）

- 更多 LLM provider（Claude, GPT, DeepSeek, 本地模型）
- SSH 远程执行工具
- 插件系统（自定义工具）
- 操作回滚 / undo
- git 操作封装
- web_fetch 工具
- 权限配置文件（per-project 的安全策略）
- Tab 补全与命令建议
