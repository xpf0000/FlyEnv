import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildDirectoryCommand,
  directoryTerminalBootstrap,
  appleScriptString,
  linuxTerminalArgs,
  validateDirectory
} from '../fork/terminal'

test('quoted Unix directory is literal and multiline command is preserved', async () => {
  const root = await mkdtemp(join(tmpdir(), "flyenv-' $() "))
  try {
    const command = 'printf "%s\\n" "$PWD"\nprintf second'
    const script = buildDirectoryCommand(root, command, 'darwin')
    const { stdout } = await promisify(execFile)('/bin/bash', ['-c', script])
    assert.equal(stdout, `${root}\nsecond`)
    assert.ok(script.includes(`\n${command}\n`))
    assert.equal(await validateDirectory(root), root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('failed cd never runs the preset command', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-shortcuts-'))
  try {
    const marker = join(root, 'marker')
    const script = buildDirectoryCommand(join(root, 'missing'), `touch '${marker}'`, 'linux')
    await assert.rejects(promisify(execFile)('/bin/bash', ['-c', script]))
    await assert.rejects(validateDirectory(marker))
    await writeFile(marker, '')
    await assert.rejects(validateDirectory(marker))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('terminal stays in the chosen directory after the preset completes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-cwd-'))
  try {
    const script = buildDirectoryCommand(root, 'true', 'darwin')
    const { stdout } = await promisify(execFile)('/bin/bash', [
      '-c',
      `${script}\nprintf '%s' "$PWD"`
    ])
    assert.equal(stdout, root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('invalid directories and empty commands fail before execution', async () => {
  for (const path of ['', 'relative/path', '/tmp/\0x'])
    await assert.rejects(validateDirectory(path))
  assert.throws(() => buildDirectoryCommand('/tmp', '  ', 'darwin'))
})

test('PowerShell literal path and AppleScript escape each interpretation layer', () => {
  const command = 'Write-Host "你好"\nGet-Location'
  const script = buildDirectoryCommand("C:\\User's [$]\\项目", command, 'win32')
  assert.ok(script.includes("Set-Location -LiteralPath 'C:\\User''s [$]\\项目' -ErrorAction Stop"))
  assert.ok(script.includes('catch { Write-Error $_; return }'))
  assert.ok(script.endsWith(command))
  assert.equal(appleScriptString('a\\b"c\nd\re'), '"a\\\\b\\"c\\nd\\re"')
})

test('Linux terminal arguments preserve one payload and use terminal-specific execute options', () => {
  const payload = buildDirectoryCommand("/tmp/it's $literal", 'printf "hello"\npwd', 'linux')
  for (const [file, option] of [
    ['/usr/bin/xfce4-terminal', '--execute'],
    ['/usr/bin/gnome-terminal', '--'],
    ['/usr/bin/xterm', '-e']
  ]) {
    assert.deepEqual(linuxTerminalArgs(file, payload), [
      option,
      '/bin/bash',
      '-ic',
      `${payload}\nexec /bin/bash -i`
    ])
  }
})

test('directory-only mode performs cd without running a placeholder command', async () => {
  const root = await mkdtemp(join(tmpdir(), "flyenv-cd-' $-"))
  try {
    const command = buildDirectoryCommand(root, undefined, 'darwin')
    const { stdout } = await promisify(execFile)('/bin/bash', [
      '-c',
      `${command}\nprintf '%s' "$PWD"`
    ])
    assert.equal(stdout, root)
    assert.ok(command.startsWith('cd -- '))
    assert.equal(
      buildDirectoryCommand("C:\\It's [$]", undefined, 'win32'),
      "Set-Location -LiteralPath 'C:\\It''s [$]' -ErrorAction Stop"
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Windows directory terminal keeps an interactive prompt without command completion UI', () => {
  const script = directoryTerminalBootstrap("C:\\It's [$]", 'C:\\Windows\\powershell.exe')
  assert.ok(script.includes("'-NoExit'"))
  assert.equal(script.includes('ReadKey'), false)
  const encoded = script.match(/'-EncodedCommand', '([^']+)'/)?.[1]
  assert.ok(encoded)
  assert.equal(
    Buffer.from(encoded, 'base64').toString('utf16le'),
    "Set-Location -LiteralPath 'C:\\It''s [$]' -ErrorAction Stop"
  )
})
