import { readdir } from 'node:fs/promises'
import type { EventSink } from '../shared'
import { InstanceCatalog } from './catalog'
import { runCommand } from './command'

export async function initializeInstance(catalog: InstanceCatalog, id: string, emit: EventSink, run = runCommand) {
  const { spec, stage } = await catalog.instance(id)
  if (stage === 'ready' || stage === 'initialized') return stage
  if (stage !== 'prepared') throw new Error('Initialization outcome is unknown; inspect the data directory before recovery')
  if ((await readdir(spec.dataDir)).length) throw new Error('Data directory is not empty; refusing reinitialization')
  await catalog.setStage(id, 'initializing')
  emit({ operationId: id, instanceId: id, stage: 'initializing' })
  try {
    await run(spec.engine.bin, [`--defaults-file=${catalog.paths(id).config}`, '--initialize-insecure'], 180_000)
    await catalog.setStage(id, 'initialized')
    return 'initialized'
  } catch (error) {
    await catalog.setStage(id, 'unknown').catch(() => undefined)
    throw error
  }
}
