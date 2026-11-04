import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { InstanceFilesController, type FileDependencies } from '../render/Files/controller'

function setup() {
  const notices: [string, string][] = []
  const commands: [string, string, unknown[], boolean | undefined][] = []
  const writes: [string, string][] = []
  const deps: FileDependencies = {
    command: async <T>(id: string, method: string, args: unknown[], write?: boolean) => {
      commands.push([id, method, args, write])
      return (
        method === 'instanceFiles'
          ? {
              config: '/managed/instances/a/my.cnf',
              errorLog: '/managed/instances/a/error.log',
              slowLog: '/managed/instances/a/slow.log',
              root: '/managed'
            }
          : method === 'readConfig'
            ? '[mysqld]\nport=13307\n'
            : true
      ) as T
    },
    notify: (type, text) => {
      notices.push([type, text])
    },
    exists: async () => false,
    read: async () => '[mysqld]\nport=13307\nmax_connections=200\n',
    write: async (file, text) => {
      writes.push([file, text])
    },
    size: async () => 100,
    realpath: async (file) => file,
    dirname,
    join,
    open: async () => undefined,
    chooseOpen: async () => undefined,
    chooseSave: async () => '/exports/custom.cnf',
    success: () => 'Success',
    tooBig: () => 'Too big'
  }
  return { deps, notices, commands, writes, controller: new InstanceFilesController(deps) }
}

test('file load is retained across drawer reentry and duplicate calls share its terminal state', async () => {
  const { deps, commands, controller: files } = setup()
  const command = deps.command
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  deps.command = async (...args) => {
    await wait
    return command(...args)
  }
  const first = files.load('a', 'config')
  const reentered = files.state('a', 'config')
  assert.equal(first, files.load('a', 'config'))
  assert.equal(reentered.busy, true)
  release()
  await first
  assert.equal(reentered.busy, false)
  assert.equal(reentered.loaded, true)
  assert.equal(commands.length, 2)
})

test('config save uses validated plugin command and a failed save retains the previous baseline', async () => {
  const { deps, commands, writes, controller: files } = setup()
  await files.load('a', 'config')
  const before = files.state('a', 'config').saved
  const command = deps.command
  deps.command = async (id, method, args, write) =>
    method === 'saveConfig' ? undefined : command(id, method, args, write)
  await files.save('a', 'invalid')
  assert.equal(files.state('a', 'config').saved, before)
  deps.command = command
  await files.save('a', 'valid')
  assert.equal(files.state('a', 'config').saved, 'valid')
  assert.deepEqual(commands.at(-1), ['a', 'saveConfig', ['valid'], true])
  assert.deepEqual(writes, [])
})

test('custom import cancellation preserves content and a read failure releases the dialog for retry', async () => {
  const { deps, notices, controller: files } = setup()
  await files.load('a', 'config')
  const state = files.state('a', 'config')
  const before = state.text
  await files.loadCustom('a')
  assert.equal(state.text, before)
  deps.chooseOpen = async () => '/custom.cnf'
  deps.read = async () => {
    throw new Error('Read denied')
  }
  await files.loadCustom('a')
  assert.equal(state.text, before)
  assert.equal(state.busy, false)
  assert.deepEqual(notices, [['error', 'Read denied']])
  deps.read = async () => 'imported'
  await files.loadCustom('a')
  assert.equal(state.text, 'imported')
  assert.notEqual(state.saved, 'imported')
})

test('export rejects a symlink into managed instance files and snapshots the requested text', async () => {
  const { deps, notices, writes, controller: files } = setup()
  await files.load('a', 'config')
  deps.exists = async () => true
  deps.realpath = async (file) =>
    file === '/exports/custom.cnf' ? '/managed/instances/a/my.cnf' : file
  await files.saveCustom('a', 'unsafe')
  assert.deepEqual(writes, [])
  assert.match(notices[0][1], /outside the managed/)
  deps.realpath = async (file) => file
  deps.notify = () => {
    throw new Error('Notice unavailable')
  }
  await files.saveCustom('a', 'snapshot')
  assert.deepEqual(writes, [['/exports/custom.cnf', 'snapshot']])
  assert.equal(files.state('a', 'config').busy, false)
})

test('a default availability failure preserves a successful read but a required reload failure disables stale editing', async () => {
  const { deps, notices, controller: files } = setup()
  deps.exists = async () => {
    throw new Error('Default check failed')
  }
  await files.load('a', 'config')
  const state = files.state('a', 'config')
  assert.equal(state.loaded, true)
  assert.match(state.text, /port=13307/)
  assert.deepEqual(notices, [['error', 'Default check failed']])
  deps.command = async () => undefined
  await files.load('a', 'config')
  assert.equal(state.loaded, false)
  assert.equal(state.busy, false)
})

test('first mounted file state remains reactive while load updates path, busy and log readiness', async () => {
  const { reactive, computed } = await import('vue')
  const { deps } = setup()
  const controller = reactive(new InstanceFilesController(deps))
  const state = controller.state('a', 'errorLog')
  const loaded = computed(() => state.loaded)
  const path = computed(() => state.file)
  const busy = computed(() => state.busy)
  assert.equal(loaded.value, false)
  assert.equal(path.value, '')
  assert.equal(busy.value, false)
  const flight = controller.load('a', 'errorLog')
  assert.equal(busy.value, true)
  await flight
  assert.equal(loaded.value, true)
  assert.equal(path.value, '/managed/instances/a/error.log')
  assert.equal(busy.value, false)
})
