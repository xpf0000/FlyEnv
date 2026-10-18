import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CommandShortcutsController, type ControllerDependencies } from '../render/controller'

function fixture(overrides: Partial<ControllerDependencies> = {}) {
  let saved: unknown
  const requests: unknown[] = []
  const deps: ControllerDependencies = {
    read: async () => {
      throw new Error('no found')
    },
    write: async (value) => {
      saved = structuredClone(value)
    },
    launch: async (request) => {
      requests.push(request)
    },
    notify: () => {},
    openPath: async () => {},
    id: (() => {
      let id = 0
      return () => `id-${++id}`
    })(),
    ...overrides
  }
  const manager = new CommandShortcutsController(deps)
  return { manager, requests, saved: () => saved }
}

async function populated(overrides: Partial<ControllerDependencies> = {}) {
  const data = fixture(overrides)
  await data.manager.load()
  await data.manager.saveFolder({ name: 'App', path: '/tmp/app' })
  await data.manager.saveCommand(data.manager.folders[0].id, {
    description: 'Dev',
    command: 'npm run dev'
  })
  return data
}

test('first use loads once and round-trips folders with their commands', async () => {
  const data = await populated()
  const second = fixture({ read: async () => structuredClone(data.saved()) })
  await second.manager.load()
  assert.deepEqual(second.manager.folders, data.manager.folders)
  const folder = second.manager.folders[0]
  await second.manager.saveFolder({ ...folder, name: 'Edited' }, folder.id)
  assert.equal(second.manager.folders[0].commands.length, 1)
  await second.manager.removeCommand(folder.id, folder.commands[0].id)
  assert.equal(second.manager.folders[0].commands.length, 0)
  await second.manager.removeFolder(folder.id)
  assert.deepEqual(second.manager.folders, [])
})

test('storage I/O failure and malformed data block mutation until load succeeds', async () => {
  for (const read of [
    async () => {
      throw new Error('disk failed')
    },
    async () => ({ version: 1, folders: [{}] })
  ]) {
    let writes = 0
    const { manager } = fixture({
      read,
      write: async () => {
        writes++
      }
    })
    assert.equal(await manager.load(), false)
    assert.equal(await manager.saveFolder({ name: 'App', path: '/tmp' }), false)
    assert.equal(writes, 0)
    assert.equal(manager.initialized, false)
    assert.ok(manager.loadError)
  }
})

test('save failure preserves published data and successful retry persists', async () => {
  let fail = false
  const { manager } = await populated({
    write: async () => {
      if (fail) throw new Error('quota')
    }
  })
  const before = structuredClone(manager.folders)
  fail = true
  assert.equal(await manager.removeFolder(before[0].id), false)
  assert.deepEqual(manager.folders, before)
  fail = false
  assert.equal(await manager.removeFolder(before[0].id), true)
})

test('launch snapshot survives page re-entry, duplicate launch is ignored, and retry is explicit', async () => {
  let finish!: () => void
  let fail!: (error: Error) => void
  let calls = 0
  let received: unknown
  const { manager } = await populated({
    launch: async (request) => {
      calls++
      received = request
      return new Promise<void>((resolve, reject) => {
        finish = resolve
        fail = reject
      })
    }
  })
  const folder = manager.folders[0]
  const command = folder.commands[0]
  const first = manager.run(folder.id, command.id)
  assert.equal(manager.isOpening(command.id), true)
  assert.equal(await manager.run(folder.id, command.id), false)
  await manager.load()
  assert.equal(manager.isOpening(command.id), true)
  await manager.saveFolder({ ...folder, path: '/tmp/changed' }, folder.id)
  assert.deepEqual(received, { path: '/tmp/app', command: 'npm run dev' })
  fail(new Error('terminal unavailable'))
  assert.equal(await first, false)
  assert.equal(manager.isOpening(command.id), false)
  assert.equal(manager.operations[command.id].status, 'failed')
  const retry = manager.run(folder.id, command.id)
  finish()
  assert.equal(await retry, true)
  assert.equal(calls, 2)
  assert.equal(manager.operations[command.id].status, 'opened')
})

test('unknown folder/command cannot launch and blank input cannot persist', async () => {
  const { manager, requests } = await populated()
  assert.equal(await manager.run('missing', 'missing'), false)
  assert.equal(
    await manager.saveCommand(manager.folders[0].id, { description: ' ', command: ' ' }),
    false
  )
  assert.deepEqual(requests, [])
})

