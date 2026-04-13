import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LOGS_DIR = path.join(os.homedir(), '.riverx', 'logs')

function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true })
  }
}

function todayLogFile(): string {
  const date = new Date().toISOString().slice(0, 10)
  return path.join(LOGS_DIR, `${date}.log`)
}

export function logToolCall(
  toolName: string,
  argsSummary: string,
  success: boolean,
  durationMs: number,
): void {
  try {
    ensureLogsDir()
    const ts = new Date().toISOString()
    const status = success ? 'success' : 'error'
    const line = `[${ts}] [${toolName}] [${argsSummary}] [${status}] [${durationMs}ms]\n`
    fs.appendFileSync(todayLogFile(), line, 'utf-8')
  } catch {
    // 日志写入失败不中断主流程
  }
}

export function cleanupOldLogs(maxAgeDays = 7): void {
  if (!fs.existsSync(LOGS_DIR)) return
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  for (const name of fs.readdirSync(LOGS_DIR)) {
    if (!name.endsWith('.log')) continue
    // 文件名格式 YYYY-MM-DD.log，直接按日期判断
    const dateStr = name.slice(0, 10)
    const ts = Date.parse(dateStr)
    if (!isNaN(ts) && ts < cutoff) {
      try {
        fs.unlinkSync(path.join(LOGS_DIR, name))
      } catch {
        // ignore
      }
    }
  }
}
