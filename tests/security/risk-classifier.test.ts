import { describe, expect, it } from 'vitest'
import { classifyCommand } from '../../src/security/risk-classifier.js'

describe('classifyCommand — safe 白名单', () => {
  it('ls → safe', () => expect(classifyCommand('ls -la')).toBe('safe'))
  it('cat → safe', () => expect(classifyCommand('cat file.txt')).toBe('safe'))
  it('echo → safe', () => expect(classifyCommand('echo hello')).toBe('safe'))
  it('pwd → safe', () => expect(classifyCommand('pwd')).toBe('safe'))
  it('whoami → safe', () => expect(classifyCommand('whoami')).toBe('safe'))
  it('date → safe', () => expect(classifyCommand('date')).toBe('safe'))
  it('uname -a → safe', () => expect(classifyCommand('uname -a')).toBe('safe'))
  it('df -h → safe', () => expect(classifyCommand('df -h')).toBe('safe'))
  it('du -sh . → safe', () => expect(classifyCommand('du -sh .')).toBe('safe'))
  it('ps aux → safe', () => expect(classifyCommand('ps aux')).toBe('safe'))
  it('env → safe', () => expect(classifyCommand('env')).toBe('safe'))
  it('which node → safe', () => expect(classifyCommand('which node')).toBe('safe'))
  it('file foo.txt → safe', () => expect(classifyCommand('file foo.txt')).toBe('safe'))
  it('stat foo → safe', () => expect(classifyCommand('stat foo')).toBe('safe'))
  it('id → safe', () => expect(classifyCommand('id')).toBe('safe'))
  it('head -n 5 → safe', () => expect(classifyCommand('head -n 5 foo.txt')).toBe('safe'))
  it('tail -f → safe', () => expect(classifyCommand('tail -f app.log')).toBe('safe'))
  it('wc -l → safe', () => expect(classifyCommand('wc -l foo.txt')).toBe('safe'))
  it('绝对路径命令亦匹配 basename', () =>
    expect(classifyCommand('/usr/bin/ls -la')).toBe('safe'))
  it('前导环境变量赋值不影响白名单判定', () =>
    expect(classifyCommand('LANG=C ls -la')).toBe('safe'))
})

describe('classifyCommand — 默认 medium', () => {
  it('未知命令 → medium', () => expect(classifyCommand('someweirdtool --go')).toBe('medium'))
  it('grep 不在白名单 → medium', () => expect(classifyCommand('grep -r foo .')).toBe('medium'))
  it('find 不在白名单 → medium', () =>
    expect(classifyCommand('find . -name "*.ts"')).toBe('medium'))
})

describe('classifyCommand — medium 模式', () => {
  it('rm (无 -r) → medium', () => expect(classifyCommand('rm nginx.conf')).toBe('medium'))
  it('rm -f → medium', () => expect(classifyCommand('rm -f file.txt')).toBe('medium'))
  it('mv → medium', () => expect(classifyCommand('mv a.txt b.txt')).toBe('medium'))
  it('mkdir → medium', () => expect(classifyCommand('mkdir -p /tmp/foo')).toBe('medium'))
  it('wget → medium', () => expect(classifyCommand('wget https://example.com/file')).toBe('medium'))
  it('curl -o → medium', () =>
    expect(classifyCommand('curl -o out.txt https://example.com')).toBe('medium'))
  it('npm install → medium', () => expect(classifyCommand('npm install lodash')).toBe('medium'))
  it('chmod (无 -R) → medium', () => expect(classifyCommand('chmod 755 file.sh')).toBe('medium'))
})

describe('classifyCommand — high 模式', () => {
  it('rm -r → high', () => expect(classifyCommand('rm -r ./dist')).toBe('high'))
  it('sudo → high', () => expect(classifyCommand('sudo apt-get update')).toBe('high'))
  it('pkill → high', () => expect(classifyCommand('pkill node')).toBe('high'))
  it('kill -9 → high', () => expect(classifyCommand('kill -9 1234')).toBe('high'))
  it('chmod -R → high', () => expect(classifyCommand('chmod -R 777 /tmp')).toBe('high'))
  it('shred → high', () => expect(classifyCommand('shred -u secret.txt')).toBe('high'))
})

describe('classifyCommand — forbidden 模式', () => {
  it('rm -rf / → forbidden', () => expect(classifyCommand('rm -rf /')).toBe('forbidden'))
  it('rm -fr / → forbidden', () => expect(classifyCommand('rm -fr /')).toBe('forbidden'))
  it('mkfs → forbidden', () => expect(classifyCommand('mkfs.ext4 /dev/sda')).toBe('forbidden'))
  it('dd if= → forbidden', () =>
    expect(classifyCommand('dd if=/dev/zero of=/dev/sda')).toBe('forbidden'))
  it('fork bomb → forbidden', () => expect(classifyCommand(':(){:|:&};:')).toBe('forbidden'))
  it('>/dev/sd → forbidden', () =>
    expect(classifyCommand('echo foo > /dev/sda')).toBe('forbidden'))
})

describe('classifyCommand — 管道 / 链式复合命令', () => {
  it('管道 两个 safe → safe', () =>
    expect(classifyCommand('cat a.txt | head -n 5')).toBe('safe'))

  it('管道 safe + unknown → medium', () =>
    expect(classifyCommand('ls | grep foo')).toBe('medium'))

  it('管道 safe + high → high', () =>
    expect(classifyCommand('ls | sudo tee out.txt')).toBe('high'))

  it('&& safe + high → high', () =>
    expect(classifyCommand('cd src && sudo make install')).toBe('high'))

  it('|| safe + high → high', () =>
    expect(classifyCommand('test -f a || rm -r dist')).toBe('high'))

  it('; safe + medium → medium', () =>
    expect(classifyCommand('echo start ; mv a b')).toBe('medium'))

  it('; 全 safe → safe', () =>
    expect(classifyCommand('echo a ; echo b')).toBe('safe'))

  it('复合命令中含 forbidden 整串识别', () =>
    expect(classifyCommand('ls && rm -rf /')).toBe('forbidden'))

  it('引号内的 | 不参与拆分', () =>
    expect(classifyCommand('echo "a | b"')).toBe('safe'))

  it('引号内的 ; 不参与拆分', () =>
    expect(classifyCommand('echo "a ; b"')).toBe('safe'))
})
