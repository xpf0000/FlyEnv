import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const source = join(root, 'plugins/opensearch/render/DashboardsPanel.ts')
const stubs: Record<string, string> = {
  'reactive-bind': 'export const reactiveBind = (value) => value',
  ipc: 'const IPC = { send() { throw new Error("unexpected default IPC") }, off() {} }; export default IPC',
  'node-fn': 'export const shell = { openExternal: async () => undefined }',
  element: 'export const MessageError = () => undefined',
  'plugin-lang': 'export const OpenSearchT = (key) => key'
}

const bundle = await build({
  entryPoints: [source],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  plugins: [
    {
      name: 'renderer-test-stubs',
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          const name =
            args.path === '@/util/Index'
              ? 'reactive-bind'
              : args.path === '@/util/IPC'
                ? 'ipc'
                : args.path === '@/util/NodeFn'
                  ? 'node-fn'
                  : args.path === '@/util/Element'
                    ? 'element'
                    : args.path === './lang'
                      ? 'plugin-lang'
                      : undefined
          return name ? { path: name, namespace: 'renderer-test' } : undefined
        })
        build.onLoad({ filter: /.*/, namespace: 'renderer-test' }, (args) => ({
          contents: stubs[args.path],
          loader: 'js'
        }))
      }
    }
  ]
})
const encoded = Buffer.from(bundle.outputFiles[0].text).toString('base64')
const { OpenSearchDashboardsPanel } = await import(`data:text/javascript;base64,${encoded}`)

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const createTransport = () => {
  const listeners: Record<string, (key: string, response: any) => void> = {}
  const sent: any[][] = []
  return {
    listeners,
    sent,
    emit: (action: string, response: any) => listeners[action]?.(`${action}-request`, response),
    ipc: {
      send: (...args: any[]) => {
        sent.push(args)
        const action = args[1]
        return {
          key: `${action}-request`,
          then: (callback: (key: string, response: any) => void) => (listeners[action] = callback)
        }
      },
      off: (key: string) => {
        const action = key.replace(/-request$/, '')
        delete listeners[action]
      }
    }
  }
}
const running = {
  version: '2.19.0',
  bin: '/opt/opensearch/bin/opensearch',
  path: '/opt/opensearch',
  pid: '4123',
  run: true,
  running: false
} as const

const transport = createTransport()
const opened: string[] = []
const errors: string[] = []
const panel = new OpenSearchDashboardsPanel({
  ipc: transport.ipc,
  shell: { openExternal: async (url: string) => opened.push(url) },
  translate: (key: string) => key,
  notifyError: (message: string) => errors.push(message),
  inactivityTimeoutMs: 1000,
  maxTimeoutMs: 5000,
  prepareMaxTimeoutMs: 5000
})

const first = panel.open(running)
const duplicate = panel.open({ ...running, version: '2.18.0' })
assert.equal(first, duplicate, 'duplicate invocation shares the in-flight operation')
assert.equal(transport.sent.length, 1)
assert.equal(transport.sent[0][0], 'app-fork:opensearch')
assert.equal(transport.sent[0][1], 'prepareDashboards')
assert.notEqual(transport.sent[0][2], running, 'request snapshot is copied')
assert.deepEqual(transport.sent[0][2], running)
assert.equal(panel.opening, true)

