import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import {
  checkCommandPermission,
  checkPathPermission,
} from '../../src/security/permissions.js'

describe('checkCommandPermission', () => {
  it('safe + headless → allow', () =>
    expect(checkCommandPermission('ls', 'safe', 'headless')).toBe('allow'))

  it('safe + repl → allow', () =>
    expect(checkCommandPermission('ls', 'safe', 'repl')).toBe('allow'))

  it('medium + headless → deny', () =>
    expect(checkCommandPermission('mv a b', 'medium', 'headless')).toBe('deny'))

  it('medium + repl → allow', () =>
    expect(checkCommandPermission('mv a b', 'medium', 'repl')).toBe('allow'))

  it('high + headless → deny', () =>
    expect(checkCommandPermission('rm -r dist', 'high', 'headless')).toBe('deny'))

  it('high + repl → need_confirm', () =>
    expect(checkCommandPermission('rm -r dist', 'high', 'repl')).toBe('need_confirm'))

  it('forbidden + headless → deny', () =>
    expect(checkCommandPermission('rm -rf /', 'forbidden', 'headless')).toBe('deny'))

  it('forbidden + repl → deny', () =>
    expect(checkCommandPermission('rm -rf /', 'forbidden', 'repl')).toBe('deny'))
})

describe('checkPathPermission', () => {
  const ws = path.join(os.tmpdir(), 'riverx-test-ws')

  it('workspace 内路径 → inside', () => {
    const target = path.join(ws, 'src', 'file.ts')
    expect(checkPathPermission(target, ws)).toBe('inside')
  })

  it('workspace 外普通路径 → outside', () => {
    const target = path.join(os.homedir(), 'other', 'file.txt')
    expect(checkPathPermission(target, ws)).toBe('outside')
  })

  it('/etc/passwd → forbidden', () =>
    expect(checkPathPermission('/etc/passwd', ws)).toBe('forbidden'))

  it('/bin/sh → forbidden', () =>
    expect(checkPathPermission('/bin/sh', ws)).toBe('forbidden'))

  it('/usr/bin/node → forbidden', () =>
    expect(checkPathPermission('/usr/bin/node', ws)).toBe('forbidden'))

  it('workspaceRoot = cwd 时使用 process.cwd()', () => {
    const target = path.join(process.cwd(), 'src', 'main.ts')
    expect(checkPathPermission(target, 'cwd')).toBe('inside')
  })

  it('workspaceRoot = cwd，外部路径 → outside', () => {
    const target = path.join(os.homedir(), 'external.txt')
    expect(checkPathPermission(target, 'cwd')).toBe('outside')
  })
})
