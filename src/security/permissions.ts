import path from 'node:path'
import { isForbiddenWritePath } from '../utils/path.js'

export type RiskLevel = 'safe' | 'medium' | 'high' | 'forbidden'
export type ExecutionMode = 'headless' | 'repl'
export type PermissionResult = 'allow' | 'deny' | 'need_confirm'

// ── 风险分级正则 ───────────────────────────────────────────────────────────────

const FORBIDDEN_PATTERNS: RegExp[] = [
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/(?:\s|$)/,  // rm -rf /
  /rm\s+-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\s+\/(?:\s|$)/,  // rm -fr /
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /:\(\)\s*\{[^}]*\}/,  // fork bomb
  />\s*\/dev\/sd/,
]

const HIGH_PATTERNS: RegExp[] = [
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*/,         // rm -r, rm -rf (非根目录)
  /\b(chmod|chown)\s+-R\b/i,
  /\b(pkill|killall)\b/,
  /\bkill\s+-9\b/,
  /\bsudo\b/,
  /\bsu\s+-\b/,
  /\btruncate\b/,
  /\bshred\b/,
]

const MEDIUM_PATTERNS: RegExp[] = [
  /\brm\b/,                                                            // rm（含 -f，不含 -r，-r 已被 HIGH 先匹配）
  /\bmv\b/,
  /\bcp\b/,                                                            // cp（含 -r，已被 HIGH 先匹配后不会到这里，但加上兜底）
  /\b(apt|apt-get|brew|yum|dnf)\s+(install|remove|purge)\b/i,
  /\b(pip|pip3|npm|yarn|pnpm)\s+install\b/,
  /\bcurl\b.*\s-[a-zA-Z]*o\b/,                                        // curl -o
  /\bwget\b/,
  /\bssh\b/,
  /\bmkdir\b/,
  /\bchmod\b/,                                                         // chmod (不含 -R，已被 HIGH 先匹配)
]

// ── 公开 API ──────────────────────────────────────────────────────────────────

/**
 * 根据命令字符串推断风险等级。
 * 按 forbidden → high → medium → safe 顺序匹配，首个命中即返回。
 */
export function classifyCommand(command: string): RiskLevel {
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(command)) return 'forbidden'
  }
  for (const re of HIGH_PATTERNS) {
    if (re.test(command)) return 'high'
  }
  for (const re of MEDIUM_PATTERNS) {
    if (re.test(command)) return 'medium'
  }
  return 'safe'
}

/**
 * 根据风险等级和执行模式决定是否允许、拒绝或需要确认。
 *
 * 决策矩阵：
 * | riskLevel | headless | repl         |
 * |-----------|----------|--------------|
 * | safe      | allow    | allow        |
 * | medium    | deny     | allow        |
 * | high      | deny     | need_confirm |
 * | forbidden | deny     | deny         |
 */
export function checkCommandPermission(
  _command: string,
  riskLevel: RiskLevel,
  mode: ExecutionMode,
): PermissionResult {
  if (riskLevel === 'forbidden') return 'deny'
  if (riskLevel === 'safe') return 'allow'

  if (mode === 'headless') return 'deny'

  // repl 模式
  if (riskLevel === 'medium') return 'allow'
  // high
  return 'need_confirm'
}

/**
 * 检查目标路径是否在 workspace_root 范围内。
 * - 'inside'   : 在 workspace 内，允许操作
 * - 'outside'  : 在 workspace 外的普通路径，风险提升
 * - 'forbidden': 系统禁止路径（/etc、/sys 等）
 */
export function checkPathPermission(
  targetPath: string,
  workspaceRoot: string,
): 'inside' | 'outside' | 'forbidden' {
  const resolved = path.resolve(targetPath)

  if (isForbiddenWritePath(resolved)) return 'forbidden'

  const root = workspaceRoot === 'cwd' ? process.cwd() : path.resolve(workspaceRoot)
  const relative = path.relative(root, resolved)

  if (relative.startsWith('..') || path.isAbsolute(relative)) return 'outside'
  return 'inside'
}
