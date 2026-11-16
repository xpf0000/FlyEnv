import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MemoryRulesInstaller } from '../fork/rules-installer'
test('all six client paths, project paths and home overrides resolve without user profile writes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'memory-rules-test-'))
  try {
    const installer = new MemoryRulesInstaller(home, {})
    const paths = {
      claudeCode: '.claude/CLAUDE.md',
      codex: '.codex/AGENTS.md',
      antigravity: '.gemini/GEMINI.md',
      copilotCli: '.copilot/copilot-instructions.md',
      openCode: '.config/opencode/AGENTS.md',
      kimi: '.kimi-code/AGENTS.md'
    } as const
    for (const [client, file] of Object.entries(paths)) {
      const result = await installer.install(client, 'Use memory tools.')
      assert.equal(result.path, join(home, file))
      assert.match(await readFile(result.path, 'utf8'), /Use memory tools\./)
    }
    const project = join(home, 'project')
    await mkdir(project)
    assert.equal(
      (await installer.install('claudeCode', 'rules', project)).path,
      join(await realpath(project), 'CLAUDE.md')
    )
    assert.equal(
      (await installer.install('copilotCli', 'rules', project)).path,
      join(await realpath(project), '.github/copilot-instructions.md')
    )
    const custom = new MemoryRulesInstaller(home, { CODEX_HOME: join(home, 'custom') })
    assert.equal((await custom.install('codex', 'rules')).path, join(home, 'custom/AGENTS.md'))
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
test('rules append preserves content, serializes duplicate writes and honors Codex override', async () => {
  const home = await mkdtemp(join(tmpdir(), 'memory-rules-test-'))
  try {
    await mkdir(join(home, '.codex'))
    const file = join(home, '.codex/AGENTS.override.md')
    await writeFile(file, 'My existing instructions.\n')
    const installer = new MemoryRulesInstaller(home, {})
    const results = await Promise.all([
      installer.install('codex', 'memory'),
      installer.install('codex', 'memory')
    ])
    assert.equal(
      results.every((result) => result.path === file),
      true
    )
    // Async path discovery may finish in either order; exactly one write must be skipped.
    assert.equal(results.filter((result) => result.unchanged).length, 1)
    const text = await readFile(file, 'utf8')
    assert.equal(text.startsWith('My existing instructions.\n'), true)
    assert.equal(text.match(/<!-- flyenv-ai-memory:start -->/g)?.length, 1)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
test('unsafe, malformed, oversized and non-UTF8 instructions fail without replacing original bytes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'memory-rules-test-'))
  try {
    const installer = new MemoryRulesInstaller(home, {})
    await mkdir(join(home, '.codex'))
    const file = join(home, '.codex/AGENTS.md')
    for (const content of [
      Buffer.from('<!-- flyenv-ai-memory:start -->\nbroken'),
      Buffer.alloc(32760, 65),
      Buffer.from([0xff, 0xfe])
    ]) {
      await writeFile(file, content)
      await assert.rejects(installer.install('codex', 'memory rules'))
      assert.deepEqual(await readFile(file), content)
    }
    await assert.rejects(installer.install('generic', 'rules'))
    await assert.rejects(installer.install('codex', 'rules', 'relative/path'))
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('instruction symlinks are rejected without changing their target', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'memory-rules-test-'))
  try {
    const installer = new MemoryRulesInstaller(home, {})
    await mkdir(join(home, '.codex'))
    const file = join(home, '.codex/AGENTS.md')
    await writeFile(join(home, 'target'), 'keep')
    try {
      await symlink(join(home, 'target'), file)
    } catch (error) {
      if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('Windows file symlink privilege unavailable')
        return
      }
      throw error
    }
    await assert.rejects(installer.install('codex', 'rules'))
    assert.equal(await readFile(join(home, 'target'), 'utf8'), 'keep')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
