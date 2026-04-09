import { spawn } from 'node:child_process'
import type { Tool, ToolContext, ToolResult } from '../tool.js'

const FORBIDDEN_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /:\(\)\s*\{/,        // fork bomb
  />\s*\/dev\/sd/,
]

const TRUNCATE_LIMIT = 200
const TRUNCATE_HEAD = 100
const TRUNCATE_TAIL = 100

function truncateOutput(text: string): string {
  const lines = text.split('\n')
  if (lines.length <= TRUNCATE_LIMIT) return text
  const omitted = lines.length - TRUNCATE_HEAD - TRUNCATE_TAIL
  return [
    ...lines.slice(0, TRUNCATE_HEAD),
    `[... ${omitted} lines omitted ...]`,
    ...lines.slice(lines.length - TRUNCATE_TAIL),
  ].join('\n')
}

function isForbidden(command: string): boolean {
  return FORBIDDEN_PATTERNS.some(re => re.test(command))
}

export const execCmd: Tool = {
  name: 'exec_cmd',
  description:
    '在当前系统上执行 shell 命令，返回 stdout、stderr 和退出码。' +
    '适用于文件操作、系统查询、程序执行等任务。',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的 shell 命令',
      },
      cwd: {
        type: 'string',
        description: '命令执行的工作目录（可选，默认为当前目录）',
      },
      timeout_ms: {
        type: 'number',
        description: '超时毫秒数（可选，默认使用配置值）',
      },
    },
    required: ['command'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const command = args['command'] as string
    const cwd = (args['cwd'] as string | undefined) ?? ctx.cwd
    const timeoutMs = (args['timeout_ms'] as number | undefined) ?? ctx.config.shell.timeout_ms

    if (isForbidden(command)) {
      const output = JSON.stringify({ error: `forbidden command: ${command}` })
      return { success: false, output, error: `禁止执行的命令: ${command}` }
    }

    const shell =
      ctx.platform.os === 'darwin'
        ? (process.env['SHELL'] ?? '/bin/zsh')
        : (process.env['SHELL'] ?? '/bin/bash')

    return new Promise<ToolResult>(resolve => {
      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let timedOut = false

      const proc = spawn(shell, ['-c', command], {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      proc.stdout.on('data', (chunk: Buffer) => { stdoutChunks.push(chunk) })
      proc.stderr.on('data', (chunk: Buffer) => { stderrChunks.push(chunk) })

      const timer = setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL')
        }, 200)
      }, timeoutMs)

      if (ctx.abortSignal) {
        ctx.abortSignal.addEventListener('abort', () => {
          clearTimeout(timer)
          proc.kill('SIGTERM')
        }, { once: true })
      }

      proc.on('close', (code: number | null) => {
        clearTimeout(timer)

        if (timedOut) {
          const output = JSON.stringify({
            error: `timeout after ${timeoutMs}ms`,
            exit_code: -1,
          })
          resolve({ success: false, output, error: `命令超时（${timeoutMs}ms）` })
          return
        }

        const exitCode = code ?? -1
        const stdout = truncateOutput(Buffer.concat(stdoutChunks).toString('utf-8'))
        const stderr = truncateOutput(Buffer.concat(stderrChunks).toString('utf-8'))

        const output = JSON.stringify({ exit_code: exitCode, stdout, stderr })
        resolve({ success: exitCode === 0, output })
      })

      proc.on('error', (err: Error) => {
        clearTimeout(timer)
        const output = JSON.stringify({ error: err.message, exit_code: -1 })
        resolve({ success: false, output, error: err.message })
      })
    })
  },
}
