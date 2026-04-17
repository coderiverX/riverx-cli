import fs from 'node:fs'
import path from 'node:path'
import type { LLMProvider, ChatMessage, ToolCall } from './llm/provider.js'
import type { PlatformInfo } from './utils/platform.js'
import type { ShellInfo } from './utils/shell.js'
import type { RiverXConfig } from './config/config.js'
import type { Tool, SessionHandle } from './tool.js'
import { ToolRegistry } from './tool.js'
import { askConfirm } from './utils/confirm-prompt.js'
import {
  classifyCommand,
  checkCommandPermission,
  checkPathPermission,
  type ExecutionMode,
} from './security/permissions.js'
import type { StreamOutput, ToolEvent } from './ui/stream-output.js'

const MAX_ROUNDS = 30

interface AggregatedToolCall {
  id: string
  name: string
  arguments: string
}

function buildArgSummary(name: string, args: Record<string, unknown>): string {
  if (name === 'exec_cmd') {
    const cmd = String(args['command'] ?? '')
    return `exec_cmd: ${cmd.length > 80 ? cmd.slice(0, 80) + '…' : cmd}`
  }
  const filePath = args['path'] ?? args['file_path'] ?? ''
  return `${name}: ${filePath}`
}

async function needsConfirm(
  tool: Tool,
  args: Record<string, unknown>,
  cwd: string,
  autoConfirm: boolean,
  mode: ExecutionMode,
  config: RiverXConfig,
): Promise<boolean | 'deny'> {
  // exec_cmd：按命令风险等级决策
  if (tool.name === 'exec_cmd') {
    const command = String(args['command'] ?? '')
    const riskLevel = classifyCommand(command)
    const result = checkCommandPermission(command, riskLevel, mode)
    if (result === 'deny') return 'deny'
    if (result === 'need_confirm') return !autoConfirm
    return false  // allow
  }

  // write_file / patch_file：按路径权限决策
  if (tool.name === 'write_file' || tool.name === 'patch_file') {
    const filePath = args['path'] as string | undefined
    if (filePath) {
      const resolved = path.resolve(cwd, filePath)
      const pathPerm = checkPathPermission(resolved, config.security.workspace_root)
      if (pathPerm === 'forbidden') return 'deny'
      if (pathPerm === 'outside') {
        // workspace 外视为 high 风险
        if (mode === 'headless') return 'deny'
        return !autoConfirm
      }
    }
  }

  // 通用 confirmMode 逻辑
  if (autoConfirm || !tool.confirmMode) return false
  if (tool.confirmMode === 'always') return true
  // on-overwrite: check if target file exists
  const filePath = args['path'] as string | undefined
  if (!filePath) return false
  return fs.existsSync(path.resolve(cwd, filePath))
}

function buildSystemPrompt(platform: PlatformInfo, shell: ShellInfo): string {
  const now = new Date().toISOString().slice(0, 10)
  return [
    `你是 RiverX，一个运行在 ${platform.os} 上的系统操作助手。`,
    `通过工具调用执行 shell 命令来完成用户的任务，不要凭空编造结果。`,
    ``,
    `当前环境：`,
    `- 操作系统：${platform.os} ${platform.osVersion}`,
    `- 用户：${platform.username}`,
    `- 工作目录：${platform.cwd}`,
    `- Shell：${shell.path}`,
    `- 日期：${now}`,
    ``,
    `执行原则：`,
    `- 优先通过工具获取真实信息，再组织回答`,
    `- 回答使用中文，命令输出可保留原文`,
  ].join('\n')
}

async function aggregateStream(
  stream: AsyncIterable<import('./llm/provider.js').ChatChunk>,
  onText?: (chunk: string) => void,
): Promise<{ text: string; toolCalls: AggregatedToolCall[] }> {
  let text = ''
  const tcMap = new Map<number, { id: string; name: string; args: string }>()

  for await (const chunk of stream) {
    if (chunk.type === 'text') {
      text += chunk.content
      onText?.(chunk.content)
    } else {
      const entry = tcMap.get(chunk.index) ?? { id: '', name: '', args: '' }
      if (chunk.id) entry.id = chunk.id
      if (chunk.name) entry.name = chunk.name
      entry.args += chunk.argumentsDelta
      tcMap.set(chunk.index, entry)
    }
  }

  const toolCalls: AggregatedToolCall[] = Array.from(tcMap.values()).map(tc => ({
    id: tc.id,
    name: tc.name,
    arguments: tc.args,
  }))

  return { text, toolCalls }
}

