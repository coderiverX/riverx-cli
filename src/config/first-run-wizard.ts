import path from 'node:path'
import os from 'node:os'
import chalk from 'chalk'
import { select, input, password } from '@inquirer/prompts'

import { saveConfig, type RiverXConfig } from './config.js'
import { PROVIDER_PRESETS, isProviderName, type ProviderName } from '../llm/presets.js'

const PROVIDER_ORDER: ProviderName[] = ['openai', 'deepseek', 'kimi', 'qwen']

/**
 * 交互式首次运行向导：通过上下键选择 + 输入完成 provider / base_url / model / API Key / wire_api 配置。
 */
export async function runFirstRunWizard(config: RiverXConfig): Promise<RiverXConfig> {
  const configPath = path.join(os.homedir(), '.riverx', 'config.json')

  process.stdout.write(
    '\n' + chalk.bold('riverx — 首次运行配置向导') + '\n' +
    '─────────────────────────\n' +
    `配置文件将写入：${configPath}\n` +
    '使用 ↑/↓ 选择，回车确认；Ctrl+C 退出。\n\n',
  )

  const defaultProvider: ProviderName = isProviderName(config.llm.provider)
    ? config.llm.provider
    : 'qwen'

  const provider = await select<ProviderName>({
    message: '选择 LLM 供应商',
    choices: PROVIDER_ORDER.map(name => ({
      name: PROVIDER_PRESETS[name].display_name,
      value: name,
    })),
    default: defaultProvider,
  })

  const preset = PROVIDER_PRESETS[provider]

  const baseUrl = await input({
    message: `Base URL（可填第三方兼容端点）`,
    default: preset.base_url,
  })

  const model = await input({
    message: '模型名',
    default: preset.default_model,
  })

  const apiKey = await password({
    message: `${preset.display_name} API Key`,
    mask: '*',
    validate: v => (v.trim().length > 0 ? true : 'API Key 不能为空'),
  })

  let wireApi: 'chat' | 'responses' | undefined
  if (provider === 'openai') {
    wireApi = await select<'chat' | 'responses'>({
      message: 'wire_api 协议（gpt-5-codex 等需要用 responses）',
      choices: [
        { name: 'chat — /v1/chat/completions（默认）', value: 'chat' },
        { name: 'responses — /v1/responses', value: 'responses' },
      ],
      default: 'chat',
    })
  }

  config.llm.provider = provider
  config.llm.base_url = baseUrl.trim() || preset.base_url
  config.llm.model = model.trim() || preset.default_model
  config.llm.api_key = apiKey.trim()
  if (wireApi && wireApi !== 'chat') {
    config.llm.wire_api = wireApi
  } else {
    delete config.llm.wire_api
  }

  saveConfig(config)

  process.stdout.write(chalk.green('\n配置已保存：') + configPath + '\n\n')
  return config
}
