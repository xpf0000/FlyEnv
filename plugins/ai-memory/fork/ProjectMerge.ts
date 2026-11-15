import { opendir } from 'node:fs/promises'
import { join } from 'node:path'
import { isUuid, MemoryFault } from '../core/validation'
import type { ResolvedScope } from '../shared'
export const MAX_PROJECT_GROUP_SCOPES = 64
/** Validate routable IDs without reading or rewriting any memory/body/history. */
export async function validateProjectMerge(scopes: ResolvedScope[]) {
  if (scopes.length > MAX_PROJECT_GROUP_SCOPES) throw new MemoryFault('project_merge_capacity')
  const ids = new Set<string>()
  for (const scope of scopes) {
    let directory: Awaited<ReturnType<typeof opendir>>
    try {
      directory = await opendir(join(scope.directory, 'records'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw new MemoryFault('project_merge_scan_failed')
    }
    try {
      for await (const entry of directory) {
        if (!entry.name.endsWith('.json')) continue
        const id = entry.name.slice(0, -5).toLowerCase()
        if (!isUuid(id)) continue
        if (ids.has(id)) throw new MemoryFault('project_merge_duplicate_ids')
        ids.add(id)
        if (ids.size > 100_000) throw new MemoryFault('project_merge_capacity')
      }
    } catch (error) {
      if (error instanceof MemoryFault) throw error
      throw new MemoryFault('project_merge_scan_failed')
    }
  }
}