transport.emit('prepareDashboards', {
  code: 200,
  msg: { 'APP-On-Progress': { stage: 'installing' } }
})
assert.equal(panel.opening, true, 'progress is not terminal')
assert.equal(panel.progressText, 'dashboardsInstalling')
transport.emit('prepareDashboards', {
  code: 0,
  data: { prepared: true, generation: 'fixture-epoch' }
})
assert.equal(
  transport.listeners.prepareDashboards,
  undefined,
  'prepare listener is removed on success'
)
await tick()
assert.equal(transport.sent.length, 2)
assert.equal(transport.sent[1][1], 'openDashboards')
assert.deepEqual(transport.sent[1][2], running, 'both phases use the same version snapshot')
assert.equal(transport.sent[1][3], 'fixture-epoch', 'open uses the preparation generation')
transport.emit('openDashboards', {
  code: 200,
  msg: { 'APP-On-Progress': { stage: 'starting' } }
})
assert.equal(panel.progressText, 'dashboardsStarting')
transport.emit('openDashboards', {
  code: 0,
  data: {
    url: 'http://127.0.0.1:5601',
    'APP-Service-Start-PID': 987,
    'APP-Service-Start-Item': running
  }
})
await first
assert.equal(panel.opening, false)
assert.equal(transport.listeners.openDashboards, undefined, 'open listener is removed on terminal')
assert.deepEqual(opened, ['http://127.0.0.1:5601'])

const failed = panel.open(running)
await tick()
transport.emit('prepareDashboards', {
  code: 0,
  data: { prepared: true, generation: 'fixture-epoch' }
})
await tick()
transport.emit('openDashboards', { code: 1, msg: 'dashboardsVersionMismatch' })
await failed
assert.equal(panel.opening, false)
assert.deepEqual(errors, ['dashboardsVersionMismatch'])

const retry = panel.open(running)
assert.equal(transport.sent.length, 5, 'a later user invocation starts one new prepare phase')
transport.emit('prepareDashboards', {
  code: 0,
  data: { prepared: true, generation: 'fixture-epoch' }
})
await tick()
transport.emit('openDashboards', { code: 0, data: { url: 'http://localhost:5601' } })
await retry
assert.equal(panel.opening, false)

const browserSendCount = { value: 0 }
const browserTransport = createTransport()
const browserFailurePanel = new OpenSearchDashboardsPanel({
  ipc: {
    send: (...args: any[]) => {
      browserSendCount.value += 1
      return browserTransport.ipc.send(...args)
    },
    off: browserTransport.ipc.off
  },
  shell: {
    openExternal: async () => {
      throw new Error('browser blocked')
    }
  },
  translate: (key: string) => key,
  notifyError: (message: string) => errors.push(message),
  inactivityTimeoutMs: 1000,
  maxTimeoutMs: 5000,
  prepareMaxTimeoutMs: 5000
})
const browserOpen = browserFailurePanel.open(running)
await tick()
browserTransport.emit('prepareDashboards', {
  code: 0,
  data: { prepared: true, generation: 'fixture-epoch' }
})
await tick()
browserTransport.emit('openDashboards', {
  code: 0,
  data: { url: 'http://127.0.0.1:5601' }
})
await browserOpen
assert.equal(browserFailurePanel.opening, false)
assert.equal(errors.at(-1), 'dashboardsBrowserOpenFailed')
assert.equal(browserSendCount.value, 2, 'a browser failure never retries either fork phase')

const failedPrepareTransport = createTransport()
const failedPreparePanel = new OpenSearchDashboardsPanel({
  ipc: failedPrepareTransport.ipc,
  shell: { openExternal: async () => undefined },
  translate: (key: string) => key,
  notifyError: (message: string) => errors.push(message),
  inactivityTimeoutMs: 1000,
  maxTimeoutMs: 5000,
  prepareMaxTimeoutMs: 5000
})
const failedPrepare = failedPreparePanel.open(running)
await tick()
failedPrepareTransport.emit('prepareDashboards', { code: 1, msg: 'dashboardsArchiveInvalid' })
await failedPrepare
assert.equal(failedPrepareTransport.sent.length, 1)
assert.equal(failedPrepareTransport.listeners.prepareDashboards, undefined)
assert.equal(failedPreparePanel.opening, false)
assert.equal(errors.at(-1), 'dashboardsArchiveInvalid')

