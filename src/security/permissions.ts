import path from 'node:path'
import { isForbiddenWritePath } from '../utils/path.js'

export type { RiskLevel } from './risk-classifier.js'
export { classifyCommand } from './risk-classifier.js'

import type { RiskLevel } from './risk-classifier.js'

export type ExecutionMode = 'headless' | 'repl'
export type PermissionResult = 'allow' | 'deny' | 'need_confirm'

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
