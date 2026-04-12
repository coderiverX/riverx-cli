import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import {
  classifyCommand,
  checkCommandPermission,
  checkPathPermission,
} from '../../src/security/permissions.js'

describe('classifyCommand', () => {
  // safe
  it('ls → safe', () => expect(classifyCommand('ls -la')).toBe('safe'))
  it('cat → safe', () => expect(classifyCommand('cat file.txt')).toBe('safe'))
  it('echo → safe', () => expect(classifyCommand('echo hello')).toBe('safe'))
  it('grep → safe', () => expect(classifyCommand('grep -r foo .')).toBe('safe'))
  it('find (无 -delete) → safe', () => expect(classifyCommand('find . -name "*.ts"')).toBe('safe'))

  // medium
  it('mv → medium', () => expect(classifyCommand('mv a.txt b.txt')).toBe('medium'))
  it('mkdir → medium', () => expect(classifyCommand('mkdir -p /tmp/foo')).toBe('medium'))
  it('wget → medium', () => expect(classifyCommand('wget https://example.com/file')).toBe('medium'))
  it('curl -o → medium', () => expect(classifyCommand('curl -o out.txt https://example.com')).toBe('medium'))
  it('npm install → medium', () => expect(classifyCommand('npm install lodash')).toBe('medium'))
  it('chmod (无 -R) → medium', () => expect(classifyCommand('chmod 755 file.sh')).toBe('medium'))

  // high
  it('rm -r → high', () => expect(classifyCommand('rm -r ./dist')).toBe('high'))
  it('sudo → high', () => expect(classifyCommand('sudo apt-get update')).toBe('high'))
  it('pkill → high', () => expect(classifyCommand('pkill node')).toBe('high'))
  it('kill -9 → high', () => expect(classifyCommand('kill -9 1234')).toBe('high'))
  it('chmod -R → high', () => expect(classifyCommand('chmod -R 777 /tmp')).toBe('high'))
  it('shred → high', () => expect(classifyCommand('shred -u secret.txt')).toBe('high'))

  // forbidden
  it('rm -rf / → forbidden', () => expect(classifyCommand('rm -rf /')).toBe('forbidden'))
  it('rm -fr / → forbidden', () => expect(classifyCommand('rm -fr /')).toBe('forbidden'))
  it('mkfs → forbidden', () => expect(classifyCommand('mkfs.ext4 /dev/sda')).toBe('forbidden'))
  it('dd if= → forbidden', () => expect(classifyCommand('dd if=/dev/zero of=/dev/sda')).toBe('forbidden'))
  it('fork bomb → forbidden', () => expect(classifyCommand(':(){:|:&};:')).toBe('forbidden'))
  it('>/dev/sd → forbidden', () => expect(classifyCommand('echo foo > /dev/sda')).toBe('forbidden'))
})

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
