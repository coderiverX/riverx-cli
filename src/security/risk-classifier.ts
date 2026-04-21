import path from 'node:path'

export type RiskLevel = 'safe' | 'medium' | 'high' | 'forbidden'

// ── 安全命令白名单（只读/诊断类命令）──────────────────────────────────────────

export const SAFE_COMMANDS: ReadonlySet<string> = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'pwd', 'echo', 'whoami', 'date',
  'uname', 'df', 'du', 'ps', 'env', 'which', 'file', 'stat', 'id',
])

// ── 风险分级正则 ───────────────────────────────────────────────────────────────

export const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/(?:\s|$)/,   // rm -rf /
  /rm\s+-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\s+\/(?:\s|$)/,   // rm -fr /
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /:\(\)\s*\{[^}]*\}/,                                   // fork bomb
  />\s*\/dev\/sd/,
]

export const HIGH_PATTERNS: readonly RegExp[] = [
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*/,         // rm -r, rm -rf (非根目录)
  /\b(chmod|chown)\s+-R\b/i,
  /\b(pkill|killall)\b/,
  /\bkill\s+-9\b/,
  /\bsudo\b/,
  /\bsu\s+-\b/,
  /\btruncate\b/,
  /\bshred\b/,
]

export const MEDIUM_PATTERNS: readonly RegExp[] = [
  /\brm\b/,
  /\bmv\b/,
  /\bcp\b/,
  /\b(apt|apt-get|brew|yum|dnf)\s+(install|remove|purge)\b/i,
  /\b(pip|pip3|npm|yarn|pnpm)\s+install\b/,
  /\bcurl\b.*\s-[a-zA-Z]*o\b/,           // curl -o
  /\bwget\b/,
  /\bssh\b/,
  /\bmkdir\b/,
  /\bchmod\b/,
]

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

const RISK_ORDER: Record<RiskLevel, number> = {
  safe: 0,
  medium: 1,
  high: 2,
  forbidden: 3,
}

/**
 * 按 shell 连接符（`|` `&&` `||` `;`）拆分命令，尊重引号和转义。
 * 不会把引号内或转义后的操作符视为分隔符。
 */
function splitSubcommands(command: string): string[] {
  const result: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escape = false

  const flush = () => {
    const t = current.trim()
    if (t) result.push(t)
    current = ''
  }

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]

    if (escape) {
      current += ch
      escape = false
      continue
    }
    if (ch === '\\') {
      current += ch
      escape = true
      continue
    }
    if (quote) {
      current += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      current += ch
      quote = ch
      continue
    }

    // && 或 ||
    if ((ch === '&' || ch === '|') && command[i + 1] === ch) {
      flush()
      i++
      continue
    }
    // 单管道 |
    if (ch === '|') {
      flush()
      continue
    }
    // 分号 ;
    if (ch === ';') {
      flush()
      continue
    }

    current += ch
  }

  flush()
  return result
}

/**
 * 提取一条命令的首个 token（跳过前导环境变量赋值），并取路径 basename。
 * 例：`FOO=bar /usr/bin/ls -la` → `ls`
 */
function firstToken(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return ''
  const m = trimmed.match(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(\S+)/)
  const token = m ? m[1] : trimmed.split(/\s+/)[0]
  return path.posix.basename(token)
}

/**
 * 对单条子命令分级：
 *   forbidden → high → medium 正则按序匹配；皆未命中时
 *   首 token 命中白名单 → safe，否则默认 medium。
 */
function classifySub(command: string): RiskLevel {
  for (const re of FORBIDDEN_PATTERNS) if (re.test(command)) return 'forbidden'
  for (const re of HIGH_PATTERNS) if (re.test(command)) return 'high'
  for (const re of MEDIUM_PATTERNS) if (re.test(command)) return 'medium'
  if (SAFE_COMMANDS.has(firstToken(command))) return 'safe'
  return 'medium'
}

// ── 公开 API ──────────────────────────────────────────────────────────────────

/**
 * 根据命令字符串推断风险等级。
 *
 * - 整串优先匹配 forbidden 模式，以捕获含 `|` `;` 的 fork bomb 等结构
 * - 按 `|` `&&` `||` `;` 拆分后逐条分析，取最高风险
 * - 单条子命令：forbidden → high → medium → 白名单 safe → 默认 medium
 */
export function classifyCommand(command: string): RiskLevel {
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(command)) return 'forbidden'
  }

  const subs = splitSubcommands(command)
  if (subs.length === 0) return 'safe'

  let max: RiskLevel = 'safe'
  for (const sub of subs) {
    const r = classifySub(sub)
    if (RISK_ORDER[r] > RISK_ORDER[max]) max = r
  }
  return max
}
