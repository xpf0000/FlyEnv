import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  inspectManagedVersionDirectory,
  isStrictDescendant,
  removeManagedVersionDirectory
} from '../src/main/core/ManagedVersionDirectory'
import {
  FORCE_DELETE_CONFIRMATION,
  type ManagedVersionDirectory
} from '../src/shared/VersionDelete'
import {
  VersionDeleteOperation,
  type VersionDeleteRequest
} from '../src/render/components/ServiceManager/VersionDeleteOperation'

let checks = 0
const check = async (name: string, fn: () => void | Promise<void>) => {
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'flyenv-version-delete-')))
const app = join(temporary, 'app')
const laragon = join(temporary, 'laragon')
const executable = async (directory: string) => {
  await mkdir(directory, { recursive: true })
  const bin = join(directory, 'php-cgi.exe')
  await writeFile(bin, 'fixture executable')
  return { path: directory, bin }
}
try {
  const managed = await executable(join(app, 'php-8.3'))
  const external = await executable(join(laragon, 'bin/php/php-8.3'))
  await mkdir(join(laragon, 'www'), { recursive: true })
  await writeFile(join(laragon, 'www/project.txt'), 'keep user work')
  const snapshot = await inspectManagedVersionDirectory(app, managed)

  await check('managed package is eligible', () => assert.equal(snapshot.path, managed.path))
  await check('Laragon root and PHP directory are refused', async () => {
    for (const target of [external, { ...external, path: laragon }]) {
      await assert.rejects(inspectManagedVersionDirectory(app, target), /not managed/)
    }
    assert.equal(await readFile(join(laragon, 'www/project.txt'), 'utf8'), 'keep user work')
  })
  await check('root, sibling prefix, relative and missing paths are refused', async () => {
    for (const path of [
      app,
      temporary,
      join(temporary, 'app-other'),
      '.',
      '',
      join(app, 'missing')
    ]) {
      await assert.rejects(inspectManagedVersionDirectory(app, { ...managed, path }))
    }
    await assert.rejects(inspectManagedVersionDirectory(undefined, managed))
  })
  await check('executable must belong to the selected directory', async () => {
    await assert.rejects(inspectManagedVersionDirectory(app, { ...managed, bin: external.bin }))
    await assert.rejects(
      inspectManagedVersionDirectory(app, { path: managed.path, bin: managed.path })
    )
  })
  await check('Windows drive, UNC, mixed separator and prefix boundaries', () => {
    for (const target of [
      'C:\\FlyEnv\\app',
      'C:\\FlyEnv\\app-other\\php',
      'D:\\FlyEnv\\app\\php',
      'php',
      'C:\\FlyEnv\\app\\..\\laragon'
    ]) {
      assert.equal(isStrictDescendant('C:\\FlyEnv\\app', target, true), false, target)
    }
    assert.equal(isStrictDescendant('C:\\FlyEnv\\app', 'c:/flyenv/app/php-8.3', true), true)
    assert.equal(
      isStrictDescendant('\\\\host\\share\\app', '\\\\host\\share\\app\\php', true),
      true
    )
    assert.equal(
      isStrictDescendant('\\\\host\\share\\app', '\\\\other\\share\\app\\php', true),
      false
    )
    assert.equal(isStrictDescendant('/app', '/app-other/php', false), false)
  })
  const linked = join(app, 'linked')
  await symlink(laragon, linked, process.platform === 'win32' ? 'junction' : 'dir')
  await check('target and ancestor junctions cannot claim external directories', async () => {
    await assert.rejects(
      inspectManagedVersionDirectory(app, {
        path: linked,
        bin: join(linked, 'bin/php/php-8.3/php-cgi.exe')
      }),
      /symbolic link|junction/
    )
    await assert.rejects(
      inspectManagedVersionDirectory(app, {
        path: join(linked, 'bin/php/php-8.3'),
        bin: join(linked, 'bin/php/php-8.3/php-cgi.exe')
      }),
      /symbolic link|junction/
    )
  })
  await check('canonical app-root aliases remain usable', async () => {
    const alias = join(temporary, 'app-alias')
    await symlink(app, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const first = await inspectManagedVersionDirectory(alias, {
      path: join(alias, 'php-8.3'),
      bin: join(alias, 'php-8.3/php-cgi.exe')
    })
    assert.equal((await inspectManagedVersionDirectory(alias, first)).identity, first.identity)
  })
  await check('incorrect confirmation never deletes files', async () => {
    for (const confirmation of [
      '',
      'force delete',
      'Force delete',
      ' Force Delete',
      'Force Delete ',
      'Force Delete\n'
    ]) {
      await assert.rejects(
        removeManagedVersionDirectory(app, snapshot, confirmation),
        /Type Force Delete/
      )
    }
    assert.equal(existsSync(managed.bin), true)
  })
  await check('directory replacement after confirmation is refused', async () => {
    await rename(managed.path, managed.path + '-old')
    await executable(managed.path)
    await assert.rejects(
      removeManagedVersionDirectory(app, snapshot, FORCE_DELETE_CONFIRMATION),
      /changed/
    )
    assert.equal(existsSync(managed.bin), true)
  })
  await check('junction replacement after confirmation cannot delete Laragon', async () => {
    const candidate = await executable(join(app, 'replace-with-link'))
    const expected = await inspectManagedVersionDirectory(app, candidate)
    await rename(candidate.path, candidate.path + '-old')
    await symlink(laragon, candidate.path, process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(removeManagedVersionDirectory(app, expected, FORCE_DELETE_CONFIRMATION))
    assert.equal(await readFile(join(laragon, 'www/project.txt'), 'utf8'), 'keep user work')
  })
  await check('successful recursive removal does not follow an internal junction', async () => {
    const candidate = await executable(join(app, 'delete-success'))
    await symlink(
      laragon,
      join(candidate.path, 'external'),
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    await removeManagedVersionDirectory(
      app,
      await inspectManagedVersionDirectory(app, candidate),
      FORCE_DELETE_CONFIRMATION
    )
    assert.equal(existsSync(candidate.path), false)
    assert.equal(await readFile(join(laragon, 'www/project.txt'), 'utf8'), 'keep user work')
  })
  await check('a vanished target propagates failure', async () => {
    const candidate = await executable(join(app, 'vanished'))
    const expected = await inspectManagedVersionDirectory(app, candidate)
    await rm(candidate.path, { recursive: true })
    await assert.rejects(removeManagedVersionDirectory(app, expected, FORCE_DELETE_CONFIRMATION))
  })

  const request: VersionDeleteRequest = { ...managed, typeFlag: 'php', version: '8.3' }
  const directory: ManagedVersionDirectory = { ...managed, identity: 'fixture-identity' }
  const harness = () => {
    const events: string[] = []
    const deps = {
      inspect: async () => directory as ManagedVersionDirectory | undefined,
      remove: async () => {
        events.push('remove')
      },
      stop: async () => {
        events.push('stop')
        return true as string | boolean
      },
      committed: () => {
        events.push('committed')
      },
      refresh: async () => {
        events.push('refresh')
      },
      error: (message: string) => {
        events.push('error:' + message)
      },
      refreshError: () => {
        events.push('refresh-error')
      }
    }
    return { events, deps, operation: new VersionDeleteOperation(deps) }
  }
  await check('exact confirmation is also enforced by the operation owner', async () => {
    const { events, operation } = harness()
    assert.equal(await operation.remove(request, directory, 'force delete', () => {}), false)
    assert.deepEqual(events, [])
  })
  await check('ownership failure stops before service interaction', async () => {
    const { events, deps, operation } = harness()
    deps.inspect = async () => undefined
    assert.equal(
      await operation.remove(request, directory, FORCE_DELETE_CONFIRMATION, () => {
        events.push('done')
      }),
      false
    )
    assert.deepEqual(events, [
      'error:The version directory changed or is not managed by FlyEnv',
      'done'
    ])
  })
  await check('stop errors and cancellation preserve the installed record', async () => {
    for (const stopped of [false, 'cancelled', 'service is still running']) {
      const { events, deps, operation } = harness()
      deps.stop = async () => stopped
      assert.equal(
        await operation.remove(request, directory, FORCE_DELETE_CONFIRMATION, () => {
          events.push('done')
        }),
        false
      )
      assert.deepEqual(events, ['error:' + String(stopped), 'done'])
    }
  })
  await check(
    'deletion failure leaves metadata and version list intact and allows retry',
    async () => {
      const { events, deps, operation } = harness()
      deps.remove = async () => {
        throw new Error('EACCES')
      }
      assert.equal(
        await operation.remove(request, directory, FORCE_DELETE_CONFIRMATION, () => {
          events.push('done')
        }),
        false
      )
      assert.deepEqual(events, ['stop', 'error:EACCES', 'done'])
      assert.equal(operation.isDeleting(request.path), false)
      deps.remove = async () => {
        events.push('remove')
      }
      assert.equal(
        await operation.remove(request, directory, FORCE_DELETE_CONFIRMATION, () => {}),
        true
      )
      assert.deepEqual(events.slice(-4), ['stop', 'remove', 'committed', 'refresh'])
    }
  )
  await check('duplicates, page closure and re-entry share one in-flight operation', async () => {
    const { events, deps, operation } = harness()
    let release!: (value: boolean) => void
    deps.stop = () =>
      new Promise<boolean>((resolve) => {
        events.push('stop')
        release = resolve
      })
    const input = { ...request }
    const first = operation.remove(input, directory, FORCE_DELETE_CONFIRMATION, () => {
      events.push('first-done')
    })
    input.bin = external.bin
    const second = operation.remove(request, directory, FORCE_DELETE_CONFIRMATION, () => {
      events.push('second-done')
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(operation.isDeleting(request.path), true)
    assert.deepEqual(events, ['stop'])
    release(true)
    assert.deepEqual(await Promise.all([first, second]), [true, true])
    assert.equal(events.filter((event) => event === 'remove').length, 1)
    assert.equal(events.filter((event) => event.endsWith('-done')).length, 2)
    assert.equal(operation.isDeleting(request.path), false)
  })
  await check('refresh failure preserves successful deletion and cannot replay it', async () => {
    const { events, deps, operation } = harness()
    deps.refresh = async () => {
      events.push('refresh')
      throw new Error('storage failed')
    }
    assert.equal(
      await operation.remove(request, directory, FORCE_DELETE_CONFIRMATION, () => {
        events.push('done')
      }),
      true
    )
    assert.deepEqual(events, ['stop', 'remove', 'committed', 'refresh', 'refresh-error', 'done'])
  })
  await check('an independent refresh still runs if local metadata update fails', async () => {
    const { events, deps, operation } = harness()
    deps.committed = () => {
      throw new Error('metadata failed')
    }
    assert.equal(
      await operation.remove(request, directory, FORCE_DELETE_CONFIRMATION, () => {}),
      true
    )
    assert.deepEqual(events, ['stop', 'remove', 'refresh', 'refresh-error'])
  })
  console.log(
    `${checks} version deletion checks passed; all filesystem operations used ${temporary}`
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
