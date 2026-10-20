import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { preparePackageCommand, cleanupPackageCommand, removeStaticPackage } from '../fork/packages'
test('package scripts have isolated identities, preserve the real exit code and never follow MacPorts dependents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-package-command-'))
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
    const command = await preparePackageCommand(root, 'Macports', 'mysql8', true, actual)
    const text = await readFile(command.path, 'utf8')
    assert.match(text, /port uninstall -v mysql8 mysql8-server/)
    assert.doesNotMatch(text, /follow-dependents|deactivate libuuid/)
    const next = await preparePackageCommand(root, 'Homebrew', 'mysql@8.4', false, actual)
    assert.notEqual(command.path, next.path)
    assert.deepEqual(next.args, ['-arm64', 'install', 'mysql@8.4'])
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
  const root = await mkdtemp(join(tmpdir(), 'mc-package-remove-'))
  try {
    const app = join(root, 'app'),
      target = join(app, 'mysql'),
      data = join(target, 'business-data')
    await mkdir(data, { recursive: true })
    await writeFile(join(data, 'keep'), 'database')
    const instance = {
      id: 'a',
      engine: { bin: join(target, 'bin/mysqld') },
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
        async () => [{ COMMAND: join(target, 'bin/mysqld') + ' --defaults-file=/tmp/native.cnf' }],
        stopped
      ),
      /process/
    )
    await symlink(data, instance.dataDir)
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
