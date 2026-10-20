import { readdir } from 'node:fs/promises'
import type { EventSink } from '../shared'
import { InstanceCatalog } from './catalog'
import { runCommand } from './command'
import { renderConfig, validateConfigEdit } from './config'
import { readFile } from 'node:fs/promises'

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
    if (stage !== 'prepared')
      throw new Error(
        'Initialization outcome is unknown; inspect the data directory before recovery'
      )
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
      await catalog.setStage(id, 'initialized')
      return 'initialized'
    } catch (error) {
      await catalog.setStage(id, 'unknown').catch(() => undefined)
      throw error
    }
  })
}
