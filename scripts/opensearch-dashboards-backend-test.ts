import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OpenSearchDashboardsRuntime } from '../plugins/opensearch/fork/OpenSearch/dashboards'

const root = await mkdtemp(join(tmpdir(), 'flyenv-dashboards-backend-'))
let status = 200
let requests = 0
const server = createServer((_request, response) => {
  requests++
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ version: { number: '3.9.0' } }))
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = (server.address() as { port: number }).port
await new Promise<void>((resolve) => server.close(() => resolve()))
await mkdir(join(root, 'config'))
await writeFile(join(root, 'config', 'opensearch.yml'), `http.port: ${port}\n`)
const backend = { path: root, version: '3.9.0', bin: join(root, 'bin', 'opensearch') }
const probe = (new OpenSearchDashboardsRuntime() as any).deps.probeBackend
const delayedListen = setTimeout(() => server.listen(port, '127.0.0.1'), 250)
try {
  assert.deepEqual(await probe(backend), { version: '3.9.0', port })
  status = 401
  const requestsBeforeAuth = requests
  await assert.rejects(probe(backend), /Authenticated/)
  assert.equal(requests, requestsBeforeAuth + 1, 'authentication errors must not be retried')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  const cancellation = new AbortController()
  const cancelTimer = setTimeout(() => cancellation.abort(), 50)
  try {
    await assert.rejects(probe(backend, cancellation.signal), /cancelled/i)
  } finally {
    clearTimeout(cancelTimer)
  }
  let probeEntered!: () => void
  const entered = new Promise<void>((resolve) => (probeEntered = resolve))
  const runtime = new OpenSearchDashboardsRuntime({
    baseDir: () => root,
    probeBackend: async (_backend, signal) => {
      probeEntered()
      return new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      })
    },
    install: async () => {
      throw new Error('cancelled backend wait must not install Dashboards')
    }
  })
  const opening = runtime.open(backend as any, () => {}).catch((error) => error)
  await entered
  assert.deepEqual(await runtime.stopAll(), [])
  assert.match(String(await opening), /cancelled/)
  console.log('OpenSearch backend delayed-readiness and cancellation tests passed')
} finally {
  clearTimeout(delayedListen)
  if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
}
