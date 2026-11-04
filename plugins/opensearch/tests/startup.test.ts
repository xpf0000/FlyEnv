import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { request as httpsRequest } from 'node:https'
import {
  hasOpenSearchStarted,
  isOpenSearchServer,
  startupLogReader,
  waitForOpenSearchStartup,
  type OpenSearchStartupState
} from '../fork/OpenSearch/startup'
import type { PItem } from '../../../src/shared/Process'

const home = 'D:/Program Files/OpenSearch'
const conf = 'D:/Program Files/OpenSearch/config'
const launcher: PItem = {
  PID: '100',
  PPID: '1',
  USER: '',
  COMMAND: 'powershell.exe',
  EXECUTABLE: 'C:/Windows/powershell.exe',
  CREATED: '2026-10-25T00:00:00.000000Z'
}
const server: PItem = {
  ...launcher,
  PID: '101',
  PPID: '100',
  EXECUTABLE: 'C:/Java/bin/java.exe',
  COMMAND: `java "-Dopensearch.path.home=${home}" "-Dopensearch.path.conf=${conf}" org.opensearch.bootstrap.OpenSearch`
}
const ready = '[2026-10-25][INFO ][o.o.n.Node               ] [fixture] started\n'
const state = (): OpenSearchStartupState => ({ list: [] })

test('matches the real JVM home/config, not a wrapper or another installation', () => {
  assert.equal(isOpenSearchServer(server, home, conf), true)
  assert.equal(isOpenSearchServer(launcher, home, conf), false)
  assert.equal(isOpenSearchServer(server, `${home}.other`, conf), false)
  assert.equal(isOpenSearchServer(server, home, `${conf}.other`), false)
  assert.equal(isOpenSearchServer({ ...server, COMMAND: '' }, home, conf), false)
})

test('accepts only the OpenSearch node started event', () => {
  assert.equal(hasOpenSearchStarted(ready), true)
  assert.equal(hasOpenSearchStarted('{"component":"o.o.n.Node","message":"started"}'), true)
  assert.equal(hasOpenSearchStarted('[INFO][other] [fixture] started'), false)
  assert.equal(hasOpenSearchStarted('pid file created'), false)
})

test('a live JVM and PID file do not report ready until the node actually starts', async () => {
  let reads = 0
  let waits = 0
  const pid = await waitForOpenSearchStartup({
    launcherPid: '100',
    home,
    conf,
    state: state(),
    readPid: async () => '101',
    listProcesses: async () => [launcher, server],
    readLogs: async () => (reads++ ? ready : 'initializing plugins'),
    wait: async () => {
      waits += 1
    }
  })
  assert.equal(pid, '101')
  assert.equal(waits, 1)
})

test('a JVM that dies after writing its PID rejects with the real SSL error', async () => {
  await assert.rejects(
    waitForOpenSearchStartup({
      launcherPid: '100',
      home,
      conf,
      state: state(),
      readPid: async () => '101',
      listProcesses: async () => [launcher],
      readLogs: async () => 'OpenSearchException[No SSL configuration found]',
      wait: async () => assert.fail('a dead JVM cannot be retried as ready')
    }),
    /No SSL configuration found/
  )
})

test('does not adopt another process with the same config or a reused launcher PID', async () => {
  await assert.rejects(
    waitForOpenSearchStartup({
      launcherPid: '100',
      home,
      conf,
      state: state(),
      readPid: async () => '101',
      listProcesses: async () => [launcher, { ...server, PPID: '999' }],
      readLogs: async () => ready,
      wait: async () => {}
    }),
    /does not belong/
  )
  await assert.rejects(
    waitForOpenSearchStartup({
      launcherPid: '100',
      home,
      conf,
      state: { list: [], launcherCreated: '2026-10-24T00:00:00Z' },
      readPid: async () => '101',
      listProcesses: async () => [launcher, server],
      readLogs: async () => ready,
      wait: async () => {}
    }),
    /startup process identity/
  )
})

