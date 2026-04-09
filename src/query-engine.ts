import type { LLMProvider, ChatMessage, ToolCall } from './llm/provider.js'
import type { PlatformInfo } from './utils/platform.js'
import type { ShellInfo } from './utils/shell.js'
import type { RiverXConfig } from './config/config.js'
import { ToolRegistry } from './tool.js'

interface AggregatedToolCall {
  id: string
  name: string
  arguments: string
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
  constructor(
    private readonly provider: LLMProvider,
    private readonly registry: ToolRegistry,
    private readonly platform: PlatformInfo,
    private readonly shell: ShellInfo,
    private readonly config: RiverXConfig,
  ) {}

  async run(
    userInput: string,
    onText?: (chunk: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt(this.platform, this.shell)
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput },
    ]
    const tools = this.registry.toToolDefinitions()

    // 第一次 LLM 调用
    const firstStream = this.provider.chat({ messages, tools })
    const { text: firstText, toolCalls } = await aggregateStream(firstStream)

    // 无工具调用：直接输出
    if (toolCalls.length === 0) {
      onText?.(firstText)
      return firstText
    }

    // 有工具调用：构建 assistant message
    const assistantToolCalls: ToolCall[] = toolCalls.map(tc => ({
      id: tc.id,
      function: { name: tc.name, arguments: tc.arguments },
    }))
    messages.push({
      role: 'assistant',
      content: firstText || null,
      tool_calls: assistantToolCalls,
    })

    // 并行执行工具
    const ctx = {
      cwd: this.platform.cwd,
      platform: this.platform,
      config: this.config,
      abortSignal,
    }

    const toolResults = await Promise.all(
      toolCalls.map(async tc => {
        let output: string
        try {
          const tool = this.registry.get(tc.name)
          const args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>
          const result = await tool.execute(args, ctx)
          output = result.output
        } catch (err) {
          output = JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
        }
        return { id: tc.id, output }
      }),
    )

    for (const tr of toolResults) {
      messages.push({ role: 'tool', content: tr.output, tool_call_id: tr.id })
    }

    // 第二次 LLM 调用，流式输出给用户
    const secondStream = this.provider.chat({ messages, tools })
    const { text: finalText } = await aggregateStream(secondStream, onText)

    return finalText
  }
}
