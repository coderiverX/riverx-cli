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

import { OpenAICompatibleProvider } from '../../src/llm/openai-compatible.js'
import { PROVIDER_PRESETS, type ProviderName } from '../../src/llm/presets.js'

function makeProvider(name: ProviderName = 'qwen') {
  const preset = PROVIDER_PRESETS[name]
  return new OpenAICompatibleProvider(
    { provider: name, api_key: 'test-key', model: preset.default_model, base_url: preset.base_url },
    preset,
  )
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

describe('OpenAICompatibleProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  describe('文本流式输出', () => {
    it('将 delta.content 转换为 TextChunk 序列', async () => {
      mockCreate.mockResolvedValueOnce(makeTextStream(['Hello', ', ', 'world']))

      const provider = makeProvider()
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

      const provider = makeProvider()
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

      const provider = makeProvider()
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

  describe('API 错误处理（多 provider 文案）', () => {
    it.each(['openai', 'deepseek', 'kimi', 'qwen'] as const)(
      '%s 的错误消息包含 display_name',
      async name => {
        const { APIError } = await import('openai')
        mockCreate.mockRejectedValueOnce(
          new APIError(500, { message: 'boom' }, 'boom', {}),
        )
        const provider = makeProvider(name)
        const displayName = PROVIDER_PRESETS[name].display_name

        await expect(async () => {
          for await (const _ of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
            // drain
          }
        }).rejects.toThrow(displayName)
      },
    )

    it.each([
      [401, 'API Key 无效或已过期'],
      [429, '请求过于频繁'],
      [500, '服务端返回错误'],
    ])('status %i 应抛出包含中文上下文的 Error', async (status, expectedFragment) => {
      const { APIError } = await import('openai')
      mockCreate.mockRejectedValueOnce(
        new APIError(status, { message: 'api error' }, 'api error', {}),
      )

      const provider = makeProvider()
      await expect(async () => {
        for await (const _ of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
          // drain
        }
      }).rejects.toThrow(expectedFragment)
    })

    it('网络连接失败应抛出包含重试建议的 Error', async () => {
      const { APIConnectionError } = await import('openai')
      mockCreate.mockRejectedValueOnce(
        new APIConnectionError({ message: 'connection refused' })
      )
      const provider = makeProvider()
      await expect(async () => {
        for await (const _ of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {}
      }).rejects.toThrow('可稍后重试')
    })

    it('API Key 无效应提示配置文件路径', async () => {
      const { APIError } = await import('openai')
      mockCreate.mockRejectedValueOnce(
        new APIError(401, { message: 'Unauthorized' }, 'Unauthorized', {})
      )
      const provider = makeProvider()
      await expect(async () => {
        for await (const _ of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {}
      }).rejects.toThrow('~/.riverx/config.json')
    })

    it('迭代中途的错误也被转换为中文上下文 Error', async () => {
      const { APIError } = await import('openai')
      async function* failMidStream() {
        yield { choices: [{ delta: { content: 'start' } }] }
        throw new APIError(503, {}, '服务不可用', {})
      }
      mockCreate.mockResolvedValueOnce(failMidStream())

      const provider = makeProvider()
      const collected: string[] = []

      await expect(async () => {
        for await (const chunk of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {
          if (chunk.type === 'text') collected.push(chunk.content)
        }
      }).rejects.toThrow('服务端返回错误')

      expect(collected).toEqual(['start'])
    })
  })

  describe('base_url / model 回退到预设', () => {
    it('config.base_url 未设置时使用预设', async () => {
      mockCreate.mockResolvedValueOnce(makeTextStream(['ok']))
      const preset = PROVIDER_PRESETS.openai
      const provider = new OpenAICompatibleProvider(
        { provider: 'openai', api_key: 'k' },
        preset,
      )
      for await (const _ of provider.chat({ messages: [{ role: 'user', content: 'hi' }] })) {}
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: preset.default_model }),
      )
    })

    it('params.model > config.model > preset.default_model', async () => {
      mockCreate.mockResolvedValueOnce(makeTextStream(['ok']))
      const preset = PROVIDER_PRESETS.openai
      const provider = new OpenAICompatibleProvider(
        { provider: 'openai', api_key: 'k', model: 'from-config' },
        preset,
      )
      for await (const _ of provider.chat({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'from-params',
      })) {}
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'from-params' }),
      )
    })
  })
})
