// Evaluation-only, single-process, volatile data. Not the durable MemoryEngine.
import { createHash, randomUUID } from 'node:crypto'
import { rankMetadata } from '../core/search'
import { MemoryFault, validateInput } from '../core/validation'
import type {
  MemoryAPI,
  MemoryInputs,
  MemoryMethod,
  MemoryOutputs,
  MemoryResult,
  SearchHit
} from '../shared'

type Sample = SearchHit & { content: string }
export function createExperimentAPI(
  fixtures: Sample[],
  options: { writesFail?: boolean } = {}
): MemoryAPI {
  const records = new Map(fixtures.map((row) => [row.id, structuredClone(row)]))
  const receipts = new Map<string, { digest: string; result: MemoryResult<unknown> }>()
  return {
    async call<M extends MemoryMethod>(
      method: M,
      raw: MemoryInputs[M]
    ): Promise<MemoryResult<MemoryOutputs[M]>> {
      let result: MemoryResult<unknown>
      try {
        const input = validateInput(method, raw)
        const inputScope = input.scope === 'global' ? 'global' : input.project_path
        const visible = (row: Sample) =>
          row.scope === input.scope &&
          (row.scope === 'global' ||
            row.projectId === inputScope ||
            (row.projectId === 'atlas' && inputScope === '/fixture/atlas'))
        if (method === 'search') {
          const query = input as MemoryInputs['search']
          const candidates = [...records.values()].filter(
            (row) => visible(row) || (query.include_global && row.scope === 'global')
          )
          const hits = rankMetadata(candidates, query).slice(0, query.limit)
          result = {
            outcome: 'success',
            data: {
              results: hits.map(({ content: _content, ...hit }: Sample) => hit),
              truncated: false
            }
          }
        } else if (method === 'get') {
          const query = input as MemoryInputs['get']
          const record = records.get(query.id)
          result =
            record && visible(record)
              ? { outcome: 'success', data: record, id: record.id, revision: record.revision }
              : { outcome: 'failed', error_code: 'not_found' }
        } else {
          const write = input as
            MemoryInputs['store'] | MemoryInputs['update'] | MemoryInputs['forget']
          const target = 'id' in write ? write.id : ''
          const key = `${inputScope}:${method}:${target}:${write.request_id}`
          const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex')
          const previous = receipts.get(key)
          if (previous)
            result =
              previous.digest === digest
                ? previous.result
                : { outcome: 'conflict', error_code: 'request_conflict' }
          else if (options.writesFail) result = { outcome: 'failed', error_code: 'write_failed' }
          else {
            const record = records.get(target)
            if (method !== 'store' && (!record || !visible(record)))
              result = { outcome: 'failed', error_code: 'not_found' }
            else if (
              method !== 'store' &&
              record!.revision !== (write as MemoryInputs['update']).expected_revision
            )
              result = {
                outcome: 'conflict',
                error_code: 'revision_conflict',
                revision: record!.revision
              }
            else {
              let id = target
              const revision = method === 'store' ? 1 : record!.revision + 1
              if (method === 'forget') records.delete(target)
              else if (method === 'store') {
                const value = write as MemoryInputs['store']
                id = randomUUID()
                const {
                  request_id: _request,
                  create_project: _create,
                  project_path: _path,
                  ...data
                } = value as MemoryInputs['store'] & { project_path?: string }
                records.set(id, {
                  ...data,
                  id,
                  revision,
                  ...(input.scope === 'project' ? { projectId: inputScope } : {}),
                  status: value.status ?? 'active',
                  pinned: value.pinned ?? false,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
              } else
                records.set(id, {
                  ...record!,
                  ...(write as MemoryInputs['update']).changes,
                  revision,
                  updated_at: new Date().toISOString()
                })
              result = { outcome: 'success', id, revision, data: { id, revision } }
              receipts.set(key, { digest, result })
            }
          }
        }
      } catch (error) {
        result = {
          outcome: 'failed',
          error_code: error instanceof MemoryFault ? error.code : 'experiment_error'
        }
      }
      return structuredClone(result) as MemoryResult<MemoryOutputs[M]>
    }
  }
}
