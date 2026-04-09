import fs from 'node:fs'

export interface ShellInfo {
  path: string
  name: string
  available: boolean
}

export function verifyShell(shellPath: string): boolean {
  return fs.existsSync(shellPath)
}

export function detectShell(): ShellInfo {
  const shellPath = process.env.SHELL ?? '/bin/bash'
  const name = shellPath.split('/').at(-1) ?? 'bash'
  return {
    path: shellPath,
    name,
    available: verifyShell(shellPath),
  }
}
