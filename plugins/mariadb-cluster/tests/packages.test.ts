import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { preparePackageCommand, cleanupPackageCommand, removeStaticPackage } from '../fork/packages'
test('package scripts have isolated identities, preserve the real exit code and never follow MacPorts dependents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdbc-package-command-'))
  try {
    const opts = { staticDir: join(process.cwd(), 'static/macOS'), arm: true }
    // Use the host platform resource directory, with its sh directory.
    const actual = { ...opts, staticDir: join(root, 'static') }
    await mkdir(join(actual.staticDir, 'sh'), { recursive: true })
    for (const name of ['brew-cmd.sh', 'port-cmd.sh'])
      await writeFile(
        join(actual.staticDir, 'sh', name),
        await readFile(join(process.cwd(), 'static/sh/macOS', name))
      )
    const command = await preparePackageCommand(root, 'Macports', 'mariadb-10.11', true, actual)
    const text = await readFile(command.path, 'utf8')
    assert.match(text, /port uninstall -v mariadb-10\.11 mariadb-10\.11-server/)
    assert.doesNotMatch(text, /follow-dependents|deactivate libuuid/)
    const next = await preparePackageCommand(root, 'Homebrew', 'mariadb@10.11', false, actual)
    assert.notEqual(command.path, next.path)
    assert.deepEqual(next.args, ['-arm64', 'install', 'mariadb@10.11'])
    await assert.rejects(
      preparePackageCommand(root, 'Homebrew', '--force', true, actual),
      /identity/
    )
    await cleanupPackageCommand(root, command.token)
    await assert.rejects(readFile(command.path))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('static removal refuses running instances, foreign processes and aliased database files before deleting a managed package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mdbc-package-remove-'))
  try {
    const app = join(root, 'app'),
      target = join(app, 'mariadb'),
      data = join(target, 'business-data')
    await mkdir(data, { recursive: true })
    await writeFile(join(data, 'keep'), 'database')
    const instance = {
      id: 'a',
      engine: { bin: join(target, 'bin/mariadbd') },
      dataDir: join(root, 'outside')
    }
    const catalog: any = {
      root: join(root, 'catalog'),
      platform: 'macOS',
      read: async () => ({ instances: [instance] }),
      operations: { runMany: (_ids: any, _op: any, task: any) => task() }
    }
    const empty = async () => [],
      stopped = async () => [{ id: 'a', state: 'stopped' }]
    await assert.rejects(
      removeStaticPackage(catalog, target, app, empty, async () => [{ id: 'a', state: 'running' }]),
      /running|unknown/
    )
    await assert.rejects(
      removeStaticPackage(
        catalog,
        target,
        app,
        async () => [
          {
            COMMAND:
              join(target, 'bin/mariadbd').replace(/\\/g, '/') +
              ' --defaults-file=/tmp/native.cnf'
          }
        ],
        stopped
      ),
      /process/
    )
    // Windows directory junctions do not require the symlink privilege.
    await symlink(data, instance.dataDir, process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(
      removeStaticPackage(catalog, target, app, empty, stopped),
      /database files/
    )
    assert.equal(await readFile(join(data, 'keep'), 'utf8'), 'database')
    await rm(instance.dataDir)
    await removeStaticPackage(catalog, target, app, empty, stopped)
    await assert.rejects(readFile(join(data, 'keep')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Homebrew bootstrap prepares a private localized host script without executing it', async () => {
  const api = (await import('../fork/packages')) as any
  const root = await mkdtemp(join(tmpdir(), 'mdbc-brew-bootstrap-'))
  try {
    const staticDir = join(root, 'static')
    await mkdir(join(staticDir, 'sh'), { recursive: true })
    await writeFile(join(staticDir, 'sh/brew-install.sh'), '#!/bin/sh\nprintf zh')
    await writeFile(join(staticDir, 'sh/brew-install-en.sh'), '#!/bin/sh\nprintf en')
    const zh = await api.prepareHomebrewInstall(root, staticDir, 'zh')
    const en = await api.prepareHomebrewInstall(root, staticDir, 'en')
    assert.notEqual(zh.path, en.path)
    assert.equal(await readFile(zh.path, 'utf8'), '#!/bin/sh\nprintf zh')
    assert.equal(await readFile(en.path, 'utf8'), '#!/bin/sh\nprintf en')
    assert.deepEqual(en.args, [])
    await cleanupPackageCommand(root, zh.token)
    await assert.rejects(readFile(zh.path))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
