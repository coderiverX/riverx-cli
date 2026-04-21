import { APIConnectionError, APIError } from 'openai'

/**
 * 将 OpenAI SDK 的异常转换为带中文上下文的 Error。
 * displayName 用于在消息中指明具体的 provider（如 OpenAI / Kimi / DeepSeek / Qwen）。
 */
export function convertOpenAIError(err: unknown, displayName: string): Error {
  // APIConnectionError 是 APIError 的子类，需先检查
  if (err instanceof APIConnectionError) {
    return new Error(
      `${displayName} API 连接失败：无法连接到服务端。\n` +
      `请检查网络连接和 base_url 配置，可稍后重试。\n` +
      `若持续失败，请确认防火墙未拦截出站 HTTPS 请求。\n` +
      `原始错误：${err.message}`,
    )
  }
  if (err instanceof APIError) {
    const status = err.status
    if (status === 401) {
      return new Error(
        `${displayName} API 认证失败（401）：API Key 无效或已过期。\n` +
        `请检查 ~/.riverx/config.json 中的 api_key，或通过环境变量 RIVERX_API_KEY 设置。\n` +
        `原始错误：${err.message}`,
      )
    }
    if (status === 429) {
      return new Error(
        `${displayName} API 请求频率超限（429）：当前请求过于频繁。\n` +
        `请稍后重试，或检查账户配额。\n` +
        `原始错误：${err.message}`,
      )
    }
    if (status !== undefined && status >= 500) {
      return new Error(
        `${displayName} API 服务异常（${status}）：服务端返回错误。\n` +
        `请稍后重试。如持续出现请联系 ${displayName} 支持。\n` +
        `原始错误：${err.message}`,
      )
    }
    return new Error(
      `${displayName} API 错误（${status ?? '未知状态码'}）：${err.message}`,
    )
  }
  if (err instanceof Error) return err
  return new Error(String(err))
}
