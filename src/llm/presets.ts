export type ProviderName = 'openai' | 'deepseek' | 'kimi' | 'qwen'

export interface ProviderPreset {
  /** 默认 API 根地址 */
  base_url: string
  /** 默认使用的模型名 */
  default_model: string
  /** 错误消息与向导中显示的厂商名 */
  display_name: string
  /** 供应商约定的 API Key 环境变量名（RIVERX_API_KEY 未设置时回退） */
  api_key_env: string
  /** 默认使用的线上协议（未设置则为 'chat'） */
  wire_api?: 'chat' | 'responses'
}

export const PROVIDER_PRESETS: Record<ProviderName, ProviderPreset> = {
  openai: {
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o-mini',
    display_name: 'OpenAI',
    api_key_env: 'OPENAI_API_KEY',
  },
  deepseek: {
    base_url: 'https://api.deepseek.com',
    default_model: 'deepseek-chat',
    display_name: 'DeepSeek',
    api_key_env: 'DEEPSEEK_API_KEY',
  },
  kimi: {
    base_url: 'https://api.moonshot.cn/v1',
    default_model: 'moonshot-v1-8k',
    display_name: 'Kimi',
    api_key_env: 'MOONSHOT_API_KEY',
  },
  qwen: {
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model: 'qwen-plus',
    display_name: 'Qwen',
    api_key_env: 'DASHSCOPE_API_KEY',
  },
}

export function isProviderName(name: string): name is ProviderName {
  return name in PROVIDER_PRESETS
}

export function getPreset(name: string): ProviderPreset | undefined {
  return isProviderName(name) ? PROVIDER_PRESETS[name] : undefined
}