test('load and save are single-flight', async () => {
  let reads = 0
  let finish!: (value: unknown) => void
  let writeDone!: () => void
  const { manager } = fixture({
    read: () => {
      reads++
      return new Promise((resolve) => {
        finish = resolve
      })
    },
    write: () =>
      new Promise<void>((resolve) => {
        writeDone = resolve
      })
  })
  const first = manager.load()
  const second = manager.load()
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(reads, 1)
  finish({ version: 1, folders: [] })
  assert.equal(await first, true)
  const save = manager.saveFolder({ name: 'App', path: '/tmp' })
  assert.equal(manager.saving, true)
  assert.equal(await manager.saveFolder({ name: 'Ignored', path: '/tmp' }), false)
  assert.deepEqual(manager.folders, [])
  writeDone()
  assert.equal(await save, true)
  assert.equal(manager.folders.length, 1)
})

test('different commands open independently', async () => {
  const finish: (() => void)[] = []
  const { manager } = await populated({
    launch: () =>
      new Promise<void>((resolve) => {
        finish.push(resolve)
      })
  })
  const folder = manager.folders[0]
  await manager.saveCommand(folder.id, { description: 'Build', command: 'npm run build' })
  const [one, two] = manager.folders[0].commands
  const first = manager.run(folder.id, one.id)
  const second = manager.run(folder.id, two.id)
  assert.equal(finish.length, 2)
  finish[0]()
  assert.equal(await first, true)
  assert.equal(manager.isOpening(two.id), true)
  finish[1]()
  assert.equal(await second, true)
})

test('failed initial read can retry without overwriting stored data', async () => {
  let fail = true
  let writes = 0
  const { manager } = fixture({
    read: async () => {
      if (fail) throw new Error('database unavailable')
      return { version: 1, folders: [] }
    },
    write: async () => {
      writes++
    }
  })
  assert.equal(await manager.load(), false)
  assert.ok(manager.loadError)
  assert.equal(writes, 0)
  fail = false
  assert.equal(await manager.load(), true)
  assert.equal(manager.loadError, '')
  assert.equal(manager.initialized, true)
})

test('folder and command drag order persists and survives reload without changing ownership', async () => {
  const data = await populated()
  const first = data.manager.folders[0]
  await data.manager.saveCommand(first.id, { description: 'Build', command: 'npm run build' })
  await data.manager.saveFolder({ name: 'Other', path: '/tmp/other' })
  const second = data.manager.folders[1]
  const commands = data.manager.folders[0].commands.map((item) => item.id).reverse()
  assert.equal(await data.manager.reorderCommands(first.id, commands), true)
  assert.equal(await data.manager.reorderFolders([second.id, first.id]), true)
  const reloaded = fixture({ read: async () => structuredClone(data.saved()) }).manager
  await reloaded.load()
  assert.deepEqual(
    reloaded.folders.map((folder) => folder.id),
    [second.id, first.id]
  )
  assert.deepEqual(
    reloaded.folders[1].commands.map((item) => item.id),
    commands
  )
  assert.equal(reloaded.folders[1].commands[0].command, 'npm run build')
  assert.deepEqual(reloaded.folders[0].commands, [])
})

test('invalid and unchanged drag orders do not write or lose saved items', async () => {
  let writes = 0
  const { manager } = await populated({
    write: async () => {
      writes++
    }
  })
  await manager.saveFolder({ name: 'Other', path: '/tmp/other' })
  const before = structuredClone(manager.folders)
  const [first, second] = before
  const count = writes
  for (const ids of [[], [first.id], [first.id, first.id], [first.id, 'missing']]) {
    assert.equal(await manager.reorderFolders(ids), false)
  }
  assert.equal(await manager.reorderCommands(first.id, []), false)
  assert.equal(await manager.reorderCommands(second.id, [first.commands[0].id]), false)
  assert.equal(await manager.reorderCommands('missing', []), false)
  assert.equal(await manager.reorderFolders([first.id, second.id]), true)
  assert.equal(await manager.reorderCommands(first.id, [first.commands[0].id]), true)
  assert.equal(writes, count)
  assert.deepEqual(manager.folders, before)
})

