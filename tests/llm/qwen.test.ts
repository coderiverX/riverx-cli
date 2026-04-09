import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('openai', async importOriginal => {
  const actual = await importOriginal<typeof import('openai')>()
  return {
    default: vi.fn(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
    APIError: actual.APIError,
    APIConnectionError: actual.APIConnectionError,
  }
})

import { QwenProvider } from '../../src/llm/qwen.js'

const TEST_CONFIG = {
  provider: 'qwen',
  model: 'qwen-plus',
  base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  api_key: 'test-key',
}

async function* makeTextStream(chunks: string[]) {
  for (const text of chunks) {
    yield { choices: [{ delta: { content: text } }] }
  }
}

async function* makeToolCallStream() {
  yield {
    choices: [{
      delta: {
        tool_calls: [{ index: 0, id: 'tc_1', function: { name: 'list_files', arguments: '' } }],
      },
    }],
  }
  yield {
    choices: [{
      delta: {
        tool_calls: [{ index: 0, function: { arguments: '{"path":' } }],
      },
    }],
  }
  yield {
    choices: [{
      delta: {
        tool_calls: [{ index: 0, function: { arguments: '"/tmp"}' } }],
      },
    }],
  }
}

describe('QwenProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  describe('文本流式输出', () => {
    it('将 delta.content 转换为 TextChunk 序列', async () => {
      mockCreate.mockResolvedValueOnce(makeTextStream(['Hello', ', ', 'world']))

      const provider = new QwenProvider(TEST_CONFIG)
      const chunks: string[] = []

      for await (const chunk of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
        if (chunk.type === 'text') chunks.push(chunk.content)
      }

      expect(chunks).toEqual(['Hello', ', ', 'world'])
    })

    it('跳过空 delta 和无 choices 的 chunk', async () => {
      async function* mixedStream() {
        yield { choices: [{ delta: {} }] }
        yield { choices: [{ delta: { content: 'ok' } }] }
        yield { choices: [] }
      }
      mockCreate.mockResolvedValueOnce(mixedStream())

      const provider = new QwenProvider(TEST_CONFIG)
      const chunks: string[] = []

      for await (const chunk of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
        if (chunk.type === 'text') chunks.push(chunk.content)
      }

      expect(chunks).toEqual(['ok'])
    })
  })

  describe('工具调用增量', () => {
    it('按 index 分发 tool_call chunk，增量可拼接为完整参数', async () => {
      mockCreate.mockResolvedValueOnce(makeToolCallStream())

      const provider = new QwenProvider(TEST_CONFIG)
      const tcChunks: Array<{ index: number; id?: string; name?: string; argumentsDelta: string }> = []

      for await (const chunk of provider.chat({ messages: [{ role: 'user', content: 'list' }] })) {
        if (chunk.type === 'tool_call') tcChunks.push(chunk)
      }

      expect(tcChunks).toHaveLength(3)
      expect(tcChunks[0]).toMatchObject({ index: 0, id: 'tc_1', name: 'list_files' })
      expect(tcChunks[1]).toMatchObject({ index: 0, argumentsDelta: '{"path":' })

      const fullArgs = tcChunks.map(c => c.argumentsDelta).join('')
      expect(fullArgs).toBe('{"path":"/tmp"}')
    })
  })

  describe('API 错误处理', () => {
    it.each([
      [401, 'API Key 无效或已过期'],
      [429, '请求过于频繁'],
      [500, '服务端返回错误'],
    ])('status %i 应抛出包含中文上下文的 Error', async (status, expectedFragment) => {
      const { APIError } = await import('openai')
      mockCreate.mockRejectedValueOnce(
        new APIError(status, { message: 'api error' }, 'api error', {}),
      )

      const provider = new QwenProvider(TEST_CONFIG)
      await expect(async () => {
        for await (const _ of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
          // drain
        }
      }).rejects.toThrow(expectedFragment)
    })

    it('迭代中途的错误也被转换为中文上下文 Error', async () => {
      const { APIError } = await import('openai')
      async function* failMidStream() {
        yield { choices: [{ delta: { content: 'start' } }] }
        throw new APIError(503, {}, '服务不可用', {})
      }
      mockCreate.mockResolvedValueOnce(failMidStream())

      const provider = new QwenProvider(TEST_CONFIG)
      const collected: string[] = []

      await expect(async () => {
        for await (const chunk of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
          if (chunk.type === 'text') collected.push(chunk.content)
        }
      }).rejects.toThrow('服务端返回错误')

      expect(collected).toEqual(['start'])
    })
  })
})
