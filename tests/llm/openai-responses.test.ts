import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', async importOriginal => {
  const actual = await importOriginal<typeof import('openai')>()
  return {
    default: vi.fn(() => ({
      responses: {
        create: mockCreate,
      },
    })),
    APIError: actual.APIError,
    APIConnectionError: actual.APIConnectionError,
  }
})

import { OpenAIResponsesProvider } from '../../src/llm/openai-responses.js'
import { PROVIDER_PRESETS } from '../../src/llm/presets.js'

const PRESET = PROVIDER_PRESETS.openai

function makeProvider() {
  return new OpenAIResponsesProvider(
    {
      provider: 'openai',
      api_key: 'test-key',
      model: 'gpt-5-codex',
      wire_api: 'responses',
    },
    PRESET,
  )
}

async function* textDeltaStream() {
  yield { type: 'response.output_text.delta', delta: 'Hello' }
  yield { type: 'response.output_text.delta', delta: ', ' }
  yield { type: 'response.output_text.delta', delta: 'world' }
}

async function* toolCallStream() {
  yield {
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'function_call',
      call_id: 'call_abc',
      name: 'list_files',
      arguments: '',
    },
  }
  yield {
    type: 'response.function_call_arguments.delta',
    output_index: 0,
    delta: '{"path":',
  }
  yield {
    type: 'response.function_call_arguments.delta',
    output_index: 0,
    delta: '"/tmp"}',
  }
}

