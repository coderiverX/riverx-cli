import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { listFiles } from '../../src/tools/list-files.js'
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
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'riverx-ls-'))
  await fsp.writeFile(path.join(tmpDir, 'a.ts'), 'hello')
  await fsp.writeFile(path.join(tmpDir, 'b.js'), 'world')
  await fsp.mkdir(path.join(tmpDir, 'subdir'))
})

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe('list_files', () => {
  it('默认列出 cwd 内容', async () => {
    const result = await listFiles.execute({}, makeCtx())
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    const names = data.entries.map((e: { name: string }) => e.name)
    expect(names).toContain('a.ts')
    expect(names).toContain('b.js')
    expect(names).toContain('subdir')
  })

  it('返回正确的类型', async () => {
    const result = await listFiles.execute({}, makeCtx())
    const data = JSON.parse(result.output)
    const subdir = data.entries.find((e: { name: string; type: string }) => e.name === 'subdir')
    expect(subdir?.type).toBe('dir')
    const file = data.entries.find((e: { name: string; type: string }) => e.name === 'a.ts')
    expect(file?.type).toBe('file')
  })

  it('支持 glob 模式过滤', async () => {
    const result = await listFiles.execute({ pattern: '*.ts' }, makeCtx())
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    const names = data.entries.map((e: { name: string }) => e.name)
    expect(names).toContain('a.ts')
    expect(names).not.toContain('b.js')
  })

  it('路径不存在返回错误', async () => {
    const result = await listFiles.execute({ path: 'nonexistent' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('不存在')
  })

  it('文件路径返回错误', async () => {
    const result = await listFiles.execute({ path: 'a.ts' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('不是目录')
  })
})
