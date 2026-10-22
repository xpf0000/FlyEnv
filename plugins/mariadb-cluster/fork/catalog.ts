import { access, mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { createServer } from 'node:net'
import {
  validateCatalog,
  validateCreateRequest,
  validateUniqueNames,
  normalizedPath,
  supportedMariaDBVersion
} from '../policy'
import { emptyCatalog } from '../shared'
import type { CreateRequest, InstanceSpec, Platform, SavedCatalog, ClusterMode } from '../shared'
import { instancePaths } from './paths'
import { writeAtomic } from './io'
import { renderConfig } from './config'
import { runCommand } from './command'
import { OperationLocks } from './locks'

export type Stage = 'prepared' | 'initializing' | 'initialized' | 'ready' | 'unknown'
export interface RuntimeCatalog extends SavedCatalog {
  stages: Record<string, Stage>
  pendingUpdates?: string[]
}
async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error
    const parent = dirname(path)
    if (parent === path) throw error
    return join(await canonical(parent), basename(path))
  }
}
export async function assertFreePort(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer()
    server.once('error', () => reject(new Error(`Port ${port} is unavailable`)))
    server.listen(port, '127.0.0.1', () =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  })
}
export async function probeEngine(
  spec: InstanceSpec,
  mode: ClusterMode = 'standalone'
): Promise<void> {
  await access(spec.engine.bin, constants.X_OK)
  const output = await runCommand(spec.engine.bin, ['--no-defaults', '--version'], 10_000)
  if (!/mariadb/i.test(output) || !output.includes(`Ver ${spec.engine.version}`))
    throw new Error('MariaDB binary version does not match the selected installation')
  if (!supportedMariaDBVersion(spec.engine.version))
    throw new Error('MariaDB 10.4 or later is required')
  // MariaDB has no Group Replication; policy limits mode to standalone/replication.
  void mode
}
export class InstanceCatalog {
  readonly operations = new OperationLocks()
  private flight: Promise<unknown> = Promise.resolve()
  constructor(
    readonly root: string,
    readonly platform: Platform
  ) {}
  paths(id: string) {
    return instancePaths(this.root, id)
  }
  async read(): Promise<RuntimeCatalog> {
    let raw: any
    try {
      raw = JSON.parse(await readFile(join(this.root, 'catalog.json'), 'utf8'))
    } catch (error: any) {
      if (error.code === 'ENOENT') return { ...emptyCatalog(), stages: {} }
      throw error
    }
    const catalog = validateCatalog(raw)
    return {
      ...catalog,
      stages: raw.stages ?? {},
      pendingUpdates: Array.isArray(raw.pendingUpdates) ? raw.pendingUpdates : []
    }
  }
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.flight.then(task, task)
    this.flight = next.catch(() => undefined)
    return next
  }
  async write(catalog: RuntimeCatalog) {
    await writeAtomic(join(this.root, 'catalog.json'), JSON.stringify(catalog, null, 2))
  }
  async setStage(id: string, stage: Stage) {
    return this.exclusive(async () => {
      const c = await this.read()
      if (!c.instances.some((i) => i.id === id)) throw new Error('Unknown instance')
      c.stages[id] = stage
      await this.write(c)
    })
  }
  async instance(id: string) {
    const c = await this.read(),
      item = c.instances.find((i) => i.id === id)
    if (!item) throw new Error('Unknown instance')
    return {
      spec: item,
      stage: c.stages[id],
      pendingUpdate: c.pendingUpdates?.includes(id) ?? false,
      cluster: c.clusters.find((g) => g.memberIds.includes(id))!
    }
  }
  prepare(
    request: CreateRequest,
    options: { probe?: (spec: InstanceSpec) => Promise<void>; checkPorts?: boolean } = {}
  ) {
    return this.exclusive(async () => {
      validateCreateRequest(request, this.platform)
      const catalog = await this.read()
      const existingGroup = catalog.clusters.find((g) => g.id === request.cluster.id)
      if (existingGroup) {
        if (
          JSON.stringify(existingGroup) !== JSON.stringify(request.cluster) ||
          request.instances.some(
            (i) =>
              JSON.stringify(catalog.instances.find((old) => old.id === i.id)) !== JSON.stringify(i)
          )
        )
          throw new Error('Existing instance identity differs')
        await this.finishPreparation(request, catalog)
        return catalog
      }
      validateUniqueNames(request, catalog)
      const all = [...catalog.instances, ...request.instances]
      const dirs: string[] = [],
        ports = new Set<number>(),
        sockets = new Set<string>()
      for (const item of all) {
        const d = normalizedPath(await canonical(item.dataDir), this.platform)
        if (dirs.some((old) => d === old || d.startsWith(old + '/') || old.startsWith(d + '/')))
          throw new Error('Overlapping real data directories')
        dirs.push(d)
        const key =
          this.platform === 'Windows' ? item.socket.toLowerCase() : await canonical(item.socket)
        if (sockets.has(key)) throw new Error('Duplicate socket')
        sockets.add(key)
        if (ports.has(item.port)) throw new Error(`Duplicate port ${item.port}`)
        ports.add(item.port)
      }
      for (const item of request.instances) {
        if (catalog.instances.some((i) => i.id === item.id))
          throw new Error('Duplicate instance ID')
        await (options.probe ?? ((spec) => probeEngine(spec, request.cluster.mode)))(item)
        try {
          if ((await readdir(item.dataDir)).length) throw new Error('Data directory is not empty')
        } catch (error: any) {
          if (error.code !== 'ENOENT') throw error
        }
        if (this.platform !== 'Windows') {
          try {
            await stat(item.socket)
            throw new Error('Socket path already exists')
          } catch (error: any) {
            if (error.code !== 'ENOENT') throw error
          }
        }
        if (options.checkPorts !== false) {
          await assertFreePort(item.port)
        }
      }
      // Commit ownership before any initialization. A failed write never starts a server.
      catalog.instances.push(...request.instances)
      catalog.clusters.push(request.cluster)
      for (const item of request.instances) catalog.stages[item.id] = 'prepared'
      await this.write(catalog)
      await this.finishPreparation(request, catalog)
      return catalog
    })
  }
  private async finishPreparation(request: CreateRequest, catalog: RuntimeCatalog) {
    for (const item of request.instances) {
      if (catalog.stages[item.id] !== 'prepared') continue
      const paths = this.paths(item.id)
      await mkdir(paths.dir, { recursive: true })
      await mkdir(item.dataDir, { recursive: true })
      await access(item.dataDir, constants.W_OK)
      try {
        const found = await stat(paths.config)
        if (!found.isFile()) throw new Error('Invalid managed config path')
        continue
      } catch (error: any) {
        if (error.code !== 'ENOENT') throw error
      }
      await writeAtomic(
        paths.config,
        renderConfig(item, request.cluster.mode, paths, this.platform)
      )
    }
  }
  update(request: CreateRequest, assertStopped?: () => Promise<void>) {
    return this.operations.runMany(request.cluster.memberIds, 'edit', () =>
      this.exclusive(async () => {
        await assertStopped?.()
        validateCreateRequest(request, this.platform)
        const before = await this.read(),
          next: RuntimeCatalog = JSON.parse(JSON.stringify(before))
        const group = next.clusters.find((g) => g.id === request.cluster.id)
        if (
          !group ||
          group.mode !== request.cluster.mode ||
          JSON.stringify(group.memberIds) !== JSON.stringify(request.cluster.memberIds)
        )
          throw new Error('Cannot change existing topology')
        validateUniqueNames(request, before, group.id)
        for (const item of request.instances) {
          const old = next.instances.find((i) => i.id === item.id)
          if (
            !old ||
            old.engine.bin !== item.engine.bin ||
            old.engine.version !== item.engine.version ||
            old.serverId !== item.serverId
          )
            throw new Error('Existing engine and server identity cannot change')
          if (old.dataDir !== item.dataDir) {
            if (before.stages[item.id] !== 'prepared')
              throw new Error('An initialized or uncertain data directory cannot be replaced')
            try {
              await access(join(this.paths(item.id).dir, 'initialized.json'))
              throw new Error('An initialized data directory cannot be replaced')
            } catch (error: any) {
              if (error.code !== 'ENOENT') throw error
            }
            // Never relocate MariaDB files or reinterpret a nonempty directory as uninitialized.
            for (const directory of [old.dataDir, item.dataDir]) {
              try {
                if ((await readdir(directory)).length)
                  throw new Error(
                    'Only empty data directories can be changed before initialization'
                  )
              } catch (error: any) {
                if (error.code !== 'ENOENT') throw error
              }
            }
          }
          Object.assign(old, {
            name: item.name,
            port: item.port,
            socket: item.socket,
            dataDir: item.dataDir
          })
        }
        group.name = request.cluster.name
        validateCatalog(next)
        const directories: string[] = [],
          sockets = new Set<string>(),
          ports = new Set<number>()
        for (const item of next.instances) {
          const directory = normalizedPath(await canonical(item.dataDir), this.platform)
          if (
            directories.some(
              (old) =>
                directory === old ||
                directory.startsWith(old + '/') ||
                old.startsWith(directory + '/')
            )
          )
            throw new Error('Overlapping real data directories')
          directories.push(directory)
          const socket =
            this.platform === 'Windows' ? item.socket.toLowerCase() : await canonical(item.socket)
          if (sockets.has(socket)) throw new Error('Duplicate socket')
          sockets.add(socket)
          if (ports.has(item.port)) throw new Error('Duplicate port')
          ports.add(item.port)
        }
        before.pendingUpdates = [...new Set([...(before.pendingUpdates ?? []), ...group.memberIds])]
        await this.write(before)
        // Journal first: a partially updated group cannot start with mismatched catalog/config identity.
        for (const item of request.instances) {
          const paths = this.paths(item.id)
          if (before.instances.find((old) => old.id === item.id)!.dataDir !== item.dataDir) {
            await mkdir(item.dataDir, { recursive: true })
            await access(item.dataDir, constants.W_OK)
          }
          let current = ''
          try {
            current = await readFile(paths.config, 'utf8')
          } catch (error: any) {
            if (error.code !== 'ENOENT') throw error
          }
          const generated = renderConfig(item, group.mode, paths, this.platform)
          const keys = new Set(
            generated
              .split('\n')
              .filter((l) => l.includes('='))
              .map((l) => l.split('=')[0])
          )
          const extra = current
            .split('\n')
            .filter((l) => l.includes('=') && !keys.has(l.split('=')[0].trim()))
          await writeAtomic(paths.config, generated + extra.join('\n') + '\n')
        }
        next.pendingUpdates = before.pendingUpdates.filter((id) => !group.memberIds.includes(id))
        await this.write(next)
        return next
      })
    )
  }
  async removeRecords(ids: string[], assertStopped?: () => Promise<void>) {
    return this.operations.runMany(ids, 'remove', () =>
      this.exclusive(async () => {
        await assertStopped?.()
        const c = await this.read(),
          selected = new Set(ids)
        for (const g of c.clusters)
          if (
            g.memberIds.some((id) => selected.has(id)) &&
            !g.memberIds.every((id) => selected.has(id))
          )
            throw new Error('Remove the complete cluster')
        c.instances = c.instances.filter((i) => !selected.has(i.id))
        c.clusters = c.clusters.filter((g) => !g.memberIds.some((id) => selected.has(id)))
        for (const id of ids) delete c.stages[id]
        c.pendingUpdates = c.pendingUpdates?.filter((id) => !selected.has(id))
        await this.write(c)
      })
    )
  }
}
