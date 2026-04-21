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

function killGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return
  try {
    process.kill(-pid, signal)
  } catch {
    // ESRCH: 进程组已退出；EPERM: 无权限——都忽略
  }
}

function summarizeCommand(command: string, max = 80): string {
  const oneLine = command.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine
}

function looksForegroundDaemon(command: string): boolean {
  return /daemon\s+off|-D FOREGROUND|\btail\s+-f\b/.test(command)
}

export const execCmd: Tool = {
  name: 'exec_cmd',
  confirmMode: 'always',
  description:
    '在当前系统上执行 shell 命令，返回 stdout、stderr 和退出码。' +
    '适用于文件操作、系统查询、程序执行等任务。' +
    '注意：此工具同步执行、有超时限制，不适合前台长驻进程（如 `nginx -g "daemon off;"`、' +
    '`tail -f`、开发服务器）。启动服务请使用守护化方式（`nginx`、`brew services start`、`nohup ... &`）。',
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
      let aborted = false

      // detached: true 让 shell 成为新进程组的 leader，kill(-pid) 可以递归杀掉所有子孙
      const proc = spawn(shell, ['-c', command], {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      })

      proc.stdout.on('data', (chunk: Buffer) => { stdoutChunks.push(chunk) })
      proc.stderr.on('data', (chunk: Buffer) => { stderrChunks.push(chunk) })

      const escalate = () => {
        setTimeout(() => {
          if (proc.exitCode === null && proc.signalCode === null) {
            killGroup(proc.pid, 'SIGKILL')
          }
        }, 800)
      }

      const timer = setTimeout(() => {
        timedOut = true
        killGroup(proc.pid, 'SIGTERM')
        escalate()
      }, timeoutMs)

      if (ctx.abortSignal) {
        ctx.abortSignal.addEventListener('abort', () => {
          aborted = true
          clearTimeout(timer)
          killGroup(proc.pid, 'SIGTERM')
          escalate()
        }, { once: true })
      }

      proc.on('close', (code: number | null) => {
        clearTimeout(timer)

        if (timedOut) {
          const summary = summarizeCommand(command)
          const hint = looksForegroundDaemon(command)
            ? '\n提示：该命令似乎是前台长驻进程。若需启动服务，请去掉 `-g "daemon off;"`，或以后台方式运行（nohup / & / brew services）。'
            : ''
          const output = JSON.stringify({
            error: `timeout after ${timeoutMs}ms`,
            command: summary,
            exit_code: -1,
          })
          resolve({
            success: false,
            output,
            error: `命令超时（${timeoutMs}ms）：${summary}${hint}`,
          })
          return
        }

        if (aborted) {
          const output = JSON.stringify({
            error: 'aborted by user',
            command: summarizeCommand(command),
            exit_code: -1,
          })
          resolve({ success: false, output, error: '命令被用户中断' })
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
