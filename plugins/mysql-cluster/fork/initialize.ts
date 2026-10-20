import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { EventSink, InstanceSpec } from '../shared'
import { InstanceCatalog } from './catalog'
import { runCommand } from './command'
import { renderConfig, validateConfigEdit } from './config'
import { writeAtomic } from './io'

// Observed execution success survives a persistence failure in this worker.
// The durable receipt also lets a replacement worker retry only the catalog commit.
const completed = new WeakMap<InstanceCatalog, Set<string>>()
const identity = (spec: InstanceSpec) =>
  JSON.stringify([spec.id, spec.dataDir, spec.engine.bin, spec.serverId])
export function initializeInstance(
  catalog: InstanceCatalog,
  id: string,
  emit: EventSink,
  run = runCommand
) {
  return catalog.operations.run(id, 'initialize', async () => {
    const { spec, stage, cluster, pendingUpdate } = await catalog.instance(id)
    if (pendingUpdate) throw new Error('Configuration update is incomplete')
    if (stage === 'ready' || stage === 'initialized') return stage
    const receipt = join(catalog.paths(id).dir, 'initialized.json')
    const key = identity(spec)
    const known = completed.get(catalog) ?? new Set<string>()
    completed.set(catalog, known)
    let recorded: string | undefined
    try {
      recorded = await readFile(receipt, 'utf8')
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error
    }
    if (recorded && recorded !== key) throw new Error('Initialization receipt identity differs')
    if (!known.has(key) && !recorded) {
      if (stage !== 'prepared')
        throw new Error(
          'Initialization outcome is unknown; inspect the data directory before recovery'
        )
      const all = await catalog.read()
      // Resume the original ownership record, repairing preparation without replacing IDs/data.
      await catalog.prepare({
        cluster,
        instances: all.instances.filter((i) => cluster.memberIds.includes(i.id)),
        credentials: {}
      })
      if ((await readdir(spec.dataDir)).length)
        throw new Error('Data directory is not empty; refusing reinitialization')
      validateConfigEdit(
        spec,
        await readFile(catalog.paths(id).config, 'utf8'),
        renderConfig(spec, cluster.mode, catalog.paths(id), catalog.platform)
      )
      await catalog.setStage(id, 'initializing')
      emit({ operationId: id, instanceId: id, stage: 'initializing' })
      try {
        await run(
          spec.engine.bin,
          [`--defaults-file=${catalog.paths(id).config}`, '--initialize-insecure'],
          180_000
        )
      } catch (error) {
        await catalog.setStage(id, 'unknown').catch(() => undefined)
        throw error
      }
      known.add(key)
    }
    // Persistence failure cannot rewrite the observed successful execution as unknown.
    if (!recorded) await writeAtomic(receipt, key)
    await catalog.setStage(id, 'initialized')
    known.delete(key)
    return 'initialized'
  })
}
