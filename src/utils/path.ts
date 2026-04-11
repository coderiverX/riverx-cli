import path from 'node:path'

const FORBIDDEN_WRITE_DIRS: readonly string[] = [
  '/etc',
  '/sys',
  '/dev',
  '/proc',
  '/boot',
  '/bin',
  '/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/lib',
  '/lib64',
]

export function isForbiddenWritePath(resolved: string): boolean {
  // 禁止直接写入根目录下的文件（如 /malicious.txt）
  if (path.dirname(resolved) === '/') return true

  for (const dir of FORBIDDEN_WRITE_DIRS) {
    if (resolved === dir || resolved.startsWith(dir + '/')) {
      return true
    }
  }
  return false
}
