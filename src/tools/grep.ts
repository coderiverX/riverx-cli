import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import type { Tool, ToolContext, ToolResult } from '../tool.js'

const DEFAULT_LIMIT = 250

const EXCLUDED_DIRS = new Set(['.git', '.svn', '.hg', 'node_modules'])

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

function hasBinaryExtension(filePath: string): boolean {
  const BINARY_EXT = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico',
    '.pdf', '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
    '.exe', '.so', '.dylib', '.o', '.a', '.wasm',
    '.mp3', '.mp4', '.avi', '.mkv', '.mov', '.flac', '.wav',
    '.bin', '.db', '.sqlite',
  ])
  return BINARY_EXT.has(path.extname(filePath).toLowerCase())
}

interface Match {
  file: string
  line: number
  content: string
}

interface State {
  stopped: boolean
  matches: Match[]
}

async function searchFile(
  filePath: string,
  re: RegExp,
  rootDir: string,
  state: State,
  limit: number,
): Promise<void> {
  if (state.stopped) return
  if (hasBinaryExtension(filePath)) return

  await new Promise<void>(resolve => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    })

    let lineNum = 0

    rl.on('line', (line: string) => {
      if (state.stopped) {
        rl.close()
        return
      }
      lineNum++
      if (re.test(line)) {
        state.matches.push({
          file: path.relative(rootDir, filePath),
          line: lineNum,
          content: line,
        })
        if (state.matches.length >= limit) {
          state.stopped = true
          rl.close()
        }
      }
    })

    rl.on('close', resolve)
    rl.on('error', resolve)
  })
}

async function searchDir(
  dir: string,
  re: RegExp,
  rootDir: string,
  includeRe: RegExp | null,
  state: State,
  limit: number,
): Promise<void> {
  if (state.stopped) return

  let entries: import('node:fs').Dirent<string>[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true, encoding: 'utf-8' }) as import('node:fs').Dirent<string>[]
  } catch {
    return
  }

  for (const entry of entries) {
    if (state.stopped) return

    if (entry.isSymbolicLink()) continue

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      await searchDir(
        path.join(dir, entry.name),
        re,
        rootDir,
        includeRe,
        state,
        limit,
      )
    } else if (entry.isFile()) {
      if (includeRe && !includeRe.test(entry.name)) continue
      await searchFile(path.join(dir, entry.name), re, rootDir, state, limit)
    }
  }
}

function ok(data: object): ToolResult {
  return { success: true, output: JSON.stringify(data) }
}

function err(message: string): ToolResult {
  return { success: false, output: JSON.stringify({ error: message }), error: message }
}

export const grep: Tool = {
  name: 'grep',
  description:
    '在目录中递归搜索匹配正则表达式的内容，返回文件路径、行号和行内容。纯 Node.js 实现，无外部依赖。',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '正则表达式' },
      path: { type: 'string', description: '搜索目录（可选，默认当前工作目录）' },
      include: { type: 'string', description: '文件名 glob 过滤，如 *.ts（可选）' },
      ignore_case: { type: 'boolean', description: '大小写不敏感（可选）' },
    },
    required: ['pattern'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const pattern = args['pattern'] as string
    const inputPath = (args['path'] as string | undefined) ?? '.'
    const include = args['include'] as string | undefined
    const ignoreCase = (args['ignore_case'] as boolean | undefined) ?? false

    let re: RegExp
    try {
      re = new RegExp(pattern, ignoreCase ? 'i' : '')
    } catch {
      return err(`无效的正则表达式: ${pattern}`)
    }

    const rootDir = path.resolve(ctx.cwd, inputPath)

    let stat: Awaited<ReturnType<typeof fsp.stat>>
    try {
      stat = await fsp.stat(rootDir)
    } catch {
      return err(`路径不存在: ${inputPath}`)
    }

    const includeRe = include ? globToRegex(include) : null
    const state: State = { stopped: false, matches: [] }

    if (stat.isDirectory()) {
      await searchDir(rootDir, re, rootDir, includeRe, state, DEFAULT_LIMIT)
    } else {
      await searchFile(rootDir, re, path.dirname(rootDir), state, DEFAULT_LIMIT)
    }

    const truncated = state.stopped
    return ok({
      pattern,
      path: rootDir,
      total: state.matches.length,
      truncated,
      matches: state.matches,
    })
  },
}