export class QueryEngine {
  private readonly startedAt = new Date()

  constructor(
    private readonly provider: LLMProvider,
    private readonly registry: ToolRegistry,
    private readonly platform: PlatformInfo,
    private readonly shell: ShellInfo,
    private readonly config: RiverXConfig,
  ) {}

  /** 创建含 system prompt 的初始会话消息数组，供 REPL 多轮对话使用 */
  createConversation(): ChatMessage[] {
    return [{ role: 'system', content: buildSystemPrompt(this.platform, this.shell) }]
  }

  private buildSessionHandle(messages: ChatMessage[]): SessionHandle {
    return {
      getMessageCount: () => messages.length,
      getCwd: () => this.platform.cwd,
      getStartedAt: () => this.startedAt,
      clear: () => { messages.splice(0) },
    }
  }

  async run(
    userInput: string,
    output?: StreamOutput,
    abortSignal?: AbortSignal,
    conversationHistory?: ChatMessage[],
  ): Promise<string> {
    let messages: ChatMessage[]
    if (conversationHistory) {
      conversationHistory.push({ role: 'user', content: userInput })
      messages = conversationHistory
    } else {
      const systemPrompt = buildSystemPrompt(this.platform, this.shell)
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ]
    }
    const tools = this.registry.toToolDefinitions()
    const ctx = {
      cwd: this.platform.cwd,
      platform: this.platform,
      config: this.config,
      abortSignal,
      session: this.buildSessionHandle(messages),
    }

    const mode: ExecutionMode = process.stdin.isTTY ? 'repl' : 'headless'

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (abortSignal?.aborted) throw new Error('已中断')

      output?.onLLMStart?.()
      const stream = this.provider.chat({ messages, tools })
      const { text, toolCalls } = await aggregateStream(
        stream,
        output ? (chunk) => output.onText(chunk) : undefined,
      )
      output?.onLLMEnd?.()

      if (toolCalls.length === 0) {
        conversationHistory?.push({ role: 'assistant', content: text })
        return text
      }

      // 有工具调用：构建 assistant message
      const assistantToolCalls: ToolCall[] = toolCalls.map(tc => ({
        id: tc.id,
        function: { name: tc.name, arguments: tc.arguments },
      }))
      messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: assistantToolCalls,
      })

      // 串行执行工具（需要依次等待用户确认）
      const autoConfirm = this.config.security.auto_confirm
      const toolResults: { id: string; output: string }[] = []
      for (const tc of toolCalls) {
        let output: string

        // 先解析参数，格式异常时降级：将错误报给 LLM 让其决策
        let args: Record<string, unknown>
        try {
          args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>
        } catch {
          output = JSON.stringify({ error: `工具 "${tc.name}" 的参数 JSON 格式异常，已跳过` })
          toolResults.push({ id: tc.id, output })
          continue
        }

        const summary = buildArgSummary(tc.name, args)
        try {
          const tool = this.registry.get(tc.name)
          const confirm = await needsConfirm(tool, args, ctx.cwd, autoConfirm, mode, this.config)

          if (confirm === 'deny') {
            output = JSON.stringify({ declined: true, reason: 'permission denied' })
            toolResults.push({ id: tc.id, output })
            continue
          }

          if (confirm === true) {
            if (!process.stdin.isTTY) {
              output = JSON.stringify({ declined: true, reason: 'headless mode' })
              toolResults.push({ id: tc.id, output })
              continue
            }
            const approved = await askConfirm(summary)
            if (!approved) {
              output = JSON.stringify({ declined: true })
              toolResults.push({ id: tc.id, output })
              continue
            }
          }

          const startTime = Date.now()
          output?.onToolEvent({ type: 'tool_start', summary })
          const result = await tool.execute(args, ctx)
          const elapsedMs = Date.now() - startTime

          if (result.success) {
            output?.onToolEvent({ type: 'tool_done', summary, elapsedMs })
          } else {
            output?.onToolEvent({ type: 'tool_error', summary, error: result.error ?? 'unknown error', elapsedMs })
          }
          output = result.output
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e)
          output?.onToolEvent({ type: 'tool_error', summary, error: errMsg, elapsedMs: 0 })
          output = JSON.stringify({ error: errMsg })
        }
        toolResults.push({ id: tc.id, output })
      }

      for (const tr of toolResults) {
        messages.push({ role: 'tool', content: tr.output, tool_call_id: tr.id })
      }
    }

    throw new Error(`工具调用超过最大轮次 (${MAX_ROUNDS})`)
  }
}