test('old startup logs cannot make a new JVM ready; new bytes can', async () => {
  const root = await mkdtemp(join(tmpdir(), 'FlyEnv OpenSearch logs '))
  try {
    const file = join(root, 'startup.log')
    await writeFile(file, ready)
    const readLogs = await startupLogReader([file])
    assert.equal(hasOpenSearchStarted(await readLogs()), false)
    await appendFile(file, 'initializing new JVM\n')
    assert.equal(hasOpenSearchStarted(await readLogs()), false)
    await appendFile(file, ready)
    assert.equal(hasOpenSearchStarted(await readLogs()), true)
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'FlyEnv OpenSearch logs ')))
    await rm(root, { recursive: true, force: true })
  }
})

test('snapshot errors and readiness timeout remain failures', async () => {
  await assert.rejects(
    waitForOpenSearchStartup({
      launcherPid: '100',
      home,
      conf,
      state: state(),
      readPid: async () => '101',
      listProcesses: async () => {
        throw new Error('snapshot unavailable')
      },
      readLogs: async () => ready,
      wait: async () => {}
    }),
    /snapshot unavailable/
  )
  await assert.rejects(
    waitForOpenSearchStartup({
      launcherPid: '100',
      home,
      conf,
      state: state(),
      readPid: async () => '101',
      listProcesses: async () => [launcher, server],
      readLogs: async () => 'initializing',
      wait: async () => {},
      timeoutMs: 0
    }),
    /startup timeout/
  )
})

