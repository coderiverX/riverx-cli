import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { readFile } from '../../src/tools/read-file.js'
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
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'riverx-read-'))
})

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe('read_file', () => {
  it('读取普通文本文件，带行号', async () => {
    await fsp.writeFile(path.join(tmpDir, 'a.txt'), 'hello\nworld\n')
    const result = await readFile.execute({ path: 'a.txt' }, makeCtx())
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    expect(data.total_lines).toBe(2)
    expect(data.lines).toContain('     1\thello')
    expect(data.lines).toContain('     2\tworld')
    expect(data.truncated).toBe(false)
  })

  it('支持 offset + limit 分页', async () => {
    const content = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n')
    await fsp.writeFile(path.join(tmpDir, 'b.txt'), content)
    const result = await readFile.execute({ path: 'b.txt', offset: 3, limit: 3 }, makeCtx())
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    expect(data.lines).toContain('     3\tline3')
    expect(data.lines).toContain('     5\tline5')
    expect(data.lines).not.toContain('line6')
  })

  it('文件不存在时返回错误', async () => {
    const result = await readFile.execute({ path: 'nonexistent.txt' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('不存在')
  })

  it('目录路径返回错误', async () => {
    const result = await readFile.execute({ path: '.' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('目录')
  })

  it('二进制扩展名拒绝读取', async () => {
    await fsp.writeFile(path.join(tmpDir, 'img.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const result = await readFile.execute({ path: 'img.png' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('二进制')
  })

  it('含 null byte 的文件拒绝读取', async () => {
    await fsp.writeFile(path.join(tmpDir, 'bin.dat'), Buffer.from([0x48, 0x00, 0x49]))
    const result = await readFile.execute({ path: 'bin.dat' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('二进制')
  })

  it('空文件正常返回', async () => {
    await fsp.writeFile(path.join(tmpDir, 'empty.txt'), '')
    const result = await readFile.execute({ path: 'empty.txt' }, makeCtx())
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    expect(data.total_lines).toBe(0)
    expect(data.lines).toBe('')
  })
})
