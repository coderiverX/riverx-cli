import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import type { Tool, ToolContext, ToolResult } from '../tool.js'

const DEFAULT_LIMIT = 2000

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  '.exe', '.so', '.dylib', '.o', '.a', '.wasm',
  '.mp3', '.mp4', '.avi', '.mkv', '.mov', '.flac', '.wav',
  '.bin', '.dat', '.db', '.sqlite',
])

function hasBinaryExtension(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

async function hasBinaryContent(filePath: string): Promise<boolean> {
  const fd = await fsp.open(filePath, 'r')
  try {
    const buf = Buffer.alloc(8192)
    const { bytesRead } = await fd.read(buf, 0, 8192, 0)
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true
    }
    return false
  } finally {
    await fd.close()
  }
}

function ok(data: object): ToolResult {
  return { success: true, output: JSON.stringify(data) }
}

function err(message: string): ToolResult {
  return { success: false, output: JSON.stringify({ error: message }), error: message }
}

export const readFile: Tool = {
  name: 'read_file',
  description: '读取文件内容，返回带行号的文本。支持 offset/limit 分页读取，自动拒绝二进制文件。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（绝对路径或相对于工作目录）' },
      offset: { type: 'number', description: '起始行号（1-based，可选）' },
      limit: { type: 'number', description: `读取行数（可选，默认 ${DEFAULT_LIMIT}）` },
    },
    required: ['path'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const inputPath = args['path'] as string
    const offset = (args['offset'] as number | undefined) ?? 1
    const limit = (args['limit'] as number | undefined) ?? DEFAULT_LIMIT

    if (offset < 1) return err('offset 必须 >= 1')
    if (limit < 1) return err('limit 必须 >= 1')

    const resolved = path.resolve(ctx.cwd, inputPath)

    let stat: Awaited<ReturnType<typeof fsp.stat>>
    try {
      stat = await fsp.stat(resolved)
    } catch {
      return err(`文件不存在: ${inputPath}`)
    }

    if (stat.isDirectory()) {
      return err(`${inputPath} 是目录，请使用 list_files`)
    }

    if (hasBinaryExtension(resolved)) {
      return err(`${inputPath} 是二进制文件，无法读取文本内容`)
    }

    try {
      const isBinary = await hasBinaryContent(resolved)
      if (isBinary) {
        return err(`${inputPath} 包含二进制内容，无法读取文本`)
      }
    } catch {
      return err(`无法读取文件: ${inputPath}`)
    }

    return new Promise<ToolResult>(resolve => {
      const rl = readline.createInterface({
        input: fs.createReadStream(resolved, { encoding: 'utf-8' }),
        crlfDelay: Infinity,
      })

      let lineNum = 0
      let collected = 0
      const lines: string[] = []

      rl.on('line', (line: string) => {
        lineNum++
        if (lineNum < offset) return
        if (collected >= limit) return
        lines.push(`${String(lineNum).padStart(6)}\t${line}`)
        collected++
      })

      rl.on('close', () => {
        const totalLines = lineNum
        const truncated = totalLines >= offset + limit - 1 && totalLines > offset + collected - 1

        resolve(ok({
          path: resolved,
          total_lines: totalLines,
          lines: lines.join('\n'),
          truncated,
          offset,
          limit,
        }))
      })

      rl.on('error', (e: Error) => {
        resolve(err(`读取文件失败: ${e.message}`))
      })
    })
  },
}
