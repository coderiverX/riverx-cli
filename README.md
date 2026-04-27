# RiverX

> Operate your Linux / macOS box in plain language.

[![Node](https://img.shields.io/badge/node-%E2%89%A520-1f1f23)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-1f1f23)](#license)
[![Status](https://img.shields.io/badge/status-v0.1.0_dev-22d3ee)](docs/PROGRESS.md)

**Website**: [cli.coderiverx.com](https://cli.coderiverx.com/) · **Languages**: **English** · [简体中文](README.zh.md)

RiverX is a terminal-native **natural-language system operations assistant**: it
translates your intent into structured tool calls and runs them under local
guardrails — not "let the LLM emit free-form shell". Every step is auditable,
controllable, and interruptible.

---

## Demo

```text
$ riverx "list the 10 largest files in the current directory"

→ Plan
  1. exec_cmd  du -sh ./* | sort -h | tail -10

→ Run ●
  132M  ./node_modules
   48M  ./dist
   12M  ./docs
    ...
```

---

## Features

- **Two modes** — `riverx "..."` for one-shot (headless); bare `riverx` for an interactive REPL.
- **Structured tool calls** — eight built-in tools, no free-form shell from the LLM.
- **Risk-tiered execution** — `safe` runs automatically, `medium` is shown before running, `high` requires confirmation, `forbidden` is rejected outright.
- **Multi-provider LLM** — OpenAI / DeepSeek / Kimi / Qwen, with API-key validation on first run.
- **Safe defaults** — workspace-bounded I/O, command timeouts, and recursive process-group cleanup (detached spawn).

---

## Install

Prerequisites: Node ≥ 20, pnpm.

```bash
git clone git@github.com:coderiverX/riverx-cli.git
cd riverx-cli
pnpm install
pnpm build
```

Optional: install globally so `riverx` is on your PATH.

```bash
npm install -g .
```

---

## Quick start

Just run `riverx`. With no config, it walks you through an interactive wizard:

```text
$ riverx
Welcome to RiverX
? Select an LLM provider:  ❯ openai / deepseek / kimi / qwen
? Enter API key: ************
✓ API key verified
Saved to ~/.riverx/config.json
```

The wizard sends a minimal request to your chosen provider to verify the key.
On failure you can retry, skip verification, or quit.

---

## Usage

```bash
# Headless: run once and exit
riverx "find all .ts files containing TODO"

# REPL: enter an interactive session
riverx

# Automation: skip every confirm prompt
riverx --yes "clean files older than 7 days under /tmp"
```

**Flags**

| Flag | Description |
| --- | --- |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Print version |
| `--config` | Print the resolved config (with file path) |
| `--yes` | Auto-confirm every prompt — useful in scripts / CI |

**Example prompts**

```bash
riverx "list the 10 largest files in the current directory"
riverx "find all .ts files containing TODO"
riverx "clean files older than 7 days under /tmp"
riverx "create test.txt with the text 'hello world'"
```

---

## Built-in tools

| Tool | Purpose |
| --- | --- |
| `read_file` | Read file contents, optional line range |
| `list_files` | List a directory, with glob and exclude rules |
| `grep` | Recursive regex search across the file tree |
| `write_file` | Atomic write, parent dirs created as needed |
| `patch_file` | Context-anchored edits — no full-file rewrites |
| `exec_cmd` | Run shell with timeouts and process-group cleanup |
| `confirm` | Human approval gate for high-risk operations |
| `session` | Inspect / reset the REPL conversation context |

The LLM invokes these via the tool-use protocol; whatever lands inside
`exec_cmd` is then graded by `src/security/risk-classifier.ts`.

---

## Configuration

Config lives at `~/.riverx/config.json`, generated on first launch.
Full schema:

```jsonc
{
  "llm": {
    "provider": "qwen",          // openai | deepseek | kimi | qwen
    "model": "qwen-plus",        // optional; falls back to the provider default
    "base_url": "...",           // optional; falls back to the provider preset
    "api_key": "...",
    "wire_api": "chat"           // chat (default) | responses (OpenAI Responses API)
  },
  "security": {
    "workspace_root": "cwd",     // operations are bounded to this root; cwd = launch dir
    "auto_confirm_safe_commands": true,
    "confirm_medium_risk": false,
    "auto_confirm": false        // equivalent to a global --yes
  },
  "shell": {
    "default": "auto",           // auto | bash | zsh
    "timeout_ms": 30000
  }
}
```

**Provider presets**

| Provider | base_url | Default model | Native env |
| --- | --- | --- | --- |
| openai | `https://api.openai.com/v1` | `gpt-4o-mini` | `OPENAI_API_KEY` |
| deepseek | `https://api.deepseek.com` | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | `MOONSHOT_API_KEY` |
| qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | `DASHSCOPE_API_KEY` |

**Environment overrides** (highest priority)

```bash
export RIVERX_API_KEY="..."     # overrides llm.api_key
export RIVERX_MODEL="..."       # overrides llm.model
export RIVERX_BASE_URL="..."    # overrides llm.base_url
```

If `RIVERX_API_KEY` is unset, RiverX falls back to the provider's native env
variable (e.g. `OPENAI_API_KEY`).

---

## Security model

| Tier | Behavior | Examples |
| --- | --- | --- |
| `safe` | Runs automatically | `ls`, `cat`, `pwd`, `df`, `du`, `ps`, `which`, `stat`, … |
| `medium` | Shown in REPL before running (configurable forced confirm) | `rm`, `mv`, `cp`, `mkdir`, `chmod`, `npm install`, `wget`, `ssh`, … |
| `high` | Requires explicit confirm | `rm -r`, `chmod -R`, `kill -9`, `sudo`, `truncate`, `shred`, … |
| `forbidden` | Rejected outright | `rm -rf /`, `mkfs`, `dd if=`, fork bombs, `> /dev/sd*` |

Additional guards:

- All file operations are bounded by `workspace_root`.
- `exec_cmd` uses `detached` spawn; on timeout or abort it sends `kill(-pid)`
  to recursively reap descendant processes.
- Pipelines and chained commands are re-graded segment by segment; the highest
  tier wins.
- `--yes` / `auto_confirm` skips confirmations only — it never bypasses
  `forbidden`.

---

## Platform support

- **macOS** (zsh / bash) — P0
- **Linux** (bash / zsh, validated on Ubuntu / Debian) — P0
- **Windows WSL** — P2, not extensively tested

The shell is auto-detected at startup, falling back to `bash` if unknown.

---

## Development

```bash
pnpm build         # tsc → dist/
pnpm test          # vitest
```

Stack: TypeScript (strict) / OpenAI SDK / Zod / fast-glob / Inquirer / Ora.
No CLI framework — argument parsing is `process.argv` directly.

---

## Roadmap

See [docs/PROGRESS.md](docs/PROGRESS.md). Currently between M2 (REPL & sessions)
and M3 (polish & release).

## License

MIT
