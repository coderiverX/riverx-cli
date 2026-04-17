import { describe, it, expect } from 'vitest'

describe('renderMarkdown', () => {
  it('将粗体 Markdown 渲染为 ANSI 转义序列', async () => {
    const { renderMarkdown } = await import('../../src/ui/stream-output.js')
    const result = renderMarkdown('**hello**')
    expect(result).toContain('hello')
    expect(result).not.toBe('**hello**')
  })

  it('将代码块渲染为带格式的文本', async () => {
    const { renderMarkdown } = await import('../../src/ui/stream-output.js')
    const result = renderMarkdown('```\necho hi\n```')
    expect(result).toContain('echo hi')
  })

  it('空字符串返回空字符串', async () => {
    const { renderMarkdown } = await import('../../src/ui/stream-output.js')
    expect(renderMarkdown('')).toBe('')
  })
})
