import type { ToolDefinition } from './llm/provider.js'
import type { PlatformInfo } from './utils/platform.js'
import type { RiverXConfig } from './config/config.js'

export interface SessionHandle {
  getMessageCount(): number
  getCwd(): string
  getStartedAt(): Date
  clear(): void
}

export interface ToolContext {
  cwd: string
  platform: PlatformInfo
  config: RiverXConfig
  abortSignal?: AbortSignal
  session?: SessionHandle
}

export interface ToolResult {
  success: boolean
  output: string   // JSON 字符串，传给 LLM 作为 tool message content
  error?: string   // 人读错误，用于显示
}

export interface Tool {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema object
  confirmMode?: 'always' | 'on-overwrite'
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`未知工具: ${name}`)
    return tool
  }

  list(): Tool[] {
    return Array.from(this.tools.values())
  }

  toToolDefinitions(): ToolDefinition[] {
    return this.list().map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
  }
}
