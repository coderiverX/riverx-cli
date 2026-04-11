import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ToolContext } from '../../src/tool.js'

function makeCtx(): ToolContext {
  return {
    cwd: '/tmp',
    platform: { os: 'linux', osVersion: '5.15', username: 'test', cwd: '/tmp' },
    config: {} as never,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('confirm', () => {
  it('headless 模式（非 TTY）自动返回 confirmed: false', async () => {
    vi.stubGlobal('process', { ...process, stdin: { ...process.stdin, isTTY: false } })
    const { confirm } = await import('../../src/tools/confirm.js')
    const result = await confirm.execute({ message: 'proceed?' }, makeCtx())
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    expect(data.confirmed).toBe(false)
    expect(data.reason).toBe('headless mode')
  })
})
