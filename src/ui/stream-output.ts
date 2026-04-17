import chalk from 'chalk'
import ora, { type Ora } from 'ora'
import { marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

marked.use(markedTerminal())

export type ToolEvent =
  | { type: 'tool_start'; summary: string }
  | { type: 'tool_done'; summary: string; elapsedMs: number }
  | { type: 'tool_error'; summary: string; error: string; elapsedMs: number }

export interface StreamOutput {
  onText(chunk: string): void
  onToolEvent(event: ToolEvent): void
  onLLMStart?(): void
  onLLMEnd?(): void
}

export function renderMarkdown(text: string): string {
  if (!text) return ''
  const result = marked.parse(text)
  return typeof result === 'string' ? result : text
}

export function createStreamOutput(): StreamOutput {
  let buffer = ''
  let llmSpinner: Ora | null = null
  let toolSpinner: Ora | null = null

  function stopToolSpinner() {
    if (toolSpinner) {
      toolSpinner.stop()
      toolSpinner = null
    }
  }

  function stopLLMSpinner() {
    if (llmSpinner) {
      llmSpinner.stop()
      llmSpinner = null
    }
  }

  return {
    onLLMStart() {
      stopToolSpinner()
      buffer = ''
      llmSpinner = ora({ text: '思考中...', stream: process.stderr }).start()
    },

    onText(chunk: string) {
      buffer += chunk
    },

    onLLMEnd() {
      stopLLMSpinner()
      if (buffer) {
        process.stdout.write(renderMarkdown(buffer))
      }
      buffer = ''
    },

    onToolEvent(event: ToolEvent) {
      switch (event.type) {
        case 'tool_start':
          stopToolSpinner()
          toolSpinner = ora({
            text: chalk.yellow(`执行: ${event.summary}`),
            stream: process.stderr,
          }).start()
          break

        case 'tool_done':
          if (toolSpinner) {
            toolSpinner.succeed(
              chalk.green(`✓ ${event.summary} (${(event.elapsedMs / 1000).toFixed(1)}s)`),
            )
            toolSpinner = null
          }
          break

        case 'tool_error':
          if (toolSpinner) {
            toolSpinner.fail(chalk.red(`✗ ${event.summary}: ${event.error}`))
            toolSpinner = null
          } else {
            process.stderr.write(chalk.red(`✗ ${event.summary}: ${event.error}`) + '\n')
          }
          break
      }
    },
  }
}
