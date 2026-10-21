import { serviceStartSpawn } from '@fork/util/ServiceStart'
import { mkdir, readFile, rm, access, realpath } from 'node:fs/promises'
import { dirname } from 'node:path'
import { escape } from 'mysql2/promise'
import type { Credential, EventSink, InstanceSnapshot, InstanceSpec } from '../shared'
import { errorText } from '../shared'
import { replicationCapabilities } from '../policy'
import { InstanceCatalog, assertFreePort } from './catalog'
import { selectInstanceRoots } from './processIdentity'
import { writeAtomic } from './io'
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
      if (cluster.mode === 'replication') {
        const skipStart = replicationCapabilities(spec.engine.version).modernReplicaVariables
          ? 'skip-replica-start'
          : 'skip-slave-start'
        args.push(`--${skipStart}=OFF`)
      }
      if (
        stage === 'ready' &&
        (cluster.mode === 'group-replication' ||
          (cluster.mode === 'replication' && cluster.memberIds[0] !== id))
      )
        args.push('--read-only=ON', '--super-read-only=ON')
      if (this.catalog.platform !== 'Windows')
        await mkdir(dirname(spec.socket), { recursive: true })
      // Initial password setup needs its init-file until MySQL has consumed it.
      // A PID alone precedes init-file execution, so only first startup waits for
      // its new server-log completion message. Ordinary service starts use the
      // shared process startup check and the existing exact identity discovery.
      const errorLogOffset =
        stage === 'initialized'
          ? await readFile(paths.error).then(
              (log) => log.length,
              (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') return 0
                throw error
              }
            )
          : 0
      if (stage === 'initialized') {
        if (!credential?.password || credential.user !== 'root')
          throw new Error('Initial root credentials are required')
        await writeAtomic(
          paths.init,
          `SET SESSION sql_log_bin=0;\nALTER USER 'root'@'localhost' IDENTIFIED BY ${escape(credential.password)};\n`
        )
        args.push(`--init-file=${paths.init}`)
      }
      let pid: string | undefined
      let initConsumed = stage !== 'initialized'
      let cleanupConfirmed = false
      try {
        emit({ operationId: id, instanceId: id, stage: 'starting' })
        const started = await serviceStartSpawn({
          version: this.descriptor(spec),
          baseDir: paths.dir,
          bin: spec.engine.bin,
          execArgs: args,
          sensitive: true,
          on: () => {}
          // Do not pass pidPath: only mysqld may write its managed PID file.
        })
        pid = started['APP-Service-Start-PID']
        const running = await this.discover(id)
        if (running.state !== 'running' || running.pid !== pid)
          throw new Error('Cannot verify started instance process identity')
        if (stage === 'initialized') {
          const deadline = Date.now() + 90_000
          let completed = false
          while (Date.now() < deadline) {
            const log = await readFile(paths.error).catch((error: NodeJS.ErrnoException) => {
              if (error.code === 'ENOENT') return Buffer.alloc(0)
              throw error
            })
            if (
              /ready for connections/i.test(
                log.subarray(log.length < errorLogOffset ? 0 : errorLogOffset).toString('utf8')
              )
            ) {
              completed = true
              initConsumed = true
              break
            }
            const current = await this.discover(id)
            if (current.state !== 'running' || current.pid !== pid)
              throw new Error('MySQL exited during initial startup; inspect the instance error log')
            await sleep(200)
          }
          if (!completed)
            throw new Error('MySQL initial startup timed out; inspect the instance error log')
        }
        await this.catalog.setStage(id, 'ready')
        return { pid, descriptor: this.descriptor(spec) }
      } catch (error) {
        // Cleanup remains with the existing stop owner and the newly launched
        // PID; an unrelated process is never eligible for startup cleanup.
        if (pid) {
          try {
            await this.deps.stop(spec, pid)
            cleanupConfirmed = true
          } catch (cleanupError) {
            throw new Error(
              `${errorText(error)}; startup cleanup failed: ${errorText(cleanupError)}`
            )
          }
        }
        throw error
      } finally {
        // If stopping failed before initial setup consumed this file, retain it
        // for that still-running process and report the cleanup failure above.
        if (initConsumed || !pid || cleanupConfirmed)
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
