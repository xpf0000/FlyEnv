import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import electron from 'electron'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { buildPlugin } from './plugin-builder'

const baselineOnly = process.argv.includes('--retrieval-baseline-only')
const retrievalOnly = baselineOnly || process.argv.includes('--retrieval-only')
const output = resolve(
  `.superpowers/sdd/2026-11-03-flyenv-ai-memory/${baselineOnly ? 'acceptance-baseline' : retrievalOnly ? 'acceptance-retrieval' : 'acceptance'}`
)
await mkdir(output, { recursive: true })
const root = await mkdtemp(join(tmpdir(), 'flyenv-memory-acceptance-'))
const checkpoints: string[] = []
let child: ReturnType<typeof spawn> | undefined
let exited: Promise<void> | undefined
let client: Client | undefined
let phase = 0
let hostLog = ''
const waitUntil = async <T>(probe: () => Promise<T | undefined>, timeout = 30_000): Promise<T> => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const error = await readFile(join(root, 'host-error.json'), 'utf8').catch(() => '')
    if (error) throw new Error(error)
    const result = await probe()
    if (result !== undefined) return result
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('acceptance_timeout')
}
const control = async (request: Record<string, unknown>) => {
  const id = randomUUID()
  await writeFile(join(root, 'request.tmp'), JSON.stringify({ ...request, id }))
  await rename(join(root, 'request.tmp'), join(root, 'request.json'))
  return waitUntil(async () => {
    const value = JSON.parse(
      await readFile(join(root, 'response.json'), 'utf8').catch(() => 'null')
    )
    return value?.id === id ? value.result : undefined
  })
}
const token = randomUUID()
const portProbe = createServer()
await new Promise<void>((yes) => portProbe.listen(0, '127.0.0.1', yes))
const port = (portProbe.address() as any).port
await new Promise<void>((yes) => portProbe.close(() => yes()))
const endpoint = `http://127.0.0.1:${port}/mcp`
const start = async () => {
  phase++
  await rm(join(root, 'ready.json'), { force: true })
  await rm(join(root, 'host-error.json'), { force: true })
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FLYENV_DATA_ROOT: root,
    FLYENV_PLUGIN_PATH: join(output, 'package')
  }
  delete env.ELECTRON_RUN_AS_NODE
  child = spawn(electron as unknown as string, [join(output, 'host/host.mjs')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout!.on('data', (bytes) => {
    hostLog += bytes
  })
  child.stderr!.on('data', (bytes) => {
    hostLog += bytes
  })
  exited = new Promise((yes, no) => {
    child!.once('exit', () => yes())
    child!.once('error', no)
  })
  const ready = await waitUntil(
    async () =>
      JSON.parse(await readFile(join(root, 'ready.json'), 'utf8').catch(() => 'null')) ?? undefined
  )
  client = new Client({ name: 'flyenv', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }
    })
  )
  return ready
}
const stop = async () => {
  await client?.close()
  client = undefined
  if (child && child.exitCode === null) {
    await control({ kind: 'stop' })
    await exited
  }
  child = undefined
}
const call = async (method: string, input: any) => {
  const envelope: any = await client!.callTool({ name: `memory_${method}`, arguments: input })
  return { ...JSON.parse(envelope.content[0].text), mcpIsError: !!envelope.isError }
}
const ui = async (method: string, input: any) => {
  const response = await control({ kind: 'ui', args: [method, input] })
  assert.equal(response.code, 0)
  return response.data
}
const draft = (title = 'Acceptance fixture') => ({
  scope: 'global',
  request_id: randomUUID(),
  type: 'note',
  title,
  topic: 'acceptance',
  summary: 'Constructed acceptance sample',
  tags: ['acceptance'],
  content: 'PRIVATE_FIXTURE_BODY_MARKER',
  source: { kind: 'document', agent: 'fixture', description: 'Constructed temporary record' }
})
try {
  await buildPlugin('ai-memory', { outputRoot: join(output, 'package'), archive: false })
  await build({
    platform: 'node',
    format: 'esm',
    bundle: true,
    packages: 'external',
    splitting: true,
    outExtension: { '.js': '.mjs' },
    outdir: join(output, 'host'),
    entryPoints: { host: 'test/fixtures/ai-memory-acceptance-host.ts', fork: 'src/fork/index.ts' }
  })
  const preload = join(output, 'preload.cjs')
  await writeFile(
    preload,
    "const {contextBridge,ipcRenderer}=require('electron'); contextBridge.exposeInMainWorld('FlyEnvNodeAPI',{send:(command,key,...args)=>ipcRenderer.send('command',command,key,...args),receive:cb=>ipcRenderer.on('reply',(_event,...args)=>cb(...args))});"
  )
  const html = join(output, 'index.html')
  await writeFile(html, '<!doctype html><html><body>Isolated memory IPC acceptance</body></html>')
  await writeFile(
    join(root, 'options.json'),
    JSON.stringify({
      staticPath: resolve('static'),
      forkFile: join(output, 'host/fork.mjs'),
      preload,
      html,
      port,
      token
    })
  )
  const projectA = join(root, 'atlas'),
    projectB = join(root, 'other'),
    childProject = join(projectA, 'child')
  await Promise.all([mkdir(childProject, { recursive: true }), mkdir(projectB)])
  const ready = await start()
  assert.equal((await client!.listTools()).tools.length, 5)
  checkpoints.push('five-production-http-tools')
  const request = draft()
  const saved = await call('store', request)
  assert.equal(saved.outcome, 'success')
  assert.equal(saved.mcpIsError, false)
  const fromUI = await ui('get', { scope: 'global', id: saved.data.id })
  assert.equal(fromUI.data.content, request.content)
  const writtenUI = await ui('store', draft('Saved through renderer IPC'))
  assert.equal(
    (await call('get', { scope: 'global', id: writtenUI.data.id })).data.title,
    'Saved through renderer IPC'
  )
  checkpoints.push('http-write-ui-read-and-ui-write-http-read')
  for (const project_path of [projectA, projectB])
    await call('store', { ...draft(), scope: 'project', project_path })
  assert.equal(
    (await call('search', { scope: 'project', project_path: projectA })).data.results.length,
    1
  )
  assert.equal(
    (await call('search', { scope: 'project', project_path: projectB })).data.results.length,
    1
  )
  const childSearch = await call('search', { scope: 'project', project_path: childProject })
  assert.equal(childSearch.data.project_candidates.length, 1)
  assert.equal(
    (await call('store', { ...draft(), scope: 'project', project_path: childProject })).error_code,
    'project_selection_required'
  )
  assert.equal(
    (
      await call('store', {
        ...draft(),
        scope: 'project',
        project_path: childProject,
        create_project: true
      })
    ).outcome,
    'success'
  )
  const revisionInput = {
    scope: 'global',
    id: saved.data.id,
    expected_revision: 1,
    reason: 'Concurrent acceptance',
    changes: { title: 'Revision winner' }
  }
  const competitors = await Promise.all([
    call('update', { ...revisionInput, request_id: randomUUID() }),
    ui('update', { ...revisionInput, request_id: randomUUID() })
  ])
  assert.deepEqual(competitors.map((r) => r.outcome).sort(), ['conflict', 'success'])
  assert.deepEqual((await call('store', request)).data, saved.data)
  checkpoints.push('scope-isolation-child-choice-concurrency-replay')
  const denied = await control({ kind: 'approvalRace', input: draft('Approval must not write') })
  assert.equal(denied.error_code, 'tool_disabled')
  assert.equal(
    (await call('search', { scope: 'global', queries: ['Approval must not write'] })).data.results
      .length,
    0
  )
  checkpoints.push('approval-rechecks-enabled-state')
  const forget = await call('forget', {
    scope: 'global',
    id: writtenUI.data.id,
    expected_revision: 1,
    request_id: randomUUID()
  })
  assert.equal(forget.outcome, 'success')
  assert.equal(forget.mcpIsError, false)
  const again = await call('forget', {
    scope: 'global',
    id: writtenUI.data.id,
    expected_revision: 1,
    request_id: randomUUID()
  })
  assert.equal(again.outcome, 'already_deleted')
  assert.equal(again.mcpIsError, false)
  const audit = await control({ kind: 'audit' })
  assert.ok(audit.some((row: any) => row.id === saved.data.id && row.revision === 1))
  assert.ok(audit.some((row: any) => typeof row.hit_count === 'number'))
  assert.equal(JSON.stringify(audit).includes('PRIVATE_FIXTURE_BODY_MARKER'), false)
  await writeFile(join(output, 'host-audit.json'), JSON.stringify(audit, null, 2))
  await stop()
  const restarted = await start()
  assert.notEqual(restarted.pid, ready.pid)
  assert.equal(restarted.dataRoot, ready.dataRoot)
  assert.equal((await call('get', { scope: 'global', id: saved.data.id })).data.revision, 2)
  assert.deepEqual((await call('store', request)).data, saved.data)
  checkpoints.push('actual-exit-restart-same-data-root-receipt')
  if (!process.argv.includes('--skip-agents')) {
    const { runAgentAcceptance } = await import('../plugins/ai-memory/scripts/agent-acceptance')
    await runAgentAcceptance({
      endpoint,
      token,
      output,
      projectA,
      projectB,
      childProject,
      call,
      restart: async () => {
        await stop()
        await start()
      },
      audit: () => control({ kind: 'audit' })
    })
    checkpoints.push('real-codex-kimi')
  }
  await stop()
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify(
      {
        ok: true,
        platform: process.platform,
        arch: process.arch,
        phases: phase,
        checkpoints,
        agentsRun: !process.argv.includes('--skip-agents'),
        retrievalOnly,
        baselineOnly
      },
      null,
      2
    )
  )
  console.log(JSON.stringify({ ok: true, checkpoints, output }))
} catch (error) {
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify({ ok: false, checkpoints, error: String(error) }, null, 2)
  )
  throw error
} finally {
  await stop().catch(() => {})
  if (child && child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
  await writeFile(join(output, 'host.log'), hostLog)
  await rm(root, { recursive: true, force: true })
}
