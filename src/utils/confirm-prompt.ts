import readline from 'node:readline'

const TIMEOUT_MS = 30_000

export async function askConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
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
