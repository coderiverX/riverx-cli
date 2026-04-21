import { describe, expect, it } from 'vitest'
import {
  PROVIDER_PRESETS,
  getPreset,
  isProviderName,
  type ProviderName,
} from '../../src/llm/presets.js'

const EXPECTED: ProviderName[] = ['openai', 'deepseek', 'kimi', 'qwen']

describe('PROVIDER_PRESETS', () => {
  it.each(EXPECTED)('%s 预设字段齐备', name => {
    const preset = PROVIDER_PRESETS[name]
    expect(preset.base_url).toMatch(/^https:\/\//)
    expect(preset.default_model).toBeTruthy()
    expect(preset.display_name).toBeTruthy()
    expect(preset.api_key_env).toMatch(/^[A-Z][A-Z0-9_]*$/)
  })

  it('覆盖全部 4 个支持的 provider', () => {
    expect(Object.keys(PROVIDER_PRESETS).sort()).toEqual(EXPECTED.slice().sort())
  })
})

describe('isProviderName / getPreset', () => {
  it.each(EXPECTED)('isProviderName("%s") 为 true', name => {
    expect(isProviderName(name)).toBe(true)
  })

  it('未知 provider 返回 false', () => {
    expect(isProviderName('gemini')).toBe(false)
    expect(isProviderName('')).toBe(false)
  })

  it('getPreset 未知返回 undefined', () => {
    expect(getPreset('gemini')).toBeUndefined()
  })

  it('getPreset 已知返回预设对象', () => {
    expect(getPreset('openai')?.display_name).toBe('OpenAI')
  })
})