describe('OpenAIResponsesProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  describe('文本流', () => {
    it('将 output_text.delta 转换为 TextChunk', async () => {
      mockCreate.mockResolvedValueOnce(textDeltaStream())
      const p = makeProvider()
      const texts: string[] = []
      for await (const c of p.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
        if (c.type === 'text') texts.push(c.content)
      }
      expect(texts).toEqual(['Hello', ', ', 'world'])
    })

    it('忽略空 delta', async () => {
      async function* s() {
        yield { type: 'response.output_text.delta', delta: '' }
        yield { type: 'response.output_text.delta', delta: 'ok' }
      }
      mockCreate.mockResolvedValueOnce(s())
      const p = makeProvider()
      const texts: string[] = []
      for await (const c of p.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
        if (c.type === 'text') texts.push(c.content)
      }
      expect(texts).toEqual(['ok'])
    })
  })

  describe('工具调用', () => {
    it('output_item.added 触发初始 tool_call，随后 delta 拼接参数', async () => {
      mockCreate.mockResolvedValueOnce(toolCallStream())
      const p = makeProvider()
      const tcs: Array<{ index: number; id?: string; name?: string; argumentsDelta: string }> = []
      for await (const c of p.chat({ messages: [{ role: 'user', content: 'list' }] })) {
        if (c.type === 'tool_call') tcs.push(c)
      }
      expect(tcs).toHaveLength(3)
      expect(tcs[0]).toMatchObject({ index: 0, id: 'call_abc', name: 'list_files', argumentsDelta: '' })
      expect(tcs[1]).toMatchObject({ index: 0, id: 'call_abc', argumentsDelta: '{"path":' })
      expect(tcs[2]).toMatchObject({ index: 0, id: 'call_abc', argumentsDelta: '"/tmp"}' })
      const full = tcs.map(t => t.argumentsDelta).join('')
      expect(full).toBe('{"path":"/tmp"}')
    })

    it('忽略非 function_call 类型的 output_item.added', async () => {
      async function* s() {
        yield {
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'message', id: 'm_1', content: [], role: 'assistant', status: 'in_progress' },
        }
        yield { type: 'response.output_text.delta', delta: 'ok' }
      }
      mockCreate.mockResolvedValueOnce(s())
      const p = makeProvider()
      const out: Array<{ type: string }> = []
      for await (const c of p.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
        out.push(c)
      }
      expect(out.filter(c => c.type === 'tool_call')).toHaveLength(0)
      expect(out.filter(c => c.type === 'text')).toHaveLength(1)
    })
  })

  describe('消息转换：ChatMessage → input 条目', () => {
    it('system/user/assistant 纯文本 → message 条目', async () => {
      mockCreate.mockResolvedValueOnce(textDeltaStream())
      const p = makeProvider()
      for await (const _ of p.chat({
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      })) {}
      const call = mockCreate.mock.calls[0][0]
      expect(call.input).toEqual([
        { role: 'system', content: 'sys', type: 'message' },
        { role: 'user', content: 'hi', type: 'message' },
        { role: 'assistant', content: 'hello', type: 'message' },
      ])
    })

    it('assistant+tool_calls → message + function_call 条目', async () => {
      mockCreate.mockResolvedValueOnce(textDeltaStream())
      const p = makeProvider()
      for await (const _ of p.chat({
        messages: [
          {
            role: 'assistant',
            content: 'let me check',
            tool_calls: [
              { id: 'call_1', function: { name: 'list_files', arguments: '{"path":"/"}' } },
            ],
          },
        ],
      })) {}
      const call = mockCreate.mock.calls[0][0]
      expect(call.input).toEqual([
        { role: 'assistant', content: 'let me check', type: 'message' },
        { type: 'function_call', call_id: 'call_1', name: 'list_files', arguments: '{"path":"/"}' },
      ])
    })

    it('assistant+tool_calls 且 content 为 null → 仅 function_call', async () => {
      mockCreate.mockResolvedValueOnce(textDeltaStream())
      const p = makeProvider()
      for await (const _ of p.chat({
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'call_1', function: { name: 'list_files', arguments: '{}' } },
            ],
          },
        ],
      })) {}
      const call = mockCreate.mock.calls[0][0]
      expect(call.input).toEqual([
        { type: 'function_call', call_id: 'call_1', name: 'list_files', arguments: '{}' },
      ])
    })

    it('tool 消息 → function_call_output', async () => {
      mockCreate.mockResolvedValueOnce(textDeltaStream())
      const p = makeProvider()
      for await (const _ of p.chat({
        messages: [
          { role: 'tool', tool_call_id: 'call_1', content: '{"files":["a"]}' },
        ],
      })) {}
      const call = mockCreate.mock.calls[0][0]
      expect(call.input).toEqual([
        { type: 'function_call_output', call_id: 'call_1', output: '{"files":["a"]}' },
      ])
    })
  })

  describe('API 参数', () => {
    it('默认 store=false 且 stream=true', async () => {
      mockCreate.mockResolvedValueOnce(textDeltaStream())
      const p = makeProvider()
      for await (const _ of p.chat({ messages: [{ role: 'user', content: 'hi' }] })) {}
      const call = mockCreate.mock.calls[0][0]
      expect(call.store).toBe(false)
      expect(call.stream).toBe(true)
    })

    it('工具定义被转换为 FunctionTool', async () => {
      mockCreate.mockResolvedValueOnce(textDeltaStream())
      const p = makeProvider()
      for await (const _ of p.chat({
        messages: [{ role: 'user', content: 'hi' }],
        tools: [
          { name: 'list_files', description: 'list files', parameters: { type: 'object' } },
        ],
      })) {}
      const call = mockCreate.mock.calls[0][0]
      expect(call.tools).toEqual([
        {
          type: 'function',
          name: 'list_files',
          description: 'list files',
          parameters: { type: 'object' },
          strict: false,
        },
      ])
    })
  })

  describe('错误处理', () => {
    it('401 错误附带配置文件路径提示', async () => {
      const { APIError } = await import('openai')
      mockCreate.mockRejectedValueOnce(new APIError(401, { message: 'unauthorized' }, 'unauthorized', {}))
      const p = makeProvider()
      await expect(async () => {
        for await (const _ of p.chat({ messages: [{ role: 'user', content: 'hi' }] })) {}
      }).rejects.toThrow('~/.riverx/config.json')
    })

    it('连接失败抛出包含重试建议的错误', async () => {
      const { APIConnectionError } = await import('openai')
      mockCreate.mockRejectedValueOnce(new APIConnectionError({ message: 'refused' }))
      const p = makeProvider()
      await expect(async () => {
        for await (const _ of p.chat({ messages: [{ role: 'user', content: 'hi' }] })) {}
      }).rejects.toThrow('可稍后重试')
    })
  })
})
