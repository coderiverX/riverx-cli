import chalk from 'chalk'

export type ToolEvent =
  | { type: 'tool_start'; summary: string }
  | { type: 'tool_done'; summary: string; elapsedMs: number }
  | { type: 'tool_error'; summary: string; error: string; elapsedMs: number }

export interface StreamOutput {
  onText(chunk: string): void
  onToolEvent(event: ToolEvent): void
}

export function createStreamOutput(): StreamOutput {
  return {
    onText(chunk: string) {
      process.stdout.write(chunk)
    },
    onToolEvent(event: ToolEvent) {
      switch (event.type) {
        case 'tool_start':
          process.stderr.write(chalk.yellow(`⟳ 执行中: ${event.summary}`) + '\n')
          break
        case 'tool_done':
          process.stderr.write(
            chalk.green(`✓ 完成，耗时 ${(event.elapsedMs / 1000).toFixed(1)}s`) + '\n',
          )
          break
        case 'tool_error':
          process.stderr.write(chalk.red(`✗ 失败: ${event.error}`) + '\n')
          break
      }
    },
  }
}
