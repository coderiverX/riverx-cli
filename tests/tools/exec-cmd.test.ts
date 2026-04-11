import { describe, expect, it } from 'vitest'
import { execCmd } from '../../src/tools/exec-cmd.js'
import type { ToolContext } from '../../src/tool.js'

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    cwd: process.cwd(),
    platform: { os: 'darwin', osVersion: '24.0.0', username: 'test', cwd: process.cwd() },
    config: {
      llm: { provider: 'qwen', model: 'qwen-plus', base_url: '', api_key: '' },
      security: { workspace_root: 'cwd', auto_confirm_safe_commands: true, confirm_medium_risk: false },
      shell: { default: 'auto', timeout_ms: 5000 },
    },
    ...overrides,
  }
}

describe('exec_cmd 工具', () => {
  it('执行 echo hello，返回 exit_code=0 且 stdout 含 hello', async () => {
    const result = await execCmd.execute({ command: 'echo hello' }, makeCtx())
    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.output) as { exit_code: number; stdout: string; stderr: string }
    expect(parsed.exit_code).toBe(0)
    expect(parsed.stdout).toContain('hello')
  })

  it('超时命令返回 timeout 错误', async () => {
    const result = await execCmd.execute(
      { command: 'sleep 5', timeout_ms: 100 },
      makeCtx(),
    )
    expect(result.success).toBe(false)
    const parsed = JSON.parse(result.output) as { error: string }
    expect(parsed.error).toMatch(/timeout/)
  }, 3000)

  it('非零退出码时 success=false，exit_code 正确', async () => {
    const result = await execCmd.execute({ command: 'exit 42' }, makeCtx())
    expect(result.success).toBe(false)
    const parsed = JSON.parse(result.output) as { exit_code: number }
    expect(parsed.exit_code).toBe(42)
  })

  it('forbidden 命令立即拒绝，不实际执行', async () => {
    const result = await execCmd.execute({ command: 'rm -rf /' }, makeCtx())
    expect(result.success).toBe(false)
    const parsed = JSON.parse(result.output) as { error: string }
    expect(parsed.error).toMatch(/forbidden/)
  })
})
