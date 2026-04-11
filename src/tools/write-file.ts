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

export const writeFile: Tool = {
  name: 'write_file',
  description: '写入文件内容，自动创建父目录。文件已存在时覆盖。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（绝对路径或相对于工作目录）' },
      content: { type: 'string', description: '写入的文本内容' },
    },
    required: ['path', 'content'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const inputPath = args['path'] as string
    const content = args['content'] as string

    const resolved = path.resolve(ctx.cwd, inputPath)

    if (isForbiddenWritePath(resolved)) {
      return err(`禁止写入系统路径: ${resolved}`)
    }

    try {
      await fsp.mkdir(path.dirname(resolved), { recursive: true })
      await fsp.writeFile(resolved, content, 'utf-8')
      const bytes = Buffer.byteLength(content, 'utf-8')
      return ok({ path: resolved, bytes })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return err(`写入失败: ${msg}`)
    }
  },
}