test('failed drag save retains the old order and retry persists only once', async () => {
  let fail = false
  const { manager } = await populated({
    write: async () => {
      if (fail) throw new Error('quota')
    }
  })
  await manager.saveCommand(manager.folders[0].id, { description: 'Build', command: 'build' })
  await manager.saveFolder({ name: 'Other', path: '/tmp/other' })
  const before = structuredClone(manager.folders)
  const folderIds = before.map((folder) => folder.id).reverse()
  const commandIds = before[0].commands.map((item) => item.id).reverse()
  fail = true
  assert.equal(await manager.reorderFolders(folderIds), false)
  assert.equal(await manager.reorderCommands(before[0].id, commandIds), false)
  assert.deepEqual(manager.folders, before)
  assert.equal(manager.saving, false)
  fail = false
  assert.equal(await manager.reorderFolders(folderIds), true)
  assert.equal(await manager.reorderCommands(before[0].id, commandIds), true)
  assert.deepEqual(
    manager.folders.map((folder) => folder.id),
    folderIds
  )
  assert.deepEqual(
    manager.folders[1].commands.map((item) => item.id),
    commandIds
  )
})

test('drag save stays owned by the controller across page re-entry and rejects simultaneous edits', async () => {
  let hold = false
  let finish!: () => void
  const { manager } = await populated({
    write: async () => {
      if (hold)
        await new Promise<void>((resolve) => {
          finish = resolve
        })
    }
  })
  await manager.saveFolder({ name: 'Other', path: '/tmp/other' })
  const before = structuredClone(manager.folders)
  const ids = before.map((folder) => folder.id).reverse()
  hold = true
  const pending = manager.reorderFolders(ids)
  assert.equal(manager.saving, true)
  assert.equal(await manager.load(), true)
  assert.equal(await manager.reorderFolders(ids), false)
  assert.equal(await manager.removeFolder(before[0].id), false)
  assert.deepEqual(manager.folders, before)
  finish()
  assert.equal(await pending, true)
  assert.deepEqual(
    manager.folders.map((folder) => folder.id),
    ids
  )
})

test('legacy custom icon is ignored and new folders need only name and path', async () => {
  const { manager } = fixture({
    read: async () => ({
      version: 1,
      folders: [{ id: 'legacy', icon: '📁', name: 'Legacy', path: '/tmp', commands: [] }]
    })
  })
  await manager.load()
  assert.equal('icon' in manager.folders[0], false)
  assert.equal(await manager.saveFolder({ name: 'New', path: '/tmp/new' }), true)
  assert.equal('icon' in manager.folders[1], false)
})

test('folder terminal opens without a preset, keeps a path snapshot, and rejects duplicates', async () => {
  let finish!: () => void
  const requests: unknown[] = []
  const { manager } = fixture({
    launch: async (request) => {
      requests.push(request)
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    }
  })
  await manager.load()
  await manager.saveFolder({ name: 'Empty', path: '/tmp/original' })
  const folder = manager.folders[0]
  const pending = manager.openFolderTerminal(folder.id)
  assert.equal(manager.isOpening(folder.id), true)
  assert.equal(await manager.openFolderTerminal(folder.id), false)
  await manager.load()
  await manager.saveFolder({ name: 'Renamed', path: '/tmp/new' }, folder.id)
  assert.deepEqual(requests, [{ path: '/tmp/original' }])
  finish()
  assert.equal(await pending, true)
  assert.equal(manager.isOpening(folder.id), false)
  assert.equal(manager.operations[folder.id].status, 'opened')
})

test('folder terminal failure can retry without running a preset', async () => {
  let fail = true
  const requests: unknown[] = []
  const { manager } = await populated({
    launch: async (request) => {
      requests.push(request)
      if (fail) throw new Error('terminal failed')
    }
  })
  const id = manager.folders[0].id
  assert.equal(await manager.openFolderTerminal(id), false)
  assert.equal(manager.isOpening(id), false)
  fail = false
  assert.equal(await manager.openFolderTerminal(id), true)
  assert.deepEqual(requests, [{ path: '/tmp/app' }, { path: '/tmp/app' }])
})

test('folder path opening has its own lifetime, duplicate guard and error result', async () => {
  let fail!: (error: Error) => void
  const paths: string[] = []
  const { manager } = await populated({
    openPath: async (path) => {
      paths.push(path)
      await new Promise<void>((_resolve, reject) => {
        fail = reject
      })
    }
  })
  const folder = manager.folders[0]
  const pending = manager.openFolderPath(folder.id)
  assert.equal(manager.isOpeningPath(folder.id), true)
  assert.equal(await manager.openFolderPath(folder.id), false)
  await manager.load()
  await manager.saveFolder({ name: folder.name, path: '/tmp/changed' }, folder.id)
  fail(new Error('file manager failed'))
  assert.equal(await pending, false)
  assert.equal(manager.isOpeningPath(folder.id), false)
  assert.deepEqual(paths, ['/tmp/app'])
  assert.equal(await manager.openFolderPath('missing'), false)
})
