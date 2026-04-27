# RiverX

> 用一句话，操作你的 Linux / macOS 系统。

[![Node](https://img.shields.io/badge/node-%E2%89%A520-1f1f23)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-1f1f23)](#license)
[![Status](https://img.shields.io/badge/status-v0.1.0_dev-22d3ee)](docs/PROGRESS.md)

**官网**: [cli.coderiverx.com](https://cli.coderiverx.com/) · **Languages**: [English](README.md) · **简体中文**

RiverX 是一个面向终端的**自然语言系统操作助手**：把指令翻译成结构化的工具调用，
再由本地受控执行。不是「让 LLM 直接吐 shell 脚本」——每一步工具调用都可审、可控、可中断。

---

## 演示

```text
$ riverx "列出当前目录下最大的 10 个文件"

→ 计划
  1. exec_cmd  du -sh ./* | sort -h | tail -10

→ 执行 ●
  132M  ./node_modules
   48M  ./dist
   12M  ./docs
    ...
```

---

## 特性

- **两种模式** — `riverx "..."` 单次执行（headless）；裸 `riverx` 进入 REPL。
- **结构化工具调用** — 8 个内置工具，LLM 不写自由 shell。
- **风险分级执行** — `safe` 自动 / `medium` 提示 / `high` 需确认 / `forbidden` 直接拒绝。
- **多 LLM provider** — OpenAI / DeepSeek / Kimi / Qwen，首次运行自动校验 API key。
- **安全默认** — 工作区边界限定、命令超时、子孙进程组递归回收（detached spawn）。

---

## 安装

前置：Node ≥ 20、pnpm。

```bash
git clone git@github.com:coderiverX/riverx-cli.git
cd riverx-cli
pnpm install
pnpm build
```

可选：全局安装后即可在任意目录使用 `riverx`。

```bash
npm install -g .
```

---

## 快速开始

直接运行 `riverx`，无配置时会自动进入交互式向导：

```text
$ riverx
欢迎使用 RiverX
? 选择 LLM provider:  ❯ openai / deepseek / kimi / qwen
? 输入 API Key: ************
✓ 已验证 API Key
配置已保存到 ~/.riverx/config.json
```

向导会调用所选 provider 发送一次最小请求验证 Key 有效性；失败时可以重试、跳过或退出。

---

## 用法

```bash
# Headless：单次执行后退出
riverx "查找所有包含 TODO 的 ts 文件"

# REPL：进入交互式会话
riverx

# 自动化场景：跳过所有 confirm
riverx --yes "清理 /tmp 下超过 7 天的文件"
```

**选项**

| 选项 | 说明 |
| --- | --- |
| `--help`, `-h` | 帮助信息 |
| `--version`, `-v` | 版本号 |
| `--config` | 打印当前配置（含路径） |
| `--yes` | 自动确认所有 prompt（适合脚本/CI） |

**示例 prompt**

```bash
riverx "列出当前目录下最大的 10 个文件"
riverx "查找所有包含 TODO 的 ts 文件"
riverx "清理 /tmp 下超过 7 天的文件"
riverx "创建 test.txt 并写入 hello world"
```

---

## 内置工具

| 工具 | 作用 |
| --- | --- |
| `read_file` | 读取文件内容，支持按行范围切片 |
| `list_files` | 列出目录，支持 glob 与排除规则 |
| `grep` | 在文件树中按正则递归搜索 |
| `write_file` | 原子写入文件，自动创建父目录 |
| `patch_file` | 基于上下文的精确编辑，避免整文件重写 |
| `exec_cmd` | 受控执行 shell，超时与子孙进程组清理 |
| `confirm` | 高风险操作前的人工确认 |
| `session` | 查看 / 清空 REPL 会话上下文 |

LLM 通过 tool-use 协议调用上述工具；`exec_cmd` 内的具体命令由 `src/security/risk-classifier.ts` 分级处理。

---

## 配置

配置文件位于 `~/.riverx/config.json`，首次运行自动生成。完整结构：

```jsonc
{
  "llm": {
    "provider": "qwen",          // openai | deepseek | kimi | qwen
    "model": "qwen-plus",        // 可省略，回退到 provider 默认模型
    "base_url": "...",           // 可省略，回退到 provider 预设
    "api_key": "...",
    "wire_api": "chat"           // chat（默认）| responses（OpenAI Responses API）
  },
  "security": {
    "workspace_root": "cwd",     // 操作受限的根目录；cwd = 启动目录
    "auto_confirm_safe_commands": true,
    "confirm_medium_risk": false,
    "auto_confirm": false        // 等同于全局 --yes
  },
  "shell": {
    "default": "auto",           // auto | bash | zsh
    "timeout_ms": 30000
  }
}
```

**Provider 预设**

| provider | base_url | 默认模型 | 原生 env |
| --- | --- | --- | --- |
| openai | `https://api.openai.com/v1` | `gpt-4o-mini` | `OPENAI_API_KEY` |
| deepseek | `https://api.deepseek.com` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | `MOONSHOT_API_KEY` |
| qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | `DASHSCOPE_API_KEY` |

**环境变量覆盖**（优先级最高）

```bash
export RIVERX_API_KEY="..."     # 覆盖 llm.api_key
export RIVERX_MODEL="..."       # 覆盖 llm.model
export RIVERX_BASE_URL="..."    # 覆盖 llm.base_url
```

未设置 `RIVERX_API_KEY` 时，会按 provider 自动回退到原生 env（如 `OPENAI_API_KEY`）。

---

## 安全模型

| 等级 | 行为 | 典型命令 |
| --- | --- | --- |
| `safe` | 自动执行 | `ls`, `cat`, `pwd`, `df`, `du`, `ps`, `which`, `stat`, … |
| `medium` | REPL 中显示后执行（可配置为强制确认） | `rm`, `mv`, `cp`, `mkdir`, `chmod`, `npm install`, `wget`, `ssh`, … |
| `high` | 必须 confirm | `rm -r`, `chmod -R`, `kill -9`, `sudo`, `truncate`, `shred`, … |
| `forbidden` | 直接拒绝 | `rm -rf /`, `mkfs`, `dd if=`, fork bomb, `> /dev/sd*` |

其它防护：

- 操作限定在 `workspace_root` 之内。
- `exec_cmd` 使用 detached spawn，超时/中断时通过 `kill(-pid)` 递归回收子孙进程组。
- 管道与链式命令会逐段重新分级，取最高风险等级。
- `--yes` / `auto_confirm` 仅跳过 confirm，**不会**绕过 forbidden。

---

## 平台支持

- **macOS**（zsh / bash）— P0
- **Linux**（bash / zsh，Ubuntu / Debian 验证过）— P0
- **Windows WSL** — P2，未充分测试

启动时自动检测 shell；未识别时回退到 `bash`。

---

## 开发

```bash
pnpm build         # tsc 编译到 dist/
pnpm test          # vitest
```

技术栈：TypeScript（strict）/ OpenAI SDK / Zod / fast-glob / Inquirer / Ora。无第三方 CLI 框架，命令行解析直接基于 `process.argv`。

---

## 路线图

详见 [docs/PROGRESS.md](docs/PROGRESS.md)。当前在 M2（REPL 与会话）/ M3（打磨发布）。

## License

MIT
