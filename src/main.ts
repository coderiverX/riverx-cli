#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { detectPlatform } from './utils/platform.js'
import { detectShell } from './utils/shell.js'
import { loadConfig, type RiverXConfig } from './config/config.js'
import { QwenProvider } from './llm/qwen.js'
import { ToolRegistry } from './tool.js'
import { execCmd } from './tools/exec-cmd.js'
import { readFile } from './tools/read-file.js'
import { writeFile } from './tools/write-file.js'
import { patchFile } from './tools/patch-file.js'
import { listFiles } from './tools/list-files.js'
import { grep } from './tools/grep.js'
import { confirm } from './tools/confirm.js'
import { session } from './tools/session.js'
import { QueryEngine } from './query-engine.js'

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

// ── 执行路径 ──────────────────────────────────────────────────────────────────

async function runHeadless(prompt: string, config: RiverXConfig) {
  if (!config.llm.api_key) {
    console.error(
      '错误：未配置 API Key\n' +
      '请在 ~/.riverx/config.json 中设置 llm.api_key\n' +
      '或通过环境变量 RIVERX_API_KEY 设置',
    )
    process.exit(1)
  }

  const platform = detectPlatform()
  const shell = detectShell()

  const provider = new QwenProvider(config.llm)
  const registry = new ToolRegistry()
  for (const tool of [execCmd, readFile, writeFile, patchFile, listFiles, grep, confirm, session]) {
    registry.register(tool)
  }

  const engine = new QueryEngine(provider, registry, platform, shell, config)

  const ac = new AbortController()
  process.once('SIGINT', () => {
    ac.abort()
    process.exit(130)
  })

  await engine.run(prompt, chunk => process.stdout.write(chunk), ac.signal)
  console.log()
}

async function runRepl(_config: RiverXConfig) {
  const { os: platform, username, cwd } = detectPlatform()
  const { path: shellPath } = detectShell()
  console.log(`riverx 0.1.0  |  ${platform}  ${shellPath}  用户：${username}`)
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
