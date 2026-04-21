import OpenAI from 'openai'
import type { RiverXConfig } from '../config/config.js'
import type { ChatChunk, ChatMessage, ChatParams, LLMProvider, ToolDefinition } from './provider.js'
import type { ProviderPreset } from './presets.js'
import { convertOpenAIError } from './errors.js'

type LLMConfig = RiverXConfig['llm']

type ResponseInputItem = OpenAI.Responses.ResponseInputItem
type FunctionTool = OpenAI.Responses.FunctionTool
type ResponseStreamEvent = OpenAI.Responses.ResponseStreamEvent

function buildTools(tools: ToolDefinition[]): FunctionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    name: t.name,
    description: t.description,
    parameters: t.parameters as Record<string, unknown>,
    strict: false,
  }))
}

/**
 * ChatMessage → Responses API input items。
 * - system/user/assistant 纯文本 → { role, content, type: 'message' }
 * - assistant tool_calls      → 若干 function_call 条目
 * - tool 消息                 → function_call_output 条目（call_id 取 tool_call_id）
 */
function buildInput(messages: ChatMessage[]): ResponseInputItem[] {
  const items: ResponseInputItem[] = []
  for (const m of messages) {
    if (m.role === 'tool') {
      items.push({
        type: 'function_call_output',
        call_id: m.tool_call_id ?? '',
        output: m.content ?? '',
      })
      continue
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      if (m.content) {
        items.push({ role: 'assistant', content: m.content, type: 'message' })
      }
      for (const tc of m.tool_calls) {
        items.push({
          type: 'function_call',
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })
      }
      continue
    }
    // system / user / assistant(纯文本)
    items.push({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content ?? '',
      type: 'message',
    })
  }
  return items
}

/**
 * Responses API Provider。
 * 使用 `/v1/responses` 端点（gpt-5-codex 等需此协议）。
 */
export class OpenAIResponsesProvider implements LLMProvider {
  private readonly client: OpenAI
  private readonly config: LLMConfig
  private readonly preset: ProviderPreset

  constructor(config: LLMConfig, preset: ProviderPreset) {
    this.config = config
    this.preset = preset
    this.client = new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url ?? preset.base_url,
      timeout: 60_000,
      maxRetries: 1,
    })
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const model = params.model ?? this.config.model ?? this.preset.default_model
    let stream: AsyncIterable<ResponseStreamEvent>
    try {
      stream = await this.client.responses.create({
        model,
        input: buildInput(params.messages),
        tools: params.tools?.length ? buildTools(params.tools) : undefined,
        temperature: params.temperature,
        stream: true,
        store: false,
      })
    } catch (err) {
      throw convertOpenAIError(err, this.preset.display_name)
    }

    // output_index → call_id 映射，避免后续 delta 事件找不到 tool_call id
    const callIdByIndex = new Map<number, string>()

    try {
      for await (const event of stream) {
        switch (event.type) {
          case 'response.output_text.delta':
            if (event.delta) {
              yield { type: 'text', content: event.delta }
            }
            break

          case 'response.output_item.added': {
            const item = event.item
            if (item.type === 'function_call') {
              callIdByIndex.set(event.output_index, item.call_id)
              yield {
                type: 'tool_call',
                index: event.output_index,
                id: item.call_id,
                name: item.name,
                argumentsDelta: item.arguments ?? '',
              }
            }
            break
          }

          case 'response.function_call_arguments.delta':
            yield {
              type: 'tool_call',
              index: event.output_index,
              id: callIdByIndex.get(event.output_index),
              argumentsDelta: event.delta,
            }
            break

          // 忽略其余事件（reasoning / refusal / audio / web_search 等）
          default:
            break
        }
      }
    } catch (err) {
      throw convertOpenAIError(err, this.preset.display_name)
    }
  }
}
