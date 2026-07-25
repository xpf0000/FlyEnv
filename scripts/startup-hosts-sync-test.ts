import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { synchronizeHostsAtStartup } from '../src/render/util/HostStartupSync'

{
  const calls: string[] = []

  await synchronizeHostsAtStartup(
    async () => {
      calls.push('load:start')
      await Promise.resolve()
      calls.push('load:end')
    },
    async () => {
      assert.deepEqual(calls, ['load:start', 'load:end'])
      calls.push('write')
    }
  )

  assert.deepEqual(calls, ['load:start', 'load:end', 'write'])
}

{
  const calls: string[] = []

  await assert.rejects(
    () =>
      synchronizeHostsAtStartup(
        async () => {
          calls.push('load')
          throw new Error('host list unavailable')
        },
        async () => {
          calls.push('write')
        }
      ),
    /host list unavailable/
  )

  assert.deepEqual(calls, ['load'])
}

{
  const calls: string[] = []

  await assert.rejects(
    () =>
      synchronizeHostsAtStartup(
        async () => {
          calls.push('load')
        },
        async () => {
          calls.push('write')
          throw new Error('hosts write unavailable')
        }
      ),
    /hosts write unavailable/
  )

  assert.deepEqual(calls, ['load', 'write'])
}

const root = process.cwd()
const rendererMain = readFileSync(join(root, 'src/render/main.ts'), 'utf8')
const hostsIndex = readFileSync(join(root, 'src/render/components/Host/Index.vue'), 'utf8')
const ipcHandler = readFileSync(join(root, 'src/main/core/IPCHandler.ts'), 'utf8')
const hostUtil = readFileSync(join(root, 'src/render/util/Host.ts'), 'utf8')
const synchronizeIndex = rendererMain.indexOf('await synchronizeHostsAtStartup')
const mountIndex = rendererMain.indexOf("appRoot.mount('#app')")

assert.ok(synchronizeIndex >= 0, 'renderer startup must await hosts synchronization')
assert.ok(mountIndex >= 0, 'renderer startup must mount the application')
assert.ok(synchronizeIndex < mountIndex, 'hosts synchronization must happen before mounting')
assert.ok(!hostsIndex.includes('hostsWrite(false)'), 'Site mount must not write system hosts')
assert.match(
  ipcHandler,
  /\.then\(\(info: any\) => \{[\s\S]*?this\.clearDebugForkAction\(debugAction\)\s*\}\)\s*\.catch\(\(error\) => \{\s*this\.handleForkCallback\(\s*command,\s*key,\s*module,\s*\{\s*code: 1,\s*msg: error instanceof Error \? error\.message : `\$\{error\}`\s*\},\s*args\s*\)\s*this\.clearDebugForkAction\(debugAction\)\s*\}\)/
)
assert.match(
  hostUtil,
  /IPC\.send\('app-fork:host', 'writeHosts', writeHosts, ipv6\)\.then\(\(key: string, res: any\) => \{\s*IPC\.off\(key\)\s*if \(res\?\.code === 0\) \{\s*resolve\(true\)\s*\} else \{\s*reject\(new Error\(res\?\.msg \?\? 'Failed to write hosts'\)\)\s*\}/
)

console.log('startup hosts synchronization checks passed')
