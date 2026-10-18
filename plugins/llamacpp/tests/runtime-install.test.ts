import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  lstat,
  rename,
  rm,
  stat
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, basename } from 'node:path'
import { loadBundle, pluginRoot } from './harness'
import type { RuntimeInstallDeps } from '../fork/runtime'
import type { RuntimeVariant } from '../shared/types'

const loadInstaller = (sources: Record<string, string> = {}) =>
  loadBundle(join(pluginRoot, 'fork/runtime.ts'), {
    '@fork/util/Zip': `export const unpack=()=>{throw Error('Unexpected unpack')};export const zipUnpack=unpack`,
    '@fork/util/Axios': `export const getAxiosProxy=()=>false`,
    '@shared/utils': `export const isWindows=()=>false`,
    ...sources
  })
const errno = (code: string) => Object.assign(Error(`rename blocked: ${code}`), { code })
const fixture = async (t: any, platform: 'windows' | 'linux' = 'windows') => {
  const root = await mkdtemp(join(tmpdir(), 'llama-install-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = {
    cacheDir: join(root, 'cache'),
    runtimeRoot: join(root, 'runtimes'),
    stagingRoot: join(root, 'staging')
  }
  const assetName = `llama-b10549-bin-${platform}-x64-cpu.zip`
  const variant: RuntimeVariant = {
    release: 'b10549',
    platform,
    arch: 'x64',
    backend: 'cpu',
    assetName,
    assetUrl: `https://github.com/ggml-org/llama.cpp/releases/download/b10549/${assetName}`,
    size: 8
  }
  const final = join(paths.runtimeRoot, `b10549-${platform}-x64-cpu`)
  const name = platform === 'windows' ? 'llama-server.exe' : 'llama-server'
  const counts = { downloads: 0, probes: 0, moves: 0, waits: [] as number[] }
  const deps: RuntimeInstallDeps & { wait(ms: number): Promise<void> } = {
    mkdir: async (p) => {
      await mkdir(p, { recursive: true })
    },
    download: async (_url, p) => {
      counts.downloads++
      await writeFile(p, 'archive!')
    },
    digest: async () => '',
    size: async (p) => (await stat(p)).size,
    extract: async (_p, dir) => {
      await mkdir(join(dir, 'bin'), { recursive: true })
      await writeFile(join(dir, 'bin', name), 'new runtime')
    },
    exists: async (p) => {
      try {
        await lstat(p)
        return true
      } catch (e) {
        if ((e as any).code === 'ENOENT') return false
        throw e
      }
    },
    rename: async (a, b) => {
      counts.moves++
      await rename(a, b)
    },
    remove: async (p) => {
      await rm(p, { recursive: true, force: true })
    },
    write: async (p, content) => {
      await mkdir(dirname(p), { recursive: true })
      await writeFile(p, content)
    },
    probe: async () => {
      counts.probes++
      return 'b10549'
    },
    findExecutable: async (dir) => join(dir, 'bin', name),
    wait: async (ms) => {
      counts.waits.push(ms)
    }
  }
  return { root, paths, variant, final, counts, deps }
}

test('Windows staging rename retries a short sharing failure without replaying download or probe', async (t) => {
  const { installRuntime } = await loadInstaller()
  const f = await fixture(t)
  let failures = 2
  const move = f.deps.rename
  f.deps.rename = async (a, b) => {
    if (b === f.final && failures-- > 0) throw errno('EPERM')
    await move(a, b)
  }
  const result = await installRuntime(f.variant, f.paths, f.deps)
  assert.equal(await readFile(result.bin, 'utf8'), 'new runtime')
  assert.equal(f.counts.downloads, 1)
  assert.equal(f.counts.probes, 1)
  assert.ok(f.counts.waits.length > 0)
  assert.equal(
    JSON.parse(await readFile(join(f.final, 'flyenv-runtime.json'), 'utf8')).executable,
    join('bin', 'llama-server.exe')
  )
  assert.deepEqual(await readdir(f.paths.stagingRoot), [])
})

test('persistent activation lock is bounded and restores the previous runtime', async (t) => {
  const { installRuntime } = await loadInstaller()
  const f = await fixture(t)
  await mkdir(f.final, { recursive: true })
  await writeFile(join(f.final, 'old.txt'), 'old runtime')
  const move = f.deps.rename
  let attempts = 0
  f.deps.rename = async (a, b) => {
    if (b === f.final && basename(a) === 'runtime') {
      attempts++
      throw errno('EPERM')
    }
    await move(a, b)
  }
  await assert.rejects(installRuntime(f.variant, f.paths, f.deps), /EPERM/)
  assert.ok(attempts > 1 && attempts < 20)
  assert.ok(f.counts.waits.reduce((a, b) => a + b, 0) <= 3000)
  assert.equal(await readFile(join(f.final, 'old.txt'), 'utf8'), 'old runtime')
  assert.equal(f.counts.downloads, 1)
  assert.equal(f.counts.probes, 1)
})

test('Windows backup and rollback directory moves tolerate temporary sharing locks', async (t) => {
  const { installRuntime } = await loadInstaller()
  const f = await fixture(t)
  await mkdir(f.final, { recursive: true })
  await writeFile(join(f.final, 'old.txt'), 'old runtime')
  const move = f.deps.rename
  let backupFailures = 1,
    restoreFailures = 1
  f.deps.rename = async (a, b) => {
    if (a === f.final && backupFailures-- > 0) throw errno('EBUSY')
    if (b === f.final && basename(a) === 'runtime') throw errno('EINVAL')
    if (b === f.final && restoreFailures-- > 0) throw errno('EACCES')
    await move(a, b)
  }
  await assert.rejects(installRuntime(f.variant, f.paths, f.deps), /EINVAL/)
  assert.ok(f.counts.waits.length >= 2)
  assert.equal(await readFile(join(f.final, 'old.txt'), 'utf8'), 'old runtime')
})

test('failed rollback reports both failures and retains the previous runtime backup', async (t) => {
  const { installRuntime } = await loadInstaller()
  const f = await fixture(t)
  await mkdir(f.final, { recursive: true })
  await writeFile(join(f.final, 'old.txt'), 'old runtime')
  const move = f.deps.rename
  f.deps.rename = async (a, b) => {
    if (b === f.final) throw errno(basename(a) === 'runtime' ? 'EINVAL' : 'EPERM')
    await move(a, b)
  }
  await assert.rejects(
    installRuntime(f.variant, f.paths, f.deps),
    (e: Error) => /EINVAL/.test(e.message) && /EPERM/.test(e.message) && /previous-/.test(e.message)
  )
  const backup = (await readdir(f.paths.runtimeRoot)).find((n) => n.includes('.previous-'))!
  assert.equal(await readFile(join(f.paths.runtimeRoot, backup, 'old.txt'), 'utf8'), 'old runtime')
})

for (const scenario of [
  { platform: 'linux' as const, code: 'EPERM' },
  { platform: 'windows' as const, code: 'EINVAL' }
]) {
  test(`${scenario.platform} ${scenario.code} does not retry unrelated rename failures`, async (t) => {
    const { installRuntime } = await loadInstaller()
    const f = await fixture(t, scenario.platform)
    let attempts = 0
    f.deps.rename = async () => {
      attempts++
      throw errno(scenario.code)
    }
    await assert.rejects(installRuntime(f.variant, f.paths, f.deps), new RegExp(scenario.code))
    assert.equal(attempts, 1)
    assert.deepEqual(f.counts.waits, [])
  })
}

test('cleanup errors after successful activation cannot reject the installed runtime', async (t) => {
  const { installRuntime } = await loadInstaller()
  const f = await fixture(t)
  await mkdir(f.final, { recursive: true })
  await writeFile(join(f.final, 'old.txt'), 'old runtime')
  f.deps.remove = async () => {
    throw errno('EPERM')
  }
  const result = await installRuntime(f.variant, f.paths, f.deps)
  assert.equal(await readFile(result.bin, 'utf8'), 'new runtime')
  assert.equal(f.counts.downloads, 1)
})

test('first install creates missing parents and renames into a nonexistent target directory', async (t) => {
  const { installRuntime } = await loadInstaller()
  const f = await fixture(t)
  assert.equal(await f.deps.exists(f.paths.runtimeRoot), false)
  assert.equal(await f.deps.exists(f.final), false)
  const move = f.deps.rename
  f.deps.rename = async (a, b) => {
    assert.equal(await f.deps.exists(dirname(b)), true)
    assert.equal(await f.deps.exists(b), false)
    await move(a, b)
  }
  const result = await installRuntime(f.variant, f.paths, f.deps)
  assert.equal(await readFile(result.bin, 'utf8'), 'new runtime')
  assert.deepEqual(f.counts.waits, [])
})

test('an existing installation is backed up so activation also targets a nonexistent directory', async (t) => {
  const { installRuntime } = await loadInstaller()
  const f = await fixture(t)
  await mkdir(f.final, { recursive: true })
  await writeFile(join(f.final, 'old.txt'), 'old runtime')
  const move = f.deps.rename
  f.deps.rename = async (a, b) => {
    assert.equal(await f.deps.exists(b), false)
    await move(a, b)
  }
  const result = await installRuntime(f.variant, f.paths, f.deps)
  assert.equal(await readFile(result.bin, 'utf8'), 'new runtime')
  assert.deepEqual(await readdir(f.paths.runtimeRoot), [basename(f.final)])
})

test('a missing destination parent produces ENOENT without sharing-error retries', async (t) => {
  const { installRuntime } = await loadInstaller()
  const f = await fixture(t)
  const move = f.deps.rename
  f.deps.rename = async (a, b) => {
    await rm(f.paths.runtimeRoot, { recursive: true })
    await move(a, b)
  }
  await assert.rejects(installRuntime(f.variant, f.paths, f.deps), { code: 'ENOENT' })
  assert.deepEqual(f.counts.waits, [])
})

test('a conflicting target created during activation is preserved alongside the old backup', async (t) => {
  const { installRuntime } = await loadInstaller()
  const f = await fixture(t)
  await mkdir(f.final, { recursive: true })
  await writeFile(join(f.final, 'old.txt'), 'old runtime')
  const move = f.deps.rename
  f.deps.rename = async (a, b) => {
    if (b === f.final && basename(a) === 'runtime') {
      await mkdir(f.final)
      await writeFile(join(f.final, 'foreign.txt'), 'other operation')
      throw errno('EEXIST')
    }
    await move(a, b)
  }
  await assert.rejects(
    installRuntime(f.variant, f.paths, f.deps),
    (e: Error) => /EEXIST/.test(e.message) && /previous-/.test(e.message)
  )
  assert.equal(await readFile(join(f.final, 'foreign.txt'), 'utf8'), 'other operation')
  const backup = (await readdir(f.paths.runtimeRoot)).find((n) => n.includes('.previous-'))!
  assert.equal(await readFile(join(f.paths.runtimeRoot, backup, 'old.txt'), 'utf8'), 'old runtime')
  assert.deepEqual(f.counts.waits, [])
})

for (const code of ['EACCES', 'ENOENT']) {
  test(`default filesystem existence check distinguishes ${code} from an accessible target`, async () => {
    const { removeRuntime } = await loadInstaller({
      'node:fs/promises': `
        export * from 'fs/promises';
        const fail=async()=>{throw Object.assign(Error('${code}'),{code:'${code}'})};
        export const access=fail;
        export const lstat=fail;
        export const rm=async()=>{throw Error('Unexpected removal')};
      `
    })
    const operation = removeRuntime(
      join(tmpdir(), 'llama-test-root', 'runtime'),
      join(tmpdir(), 'llama-test-root')
    )
    if (code === 'ENOENT') await operation
    else await assert.rejects(operation, { code })
  })
}
