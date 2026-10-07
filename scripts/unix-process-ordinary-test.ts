import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const scratch = join(process.cwd(), 'tmp')
await mkdir(scratch, { recursive: true })
const directory = await mkdtemp(join(scratch, 'flyenv-unix-process-'))
const state = {
  signalCalls: [] as number[],
  helperCalls: 0,
  lsof: '',
  linux: false,
  helperError: false
}
;(globalThis as any).__ordinaryUnix = state
try {
  const mocks: Record<string, string> = {
    '../fork/Helper': `export default {enable:true,send:async()=>{
      const state=globalThis.__ordinaryUnix;state.helperCalls++;
      if(!state.linux||state.helperError)throw Error('port ownership unavailable');
      return [{PID:String(process.pid),COMMAND:'node',USER:'developer',PPID:''}]
    }}`,
    '@shared/utils':
      'export const isWindows=()=>false,isLinux=()=>globalThis.__ordinaryUnix.linux,appDebugLog=async()=>{};',
    '@shared/child-process':
      'export const execPromiseWithEnv=async()=>({stdout:globalThis.__ordinaryUnix.lsof,stderr:""});',
    './Process.win':
      'export const ProcessPidListStrict=()=>{throw Error("unexpected Windows query")};',
    './ServiceStopDiagnostics': 'export const logServiceStop=async()=>{};',
    './WindowsTaskkill':
      'export const runWindowsTaskkill=()=>{throw Error("unexpected Windows stop")};'
  }
  const bundled = await build({
    entryPoints: ['src/shared/Process.ts'],
    platform: 'node',
    format: 'esm',
    bundle: true,
    write: false,
    packages: 'external',
    plugins: [
      {
        name: 'ordinary-unix',
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            mocks[path] ? { path, namespace: 'mock' } : undefined
          )
          builder.onLoad({ filter: /./, namespace: 'mock' }, ({ path }) => ({
            contents: mocks[path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const path = join(directory, 'process.mjs')
  await writeFile(path, bundled.outputFiles[0].text)
  const module = await import(pathToFileURL(path).href)
  const processes = await module.ProcessListFetch()
  assert.ok(
    processes.some((item: any) => item.PID === String(process.pid)),
    'ordinary ps exposes this process'
  )
  const original = process.kill
  process.kill = ((pid: number) => {
    state.signalCalls.push(pid)
    if (pid === 12347) throw Object.assign(new Error('denied'), { code: 'EPERM' })
    return true
  }) as any
  try {
    await assert.rejects(
      module.ProcessKillStrict('-TERM', ['12345', 'bad', '12347', '12346']),
      /Invalid PID: bad[\s\S]*denied/
    )
    assert.deepEqual(
      state.signalCalls,
      [12345, 12347, 12346],
      'one candidate failure does not stop siblings'
    )
    await assert.rejects(
      module.ProcessKill('-TERM', ['12347']),
      /denied/,
      'compatibility caller must retain stop failure'
    )
  } finally {
    process.kill = original
  }
  state.lsof = `COMMAND PID USER\nnode ${process.pid} developer\n`
  const targets = await module.fetchProcessPidByPort('18080')
  assert.equal(targets[0].PID, String(process.pid))
  assert.equal(state.helperCalls, 0, 'enabled Helper cannot intercept ordinary Unix operations')
  state.linux = true
  state.lsof = ''
  const linuxTargets = await module.fetchProcessPidByPort('18080')
  assert.equal(
    linuxTargets[0]?.PID,
    String(process.pid),
    'Linux must query ownership through the fixed read-only Helper when ordinary lsof cannot see fds'
  )
  state.helperError = true
  await assert.rejects(module.fetchProcessPidByPort('18080'), /port ownership unavailable/)
  await assert.rejects(module.fetchProcessPidByPort('80;touch /tmp/pwned'), /Invalid port/)
  console.log(
    'Unix process operations: ordinary ps/lsof, signals and independent candidate outcomes passed'
  )
} finally {
  await rm(directory, { recursive: true, force: true })
  delete (globalThis as any).__ordinaryUnix
}
