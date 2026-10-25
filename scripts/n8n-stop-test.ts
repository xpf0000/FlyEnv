import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import n8n from '../src/fork/module/N8N'
import { windowsN8nRootMatcher } from '../src/fork/module/N8N/Process'
import { fetchStopProcessListLocal } from '../src/shared/StopProcessList'
import { ProcessKillStrict, ProcessListByExactPid, type PItem } from '../src/shared/Process'
import { waitForServiceProcessExit } from '../src/shared/ServiceStop'
import EnvSync from '../src/shared/EnvSync'
import type { SoftInstalled } from '../src/shared/app'

if (process.platform !== 'win32') {
  console.log('n8n Windows stop regression: skipped on this platform')
  process.exit(0)
}

const root = await mkdtemp(join(tmpdir(), 'FlyEnv n8n stop '))
const previousServer = global.Server
const previousPidPath = n8n.pidPath
const previousCwd = process.cwd()
const children: ChildProcess[] = []
const startedPids = new Set<string>()
const versionFor = (bin: string, pid = '') =>
  ({ bin, path: dirname(bin), pid, version: '2.13.0', typeFlag: 'n8n' }) as SoftInstalled
try {
  global.Server = { BaseDir: root } as typeof global.Server
  await mkdir(join(root, 'n8n'))
  await mkdir(join(root, 'pid'))
  n8n.init()
  const appPidFile = join(root, 'pid/n8n.pid')
  const install = join(root, 'install A')
  const alias = join(root, 'env node')
  const script = join(install, 'node_modules/n8n/bin/n8n')
  await mkdir(dirname(script), { recursive: true })
  await writeFile(script, 'setInterval(() => {}, 1000)\n')
  await symlink(install, alias, 'junction')
  const version = versionFor(join(install, 'n8n.cmd'))
  const row = (command: string, extra: Partial<PItem> = {}): PItem => ({
    PID: '101',
    PPID: '1',
    USER: '',
    CREATED: '2026-10-25T00:00:00.000000Z',
    EXECUTABLE: process.execPath,
    COMMAND: command,
    ...extra
  })
  const matcher = windowsN8nRootMatcher(version)
  let count = 0
  for (const entry of [
    script,
    join(alias, 'node_modules/n8n/bin/n8n'),
    script.replaceAll('\\', '/'),
    script.toUpperCase(),
    join(install, 'node_modules/n8n/bin/../bin/n8n')
  ]) {
    assert.equal(matcher(row(`"${process.execPath}" "${entry}" start`)), true, entry)
    count += 1
  }
  for (const command of [
    `"${process.execPath}" "${script}.other" start`,
    `"${process.execPath}" "${join(root, 'install B/node_modules/n8n/bin/n8n')}" start`,
    `"${process.execPath}" "${join(install, 'node_modules/other/bin/n8n')}" start`,
    `"${process.execPath}" "${join(install, 'node_modules/n8n/bin/runner')}" start`,
    `"${process.execPath}" "${script}" worker`,
    `"${process.execPath}" "${script}" export:workflow`,
    `"${process.execPath}" -e "console.log('${script}')"`,
    `cmd.exe /c n8n.cmd start`,
    '',
    `powershell.exe "${script}" start`
  ]) {
    assert.equal(matcher(row(command)), false, command)
    count += 1
  }
  for (const extra of [{ COMMAND: '' }, { EXECUTABLE: '' }, { CREATED: undefined }]) {
    assert.equal(matcher(row(`"${process.execPath}" "${script}" start`, extra)), false)
    count += 1
  }
  console.log(`n8n process identity regression: ${count} cases passed`)

  // Opt in with an installed npm launcher. Only the temporary user folder is used.
  if (process.env.FLYENV_N8N_TEST_BIN) {
    const launcher = resolve(process.env.FLYENV_N8N_TEST_BIN)
    const physical = await realpath(launcher)
    const node = join(dirname(launcher), 'node.exe')
    const listener = createServer()
    await new Promise<void>((done, fail) => {
      listener.once('error', fail)
      listener.listen(0, '127.0.0.1', done)
    })
    const port = (listener.address() as { port: number }).port
    await new Promise<void>((done) => listener.close(() => done()))
    const env = {
      N8N_USER_FOLDER: join(root, 'user'),
      N8N_PORT: `${port}`,
      N8N_RUNNERS_ENABLED: 'false',
      N8N_DIAGNOSTICS_ENABLED: 'false',
      N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
      N8N_TEMPLATES_ENABLED: 'false'
    }
    const envFile = join(root, 'n8n/n8n.env')
    await writeFile(
      envFile,
      Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')
    )
    const startChild = (args: string[], options: { env?: NodeJS.ProcessEnv } = {}) => {
      const child = spawn(node, args, { windowsHide: true, stdio: 'ignore', ...options })
      children.push(child)
      return child
    }
    // An unrelated Node process in the same installation must survive a stale registered PID.
    const unrelated = startChild(['-e', 'setInterval(() => {}, 1000)'])
    await once(unrelated, 'spawn')
    const foreign = startChild([script, 'start']) // n8n-shaped entry from a different installation.
    await once(foreign, 'spawn')
    const child = startChild([join(dirname(launcher), 'node_modules/n8n/bin/n8n'), 'start'], {
      env: { ...process.env, ...env }
    })
    await once(child, 'spawn')
    const waitHealthy = async () => {
      const deadline = Date.now() + 40_000
      while (true) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
            signal: AbortSignal.timeout(1000)
          })
          if (response.ok) return
        } catch {}
        assert.ok(Date.now() < deadline, 'isolated n8n must become ready')
        await new Promise((done) => setTimeout(done, 250))
      }
    }
    await waitHealthy()
    const pid = `${child.pid}`
    await writeFile(n8n.pidPath, pid)
    await writeFile(appPidFile, `${unrelated.pid}`)
    const processList = await fetchStopProcessListLocal()
    const targets = ProcessListByExactPid(pid, processList).map((item) => item.PID)
    assert.ok(targets.length > 1, 'test covers the internal runner companion')
    const liveVersion = versionFor(physical, `${unrelated.pid}`)

    // A required PID-file read failure must reject without stopping or clearing anything.
    await unlink(n8n.pidPath)
    await mkdir(n8n.pidPath)
    await assert.rejects(
      Promise.resolve(n8n.stopService(liveVersion, { processList, reason: 'stop' })),
      /EISDIR|EPERM/
    )
    assert.equal(await readFile(appPidFile, 'utf8'), `${unrelated.pid}`)
    process.kill(Number(pid), 0)
    await rmdir(n8n.pidPath)
    await writeFile(n8n.pidPath, pid)
    // A bad display/configuration port must not block stopping the already identified tree.
    await writeFile(envFile, 'N8N_PORT=invalid\n')
    const stopped = await n8n.stopService(liveVersion, { processList, reason: 'stop' })
    assert.deepEqual(new Set(stopped['APP-Service-Stop-PID']), new Set(targets))
    const finalList = await fetchStopProcessListLocal()
    assert.equal(
      finalList.some((item) => targets.includes(item.PID)),
      false
    )
    assert.equal(existsSync(n8n.pidPath), false)
    assert.equal(await readFile(appPidFile, 'utf8'), `${unrelated.pid}`)
    for (const peer of [unrelated, foreign]) process.kill(peer.pid!, 0)
    console.log(
      'n8n live manual stop/retry: passed; runner stopped and unrelated processes preserved'
    )

    // Exercise the real FlyEnv launcher and make sure it registers the new n8n root,
    // even while another n8n-shaped process is present in the first process snapshot.
    await writeFile(
      envFile,
      Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')
    )
    EnvSync.AppEnv = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    )
    const started: any = await n8n._startServer(versionFor(physical))
    const startedPid = `${started['APP-Service-Start-PID']}`
    startedPids.add(startedPid)
    assert.notEqual(startedPid, `${foreign.pid}`)
    assert.notEqual(startedPid, `${unrelated.pid}`)
    await waitHealthy()
    await writeFile(appPidFile, startedPid)
    const quitList = await fetchStopProcessListLocal()
    const quitTargets = ProcessListByExactPid(startedPid, quitList).map((item) => item.PID)
    assert.ok(quitTargets.includes(startedPid))
    const quitResult = await n8n.stopService(versionFor(physical, startedPid), {
      processList: quitList,
      reason: 'quit'
    })
    assert.deepEqual(new Set(quitResult['APP-Service-Stop-PID']), new Set(quitTargets))
    const afterQuit = await fetchStopProcessListLocal()
    assert.equal(
      afterQuit.some((item) => quitTargets.includes(item.PID)),
      false
    )
    assert.equal(existsSync(n8n.pidPath), false)
    assert.equal(existsSync(appPidFile), false)
    for (const peer of [unrelated, foreign]) process.kill(peer.pid!, 0)
    console.log(
      'n8n live FlyEnv launch/quit: passed; root registration and companion cleanup verified'
    )
  }
} finally {
  process.chdir(previousCwd)
  // Cleanup is restricted to roots explicitly created by this test.
  for (const pid of [...children.map((child) => `${child.pid ?? ''}`), ...startedPids]) {
    if (!pid) continue
    const list = await fetchStopProcessListLocal()
    const pids = ProcessListByExactPid(pid, list).map((item) => item.PID)
    if (!pids.length) continue
    await ProcessKillStrict('-INT', pids)
    await waitForServiceProcessExit(pids, 10_000, { initialList: list })
  }
  n8n.pidPath = previousPidPath
  global.Server = previousServer
  assert.ok(root.startsWith(join(tmpdir(), 'FlyEnv n8n stop ')))
  await rm(root, { recursive: true, force: true })
}
