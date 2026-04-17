import { describe, it, expect, vi } from 'vitest'
import { QueryEngine } from '../src/query-engine.js'
import { ToolRegistry } from '../src/tool.js'
import type { LLMProvider, ChatChunk } from '../src/llm/provider.js'
import type { Tool, ToolContext } from '../src/tool.js'

function makePlatform() {
  return { os: 'linux' as const, osVersion: '5.15', username: 'test', cwd: '/tmp' }
}

function makeShell() {
  return { path: '/bin/bash', name: 'bash', available: true }
}

function makeConfig() {
  return {
    llm: { provider: 'qwen', model: 'qwen-plus', base_url: '', api_key: '' },
    security: { workspace_root: 'cwd', auto_confirm_safe_commands: true, confirm_medium_risk: false, auto_confirm: true },
    shell: { default: 'auto', timeout_ms: 5000 },
  } as const
}

function makeProvider(rounds: Array<'text' | 'tool'>): LLMProvider {
  let call = 0
  return {
    async *chat() {
      const round = rounds[call++] ?? 'text'
      if (round === 'text') {
        yield { type: 'text', content: 'done' } satisfies ChatChunk
      } else {
        yield {
          type: 'tool_call',
          index: 0,
          id: `tc_${call}`,
          name: 'mock_tool',
          argumentsDelta: '{}',
        } satisfies ChatChunk
      }
    },
  }
}

function makeMockTool(name = 'mock_tool'): Tool {
  return {
    name,
    description: 'mock',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: vi.fn(async (_args: Record<string, unknown>, _ctx: ToolContext) => ({
      success: true,
      output: JSON.stringify({ result: 'ok' }),
    })),
  }
}

describe('QueryEngine 多轮循环', () => {
  it('无工具调用时直接返回文本', async () => {
    const registry = new ToolRegistry()
    const engine = new QueryEngine(
      makeProvider(['text']),
      registry,
      makePlatform(),
      makeShell(),
      makeConfig(),
    )
    const chunks: string[] = []
    const result = await engine.run('hello', {
      onText: chunk => chunks.push(chunk),
      onToolEvent: () => {},
    })
    expect(result).toBe('done')
    expect(chunks).toEqual(['done'])
  })

  it('一轮工具调用后返回最终文本', async () => {
    const registry = new ToolRegistry()
    const tool = makeMockTool()
    registry.register(tool)

    const engine = new QueryEngine(
      makeProvider(['tool', 'text']),
      registry,
      makePlatform(),
      makeShell(),
      makeConfig(),
    )
    const result = await engine.run('do something')
    expect(result).toBe('done')
    expect(tool.execute).toHaveBeenCalledOnce()
  })

  it('多轮工具调用正确累积 messages', async () => {
    const registry = new ToolRegistry()
    const tool = makeMockTool()
    registry.register(tool)

    const engine = new QueryEngine(
      makeProvider(['tool', 'tool', 'text']),
      registry,
      makePlatform(),
      makeShell(),
      makeConfig(),
    )
    const result = await engine.run('multi round')
    expect(result).toBe('done')
    expect(tool.execute).toHaveBeenCalledTimes(2)
  })

  it('abortSignal 触发时抛出错误', async () => {
    const controller = new AbortController()
    const registry = new ToolRegistry()
    const tool = makeMockTool()
    registry.register(tool)

    // abort 在第一轮工具调用执行时触发
    const slowTool: Tool = {
      ...tool,
      execute: vi.fn(async () => {
        controller.abort()
        return { success: true, output: '{}' }
      }),
    }
    registry.register({ ...slowTool, name: 'mock_tool' })

    const engine = new QueryEngine(
      makeProvider(['tool', 'text']),
      registry,
      makePlatform(),
      makeShell(),
      makeConfig(),
    )
    await expect(engine.run('abort test', undefined, controller.signal)).rejects.toThrow('已中断')
  })

  it('工具参数 JSON 格式异常时跳过该工具并报错给 LLM', async () => {
    const registry = new ToolRegistry()
    const tool = makeMockTool()
    registry.register(tool)

    let callCount = 0
    const provider: LLMProvider = {
      async *chat() {
        callCount++
        if (callCount === 1) {
          yield {
            type: 'tool_call',
            index: 0,
            id: 'tc_bad',
            name: 'mock_tool',
            argumentsDelta: '{invalid json',
          } satisfies ChatChunk
        } else {
          yield { type: 'text', content: '参数格式有误，无法执行' } satisfies ChatChunk
        }
      },
    }

    const engine = new QueryEngine(provider, registry, makePlatform(), makeShell(), makeConfig())
    const result = await engine.run('test malformed args')
    expect(result).toBe('参数格式有误，无法执行')
    expect(tool.execute).not.toHaveBeenCalled()
  })

  it('超过 MAX_ROUNDS 抛出错误', async () => {
    const registry = new ToolRegistry()
    const tool = makeMockTool()
    registry.register(tool)

    // 始终返回工具调用，不返回文本
    const engine = new QueryEngine(
      makeProvider(Array(31).fill('tool')),
      registry,
      makePlatform(),
      makeShell(),
      makeConfig(),
    )
    await expect(engine.run('infinite loop')).rejects.toThrow('最大轮次')
  })
})
