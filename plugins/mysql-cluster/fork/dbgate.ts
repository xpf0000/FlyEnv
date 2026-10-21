import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { DbGateRuntime, dbGateEnv, type DbGateOpenResult } from '@fork/module/DbGate'
import { serviceStartSpawn } from '@fork/util/ServiceStart'
import type { MysqlInstanceRuntime } from './runtime'
import { installDbGate } from './dbgateInstall'
import { dbGateListeningPids } from './dbgateListeners'

/**
 * Fork owns this private companion for the module lifetime. Opens and parent /
 * companion stops share one admission queue; duplicate opens share their result
 * and raw progress. A verified final parent requires companion cleanup BEFORE
 * MySQL stop. Unknown peers are not proof of all-stopped. Cleanup failure blocks
 * that parent only; completed peer stops keep their own results. The native
 * instance lifecycle remains the sole MySQL stop owner.
 */
export class MysqlClusterDbGate {
  private readonly runtime: DbGateRuntime
  private tail: Promise<unknown> = Promise.resolve()
  private opening?: Promise<DbGateOpenResult>
  private readonly openListeners = new Set<(...args: any[]) => void>()

  constructor(
    baseDir: string,
    private readonly instances: Pick<MysqlInstanceRuntime, 'listInstances' | 'stop'>
  ) {
    this.runtime = new DbGateRuntime(join(baseDir, 'mysql-cluster'), {
      installer: installDbGate,
      listeningPids: dbGateListeningPids,
      starter: (node, paths, port, credentials, on) =>
        serviceStartSpawn({
          version: this.descriptor(),
          pidPath: paths.pid,
          baseDir: paths.root,
          bin: node.bin,
          execArgs: [paths.entry],
          execEnv: dbGateEnv(paths, port, credentials),
          cwd: paths.root,
          outFile: paths.startOut,
          errFile: paths.startError,
          sensitive: true,
          on,
          waitTime: 2000
        })
    })
  }

  private run<T>(task: () => PromiseLike<T>): Promise<T> {
    const pending = this.tail.then(task)
    this.tail = pending.catch(() => undefined)
    return pending
  }

  descriptor(pid?: string): SoftInstalled {
    return {
      typeFlag: 'mysql-cluster',
      version: 'dbgate',
      bin: this.runtime.paths.entry,
      path: this.runtime.paths.root,
      ...(pid ? { pid } : {})
    } as SoftInstalled
  }

  open(node: SoftInstalled): ForkPromise<DbGateOpenResult> {
    return new ForkPromise((resolve, reject, on) => {
      this.openListeners.add(on)
      if (!this.opening) {
        const pending = this.run(async () => {
          if (!(await this.instances.listInstances()).some((item) => item.state === 'running'))
            throw new Error('A running MySQL instance is required to open DbGate')
          const result = await this.runtime.open(node, (...args) => {
            for (const listener of this.openListeners) listener(...args)
          })
          return { ...result, 'APP-Service-Start-Item': this.descriptor() }
        })
        this.opening = pending
        // Clear admission before resolving callers, so a later open revalidates
        // process state after a queued final-parent stop.
        pending.then(
          () => {
            if (this.opening === pending) this.opening = undefined
          },
          () => {
            if (this.opening === pending) this.opening = undefined
          }
        )
      }
      this.opening.then(
        (result) => {
          this.openListeners.delete(on)
          resolve(result)
        },
        (error) => {
          this.openListeners.delete(on)
          reject(error)
        }
      )
    })
  }

  stop(expectedPid?: string): Promise<string[]> {
    return this.run(() => this.stopPanel(expectedPid))
  }

  private async stopPanel(expectedPid?: string): Promise<string[]> {
    if (!expectedPid && !existsSync(this.runtime.paths.root)) return []
    const stopped = await this.runtime.stop(expectedPid)
    if (existsSync(this.runtime.paths.pid))
      throw new Error('DbGate stop could not be confirmed; its private PID record is retained')
    return stopped
  }

  stopInstance(id: string, pid?: string): Promise<string[]> {
    return this.run(async () => {
      let companionPids: string[] = []
      if (existsSync(this.runtime.paths.root)) {
        const snapshots = await this.instances.listInstances()
        const finalParent =
          snapshots.some((item) => item.id === id && item.state !== 'unknown') &&
          snapshots.every((item) => item.id === id || ['stopped', 'missing'].includes(item.state))
        if (finalParent) companionPids = await this.stopPanel()
      }
      const instancePids = await this.instances.stop(id, pid)
      return [...new Set([...instancePids, ...companionPids])]
    })
  }
}
