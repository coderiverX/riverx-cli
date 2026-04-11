import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Tool, ToolContext, ToolResult } from '../tool.js'
import { isForbiddenWritePath } from '../utils/path.js'

function ok(data: object): ToolResult {
  return { success: true, output: JSON.stringify(data) }
}

function err(message: string): ToolResult {
  return { success: false, output: JSON.stringify({ error: message }), error: message }
}

function countOccurrences(text: string, search: string): number {
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++
    pos += search.length
  }
  return count
}

function findLineRange(
  content: string,
  startOffset: number,
  newString: string,
): { startLine: number; endLine: number } {
  const before = content.slice(0, startOffset)
  const startLine = before.split('\n').length
  const endLine = startLine + newString.split('\n').length - 1
  return { startLine, endLine }
}

export const patchFile: Tool = {
  name: 'patch_file',
  description:
    '在文件中将 old_string 替换为 new_string。old_string 必须在文件中唯一匹配，否则报错。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（绝对路径或相对于工作目录）' },
      old_string: { type: 'string', description: '要替换的原始字符串（必须唯一）' },
      new_string: { type: 'string', description: '替换后的新字符串' },
    },
    required: ['path', 'old_string', 'new_string'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const inputPath = args['path'] as string
    const oldString = args['old_string'] as string
    const newString = args['new_string'] as string

    if (!oldString) return err('old_string 不能为空')

    const resolved = path.resolve(ctx.cwd, inputPath)

    if (isForbiddenWritePath(resolved)) {
      return err(`禁止修改系统路径: ${resolved}`)
    }

    let content: string
    try {
      content = await fsp.readFile(resolved, 'utf-8')
    } catch {
      return err(`文件不存在: ${inputPath}`)
    }

    const count = countOccurrences(content, oldString)
    if (count === 0) return err('old_string 未在文件中找到')
    if (count > 1) return err(`old_string 匹配到 ${count} 处，必须唯一匹配`)

    const startOffset = content.indexOf(oldString)
    const { startLine, endLine } = findLineRange(content, startOffset, newString)

    const newContent = content.slice(0, startOffset) + newString + content.slice(startOffset + oldString.length)

    try {
      await fsp.writeFile(resolved, newContent, 'utf-8')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return err(`写入失败: ${msg}`)
    }

    return ok({ path: resolved, start_line: startLine, end_line: endLine })
  },
}
