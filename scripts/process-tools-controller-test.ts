import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.ok(
  existsSync('src/render/components/Tools/ProcessKill/Controller.ts'),
  'ProcessKill must own IPC errors and sudo stops outside the page'
)
const directory = await mkdtemp(join(tmpdir(), 'flyenv-process-tools-'))
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
try {
  for (const kind of ['PortKill', 'ProcessKill']) {
    const requests: any[] = [],
      notices: any[] = [],
      removed: string[] = [],
      sudo: any[] = []
    ;(globalThis as any).__processTools = { requests, notices, removed, sudo }
    const mocks: Record<string, string> = {
      '@/util/IPC': `export default {send:(_,fn,...args)=>({then:callback=>{
        const f=globalThis.__processTools,key='request-'+f.requests.length;
        f.requests.push({fn,args,reply:response=>callback(key,response)})
      }}),off:key=>globalThis.__processTools.removed.push(key)}`,
      '@/util/Index': 'export const reactiveBind=value=>value',
      '@/util/Element': `const emit=type=>message=>globalThis.__processTools.notices.push([type,message]);
        export const MessageError=emit('error'),MessageSuccess=emit('success'),MessageWarning=emit('warning')`,
      '@lang/index': 'export const I18nT=key=>key',
      sudo: `export const runSudoKill=(pids,title)=>new Promise((resolve,reject)=>{
        globalThis.__processTools.sudo.push({pids,title,resolve,reject})
      })`
    }
    const bundled = await build({
      entryPoints: [`src/render/components/Tools/${kind}/Controller.ts`],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      plugins: [
        {
          name: 'process-tools-boundaries',
          setup(builder) {
            builder.onResolve({ filter: /./ }, ({ path }) => {
              if (path.endsWith('SudoKill')) return { path: 'sudo', namespace: 'mock' }
              if (mocks[path]) return { path, namespace: 'mock' }
              return undefined
            })
            builder.onLoad({ filter: /./, namespace: 'mock' }, ({ path }) => ({
              contents: mocks[path]
            }))
          }
        }
      ]
    })
    const file = join(directory, `${kind}.mjs`)
    await writeFile(file, bundled.outputFiles[0].text)
    const exported = await import(pathToFileURL(file).href)
    const controller = new exported[`${kind}Controller`]()
    const queryName = kind === 'PortKill' ? 'getPortPids' : 'getPidsByKey'
    const query = controller.search('123')
    assert.equal(requests[0].fn, queryName)
    requests[0].reply({ code: 200 })
    assert.equal(removed.length, 0)
    requests[0].reply({ code: 1, msg: 'ps failed' })
    await query
    assert.deepEqual(notices, [['error', 'ps failed']], 'query errors are not empty results')
    const ordinary = controller.kill(['123'])
    await tick()
    assert.equal(requests[1].fn, 'killPids')
    requests[1].reply({ code: 1, msg: 'permission denied' })
    await ordinary
    assert.equal(notices.filter(([type]) => type === 'success').length, 0)

    const pids = ['123']
    const elevated = controller.kill(pids, true)
    pids.push('456')
    assert.equal(controller.kill(['789'], false), elevated, 're-entry cannot launch a second stop')
    await tick()
    assert.equal(requests.length, 2, 'sudo stop does not use ordinary kill RPC')
    assert.equal(sudo.length, 1)
    assert.deepEqual(sudo[0].pids, ['123'], 'PID list is snapshotted before terminal launch')
    sudo[0].resolve(true)
    await tick()
    assert.equal(requests[2].fn, queryName)
    requests[2].reply({ code: 1, msg: 'refresh failed' })
    await elevated
    assert.equal(notices.filter(([type]) => type === 'success').length, 1)
    assert.equal(controller.error, 'refresh failed')
    assert.equal(controller.killing, false)
    const canceled = controller.kill(['123'], true)
    await tick()
    sudo[1].reject(new Error('canceled'))
    await canceled
    assert.deepEqual(notices.at(-1), ['error', 'canceled'])
    assert.equal(notices.filter(([type]) => type === 'success').length, 1)
    assert.equal(requests.length, 3, 'failure neither falls back to ordinary kill nor refreshes')
    assert.equal(removed.length, requests.length)
    const nested = controller.search('worker')
    requests[3].reply({
      code: 0,
      data: [
        {
          PID: '100',
          PPID: '1',
          USER: 'user',
          COMMAND: 'parent',
          children: [
            {
              PID: '101',
              PPID: '100',
              USER: 'user',
              COMMAND: 'worker',
              children: [
                {
                  PID: '102',
                  PPID: '101',
                  USER: 'user',
                  COMMAND: 'grandchild'
                }
              ]
            }
          ]
        }
      ]
    })
    await nested
    assert.deepEqual(
      controller.processes.map((item: any) => item.PID),
      ['100', '101', '102'],
      'Windows nested query results retain every descendant for cleanAll'
    )
    assert.equal(controller.rows[0].children[0].children[0].PID, '102')
    console.log(
      `${kind}: query/stop failures, ordinary/sudo routing, snapshots and re-entry passed`
    )
  }
} finally {
  await rm(directory, { recursive: true, force: true })
  delete (globalThis as any).__processTools
}
