#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface RiverXConfig {
  llm: {
    provider: string
    model: string
    base_url: string
    api_key: string
  }
  security: {
    workspace_root: string
    auto_confirm_safe_commands: boolean
    confirm_medium_risk: boolean
  }
  shell: {
    default: string
    timeout_ms: number
  }
}

// ── 默认配置 ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: RiverXConfig = {
  llm: {
    provider: 'qwen',
    model: 'qwen-plus',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    api_key: '',
  },
  security: {
    workspace_root: 'cwd',
    auto_confirm_safe_commands: true,
    confirm_medium_risk: false,
  },
  shell: {
    default: 'auto',
    timeout_ms: 30000,
  },
}

// ── 平台检测（将在 M0.3 迁移至 src/utils/platform.ts）───────────────────────

function detectPlatform() {
  const platform = process.platform as 'darwin' | 'linux'
  const shell = process.env.SHELL ?? '/bin/bash'
  const username = process.env.USER ?? os.userInfo().username
  const cwd = process.cwd()
  return { platform, shell, username, cwd }
}

// ── 配置加载（将在 M0.4 迁移至 src/config/config.ts）────────────────────────

function loadConfig(): RiverXConfig {
  const configPath = path.join(os.homedir(), '.riverx', 'config.json')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

// ── 命令处理 ──────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
riverx — 自然语言系统操作助手

用法：
  riverx "prompt"    用自然语言描述你想做的事（headless 模式）
  riverx             进入交互式会话（REPL 模式）

选项：
  --help             显示帮助信息
  --version          显示版本号
  --config           打印当前配置

示例：
  riverx "列出当前目录下最大的 10 个文件"
  riverx "查找所有包含 TODO 的 ts 文件"
  riverx "清理 /tmp 下超过 7 天的文件"
`)
}

function printVersion() {
  console.log('riverx 0.1.0')
}

function printConfig(config: RiverXConfig) {
  const configPath = path.join(os.homedir(), '.riverx', 'config.json')
  const exists = fs.existsSync(configPath)
  console.log(`配置文件：${configPath}${exists ? '' : '（未找到，使用默认值）'}`)
  console.log(JSON.stringify(config, null, 2))
}

// ── 执行路径（将在后续里程碑完整实现）────────────────────────────────────────

async function runHeadless(prompt: string, _config: RiverXConfig) {
  const { platform, shell, username, cwd } = detectPlatform()
  console.log(`[riverx] headless 模式`)
  console.log(`  平台：${platform}  Shell：${shell}  用户：${username}`)
  console.log(`  工作目录：${cwd}`)
  console.log(`  指令：${prompt}`)
  console.log()
  console.log('QueryEngine 尚未实现，将在 M0.8 完成。')
  process.exit(0)
}

async function runRepl(_config: RiverXConfig) {
  const { platform, shell, username, cwd } = detectPlatform()
  console.log(`riverx 0.1.0  |  ${platform}  ${shell}  用户：${username}`)
  console.log(`工作目录：${cwd}`)
  console.log()
  console.log('REPL 交互模式尚未实现，将在 M2 完成。')
  process.exit(0)
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  if (args.includes('--version') || args.includes('-v')) {
    printVersion()
    process.exit(0)
  }

  const config = loadConfig()

  if (args.includes('--config')) {
    printConfig(config)
    process.exit(0)
  }

  const prompt = args.find(a => !a.startsWith('--'))

  if (prompt) {
    await runHeadless(prompt, config)
  } else {
    await runRepl(config)
  }
}

main().catch(err => {
  console.error('riverx 错误：', err instanceof Error ? err.message : err)
  process.exit(1)
})
