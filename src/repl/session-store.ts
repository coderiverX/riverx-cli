import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface SessionData {
  id: string
  startedAt: string
  endedAt: string
  messageCount: number
  toolCallStats: Record<string, number>
}

const SESSIONS_DIR = path.join(os.homedir(), '.riverx', 'sessions')

export function saveSession(data: SessionData): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true })
  }
  const file = path.join(SESSIONS_DIR, `${data.id}.json`)
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

export function cleanupOldSessions(maxAgeDays = 30): void {
  if (!fs.existsSync(SESSIONS_DIR)) return
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  for (const name of fs.readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith('.json')) continue
    const file = path.join(SESSIONS_DIR, name)
    try {
      const stat = fs.statSync(file)
      if (stat.mtimeMs < cutoff) fs.unlinkSync(file)
    } catch {
      // ignore
    }
  }
}
