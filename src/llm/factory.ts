import type { RiverXConfig } from '../config/config.js'
import type { LLMProvider } from './provider.js'
import { OpenAICompatibleProvider } from './openai-compatible.js'
import { PROVIDER_PRESETS, getPreset, type ProviderPreset } from './presets.js'

type LLMConfig = RiverXConfig['llm']

/**
 * 根据 config.provider 创建对应的 LLMProvider。
 * openai / deepseek / kimi / qwen 均走 OpenAI 兼容协议，共用 OpenAICompatibleProvider。
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

  return new OpenAICompatibleProvider(config, preset)
}

export function resolvePreset(config: LLMConfig): ProviderPreset | undefined {
  return getPreset(config.provider)
}
