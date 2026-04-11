import type { Tool, ToolContext, ToolResult } from '../tool.js'

function ok(data: object): ToolResult {
  return { success: true, output: JSON.stringify(data) }
}

function err(message: string): ToolResult {
  return { success: false, output: JSON.stringify({ error: message }), error: message }
}

export const session: Tool = {
  name: 'session',
  description: '查询或清空当前会话信息。action=info 返回消息数/工作目录/运行时长，action=clear 清空会话上下文。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['info', 'clear'],
        description: '"info" 查询会话信息，"clear" 清空会话上下文',
      },
    },
    required: ['action'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.session) {
      return err('session context 不可用')
    }

    const action = args['action'] as string

    if (action === 'info') {
      const elapsed = Date.now() - ctx.session.getStartedAt().getTime()
      return ok({
        message_count: ctx.session.getMessageCount(),
        cwd: ctx.session.getCwd(),
        elapsed_ms: elapsed,
        started_at: ctx.session.getStartedAt().toISOString(),
      })
    }

    if (action === 'clear') {
      ctx.session.clear()
      return ok({ cleared: true })
    }

    return err(`未知 action: ${action}`)
  },
}
