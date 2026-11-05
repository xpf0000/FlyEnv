import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import ts from 'typescript'

const compile = (file: string, expose: string) =>
  ts
    .transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
    })
    .outputText.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/\bexport\s+default\s+/g, '')
    .replace(/\bexport\s+/g, '') + `\nthis.subject = ${expose};`

const pathCode = compile('src/main/utils/ServerPath.ts', 'SetupGlobalPaths')
async function paths(
  documents: string | Error,
  creation: boolean | Error = true,
  home: string | Error = 'C:\\Users\\User'
) {
  const server: Record<string, unknown> = { UserDocuments: 'stale-documents' }
  const warnings: unknown[][] = []
  let created = false
  const context = createContext({
    global: { Server: server },
    app: {
      getPath: (name: string) => {
        if (name === 'home') {
          if (home instanceof Error) throw home
          return home
        }
        if (documents instanceof Error) throw documents
        return documents
      }
    },
    join,
    arch: () => 'x64',
    isArmArch: () => false,
    isWindows: () => true,
    isMacOS: () => false,
    isLinux: () => false,
    windowsSystemDirectory: () => 'C:\\Windows\\System32',
    __static: 'C:\\FlyEnv\\static',
    createBaseDirectories: async () => {
      created = true
      if (creation instanceof Error) throw creation
      return creation
    },
    mkdirp: async () => {},
    console: { warn: (...args: unknown[]) => warnings.push(args) }
  })
  runInContext(pathCode, context)
  const subject = context.subject as (root: string) => Promise<boolean>
  const ready = await subject('D:\\FlyEnv-Data')
  return { ready, server, warnings, created }
}
const missing = await paths(new Error("Failed to get 'documents' path"))
assert.equal(missing.ready, true)
assert.equal(missing.created, true)
assert.equal(
  missing.server.UserDocuments,
  undefined,
  'unresolved Documents must not retain stale or guessed profile targets'
)
assert.equal(missing.warnings.length, 1)
assert.equal((await paths('')).server.UserDocuments, undefined)
for (const redirected of [
  'D:\\OneDrive\\Documents',
  '\\\\server\\users\\Docs',
  'C:\\Users\\User\\Documents'
]) {
  const result = await paths(redirected)
  assert.equal(result.server.UserDocuments, redirected, 'preserve authoritative known-folder path')
  assert.equal(result.warnings.length, 0)
}
assert.equal((await paths(new Error('documents unavailable'), false)).ready, false)
await assert.rejects(
  paths(new Error('documents unavailable'), new Error('data directory failed')),
  /data directory failed/
)
await assert.rejects(
  paths('D:\\Documents', true, new Error('home unavailable')),
  /home unavailable/
)

const launcherCode = compile('src/main/Launcher.ts', 'Launcher')
for (const failure of ['constructor', 'init', 'start', 'none']) {
  const app = new EventEmitter() as EventEmitter & { quit: () => void }
  const errors: unknown[] = []
  const dialogs: string[] = []
  let quits = 0
  let started = false
  app.quit = () => {
    quits++
  }
  class Application extends EventEmitter {
    constructor() {
      super()
      if (failure === 'constructor') throw new Error('constructor failed')
    }
    async init() {
      if (failure === 'init') throw new Error('init failed')
    }
    start() {
      if (failure === 'start') throw new Error('start failed')
      started = true
    }
  }
  const context = createContext({
    EventEmitter,
    app,
    Application,
    global: {},
    console: { log() {} },
    logger: { error: (...args: unknown[]) => errors.push(args), info() {} },
    dialog: { showErrorBox: (_title: string, message: string) => dialogs.push(message) },
    Menu: { setApplicationMenu() {} },
    isWindows: () => true,
    isLinux: () => false,
    isMacOS: () => false
  })
  runInContext(launcherCode, context)
  const Subject = context.subject as { prototype: { handelAppReady(): void } }
  const launcher = Object.create(Subject.prototype)
  launcher.loadDebugExtension = async () => {}
  launcher.handelAppReady()
  await assert.doesNotReject(() => Promise.resolve(app.listeners('ready')[0]()))
  assert.equal(quits, failure === 'none' ? 0 : 1)
  assert.equal(dialogs.length, failure === 'none' ? 0 : 1)
  assert.equal(errors.length, failure === 'none' ? 0 : 1)
  assert.equal(started, failure === 'none')
}
console.log(
  'Startup Documents optional lookup, redirected paths, required failures and ready rejection handling passed'
)
