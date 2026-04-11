import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { grep } from '../../src/tools/grep.js'
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
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'riverx-grep-'))
  await fsp.writeFile(path.join(tmpDir, 'a.ts'), 'export function hello() {}\nexport function world() {}')
  await fsp.writeFile(path.join(tmpDir, 'b.js'), 'const foo = 1\nconst bar = 2')
  await fsp.mkdir(path.join(tmpDir, 'sub'))
  await fsp.writeFile(path.join(tmpDir, 'sub', 'c.ts'), 'import { hello } from "../a"')
})

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe('grep', () => {
  it('递归搜索匹配内容', async () => {
    const result = await grep.execute({ pattern: 'hello' }, makeCtx())
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    expect(data.total).toBeGreaterThanOrEqual(2)
    const files = data.matches.map((m: { file: string }) => m.file)
    expect(files).toContain('a.ts')
    expect(files).toContain(path.join('sub', 'c.ts'))
  })

  it('返回正确的行号', async () => {
    const result = await grep.execute({ pattern: 'world' }, makeCtx())
    const data = JSON.parse(result.output)
    const match = data.matches.find((m: { file: string; line: number }) => m.file === 'a.ts')
    expect(match?.line).toBe(2)
  })

  it('支持 include glob 过滤', async () => {
    const result = await grep.execute({ pattern: 'const', include: '*.js' }, makeCtx())
    const data = JSON.parse(result.output)
    const files = data.matches.map((m: { file: string }) => m.file)
    expect(files).toContain('b.js')
    expect(files.every((f: string) => f.endsWith('.js'))).toBe(true)
  })

  it('支持大小写不敏感搜索', async () => {
    const result = await grep.execute({ pattern: 'HELLO', ignore_case: true }, makeCtx())
    const data = JSON.parse(result.output)
    expect(data.total).toBeGreaterThanOrEqual(1)
  })

  it('无效正则表达式返回错误', async () => {
    const result = await grep.execute({ pattern: '[invalid' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('无效的正则表达式')
  })

  it('路径不存在返回错误', async () => {
    const result = await grep.execute({ pattern: 'x', path: 'nonexistent' }, makeCtx())
    expect(result.success).toBe(false)
    expect(result.output).toContain('不存在')
  })

  it('排除 .git 目录', async () => {
    await fsp.mkdir(path.join(tmpDir, '.git'))
    await fsp.writeFile(path.join(tmpDir, '.git', 'HEAD'), 'ref: hello')
    const result = await grep.execute({ pattern: 'hello' }, makeCtx())
    const data = JSON.parse(result.output)
    const files = data.matches.map((m: { file: string }) => m.file)
    expect(files.every((f: string) => !f.startsWith('.git'))).toBe(true)
  })
})
