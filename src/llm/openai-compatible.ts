import OpenAI from 'openai'
import type { RiverXConfig } from '../config/config.js'
import type { ChatChunk, ChatMessage, ChatParams, LLMProvider, ToolDefinition } from './provider.js'
import type { ProviderPreset } from './presets.js'
import { convertOpenAIError } from './errors.js'

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

/**
 * OpenAI 兼容协议的通用 Provider。
 * 适用于 OpenAI / DeepSeek / Kimi (Moonshot) / Qwen (DashScope 兼容端点) 等。
 */
export class OpenAICompatibleProvider implements LLMProvider {
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
    let stream: AsyncIterable<OpenAI.ChatCompletionChunk>
    try {
      stream = await this.client.chat.completions.create({
        model,
        messages: buildMessages(params.messages),
        tools: params.tools?.length ? buildTools(params.tools) : undefined,
        temperature: params.temperature,
        stream: true as const,
      })
    } catch (err) {
      throw convertOpenAIError(err, this.preset.display_name)
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
      throw convertOpenAIError(err, this.preset.display_name)
    }
  }
}