const emptyGenerationTransport = createTransport()
const emptyGenerationPanel = new OpenSearchDashboardsPanel({
  ipc: emptyGenerationTransport.ipc,
  shell: { openExternal: async () => undefined },
  translate: (key: string) => key,
  notifyError: (message: string) => errors.push(message),
  inactivityTimeoutMs: 1000,
  maxTimeoutMs: 5000,
  prepareMaxTimeoutMs: 5000
})
const emptyGeneration = emptyGenerationPanel.open(running)
await tick()
emptyGenerationTransport.emit('prepareDashboards', {
  code: 0,
  data: { prepared: true, generation: '' }
})
await tick()
assert.equal(emptyGenerationTransport.sent.length, 2)
assert.equal(emptyGenerationTransport.sent[1][3], '', 'an empty initial generation remains valid')
emptyGenerationTransport.emit('openDashboards', { code: 1, msg: 'dashboardsOpenCancelled' })
await emptyGeneration

const missingGenerationTransport = createTransport()
const missingGenerationPanel = new OpenSearchDashboardsPanel({
  ipc: missingGenerationTransport.ipc,
  shell: { openExternal: async () => undefined },
  translate: (key: string) => key,
  notifyError: (message: string) => errors.push(message),
  inactivityTimeoutMs: 1000,
  maxTimeoutMs: 5000,
  prepareMaxTimeoutMs: 5000
})
const missingGeneration = missingGenerationPanel.open(running)
await tick()
missingGenerationTransport.emit('prepareDashboards', { code: 0, data: { prepared: true } })
await missingGeneration
assert.equal(missingGenerationTransport.sent.length, 1)
assert.equal(missingGenerationPanel.opening, false)
assert.equal(errors.at(-1), 'dashboardsOpenFailed')

const progressTransport = createTransport()
const progressPanel = new OpenSearchDashboardsPanel({
  ipc: progressTransport.ipc,
  shell: { openExternal: async () => undefined },
  translate: (key: string) => key,
  notifyError: (message: string) => errors.push(message),
  inactivityTimeoutMs: 20,
  maxTimeoutMs: 1000,
  prepareMaxTimeoutMs: 1000
})
const progressOpen = progressPanel.open(running)
setTimeout(() => {
  progressTransport.emit('prepareDashboards', {
    code: 200,
    msg: { 'APP-On-Progress': { stage: 'installing' } }
  })
  setTimeout(
    () =>
      progressTransport.emit('prepareDashboards', {
        code: 0,
        data: { prepared: true, generation: 'fixture-epoch' }
      }),
    12
  )
}, 12)
setTimeout(async () => {
  await tick()
  progressTransport.emit('openDashboards', {
    code: 0,
    data: { url: 'http://127.0.0.1:5601' }
  })
}, 30)
await progressOpen
assert.equal(progressPanel.opening, false)
assert.equal(
  Object.keys(progressTransport.listeners).length,
  0,
  'both phase listeners are cleaned up'
)

const noRun = new OpenSearchDashboardsPanel({
  ipc: {
    send: () => {
      throw new Error('must not send')
    },
    off: () => undefined
  },
  shell: { openExternal: async () => undefined },
  translate: (key: string) => key,
  notifyError: (message: string) => errors.push(message),
  inactivityTimeoutMs: 1000,
  maxTimeoutMs: 5000,
  prepareMaxTimeoutMs: 5000
})
await noRun.open({ ...running, run: false })
assert.equal(errors.at(-1), 'dashboardsNoRunningVersion')

const page = readFileSync(join(root, 'plugins/opensearch/render/Index.vue'), 'utf8')
assert.match(page, /installed\.find\(\(item\) =>/)
assert.match(page, /item\.run &&/)
assert.match(page, /!item\.running &&/)
assert.match(page, /dashboardsPanel\.open\(runningVersion\)/)
const controllerSource = readFileSync(source, 'utf8')
assert.match(controllerSource, /export default reactiveBind\(new OpenSearchDashboardsPanel\(\)\)/)
console.log('OpenSearch Dashboards renderer controller tests passed')
