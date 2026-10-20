import { access, mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { createServer } from 'node:net'
import { validateCatalog, validateCreateRequest, normalizedPath } from '../policy'
import { emptyCatalog } from '../shared'
import type { CreateRequest, InstanceSpec, Platform, SavedCatalog } from '../shared'
import { instancePaths } from './paths'
import { writeAtomic } from './io'
import { renderConfig } from './config'
import { runCommand } from './command'

export type Stage = 'prepared' | 'initializing' | 'initialized' | 'ready' | 'unknown'
export interface RuntimeCatalog extends SavedCatalog { stages: Record<string, Stage> }
async function canonical(path: string): Promise<string> {
  try { return await realpath(path) }
  catch (error: any) {
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
    server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()))
  })
}
export async function probeEngine(spec: InstanceSpec): Promise<void> {
  await access(spec.engine.bin, constants.X_OK)
  const output = await runCommand(spec.engine.bin, ['--no-defaults', '--version'], 10_000)
  if (/maria/i.test(output) || !output.includes(`Ver ${spec.engine.version} `)) throw new Error('MySQL binary version does not match the selected installation')
  if (!/^([89]|[1-9]\d)\./.test(spec.engine.version) && !/^5\.7\./.test(spec.engine.version)) throw new Error('This MySQL build does not support safe instance initialization')
}
export class InstanceCatalog {
  private flight: Promise<unknown> = Promise.resolve()
  constructor(readonly root: string, readonly platform: Platform) {}
  paths(id: string) { return instancePaths(this.root, id) }
  async read(): Promise<RuntimeCatalog> {
    let raw: any
    try { raw = JSON.parse(await readFile(join(this.root, 'catalog.json'), 'utf8')) }
    catch (error: any) { if (error.code === 'ENOENT') return { ...emptyCatalog(), stages: {} }; throw error }
    const catalog = validateCatalog(raw)
    return { ...catalog, stages: raw.stages ?? {} }
  }
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.flight.then(task, task)
    this.flight = next.catch(() => undefined)
    return next
  }
  async write(catalog: RuntimeCatalog) { await writeAtomic(join(this.root, 'catalog.json'), JSON.stringify(catalog, null, 2)) }
  async setStage(id: string, stage: Stage) {
    return this.exclusive(async () => { const c = await this.read(); if (!c.instances.some(i => i.id === id)) throw new Error('Unknown instance'); c.stages[id] = stage; await this.write(c) })
  }
  async instance(id: string) {
    const c = await this.read(), item = c.instances.find(i => i.id === id)
    if (!item) throw new Error('Unknown instance')
    return { spec: item, stage: c.stages[id], cluster: c.clusters.find(g => g.memberIds.includes(id))! }
  }
  prepare(request: CreateRequest, options: { probe?: (spec: InstanceSpec) => Promise<void>; checkPorts?: boolean } = {}) {
    return this.exclusive(async () => {
      validateCreateRequest(request, this.platform)
      const catalog = await this.read()
      const existingGroup = catalog.clusters.find(g => g.id === request.cluster.id)
      if (existingGroup) {
        if (JSON.stringify(existingGroup) !== JSON.stringify(request.cluster) || request.instances.some(i => JSON.stringify(catalog.instances.find(old => old.id === i.id)) !== JSON.stringify(i))) throw new Error('Existing instance identity differs')
        return catalog
      }
      const all = [...catalog.instances, ...request.instances]
      const dirs: string[] = [], ports = new Set<number>(), sockets = new Set<string>()
      for (const item of all) {
        const d = normalizedPath(await canonical(item.dataDir), this.platform)
        if (dirs.some(old => d === old || d.startsWith(old + '/') || old.startsWith(d + '/'))) throw new Error('Overlapping real data directories')
        dirs.push(d)
        const key = this.platform === 'Windows' ? item.socket.toLowerCase() : await canonical(item.socket)
        if (sockets.has(key)) throw new Error('Duplicate socket'); sockets.add(key)
        for (const p of [item.port, item.groupPort].filter(Boolean) as number[]) { if (ports.has(p)) throw new Error(`Duplicate port ${p}`); ports.add(p) }
      }
      for (const item of request.instances) {
        if (catalog.instances.some(i => i.id === item.id)) throw new Error('Duplicate instance ID')
        await (options.probe ?? probeEngine)(item)
        try { if ((await readdir(item.dataDir)).length) throw new Error('Data directory is not empty') }
        catch (error: any) { if (error.code !== 'ENOENT') throw error }
        if (this.platform !== 'Windows') {
          try { await stat(item.socket); throw new Error('Socket path already exists') }
          catch (error: any) { if (error.code !== 'ENOENT') throw error }
        }
        if (options.checkPorts !== false) { await assertFreePort(item.port); if (item.groupPort) await assertFreePort(item.groupPort) }
      }
      // Commit ownership before any initialization. A failed write never starts a server.
      catalog.instances.push(...request.instances); catalog.clusters.push(request.cluster)
      for (const item of request.instances) catalog.stages[item.id] = 'prepared'
      await this.write(catalog)
      for (const item of request.instances) {
        const paths = this.paths(item.id)
        await mkdir(paths.dir, { recursive: true }); await mkdir(item.dataDir, { recursive: true })
        await access(item.dataDir, constants.W_OK)
        await writeAtomic(paths.config, renderConfig(item, request.cluster.mode, paths, this.platform))
      }
      return catalog
    })
  }
  async removeRecords(ids: string[]) {
    return this.exclusive(async () => {
      const c = await this.read(), selected = new Set(ids)
      for (const g of c.clusters) if (g.memberIds.some(id => selected.has(id)) && !g.memberIds.every(id => selected.has(id))) throw new Error('Remove the complete cluster')
      c.instances = c.instances.filter(i => !selected.has(i.id)); c.clusters = c.clusters.filter(g => !g.memberIds.some(id => selected.has(id)))
      for (const id of ids) delete c.stages[id]
      await this.write(c)
    })
  }
}
