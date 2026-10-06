import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'

// Run complete production modules; replace OS privileges and Electron IPC only.
function loadSource(filename: string, dependencies: Record<string, any>) {
  const module = { exports: {} as any }
  runInNewContext(
    transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
    {
      module,
      exports: module.exports,
      require: (id: string) => ({ __esModule: true, ...(dependencies[id] ?? {}) }),
      console: { ...console, error: () => {} },
      Error,
      Promise,
      Map,
      Set,
      AbortController,
      Buffer,
      process,
      setTimeout,
      clearTimeout
    }
  )
  return module.exports
}
const directory = await fs.mkdtemp(path.join(tmpdir(), 'flyenv-generic-hosts-'))
let macOS = true
let helperCalls = 0
let writes = 0
const helper = {
  default: {
    send: async (_module: string, fn: string) => {
      helperCalls++
      return fn === 'readHosts' ? { content: 'original', digest: 'a'.repeat(64) } : true
    }
  }
}
const utils = {
  isWindows: () => false,
  isMacOS: () => macOS,
  isLinux: () => !macOS,
  pathFixedToUnix: (value: string) => value,
  appDebugLog: async () => {}
}
const hosts = loadSource('src/fork/module/Host/UnixHosts.ts', {
  '@shared/utils': utils,
  '../../Helper': helper,
  path,
  'node:path': path
})
const fileOps = {
  writeFile: async (file: string, content: string) => {
    writes++
    assert.ok(file.startsWith(directory), 'fixture refuses any real system write')
    await fs.writeFile(file, content)
  }
}
const shared = { '@shared/fs-extra': fileOps, '@shared/utils': utils }
const fork = loadSource('src/fork/Fn.ts', {
  ...shared,
  './module/Host/UnixHosts': hosts,
  './Helper': helper
})
const main = loadSource('src/main/utils/index.ts', {
  ...shared,
  '../../fork/module/Host/UnixHosts': hosts,
  '../../fork/Helper': helper
})
const appNode = loadSource('src/main/core/AppNodeFn.ts', {
  ...shared,
  '../../fork/module/Host/UnixHosts': hosts,
  '../../fork/Helper': helper,
  './lazy/LazyRuntime': { LazyRuntime: class {} }
}).default
async function rendererWrite(file: string, content: string) {
  const response = await new Promise<any>((resolve) => {
    appNode.mainWindow = {
      webContents: {
        send: (_event: string, _command: string, _key: string, result: any) => resolve(result)
      }
    }
    appNode.fs_writeFile('fs', 'write', file, content)
  })
  if (response !== true) throw Object.assign(new Error(response.msg), { code: response.errorCode })
}
try {
  for (macOS of [true, false]) {
    const systemPaths = ['/etc/hosts', '/etc/./hosts', '/etc/../etc/hosts', '/etc//hosts/']
    if (macOS) systemPaths.push('/private/etc/hosts', '/private/var/../etc/hosts')
    for (const [name, write] of [
      ['fork', fork.writeFileByRoot],
      ['main', main.writeFileByRoot],
      ['renderer', rendererWrite]
    ] as const) {
      for (const file of systemPaths)
        await assert.rejects(
          write(file, 'stale full text'),
          (error: any) => error.code === 'HOSTS_EDIT_REQUIRED',
          `${name}: ${file}`
        )
      const ordinary = path.join(directory, `${name}-${macOS}.txt`)
      await write(ordinary, 'ordinary saved')
      assert.equal(await fs.readFile(ordinary, 'utf8'), 'ordinary saved')
    }
  }
  assert.equal(
    helperCalls,
    0,
    'generic Unix APIs must never read or overwrite hosts through Helper'
  )
  assert.equal(writes, 6, 'only ordinary user files reach the Node writer')
  console.log(
    'Generic Unix writes: centralized hosts rejection, normalized aliases and ordinary file writes passed'
  )
} finally {
  await fs.rm(directory, { recursive: true, force: true })
}
