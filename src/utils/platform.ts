import os from 'node:os'

export type SupportedOS = 'darwin' | 'linux'

export interface PlatformInfo {
  os: SupportedOS
  osVersion: string
  username: string
  cwd: string
}

export function detectPlatform(): PlatformInfo {
  const raw = process.platform
  if (raw !== 'darwin' && raw !== 'linux') {
    throw new Error(`不支持的操作系统：${raw}，riverx 仅支持 darwin 和 linux。`)
  }
  return {
    os: raw,
    osVersion: os.release(),
    username: process.env.USER ?? os.userInfo().username,
    cwd: process.cwd(),
  }
}
