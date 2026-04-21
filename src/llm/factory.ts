import type { RiverXConfig } from '../config/config.js'
import type { LLMProvider } from './provider.js'
import { OpenAICompatibleProvider } from './openai-compatible.js'
import { OpenAIResponsesProvider } from './openai-responses.js'
import { PROVIDER_PRESETS, getPreset, type ProviderPreset } from './presets.js'

type LLMConfig = RiverXConfig['llm']

/**
 * 解析 wire_api：config.wire_api > preset.wire_api > 'chat'
 */
function resolveWireApi(config: LLMConfig, preset: ProviderPreset): 'chat' | 'responses' {
  return config.wire_api ?? preset.wire_api ?? 'chat'
}

/**
 * 根据 config.provider + wire_api 创建对应的 LLMProvider。
 * - wire_api = 'chat'      → OpenAICompatibleProvider（/v1/chat/completions）
 * - wire_api = 'responses' → OpenAIResponsesProvider（/v1/responses）
 * base_url 与 model 若未配置则回退到预设值。
 */
export function createProvider(config: LLMConfig): LLMProvider {
  const preset = getPreset(config.provider)
  if (!preset) {
    const available = Object.keys(PROVIDER_PRESETS).join(', ')
    throw new Error(
      `不支持的 LLM provider: "${config.provider}"。\n` +
      `可用的 provider：${available}\n` +
      `请检查 ~/.riverx/config.json 中的 llm.provider 字段。`,
    )
  }

  const wireApi = resolveWireApi(config, preset)
  if (wireApi === 'responses') {
    return new OpenAIResponsesProvider(config, preset)
  }
  return new OpenAICompatibleProvider(config, preset)
}

export function resolvePreset(config: LLMConfig): ProviderPreset | undefined {
  return getPreset(config.provider)
}
