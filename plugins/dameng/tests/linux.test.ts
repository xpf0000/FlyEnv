import assert from 'node:assert/strict'
import test from 'node:test'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLinuxOperations, parseLinuxLoopDevice, parseLinuxMountTarget } from '../fork/linux'
import type { CommandOptions } from '../fork/runtime'

test('mount selectors accept one exact loop device and reject ambiguous or nonabsolute targets', () => {
  assert.equal(parseLinuxLoopDevice('Mapped file /tmp/dm.iso as /dev/loop12.\n'), '/dev/loop12')
  for (const text of ['Mapped /dev/sda', '/dev/loop1p2', '/dev/loop1 /dev/loop2']) {
    assert.throws(() => parseLinuxLoopDevice(text), /UNKNOWN/)
  }
  assert.equal(
    parseLinuxMountTarget('{"filesystems":[{"target":"/media/x/DM 8"}]}'),
    '/media/x/DM 8'
  )
  for (const text of [
    '{}',
    '{"filesystems":[]}',
    '{"filesystems":[{"target":"relative"}]}',
    '{"filesystems":[{"target":"/a"},{"target":"/b"}]}'
  ]) {
    assert.throws(() => parseLinuxMountTarget(text), /mount/i)
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dm-linux-test-'))
  const media = join(root, 'media'),
    install = join(root, 'installation')
  await mkdir(media)
  await writeFile(join(media, 'DMInstall.bin'), '#!/bin/sh\nexit 0\n')
  const calls: { bin: string; args: string[]; options: CommandOptions }[] = []
  let installFailure = '',
    complete = true,
    cleanupFailure = false,
    sharedConflict = false,
    mountFailure = false,
    removeEngine = true,
    invalidEngineTree = false
  const operations = createLinuxOperations({
    env: {},
    exists: async (file) =>
      file === '/etc/dm_svc.conf'
        ? sharedConflict
        : file.startsWith('/usr/bin/') || file === '/bin/ps'
          ? true
          : access(file)
              .then(() => true)
              .catch(() => false),
    command: async (bin, args, options = {}) => {
      calls.push({ bin, args, options })
      if (bin === '/bin/ps') return ''
      if (bin === '/usr/bin/findmnt') return JSON.stringify({ filesystems: [{ target: media }] })
      if (args[0] === 'loop-setup') {
        assert.deepEqual(args.slice(1), ['--file', join(root, 'official.iso'), '--read-only'])
        return `Mapped file ${join(root, 'official.iso')} as /dev/loop12.\n`
      }
      if (args[0] === 'unmount' && cleanupFailure) throw new Error('media busy')
      if (args[0] === 'mount' && mountFailure) throw new Error('mount response failed')
      if (bin.endsWith('DMInstall.bin')) {
        assert.equal(args[0], '-q')
        assert.equal(await readFile(args[1], 'utf8'), '<DATABASE><INIT_DB>N</INIT_DB></DATABASE>')
        assert.equal(options.env?.DM_INSTALL_TMPDIR, options.cwd)
        assert.ok(bin.startsWith(options.cwd!))
        await mkdir(join(install, 'bin'), { recursive: true })
        await writeFile(join(install, 'bin', 'dmserver'), 'engine')
        if (complete)
          for (const name of ['dminit', 'disql']) await writeFile(join(install, 'bin', name), name)
        if (invalidEngineTree) {
          await rm(join(install, 'bin'), { recursive: true })
          await writeFile(join(install, 'bin'), 'partial')
        }
        if (installFailure) throw new Error(installFailure)
      }
      if (bin.endsWith('uninstall.sh')) {
        assert.deepEqual(args, ['-i'])
        assert.equal(options.input, 'y\n')
        if (removeEngine) await rm(join(install, 'bin', 'dmserver'))
      }
      return ''
    }
  })
  return {
    root,
    install,
    calls,
    operations,
    set: (value: {
      failure?: string
      complete?: boolean
      cleanup?: boolean
      conflict?: boolean
      mountFailure?: boolean
      removeEngine?: boolean
      invalidEngineTree?: boolean
    }) => {
      installFailure = value.failure ?? ''
      complete = value.complete ?? true
      cleanupFailure = value.cleanup ?? false
      sharedConflict = value.conflict ?? false
      mountFailure = value.mountFailure ?? false
      removeEngine = value.removeEngine ?? true
      invalidEngineTree = value.invalidEngineTree ?? false
    },
    cleanup: async () => {
      for (const call of calls) {
        if (call.bin.endsWith('DMInstall.bin') && call.options.cwd)
          await rm(call.options.cwd, { recursive: true, force: true })
      }
      await rm(root, { recursive: true, force: true })
    }
  }
}

test('official installation survives supplementary unmount failure and releases loop independently', async () => {
  const f = await fixture()
  f.set({ cleanup: true })
  try {
    const result = await f.operations.install(
      join(f.root, 'official.iso'),
      f.install,
      '<DATABASE><INIT_DB>N</INIT_DB></DATABASE>',
      () => {}
    )
    assert.equal(result.installed, true)
    assert.equal(result.handoffError, undefined)
    assert.match(result.warning!, /media busy/)
    assert.ok(
      f.calls.some((call) => call.args[0] === 'loop-delete' && call.args[2] === '/dev/loop12')
    )
    const installer = f.calls.find((call) => call.bin.endsWith('DMInstall.bin'))!
    await assert.rejects(access(installer.options.cwd!), /ENOENT/)
  } finally {
    await f.cleanup()
  }
})

test('mount failure releases the identified loop without invoking the installer', async () => {
  const f = await fixture()
  f.set({ mountFailure: true })
  try {
    await assert.rejects(
      f.operations.install(join(f.root, 'official.iso'), f.install, '<DATABASE/>', () => {}),
      /mount response failed/
    )
    assert.ok(f.calls.some((call) => call.args[0] === 'unmount'))
    assert.ok(f.calls.some((call) => call.args[0] === 'loop-delete'))
    assert.ok(!f.calls.some((call) => call.bin.endsWith('DMInstall.bin')))
  } finally {
    await f.cleanup()
  }
})

test('official uninstaller returning without removing the engine cannot report success', async () => {
  const f = await fixture()
  f.set({ removeEngine: false })
  try {
    await mkdir(join(f.install, 'bin'), { recursive: true })
    await writeFile(join(f.install, 'bin', 'dmserver'), 'keep')
    await writeFile(join(f.install, 'uninstall.sh'), '#!/bin/sh\n')
    await assert.rejects(f.operations.uninstall(f.install), /DAMENG_OUTCOME_UNKNOWN/)
    assert.equal(await readFile(join(f.install, 'bin', 'dmserver'), 'utf8'), 'keep')
  } finally {
    await f.cleanup()
  }
})

test('unverifiable engine files after installer execution retain an unknown outcome', async () => {
  const f = await fixture()
  f.set({ invalidEngineTree: true })
  try {
    await assert.rejects(
      f.operations.install(
        join(f.root, 'official.iso'),
        f.install,
        '<DATABASE><INIT_DB>N</INIT_DB></DATABASE>',
        () => {}
      ),
      /DAMENG_OUTCOME_UNKNOWN/
    )
    assert.equal(await readFile(join(f.install, 'bin'), 'utf8'), 'partial')
  } finally {
    await f.cleanup()
  }
})

test('installer failure preserves complete engine facts while incomplete writes prevent replay', async () => {
  for (const complete of [true, false]) {
    const f = await fixture()
    f.set({ failure: 'vendor failed', complete })
    try {
      const operation = f.operations.install(
        join(f.root, 'official.iso'),
        f.install,
        '<DATABASE><INIT_DB>N</INIT_DB></DATABASE>',
        () => {}
      )
      if (complete) {
        const result = await operation
        assert.equal(result.installed, true)
        assert.match(result.handoffError!, /vendor failed/)
        assert.equal(result.warning, undefined)
      } else await assert.rejects(operation, /DAMENG_OUTCOME_UNKNOWN/)
      assert.equal(await readFile(join(f.install, 'bin', 'dmserver'), 'utf8'), 'engine')
      assert.ok(f.calls.some((call) => call.args[0] === 'unmount'))
      assert.ok(f.calls.some((call) => call.args[0] === 'loop-delete'))
    } finally {
      await f.cleanup()
    }
  }
})

test('external shared configuration prevents mounting and official uninstall retains data', async () => {
  const f = await fixture()
  f.set({ conflict: true })
  try {
    await assert.rejects(
      f.operations.install(join(f.root, 'official.iso'), f.install, '<DATABASE/>', () => {}),
      /external|shared/i
    )
    assert.equal(f.calls.length, 0)
    await mkdir(join(f.install, 'bin'), { recursive: true })
    await writeFile(join(f.install, 'bin', 'dmserver'), 'engine')
    await writeFile(join(f.install, 'uninstall.sh'), '#!/bin/sh\n')
    await writeFile(join(f.install, 'user.data'), 'keep')
    assert.deepEqual(await f.operations.uninstall(f.install), { uninstalled: true })
    assert.equal(await readFile(join(f.install, 'user.data'), 'utf8'), 'keep')
  } finally {
    await f.cleanup()
  }
})
