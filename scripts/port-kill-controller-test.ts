import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const source = 'src/render/components/Tools/PortKill/Controller.ts'
assert.ok(existsSync(source), 'PortKill operations need a module owner that retains IPC failures')
const requests: Array<{ fn: string; args: any[]; reply: (response: any) => void }> = []
const notices: Array<[string, string]> = []
const removed: string[] = []
;(globalThis as any).__portKill = { requests, notices, removed }
const directory = await mkdtemp(join(tmpdir(), 'flyenv-port-controller-'))
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
try {
  const mocks: Record<string, string> = {
    '@/util/IPC': `export default {send:(_,fn,...args)=>({then:callback=>{
      const f=globalThis.__portKill,key='request-'+f.requests.length;
      f.requests.push({fn,args,reply:response=>callback(key,response)})
    }}),off:key=>globalThis.__portKill.removed.push(key)}`,
    '@/util/Index': 'export const reactiveBind=value=>value',
    '@/util/Element': `const emit=type=>message=>globalThis.__portKill.notices.push([type,message]);
      export const MessageError=emit('error'),MessageSuccess=emit('success'),MessageWarning=emit('warning')`,
    '@lang/index': 'export const I18nT=key=>key'
  }
  const result = await build({
    entryPoints: [source],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'port-controller',
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            mocks[path] ? { path, namespace: 'mock' } : undefined
          )
          builder.onLoad({ filter: /./, namespace: 'mock' }, ({ path }) => ({
            contents: mocks[path]
          }))
        }
      }
    ]
  })
  const path = join(directory, 'controller.mjs')
  await writeFile(path, result.outputFiles[0].text)
  const { PortKillController } = await import(pathToFileURL(path).href)
  const controller = new PortKillController()
  const query = controller.search('80')
  assert.equal(controller.search('80'), query, 'duplicate search joins the accepted operation')
  requests[0].reply({ code: 200, msg: 'working' })
  assert.equal(controller.querying, true)
  assert.equal(removed.length, 0, 'progress retains the response listener')
  requests[0].reply({ code: 1, msg: 'cannot query ownership' })
  await query
  assert.deepEqual(notices, [['error', 'cannot query ownership']])
  assert.equal(controller.querying, false)
  assert.deepEqual(removed, ['request-0'])

  const latest = controller.search('80')
  controller.search('53')
  assert.equal(
    controller.lastPort,
    '53',
    'page re-entry restores the latest request during progress'
  )
  requests[1].reply({ code: 0, data: [{ PID: '80', PPID: '', COMMAND: 'stale' }] })
  await settle()
  assert.equal(requests[2].args[0], '53')
  requests[2].reply({ code: 0, data: [{ PID: '53', PPID: '', COMMAND: 'numa' }] })
  await latest
  assert.equal(controller.rows[0].PID, '53', 'late response cannot replace the latest query')
  assert.equal(controller.lastPort, '53')

  const kill = controller.kill(['53'])
  assert.equal(controller.kill(['53']), kill)
  requests[3].reply({ code: 1, msg: 'permission denied' })
  await kill
  assert.deepEqual(notices.at(-1), ['error', 'permission denied'])
  assert.equal(controller.killing, false)
  assert.ok(!notices.some(([type]) => type === 'success'), 'failed stop cannot report success')

  const successfulKill = controller.kill(['53'])
  requests[4].reply({ code: 0, data: true })
  await settle()
  assert.equal(requests[5].fn, 'getPortPids')
  requests[5].reply({ code: 1, msg: 'refresh failed' })
  await successfulKill
  assert.ok(notices.some(([type]) => type === 'success'))
  assert.equal(controller.error, 'refresh failed')
  assert.equal(controller.killing, false)
  assert.equal(controller.querying, false)
  assert.equal(removed.length, requests.length)

  const overlappingKill = controller.kill(['53'])
  controller.search('53')
  requests[6].reply({ code: 0, data: true })
  await settle()
  requests[7].reply({ code: 0, data: [{ PID: '53', PPID: '', COMMAND: 'stopped process' }] })
  await settle()
  assert.equal(
    requests.length,
    9,
    'a successful stop must issue a fresh query after any old snapshot'
  )
  assert.equal(controller.rows.length, 0, 'pre-stop query results must not repopulate stopped rows')
  requests[8].reply({ code: 0, data: [] })
  await overlappingKill
  assert.equal(controller.rows.length, 0)
  assert.equal(removed.length, requests.length)
  console.log(
    'PortKill controller: progress, duplicate calls, stale queries and failure boundaries passed'
  )
} finally {
  await rm(directory, { recursive: true, force: true })
  delete (globalThis as any).__portKill
}
