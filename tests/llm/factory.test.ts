import { describe, expect, it, vi } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
const { mockOpenAICtor } = vi.hoisted(() => ({ mockOpenAICtor: vi.fn() }))

vi.mock('openai', async importOriginal => {
  const actual = await importOriginal<typeof import('openai')>()
  return {
    default: mockOpenAICtor.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
    APIError: actual.APIError,
    APIConnectionError: actual.APIConnectionError,
  }
})

import { createProvider, resolvePreset } from '../../src/llm/factory.js'
import { OpenAICompatibleProvider } from '../../src/llm/openai-compatible.js'

describe('createProvider', () => {
  it.each([
    ['openai', 'https://api.openai.com/v1'],
    ['deepseek', 'https://api.deepseek.com'],
    ['kimi', 'https://api.moonshot.cn/v1'],
    ['qwen', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
  ] as const)('provider=%s 时使用预设 base_url', (provider, expectedUrl) => {
    mockOpenAICtor.mockClear()
    const p = createProvider({ provider, api_key: 'k' })
    expect(p).toBeInstanceOf(OpenAICompatibleProvider)
    expect(mockOpenAICtor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'k', baseURL: expectedUrl }),
    )
  })

  it('显式 base_url 覆盖预设', () => {
    mockOpenAICtor.mockClear()
    createProvider({
      provider: 'openai',
      api_key: 'k',
      base_url: 'https://proxy.example.com/v1',
    })
    expect(mockOpenAICtor).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://proxy.example.com/v1' }),
    )
  })

  it('未知 provider 抛错并列出可用项', () => {
    expect(() => createProvider({ provider: 'gemini', api_key: 'k' }))
      .toThrow(/不支持的 LLM provider.*gemini/)
    expect(() => createProvider({ provider: 'gemini', api_key: 'k' }))
      .toThrow(/openai.*deepseek.*kimi.*qwen/)
  })
})

describe('resolvePreset', () => {
  it('返回对应 provider 的预设', () => {
    expect(resolvePreset({ provider: 'kimi', api_key: 'k' })?.display_name).toBe('Kimi')
  })

  it('未知 provider 返回 undefined', () => {
    expect(resolvePreset({ provider: 'gemini', api_key: 'k' })).toBeUndefined()
  })
})
