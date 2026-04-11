import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { patchFile } from '../../src/tools/patch-file.js'
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
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'riverx-patch-'))
})

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe('patch_file', () => {
  it('替换唯一匹配的字符串', async () => {
    await fsp.writeFile(path.join(tmpDir, 'f.txt'), 'hello world')
    const result = await patchFile.execute(
      { path: 'f.txt', old_string: 'world', new_string: 'RiverX' },
      makeCtx(),
    )
    expect(result.success).toBe(true)
    const actual = await fsp.readFile(path.join(tmpDir, 'f.txt'), 'utf-8')
    expect(actual).toBe('hello RiverX')
  })

  it('返回修改的行号', async () => {
    await fsp.writeFile(path.join(tmpDir, 'f.txt'), 'line1\nline2\nline3')
    const result = await patchFile.execute(
      { path: 'f.txt', old_string: 'line2', new_string: 'replaced' },
      makeCtx(),
    )
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    expect(data.start_line).toBe(2)
    expect(data.end_line).toBe(2)
  })

  it('old_string 未找到时返回错误', async () => {
    await fsp.writeFile(path.join(tmpDir, 'f.txt'), 'hello')
    const result = await patchFile.execute(
      { path: 'f.txt', old_string: 'notexist', new_string: 'x' },
      makeCtx(),
    )
    expect(result.success).toBe(false)
    expect(result.output).toContain('未在文件中找到')
  })

  it('old_string 多处匹配时返回错误', async () => {
    await fsp.writeFile(path.join(tmpDir, 'f.txt'), 'abc abc')
    const result = await patchFile.execute(
      { path: 'f.txt', old_string: 'abc', new_string: 'xyz' },
      makeCtx(),
    )
    expect(result.success).toBe(false)
    expect(result.output).toContain('匹配到 2 处')
  })

  it('文件不存在时返回错误', async () => {
    const result = await patchFile.execute(
      { path: 'missing.txt', old_string: 'x', new_string: 'y' },
      makeCtx(),
    )
    expect(result.success).toBe(false)
    expect(result.output).toContain('不存在')
  })

  it('多行替换时行号范围正确', async () => {
    await fsp.writeFile(path.join(tmpDir, 'f.txt'), 'a\nb\nc')
    const result = await patchFile.execute(
      { path: 'f.txt', old_string: 'b', new_string: 'x\ny\nz' },
      makeCtx(),
    )
    expect(result.success).toBe(true)
    const data = JSON.parse(result.output)
    expect(data.start_line).toBe(2)
    expect(data.end_line).toBe(4)
  })
})
