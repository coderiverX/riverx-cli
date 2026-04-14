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
  confirmMode: 'on-overwrite',
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

    // 磁盘空间预检：写前确认可用空间足够
    const contentBytes = Buffer.byteLength(content, 'utf-8')
    try {
      const stats = await fsp.statfs(path.dirname(resolved))
      const available = stats.bavail * stats.bsize
      if (available < contentBytes) {
        return err(`磁盘空间不足：文件需要 ${contentBytes} 字节，可用约 ${available} 字节`)
      }
    } catch {
      // statfs 不可用时跳过检查，继续写入
    }

    try {
      await fsp.mkdir(path.dirname(resolved), { recursive: true })
      await fsp.writeFile(resolved, content, 'utf-8')
      const bytes = Buffer.byteLength(content, 'utf-8')
      return ok({ path: resolved, bytes })
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EPERM') {
        return err(`权限不足，无法写入文件：${resolved}。请检查目录或文件的权限设置。`)
      }
      const msg = e instanceof Error ? e.message : String(e)
      return err(`写入失败: ${msg}`)
    }
  },
}
