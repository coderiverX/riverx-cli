import readline from 'node:readline'
import type { ChatMessage } from '../llm/provider.js'
import type { RiverXConfig } from '../config/config.js'
import type { QueryEngine } from '../query-engine.js'
import { createStreamOutput, type ToolEvent } from '../ui/stream-output.js'
import { detectPlatform } from '../utils/platform.js'
import { detectShell } from '../utils/shell.js'
import { logToolCall } from '../utils/logger.js'
import { saveSession, cleanupOldSessions, type SessionData } from './session-store.js'

function generateSessionId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const rand = Math.random().toString(36).slice(2, 7)
  return `${ts}-${rand}`
}

function trimConversation(messages: ChatMessage[], maxChars = 150_000): void {
  // messages[0] 始终是 system prompt，永远保留
  let total = JSON.stringify(messages).length
  while (total > maxChars && messages.length > 3) {
    messages.splice(1, 2)
    total = JSON.stringify(messages).length
  }
}

export class Repl {
  constructor(
    private engine: QueryEngine,
    private readonly config: RiverXConfig,
    private readonly onModelChange?: (model: string) => void,
  ) {}

  async start(): Promise<void> {
    const { os: osName, username, cwd } = detectPlatform()
    const { path: shellPath } = detectShell()

    process.stdout.write(
      `riverx 0.1.0  |  ${osName}  ${shellPath}  用户：${username}\n` +
      `工作目录：${cwd}\n` +
      `输入 /help 查看可用命令，Ctrl+D 退出。\n\n`,
    )

    const messages: ChatMessage[] = this.engine.createConversation()
    const toolCallStats: Record<string, number> = {}
    const startedAt = new Date()
    const sessionId = generateSessionId()

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'riverx> ',
      terminal: true,
    })

    let currentAc: AbortController | null = null

    const streamOut = createStreamOutput()

    const onToolEvent = (event: ToolEvent) => {
      streamOut.onToolEvent(event)
      if (event.type === 'tool_done' || event.type === 'tool_error') {
        // 从 summary 中提取 toolName（格式：toolName: args）
        const toolName = event.summary.split(':')[0].trim()
        toolCallStats[toolName] = (toolCallStats[toolName] ?? 0) + 1
        logToolCall(
          toolName,
          event.summary,
          event.type === 'tool_done',
          event.elapsedMs,
        )
      }
    }

    const handleBuiltin = (line: string): boolean => {
      const parts = line.trim().split(/\s+/)
      const cmd = parts[0]

      if (cmd === '/help') {
        process.stdout.write(
          '\n可用命令：\n' +
          '  /help              显示此帮助\n' +
          '  /clear             清空当前对话上下文\n' +
          '  /history           查看最近对话记录\n' +
          '  /config            显示当前配置\n' +
          '  /model <name>      切换模型（如 qwen-turbo、qwen-plus）\n' +
          '  /exit              退出\n\n',
        )
        return true
      }

      if (cmd === '/clear') {
        messages.splice(1)
        process.stdout.write('会话上下文已清空。\n\n')
        return true
      }

      if (cmd === '/history') {
        const history = messages.filter(m => m.role === 'user' || m.role === 'assistant')
        const recent = history.slice(-10)
        if (recent.length === 0) {
          process.stdout.write('（暂无对话记录）\n\n')
        } else {
          process.stdout.write('\n')
          for (const m of recent) {
            const label = m.role === 'user' ? '你' : 'RiverX'
            const text = typeof m.content === 'string' ? m.content : '(工具调用)'
            const preview = text.length > 200 ? text.slice(0, 200) + '…' : text
            process.stdout.write(`[${label}] ${preview}\n`)
          }
          process.stdout.write('\n')
        }
        return true
      }

      if (cmd === '/config') {
        process.stdout.write('\n' + JSON.stringify(this.config, null, 2) + '\n\n')
        return true
      }

      if (cmd === '/model') {
        const model = parts[1]
        if (!model) {
          process.stdout.write(`当前模型：${this.config.llm.model}\n\n`)
        } else {
          this.config.llm.model = model
          this.onModelChange?.(model)
          process.stdout.write(`已切换模型：${model}\n\n`)
        }
        return true
      }

      if (cmd === '/exit') {
        rl.close()
        return true
      }

      if (cmd.startsWith('/')) {
        process.stdout.write(`未知命令：${cmd}（输入 /help 查看可用命令）\n\n`)
        return true
      }

      return false
    }

    rl.prompt()

    rl.on('line', (rawLine: string) => {
      const line = rawLine.trim()
      if (!line) {
        rl.prompt()
        return
      }

      if (handleBuiltin(line)) {
        rl.prompt()
        return
      }

      trimConversation(messages)

      const ac = new AbortController()
      currentAc = ac

      // 暂停 readline 防止并发输入
      rl.pause()

      this.engine
        .run(line, streamOut.onText.bind(streamOut), ac.signal, onToolEvent, messages)
        .then(() => {
          process.stdout.write('\n')
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return
          const msg = err instanceof Error ? err.message : String(err)
          process.stderr.write(`\n错误：${msg}\n`)
        })
        .finally(() => {
          currentAc = null
          rl.resume()
          rl.prompt()
        })
    })

    rl.on('SIGINT', () => {
      if (currentAc) {
        currentAc.abort()
        process.stdout.write('\n^C（中断当前操作）\n')
        currentAc = null
      } else {
        process.stdout.write('\n提示：输入 /exit 或按 Ctrl+D 退出\n')
        rl.prompt()
      }
    })

    rl.on('close', () => {
      process.stdout.write('\n再见！\n')

      const sessionData: SessionData = {
        id: sessionId,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        messageCount: messages.length,
        toolCallStats,
      }

      try {
        saveSession(sessionData)
        cleanupOldSessions()
      } catch {
        // 会话保存失败不中断退出
      }

      process.exit(0)
    })
  }
}
