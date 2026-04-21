import readline from 'node:readline'

const TIMEOUT_MS = 30_000

export async function askConfirm(message: string): Promise<boolean> {
  const stdin = process.stdin
  // 主 REPL 创建的 readline 已把 stdin 置为 raw mode；
  // 新建的 rl 在 close() 时会把 stdin 切回 cooked，导致主 REPL 之后按 Enter 变成 ^M。
  // 进入前记录、离开时恢复，避免干扰上层 readline。
  const wasRaw = stdin.isTTY ? stdin.isRaw === true : false

  const rl = readline.createInterface({
    input: stdin,
    output: process.stderr,
    terminal: true,
  })

  return new Promise<boolean>(resolve => {
    let resolved = false

    const done = (confirmed: boolean) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      rl.close()
      if (wasRaw && stdin.isTTY) {
        try {
          stdin.setRawMode(true)
        } catch {
          // 非 TTY 或权限问题时忽略
        }
      }
      resolve(confirmed)
    }

    const timer = setTimeout(() => done(false), TIMEOUT_MS)

    rl.question(`[RiverX confirm] ${message}\n确认执行? (Y/n): `, (answer: string) => {
      const trimmed = answer.trim().toLowerCase()
      done(trimmed !== 'n')
    })

    rl.once('close', () => done(false))
  })
}
