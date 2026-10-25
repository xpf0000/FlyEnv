import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { copyFile, link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import rustfs from '../src/fork/module/RustFS'
import EnvSync from '../src/shared/EnvSync'
import { fetchStopProcessListLocal } from '../src/shared/StopProcessList'
import { ProcessKillStrict, ProcessListByExactPid } from '../src/shared/Process'
import { waitForServiceProcessExit } from '../src/shared/ServiceStop'
import type { SoftInstalled } from '../src/shared/app'

if (process.platform !== 'win32' || !process.env.FLYENV_RUSTFS_TEST_ROOT) process.exit(0)

const root = await mkdtemp(join(tmpdir(), "FlyEnv RustFS Program Files 测试 ' "))
const previousServer = global.Server
const previousEnv = EnvSync.AppEnv
const previousCwd = process.cwd()
const previousPidPath = rustfs.pidPath
let startedPid = ''
try {
  global.Server = { BaseDir: root, Static: resolve('static') } as typeof global.Server
  EnvSync.AppEnv = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  delete EnvSync.AppEnv.RUSTFS_UNSAFE_BYPASS_DISK_CHECK
  await mkdir(join(root, 'pid'))
  await mkdir(join(root, 'rustfs'))
  rustfs.init()
  const peers = (await fetchStopProcessListLocal()).filter((item) =>
    /rustfs\.exe/i.test(item.EXECUTABLE ?? '')
  )
  for (const versionText of ['1.0.0-alpha.99', '1.0.3']) {
    const source = join(process.env.FLYENV_RUSTFS_TEST_ROOT, versionText, 'rustfs.exe')
    assert.ok(existsSync(source), `Missing RustFS ${versionText}`)
    const bin = join(root, `install ${versionText}`, 'rustfs.exe')
    await mkdir(dirname(bin))
    await link(source, bin).catch(async (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
      await copyFile(source, bin)
    })
    const installed = {
      bin,
      path: dirname(bin),
      version: versionText,
      typeFlag: 'rustfs'
    } as SoftInstalled
    const listeners = [createServer(), createServer()]
    const ports: number[] = []
    for (const listener of listeners) {
      await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done))
      ports.push((listener.address() as { port: number }).port)
    }
    await Promise.all(
      listeners.map((listener) => new Promise<void>((done) => listener.close(() => done())))
    )
    // Relative credential files must retain their old install-directory meaning.
    await mkdir(join(dirname(bin), 'keys'))
    await writeFile(join(dirname(bin), 'keys/access key.txt'), 'flyenvtest')
    await writeFile(join(dirname(bin), 'keys/secret key.txt'), 'flyenv-isolated-secret')
    await writeFile(
      join(root, 'rustfs/rustfs.conf'),
      [
        `RUSTFS_ADDRESS=127.0.0.1:${ports[0]}`,
        'RUSTFS_CONSOLE_ENABLE=false',
        `RUSTFS_CONSOLE_ADDRESS=127.0.0.1:${ports[1]}`,
        'RUSTFS_ACCESS_KEY_FILE=keys/access key.txt',
        'RUSTFS_SECRET_KEY_FILE=keys/secret key.txt'
      ].join('\n')
    )
    // Cover the default volume and a selected custom volume, both with spaces/Unicode.
    const selected = versionText === '1.0.3' ? join(root, "custom volume 数据 ' store") : undefined
    const dataDir = selected ?? join(root, 'rustfs/data')
    const started: any = await rustfs.startService(installed, selected)
    startedPid = `${started['APP-Service-Start-PID']}`
    const processList = await fetchStopProcessListLocal()
    assert.ok(processList.some((item) => item.PID === startedPid && item.COMMAND.endsWith(' .')))
    let healthy = false
    for (let attempt = 0; attempt < 80; attempt++) {
      const response = await fetch(`http://127.0.0.1:${ports[0]}/health`, {
        signal: AbortSignal.timeout(1000)
      }).catch(() => undefined)
      if (response?.status === 200) {
        healthy = true
        break
      }
      process.kill(Number(startedPid), 0)
      await new Promise((done) => setTimeout(done, 250))
    }
    if (!healthy) {
      const diagnostics = await Promise.all(
        ['out', 'error'].map((kind) =>
          readFile(join(root, `rustfs/rustfs-${versionText}-start-${kind}.log`), 'utf8')
        )
      )
      throw new Error(`RustFS ${versionText} unhealthy: ${diagnostics.join('\n').slice(-16000)}`)
    }
    assert.ok(
      (await readdir(dataDir)).some((name) => name.startsWith('.rustfs')),
      'Storage was initialized in the selected data directory'
    )
    assert.equal(await readFile(rustfs.pidPath, 'utf8'), startedPid)
    assert.equal(existsSync(join(dirname(bin), 'Files')), false)
    const targets = ProcessListByExactPid(startedPid, processList).map((item) => item.PID)
    await rustfs.stopService(
      { ...installed, pid: startedPid },
      { processList, reason: versionText === '1.0.3' ? 'quit' : 'stop' }
    )
    await waitForServiceProcessExit(targets, 10_000, { initialList: processList })
    const after = await fetchStopProcessListLocal()
    assert.ok(
      peers.every((peer) =>
        after.some((item) => item.PID === peer.PID && item.CREATED === peer.CREATED)
      )
    )
    assert.equal(existsSync(rustfs.pidPath), false)
    console.log(
      `RustFS ${versionText}: selected volume, relative credentials, HTTP health 200 and shutdown passed`
    )
    startedPid = ''
  }
} finally {
  process.chdir(previousCwd)
  if (startedPid) {
    const list = await fetchStopProcessListLocal()
    const pids = ProcessListByExactPid(startedPid, list).map((item) => item.PID)
    if (pids.length) {
      await ProcessKillStrict('-INT', pids)
      await waitForServiceProcessExit(pids, 10_000, { initialList: list })
    }
  }
  rustfs.pidPath = previousPidPath
  EnvSync.AppEnv = previousEnv
  global.Server = previousServer
  assert.ok(root.startsWith(join(tmpdir(), "FlyEnv RustFS Program Files 测试 ' ")))
  await rm(root, { recursive: true, force: true })
}
