import { describe, expect, it } from 'vitest'
import { ToolRegistry } from '../../src/tool.js'
import type { Tool, ToolContext, ToolResult } from '../../src/tool.js'

function makeTool(name: string, description = '测试工具'): Tool {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: { input: { type: 'string' } },
      required: ['input'],
    },
    async execute(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
      return { success: true, output: '{}' }
    },
  }
}

describe('ToolRegistry', () => {
  describe('register / get', () => {
    it('注册后可通过 name 取回同一工具', () => {
      const registry = new ToolRegistry()
      const tool = makeTool('echo')
      registry.register(tool)
      expect(registry.get('echo')).toBe(tool)
    })

    it('取不存在的工具时抛出包含名称的错误', () => {
      const registry = new ToolRegistry()
      expect(() => registry.get('unknown')).toThrow('未知工具: unknown')
    })

    it('重复注册同名工具时后者覆盖前者', () => {
      const registry = new ToolRegistry()
      const first = makeTool('dup', '第一个')
      const second = makeTool('dup', '第二个')
      registry.register(first)
      registry.register(second)
      expect(registry.get('dup').description).toBe('第二个')
    })
  })

  describe('list', () => {
    it('返回所有已注册工具', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('a'))
      registry.register(makeTool('b'))
      const names = registry.list().map(t => t.name)
      expect(names).toContain('a')
      expect(names).toContain('b')
      expect(names).toHaveLength(2)
    })

    it('空注册表返回空数组', () => {
      expect(new ToolRegistry().list()).toEqual([])
    })
  })

  describe('toToolDefinitions', () => {
    it('生成的 ToolDefinition 包含 name / description / parameters', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('my_tool', '做某事'))
      const defs = registry.toToolDefinitions()
      expect(defs).toHaveLength(1)
      expect(defs[0]).toMatchObject({
        name: 'my_tool',
        description: '做某事',
        parameters: {
          type: 'object',
          properties: { input: { type: 'string' } },
        },
      })
    })

    it('不包含 execute 方法（只是数据）', () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('t'))
      const def = registry.toToolDefinitions()[0]
      expect(def).not.toHaveProperty('execute')
    })
  })
})
