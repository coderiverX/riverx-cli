import readline from 'node:readline'
import type { Tool, ToolContext, ToolResult } from '../tool.js'

const TIMEOUT_MS = 30_000

function ok(data: object): ToolResult {
  return { success: true, output: JSON.stringify(data) }
}

async function askConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  })

  return new Promise<boolean>(resolve => {
    let resolved = false

    const done = (confirmed: boolean) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      rl.close()
      resolve(confirmed)
    }

    const timer = setTimeout(() => done(false), TIMEOUT_MS)

    rl.question(`[RiverX] ${message} (Y/n): `, (answer: string) => {
      const trimmed = answer.trim().toLowerCase()
      done(trimmed !== 'n')
    })

    rl.once('close', () => done(false))
  })
}

export const confirm: Tool = {
  name: 'confirm',
  description:
    '向用户显示确认提示，等待 Y/n 输入。headless 模式下自动拒绝（安全优先），30 秒超时自动拒绝。',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: '展示给用户的确认信息' },
    },
    required: ['message'],
  },

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const message = args['message'] as string

    if (!process.stdin.isTTY) {
      return ok({ confirmed: false, reason: 'headless mode' })
    }

    const confirmed = await askConfirm(message)
    return ok({ confirmed })
  },
}
