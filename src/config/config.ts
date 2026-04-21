import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getPreset } from '../llm/presets.js'

export interface RiverXConfig {
  llm: {
    provider: string
    /** 可选；未设置时回退到对应 provider 预设的 default_model */
    model?: string
    /** 可选；未设置时回退到对应 provider 预设的 base_url */
    base_url?: string
    api_key: string
  }
  security: {
    workspace_root: string
    auto_confirm_safe_commands: boolean
    confirm_medium_risk: boolean
    auto_confirm: boolean
  }
  shell: {
    default: string
    timeout_ms: number
  }
}

const DEFAULT_CONFIG: RiverXConfig = {
  llm: {
    provider: 'qwen',
    model: 'qwen-plus',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    api_key: '',
  },
  security: {
    workspace_root: 'cwd',
    auto_confirm_safe_commands: true,
    confirm_medium_risk: false,
    auto_confirm: false,
  },
  shell: {
    default: 'auto',
    timeout_ms: 30000,
  },
}

const CONFIG_DIR = path.join(os.homedir(), '.riverx')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function applyEnvOverrides(config: RiverXConfig): RiverXConfig {
  // 通用覆盖：RIVERX_* 永远最高优先级
  if (process.env.RIVERX_API_KEY) config.llm.api_key = process.env.RIVERX_API_KEY
  if (process.env.RIVERX_MODEL) config.llm.model = process.env.RIVERX_MODEL
  if (process.env.RIVERX_BASE_URL) config.llm.base_url = process.env.RIVERX_BASE_URL

  // api_key 仍为空时，按 provider 对应的环境变量回退
  if (!config.llm.api_key) {
    const preset = getPreset(config.llm.provider)
    if (preset) {
      const envKey = process.env[preset.api_key_env]
      if (envKey) config.llm.api_key = envKey
    }
  }

  return config
}

export function saveConfig(config: RiverXConfig): void {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

export function loadConfig(): RiverXConfig {
  ensureConfigDir()

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
    return applyEnvOverrides(structuredClone(DEFAULT_CONFIG))
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<RiverXConfig>
    const merged: RiverXConfig = {
      llm: { ...DEFAULT_CONFIG.llm, ...parsed.llm },
      security: { ...DEFAULT_CONFIG.security, ...parsed.security },
      shell: { ...DEFAULT_CONFIG.shell, ...parsed.shell },
    }
    return applyEnvOverrides(merged)
  } catch (err) {
    throw new Error(
      `配置文件加载失败：${CONFIG_PATH}\n` +
      `原因：${err instanceof Error ? err.message : String(err)}\n` +
      `请检查文件格式是否为有效 JSON。`,
    )
  }
}
