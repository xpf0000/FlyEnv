import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, access, realpath } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createConnection, escape } from 'mysql2/promise'
import type { Credential, EventSink, InstanceSnapshot, InstanceSpec } from '../shared'
import { errorText } from '../shared'
import { InstanceCatalog, assertFreePort } from './catalog'
import { selectInstanceRoots } from './processIdentity'
import { writeAtomic } from './io'
import { normalizedPath } from '../policy'
import { renderConfig, validateConfigEdit } from './config'

export type ProcessRow = { PID: string; PPID: string; COMMAND: string }
export interface RuntimeDependencies {
  list(): Promise<ProcessRow[]>
  stop(spec: InstanceSpec, registeredPid?: string): Promise<string[]>
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
export class MysqlInstanceRuntime {
  constructor(
    readonly catalog: InstanceCatalog,
    private readonly deps: RuntimeDependencies
  ) {}
  descriptor(spec: InstanceSpec) {
    return {
      typeFlag: 'mysql-cluster',
      bin: this.catalog.paths(spec.id).config,
      path: this.catalog.paths(spec.id).dir,
      version: spec.engine.version,
      source: spec.engine.source,
      enable: true,
      run: false,
      running: false,
      num: 0
    }
  }
  async discover(id: string, list?: ProcessRow[]): Promise<InstanceSnapshot> {
    const { spec } = await this.catalog.instance(id)
    const rows = list ?? (await this.deps.list())
    const roots = selectInstanceRoots(
      rows,
      this.catalog.paths(id).config,
      this.catalog.platform === 'Windows',
      [spec.engine.bin, await realpath(spec.engine.bin).catch(() => spec.engine.bin)]
    )
    if (roots.some((root) => /\s--initialize(?:-insecure)?(?:\s|=|$)/.test(root.COMMAND)))
      return { id, state: 'unknown', error: 'Instance initialization is in progress' }
    if (roots.length === 1) return { id, state: 'running', pid: roots[0].PID }
    if (roots.length > 1)
      return { id, state: 'unknown', error: 'Multiple processes use this instance configuration' }
    let recorded = ''
    try {
      recorded = (await readFile(this.catalog.paths(id).pid, 'utf8')).trim()
    } catch (error: any) {
      if (error.code !== 'ENOENT')
        return { id, state: 'unknown', error: 'Cannot read instance PID file' }
    }
    if (
      recorded &&
      rows.some(
        (p) =>
          p.PID === recorded &&
          (!p.COMMAND?.trim() || p.COMMAND.includes(this.catalog.paths(id).config))
      )
    )
      return { id, state: 'unknown', error: 'Cannot verify instance process identity' }
    try {
      await access(spec.engine.bin)
    } catch {
      return { id, state: 'missing', error: 'MySQL installation is unavailable' }
    }
    return { id, state: 'stopped' }
  }
  async listInstances(): Promise<InstanceSnapshot[]> {
    const c = await this.catalog.read(),
      list = await this.deps.list()
    return Promise.all(
      c.instances.map(async (i) => {
        try {
          return await this.discover(i.id, list)
        } catch (error) {
          return { id: i.id, state: 'unknown' as const, error: errorText(error) }
        }
      })
    )
  }
  start(id: string, credential: Credential | undefined, emit: EventSink = () => {}) {
    return this.catalog.operations.run(id, 'start', async () => {
      const { spec, stage, pendingUpdate, cluster } = await this.catalog.instance(id)
      if (pendingUpdate)
        throw new Error(
          'Configuration update is incomplete; retry editing the complete group before startup'
        )
      if (!['initialized', 'ready'].includes(stage))
        throw new Error('Instance is not safely initialized')
      validateConfigEdit(
        spec,
        await readFile(this.catalog.paths(id).config, 'utf8'),
        renderConfig(spec, cluster.mode, this.catalog.paths(id), this.catalog.platform)
      )
      const before = await this.discover(id)
      if (before.state === 'running') return { pid: before.pid!, descriptor: this.descriptor(spec) }
      if (before.state !== 'stopped')
        throw new Error(before.error ?? 'Cannot determine instance state')
      const paths = this.catalog.paths(id)
      await assertFreePort(spec.port)
      if (spec.groupPort) await assertFreePort(spec.groupPort)
      const args = [`--defaults-file=${paths.config}`]
      if (stage === 'initialized') {
        if (!credential?.password || credential.user !== 'root')
          throw new Error('Initial root credentials are required')
        await writeAtomic(
          paths.init,
          `SET SESSION sql_log_bin=0;\nALTER USER 'root'@'localhost' IDENTIFIED BY ${escape(credential.password)};\n`
        )
        args.push(`--init-file=${paths.init}`)
      }
      if (this.catalog.platform !== 'Windows')
        await mkdir(dirname(spec.socket), { recursive: true })
      emit({ operationId: id, instanceId: id, stage: 'starting' })
      const child = spawn(spec.engine.bin, args, {
        stdio: 'ignore',
        windowsHide: true,
        shell: false
      })
      let spawnError = false
      child.on('error', () => {
        spawnError = true
      })
      child.unref()
      try {
        const deadline = Date.now() + 90_000
        let ready = false
        while (Date.now() < deadline) {
          if (spawnError || child.exitCode !== null)
            throw new Error('MySQL exited during startup; inspect the instance error log')
          try {
            const pid = (await readFile(paths.pid, 'utf8')).trim()
            if (pid !== String(child.pid)) throw new Error('Waiting for owned PID')
            if (credential) {
              const connection = await createConnection({
                host: '127.0.0.1',
                port: spec.port,
                user: credential.user,
                password: credential.password,
                connectTimeout: 1000
              })
              try {
                const [rows]: any = await connection.query(
                  'SELECT @@datadir AS dataDir, @@port AS port'
                )
                if (
                  normalizedPath(rows[0].dataDir, this.catalog.platform) !==
                    normalizedPath(spec.dataDir, this.catalog.platform) ||
                  Number(rows[0].port) !== spec.port
                )
                  throw new Error('Connected instance identity mismatch')
              } finally {
                await connection.end()
              }
            } else {
              const { createConnection: connect } = await import('node:net')
              await new Promise<void>((resolve, reject) => {
                const socket = connect({ host: '127.0.0.1', port: spec.port })
                socket.setTimeout(1000)
                socket.once('connect', () => {
                  socket.destroy()
                  resolve()
                })
                socket.once('error', reject)
                socket.once('timeout', () => {
                  socket.destroy()
                  reject(new Error('Not ready'))
                })
              })
            }
            ready = true
            break
          } catch {
            await sleep(200)
          }
        }
        if (!ready)
          throw new Error('MySQL readiness check timed out; inspect credentials and instance log')
        await this.catalog.setStage(id, 'ready')
        return { pid: String(child.pid), descriptor: this.descriptor(spec) }
      } catch (error) {
        // Only this newly spawned child is eligible for startup-failure cleanup.
        if (child.pid && child.exitCode === null) child.kill('SIGTERM')
        throw error
      } finally {
        await rm(paths.init, { force: true }).catch(() => undefined)
      }
    })
  }
  stop(id: string, pid?: string) {
    return this.catalog.operations.run(id, 'stop', async () => {
      const { spec } = await this.catalog.instance(id)
      return this.deps.stop(spec, pid)
    })
  }
}
