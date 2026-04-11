import { describe, it, expect } from 'vitest'
import { session } from '../../src/tools/session.js'
import type { ToolContext, SessionHandle } from '../../src/tool.js'

function makeCtx(handle?: SessionHandle): ToolContext {
  return {
    cwd: '/tmp',
    platform: { os: 'linux', osVersion: '5.15', username: 'test', cwd: '/tmp' },
    config: {} as never,
    session: handle,
  }
}

function makeHandle(overrides?: Partial<SessionHandle>): SessionHandle {
  const startedAt = new Date()
  let count = 5
  return {
    getMessageCount: () => count,
    getCwd: () => '/workspace',
    getStartedAt: () => startedAt,
    clear: () => { count = 0 },
    ...overrides,
  }
}

describe('session', () => {
  it('action=info 返回会话信息', async () => {
    const handle = makeHandle()
    const result = await session.execute({ action: 'info' }, makeCtx(handle))
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    expect(data.message_count).toBe(5)
    expect(data.cwd).toBe('/workspace')
    expect(data.elapsed_ms).toBeGreaterThanOrEqual(0)
    expect(data.started_at).toMatch(/^\d{4}-/)
  })

  it('action=clear 清空会话', async () => {
    const handle = makeHandle()
    const result = await session.execute({ action: 'clear' }, makeCtx(handle))
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    expect(data.cleared).toBe(true)
    expect(handle.getMessageCount()).toBe(0)
  })

  it('无 session context 时返回错误', async () => {
    const result = await session.execute({ action: 'info' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('不可用')
  })
})
