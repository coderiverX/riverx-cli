import fsp from 'node:fs/promises'
import path from 'node:path'
import fg from 'fast-glob'
import type { Tool, ToolContext, ToolResult } from '../tool.js'

const DEFAULT_MAX = 200

function ok(data: object): ToolResult {
  return { success: true, output: JSON.stringify(data) }
}

function err(message: string): ToolResult {
  return { success: false, output: JSON.stringify({ error: message }), error: message }
}

export const listFiles: Tool = {
  name: 'list_files',
  description: '列出目录内容，支持 glob 模式匹配。返回文件名、类型（file/dir/symlink）和大小。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目录路径（可选，默认当前工作目录）' },
      pattern: { type: 'string', description: 'glob 模式（可选，如 *.ts）' },
    },
    required: [],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const inputPath = (args['path'] as string | undefined) ?? '.'
    const pattern = (args['pattern'] as string | undefined) ?? '*'

    const basePath = path.resolve(ctx.cwd, inputPath)

    let stat: Awaited<ReturnType<typeof fsp.stat>>
    try {
      stat = await fsp.stat(basePath)
    } catch {
      return err(`路径不存在: ${inputPath}`)
    }

    if (!stat.isDirectory()) {
      return err(`${inputPath} 不是目录，请使用 read_file 读取文件`)
    }

    const globPattern = path.join(basePath, pattern).replace(/\\/g, '/')

    const entries = await fg(globPattern, {
      dot: true,
      onlyFiles: false,
      stats: true,
      followSymbolicLinks: false,
      suppressErrors: true,
    })

    const truncated = entries.length > DEFAULT_MAX
    const sliced = truncated ? entries.slice(0, DEFAULT_MAX) : entries

    const result = sliced.map(e => {
      let type: 'file' | 'dir' | 'symlink' = 'file'
      if (e.dirent.isSymbolicLink()) type = 'symlink'
      else if (e.dirent.isDirectory()) type = 'dir'
      return {
        name: path.relative(basePath, e.path),
        type,
        size: e.stats?.size ?? 0,
      }
    })

    return ok({
      path: basePath,
      total: entries.length,
      truncated,
      entries: result,
    })
  },
}
