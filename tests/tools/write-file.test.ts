import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { writeFile } from '../../src/tools/write-file.js'
import type { ToolContext } from '../../src/tool.js'

let tmpDir: string

function makeCtx(): ToolContext {
  return {
    cwd: tmpDir,
    platform: { os: 'linux', osVersion: '5.15', username: 'test', cwd: tmpDir },
    config: {} as never,
  }
}

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'riverx-write-'))
})

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe('write_file', () => {
  it('写入新文件并返回路径和字节数', async () => {
    const result = await writeFile.execute({ path: 'hello.txt', content: 'hello' }, makeCtx())
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    expect(data.bytes).toBe(5)
    const actual = await fsp.readFile(path.join(tmpDir, 'hello.txt'), 'utf-8')
    expect(actual).toBe('hello')
  })

  it('自动创建父目录', async () => {
    const result = await writeFile.execute({ path: 'a/b/c.txt', content: 'nested' }, makeCtx())
    expect(result.success).toBe(true)
    const actual = await fsp.readFile(path.join(tmpDir, 'a', 'b', 'c.txt'), 'utf-8')
    expect(actual).toBe('nested')
  })

  it('覆盖已存在文件', async () => {
    await fsp.writeFile(path.join(tmpDir, 'existing.txt'), 'old')
    const result = await writeFile.execute({ path: 'existing.txt', content: 'new' }, makeCtx())
    expect(result.success).toBe(true)
    const actual = await fsp.readFile(path.join(tmpDir, 'existing.txt'), 'utf-8')
    expect(actual).toBe('new')
  })

  it('禁止写入系统路径', async () => {
    const result = await writeFile.execute({ path: '/etc/passwd', content: 'hacked' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('禁止')
  })

  it('禁止写入根目录', async () => {
    const result = await writeFile.execute({ path: '/malicious.txt', content: 'x' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('禁止')
  })

  it('文件权限不足（EACCES）时返回明确提示', async () => {
    vi.spyOn(fsp, 'writeFile').mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied, open '/protected.txt'"), { code: 'EACCES' })
    )
    const result = await writeFile.execute({ path: 'protected.txt', content: 'x' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('权限不足')
  })

  it('文件被锁定（EPERM）时返回明确提示', async () => {
    vi.spyOn(fsp, 'writeFile').mockRejectedValueOnce(
      Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
    )
    const result = await writeFile.execute({ path: 'locked.txt', content: 'x' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('权限不足')
  })
})
