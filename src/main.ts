#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import chalk from 'chalk'

import { detectPlatform } from './utils/platform.js'
import { detectShell } from './utils/shell.js'
import { loadConfig, saveConfig, type RiverXConfig } from './config/config.js'
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
import { createStreamOutput } from './ui/stream-output.js'
import { Repl } from './repl/repl.js'
import { cleanupOldLogs } from './utils/logger.js'

// ── 工具注册 ──────────────────────────────────────────────────────────────────

function buildRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  for (const tool of [execCmd, readFile, writeFile, patchFile, listFiles, grep, confirm, session]) {
    registry.register(tool)
  }
  return registry
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
  riverx --yes "删除 output 目录下所有临时文件"

选项：
  --yes              跳过所有确认提示（适用于脚本/自动化）
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

// ── 首次运行向导 ──────────────────────────────────────────────────────────────

async function runFirstRunWizard(config: RiverXConfig): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string) => new Promise<string>(resolve => rl.question(q, resolve))

  process.stdout.write(
    '\nriverx — 首次运行配置向导\n' +
    '─────────────────────────\n' +
    '检测到尚未配置 API Key。\n\n',
  )

  const apiKey = await ask('请输入 Qwen (通义千问) API Key: ')
  rl.close()

  const trimmed = apiKey.trim()
  if (!trimmed) {
    console.error('错误：API Key 不能为空，请重新运行配置。')
    process.exit(1)
  }

  config.llm.api_key = trimmed
  saveConfig(config)
  process.stdout.write('配置已保存。\n\n')

  return trimmed
}

// ── 执行路径 ──────────────────────────────────────────────────────────────────

async function runHeadless(prompt: string, config: RiverXConfig) {
  if (!config.llm.api_key) {
    console.error(chalk.red(
      '错误：未配置 API Key\n' +
      '请在 ~/.riverx/config.json 中设置 llm.api_key\n' +
      '或通过环境变量 RIVERX_API_KEY 设置',
    ))
    process.exit(1)
  }

  const platform = detectPlatform()
  const shell = detectShell()

  const provider = new QwenProvider(config.llm)
  const registry = buildRegistry()
  const engine = new QueryEngine(provider, registry, platform, shell, config)

  const ac = new AbortController()
  process.once('SIGINT', () => {
    ac.abort()
    process.exit(130)
  })

  const out = createStreamOutput()
  await engine.run(prompt, out, ac.signal)
  console.log()
}

async function runRepl(config: RiverXConfig) {
  if (!config.llm.api_key) {
    await runFirstRunWizard(config)
  }

  cleanupOldLogs()

  const platform = detectPlatform()
  const shell = detectShell()

  let provider = new QwenProvider(config.llm)
  let engine = new QueryEngine(provider, buildRegistry(), platform, shell, config)

  const onModelChange = (model: string) => {
    config.llm.model = model
    provider = new QwenProvider(config.llm)
    engine = new QueryEngine(provider, buildRegistry(), platform, shell, config)
  }

  const repl = new Repl(engine, config, onModelChange)
  await repl.start()
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

  if (args.includes('--yes')) {
    config.security.auto_confirm = true
  }

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
  console.error(chalk.red('riverx 错误：' + (err instanceof Error ? err.message : String(err))))
  process.exit(1)
})
