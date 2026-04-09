export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  function: {
    name: string
    arguments: string
  }
}

export interface ChatMessage {
  role: ChatRole
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ChatParams {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  model?: string
  temperature?: number
}

export type ChatChunk =
  | { type: 'text'; content: string }
  | {
      type: 'tool_call'
      index: number
      id?: string
      name?: string
      argumentsDelta: string
    }

export interface LLMProvider {
  chat(params: ChatParams): AsyncIterable<ChatChunk>
}
