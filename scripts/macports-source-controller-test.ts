import assert from 'node:assert/strict'
import { build } from 'esbuild'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Exercise the real controller/fork operation, replacing only Electron IPC and terminal UI.
const directory = await fs.mkdtemp(join(tmpdir(), 'flyenv-macports-controller-'))
const listeners = new Map<string, (key: string, result: any) => void>()
let sends = 0
let timeout: (() => void) | undefined
let failWrite = false
const fixture = {
  ipc: {
    send: () => {
      const key = `request-${++sends}`
      return { key, then: (callback: any) => listeners.set(key, callback) }
    },
    off: (key: string) => listeners.delete(key)
  },
  fs: {
    ...fs,
    mkdirp: (path: string) => fs.mkdir(path, { recursive: true }),
    remove: (path: string) => fs.rm(path, { recursive: true, force: true }),
    writeFile: async (path: string, content: string) => {
      if (failWrite) throw new Error('preview disk unavailable')
      await fs.writeFile(path, content)
    }
  },
  uuid: () => `preview-${sends}`,
  readFile: async (path: string) =>
    path.endsWith('/sources.conf')
      ? 'rsync://old.invalid/ports [default]\n'
      : 'rsync_server old.invalid\nrsync_dir old/ports\n'
}
;(globalThis as any).__macportsFixture = fixture
;(globalThis as any).window = { Server: { Cache: directory } }
const stubs: Record<string, string> = {
  '@/util/IPC': 'export default globalThis.__macportsFixture.ipc',
  '@/util/XTerm': 'export default class XTerm {}',
  '@/util/Index':
    'export const reactiveBind=x=>x; export const uuid=globalThis.__macportsFixture.uuid',
  '@/util/NodeFn': 'export const fs=globalThis.__macportsFixture.fs',
  '@/util/Element': 'export const MessageError=()=>{}; export const MessageSuccess=()=>{}',
  '@lang/index': 'export const I18nT=x=>x',
  '../Base': 'export class Base {}',
  '../../Fn':
    'export const readFile=globalThis.__macportsFixture.readFile; export const mkdirp=globalThis.__macportsFixture.fs.mkdirp; export const writeFile=globalThis.__macportsFixture.fs.writeFile; export const uuid=globalThis.__macportsFixture.uuid'
}
async function load(entry: string) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'electron-fixture',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (stubs[args.path]) return { path: args.path, namespace: 'fixture' }
            return undefined
          })
          build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents: stubs[args.path]
          }))
        }
      }
    ]
  })
  return (
    await import(
      `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
    )
  ).default
}
const originalTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
try {
  const controller = await load('src/render/components/Setup/MacPortsSrc/Controller.ts')
  const fork = await load('src/fork/module/MacPorts/index.ts')
  // A slow, abandoned fork response must create no preview directory at all.
  ;(globalThis as any).Server = { Cache: directory }
  const source = {
    url: 'rsync://new.invalid/ports',
    rsync_server: 'new.invalid',
    rsync_dir: 'new/ports'
  }
  const result = await fork.changSrc(source)
  assert.deepEqual(
    await fs.readdir(directory),
    [],
    'fork must not leave snapshots after IPC timeout'
  )
  assert.deepEqual(
    result.files.map((file: any) => file.content),
    ['\nrsync://new.invalid/ports [default]\n', '\nrsync_server new.invalid\nrsync_dir new/ports\n']
  )

  globalThis.setTimeout = ((callback: () => void) => {
    timeout = callback
    return 1
  }) as any
  globalThis.clearTimeout = (() => {
    timeout = undefined
  }) as any
  const previousDirectory = join(directory, 'previous')
  await fs.mkdir(previousDirectory)
  const previous = {
    directory: previousDirectory,
    files: [{ path: '/old', snapshot: '/old.preview', content: 'old' }]
  }
  const outcomes = [{ path: '/old', status: 'failed' }]
  let destroyed = 0
  controller.preview = previous
  controller.outcomes = outcomes
  controller.xterm = {
    destroy: () => {
      destroyed++
    },
    unmounted: () => {}
  }

  const failed = controller.prepare(source)
  assert.equal(controller.running, true)
  await controller.prepare(source)
  assert.equal(sends, 1, 'duplicate preparation must not send another request')
  listeners.get('request-1')!('request-1', { code: 200 })
  assert.equal(controller.running, true, 'progress is non-terminal')
  listeners.get('request-1')!('request-1', { code: 1, msg: 'read denied' })
  await failed
  assert.equal(controller.preview, previous)
  assert.equal(
    controller.outcomes,
    outcomes,
    'failed preparation must preserve partial apply results'
  )
  assert.equal(destroyed, 0)
  assert.equal(listeners.size, 0)

  const timedOut = controller.prepare(source)
  timeout!()
  await timedOut
  assert.equal(controller.preview, previous)
  assert.equal(controller.outcomes, outcomes)
  assert.equal(listeners.size, 0, 'timed-out response listener must be removed')
  assert.deepEqual(await fs.readdir(directory), ['previous'])

  failWrite = true
  const diskFailed = controller.prepare(source)
  listeners.get('request-3')!('request-3', { code: 0, data: result })
  await diskFailed
  assert.equal(controller.preview, previous)
  assert.equal(controller.outcomes, outcomes)
  assert.deepEqual(await fs.readdir(directory), ['previous'], 'partial snapshot must be removed')
  assert.equal(destroyed, 0)

  failWrite = false
  const success = controller.prepare(source)
  listeners.get('request-4')!('request-4', { code: 0, data: result })
  await success
  assert.equal(destroyed, 1, 'successful replacement must release old terminal listener')
  assert.equal(controller.xterm, undefined)
  assert.deepEqual(controller.outcomes, [])
  assert.equal(controller.running, false)
  assert.equal(listeners.size, 0)
  assert.deepEqual(await fs.readdir(directory), ['macports-source-preview-4'])
  for (const file of controller.preview.files)
    assert.equal(await fs.readFile(file.snapshot, 'utf8'), file.content)
  console.log(
    'MacPorts prepare: preserved previous results, bounded IPC, no orphan snapshots, completed terminal cleanup passed'
  )
} finally {
  globalThis.setTimeout = originalTimeout
  globalThis.clearTimeout = originalClearTimeout
  delete (globalThis as any).__macportsFixture
  await fs.rm(directory, { recursive: true, force: true })
}