test(
  'real OpenSearch rejects missing SSL and reports success only after a healthy startup',
  {
    skip: process.platform !== 'win32' || !process.env.FLYENV_OPENSEARCH_TEST_ROOT,
    timeout: 240_000
  },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'FlyEnv OpenSearch startup '))
    const previousServer = global.Server
    const previousCwd = process.cwd()
    const { default: module } = await import('../fork/OpenSearch')
    const { default: EnvSync } = await import('../../../src/shared/EnvSync')
    const { fetchStopProcessListLocal } = await import('../../../src/shared/StopProcessList')
    const previousEnv = EnvSync.AppEnv
    const previousPidPath = module.pidPath
    const install = join(root, 'distribution')
    const version = {
      version: '3.9.0',
      path: install,
      bin: join(install, 'bin/opensearch.bat'),
      typeFlag: 'opensearch'
    } as any
    try {
      const source = process.env.FLYENV_OPENSEARCH_TEST_ROOT!
      await mkdir(install)
      for (const dir of ['agent', 'bin', 'jdk', 'lib', 'modules', 'plugins']) {
        await symlink(join(source, dir), join(install, dir), 'junction')
      }
      const configDir = join(install, 'config')
      await mkdir(configDir)
      await copyFile(join(source, 'config/log4j2.properties'), join(configDir, 'log4j2.properties'))
      const options =
        (await readFile(join(source, 'config/jvm.options'), 'utf8'))
          .split(/\r?\n/)
          .filter((line) => !/^\s*-Xm[sx]/.test(line))
          .join('\n') + '\n-Xms512m\n-Xmx512m\n'
      await writeFile(join(configDir, 'jvm.options'), options)
      const listeners = [createServer(), createServer()]
      const ports: number[] = []
      for (const listener of listeners) {
        await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done))
        ports.push((listener.address() as { port: number }).port)
      }
      await Promise.all(
        listeners.map((listener) => new Promise<void>((done) => listener.close(() => done())))
      )
      const config =
        [
          'cluster.name: flyenv_startup_test',
          'node.name: flyenv_startup_test',
          'network.host: 127.0.0.1',
          `http.port: ${ports[0]}`,
          `transport.port: ${ports[1]}`,
          'discovery.type: single-node',
          `path.data: ${JSON.stringify(join(root, 'data'))}`,
          `path.logs: ${JSON.stringify(join(root, 'logs'))}`
        ].join('\n') + '\n'
      await writeFile(join(configDir, 'opensearch.yml'), config)
      global.Server = {
        BaseDir: root,
        Static: join(process.cwd(), 'static')
      } as typeof global.Server
      EnvSync.AppEnv = Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined
        )
      )
      module.init()
      if (!process.env.FLYENV_OPENSEARCH_TEST_TLS_ONLY) {
        const failedEvents: any[] = []
        await assert.rejects(
          Promise.resolve(module.startService(version).on((event) => failedEvents.push(event))),
          /No SSL configuration found/
        )
        assert.equal(
          failedEvents.some((event) => event['APP-Service-Start-Success']),
          false
        )
        const afterFailure = await fetchStopProcessListLocal()
        assert.equal(
          afterFailure.some((process) => isOpenSearchServer(process, install, configDir)),
          false
        )
        console.log('OpenSearch real SSL failure: rejected without startup success')
        await writeFile(
          join(configDir, 'opensearch.yml'),
          config + 'plugins.security.disabled: true\n'
        )
        const started: any = await module.startService(version)
        const pid = `${started['APP-Service-Start-PID']}`
        const processList = await fetchStopProcessListLocal()
        assert.ok(
          processList.some(
            (process) => process.PID === pid && isOpenSearchServer(process, install, configDir)
          )
        )
        const response = await fetch(`http://127.0.0.1:${ports[0]}`, {
          signal: AbortSignal.timeout(3000)
        })
        assert.equal(response.status, 200)
        assert.equal(((await response.json()) as any).version.number, '3.9.0')
        await module.stopService({ ...version, pid }, { processList, reason: 'quit' })
        assert.equal(
          (await fetchStopProcessListLocal()).some((process) => process.PID === pid),
          false
        )
        console.log('OpenSearch real ready/quit: actual JVM and HTTP API verified')
      }
      if (process.env.FLYENV_OPENSEARCH_TEST_CA) {
        const caCert = process.env.FLYENV_OPENSEARCH_TEST_CA
        const caKey = process.env.FLYENV_OPENSEARCH_TEST_CA_KEY!
        const originalKey = await readFile(caKey)
        const configured: any = await module.configureLocalTLS(version, { caCert, caKey })
        assert.ok((await readFile(caKey)).equals(originalKey), 'Original CA key was modified')
        const secure: any = await module.startService(version)
        const securePid = `${secure['APP-Service-Start-PID']}`
        const response = await new Promise<{ status: number; body: string }>(
          async (resolve, reject) => {
            try {
              const req = httpsRequest(
                {
                  hostname: '127.0.0.1',
                  port: ports[0],
                  path: '/',
                  ca: await readFile(join(configured.directory, 'root-ca.pem')),
                  cert: await readFile(join(configured.directory, 'admin.pem')),
                  key: await readFile(join(configured.directory, 'admin-key.pem')),
                  timeout: 5000
                },
                (res) => {
                  let body = ''
                  res.setEncoding('utf8')
                  res.on('data', (chunk) => {
                    body += chunk
                  })
                  res.on('end', () => resolve({ status: res.statusCode!, body }))
                }
              )
              req.on('error', reject)
              req.on('timeout', () => req.destroy(new Error('HTTPS timeout')))
              req.end()
            } catch (error) {
              reject(error)
            }
          }
        )
        assert.ok(
          [200, 503].includes(response.status),
          `HTTPS ${response.status}: ${response.body}`
        )
        if (response.status === 503) assert.match(response.body, /not initialized/i)
        const secureList = await fetchStopProcessListLocal()
        await module.stopService(
          { ...version, pid: securePid },
          { processList: secureList, reason: 'quit' }
        )
        assert.equal(
          (await fetchStopProcessListLocal()).some((process) => process.PID === securePid),
          false
        )
        console.log(
          `OpenSearch real FlyEnv CA TLS: verified HTTPS/admin certificate, status ${response.status}, quit stopped JVM`
        )
      }
    } finally {
      process.chdir(previousCwd)
      // Stop only this test's cloned installation if an assertion interrupted startup.
      await module.stopService(version).catch(() => {})
      module.pidPath = previousPidPath
      EnvSync.AppEnv = previousEnv
      global.Server = previousServer
      assert.ok(root.startsWith(join(tmpdir(), 'FlyEnv OpenSearch startup ')))
      await rm(root, { recursive: true, force: true })
    }
  }
)
