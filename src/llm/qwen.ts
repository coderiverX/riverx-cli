import OpenAI, { APIConnectionError, APIError } from 'openai'
import type { RiverXConfig } from '../config/config.js'
import type { ChatChunk, ChatMessage, ChatParams, LLMProvider, ToolDefinition } from './provider.js'

type LLMConfig = RiverXConfig['llm']

function buildTools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

function buildMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        content: m.content ?? '',
        tool_call_id: m.tool_call_id!,
      }
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return {
        role: 'assistant' as const,
        content: m.content,
        tool_calls: m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: tc.function,
        })),
      }
    }
    return {
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content ?? '',
    }
  })
}

function convertError(err: unknown): Error {
  // APIConnectionError 是 APIError 的子类，需先检查
  if (err instanceof APIConnectionError) {
    return new Error(
      `Qwen API 连接失败：无法连接到 DashScope 服务。\n` +
      `请检查网络连接和 base_url 配置，可稍后重试。\n` +
      `若持续失败，请确认防火墙未拦截出站 HTTPS 请求。\n` +
      `原始错误：${err.message}`,
    )
  }
  if (err instanceof APIError) {
    const status = err.status
    if (status === 401) {
      return new Error(
        `Qwen API 认证失败（401）：API Key 无效或已过期。\n` +
        `请检查 ~/.riverx/config.json 中的 api_key，或通过环境变量 RIVERX_API_KEY 设置。\n` +
        `原始错误：${err.message}`,
      )
    }
    if (status === 429) {
      return new Error(
        `Qwen API 请求频率超限（429）：当前请求过于频繁。\n` +
        `请稍后重试，或检查账户配额。\n` +
        `原始错误：${err.message}`,
      )
    }
    if (status !== undefined && status >= 500) {
      return new Error(
        `Qwen API 服务异常（${status}）：服务端返回错误。\n` +
        `请稍后重试。如持续出现请联系 DashScope 支持。\n` +
        `原始错误：${err.message}`,
      )
    }
    return new Error(
      `Qwen API 错误（${status ?? '未知状态码'}）：${err.message}`,
    )
  }
  if (err instanceof Error) return err
  return new Error(String(err))
}

export class QwenProvider implements LLMProvider {
  private readonly client: OpenAI
  private readonly config: LLMConfig

  constructor(config: LLMConfig) {
    this.config = config
    this.client = new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url,
      timeout: 60_000,
      maxRetries: 1,
    })
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    let stream: AsyncIterable<OpenAI.ChatCompletionChunk>
    try {
      stream = await this.client.chat.completions.create({
        model: params.model ?? this.config.model,
        messages: buildMessages(params.messages),
        tools: params.tools?.length ? buildTools(params.tools) : undefined,
        temperature: params.temperature,
        stream: true as const,
      })
    } catch (err) {
      throw convertError(err)
    }

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta
        if (!delta) continue

        if (delta.content) {
          yield { type: 'text', content: delta.content }
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            yield {
              type: 'tool_call',
              index: tc.index,
              id: tc.id,
              name: tc.function?.name,
              argumentsDelta: tc.function?.arguments ?? '',
            }
          }
        }
      }
    } catch (err) {
      throw convertError(err)
    }
  }
}
