import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { searchPage } from '../core/search'
import type { SearchHit, SearchInput } from '../shared'

const rows = (count: number, scope: 'global' | 'project' = 'global'): SearchHit[] =>
  Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    revision: 1,
    scope,
    ...(scope === 'project' ? { projectId: 'project-1' } : {}),
    type: 'note',
    title: `Record ${index}`,
    topic: 'pagination',
    summary: '中文 context ' + index,
    tags: ['page'],
    status: 'active',
    pinned: false,
    source: { kind: 'document', agent: 'fixture', description: 'Constructed sample' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  }))
const snapshot = (records = rows(25), scopeKey = 'global', generation = 'generation-1') => ({
  records,
  scopeKey,
  generation,
  warnings: []
})

test('default and maximum page sizes yield every hit exactly once with stable cursors', () => {
  const source = snapshot()
  const first = searchPage([source], { scope: 'global' })
  assert.equal(first.data!.results.length, 8)
  assert.equal(first.data!.truncated, true)
  const found = [...first.data!.results.map((hit) => hit.id)]
  let cursor = first.data!.next_cursor
  while (cursor) {
    const page = searchPage([source], { scope: 'global', cursor })
    found.push(...page.data!.results.map((hit) => hit.id))
    cursor = page.data!.next_cursor
  }
  assert.equal(new Set(found).size, 25)
  assert.equal(found.length, 25)
  assert.ok(searchPage([source], { scope: 'global', limit: 20 }).data!.results.length <= 20)
  assert.throws(() => searchPage([source], { scope: 'global', limit: 21 }), /invalid_input/)
})
test('cursor binds filters, selected scopes and every scope generation', () => {
  const source = snapshot()
  const cursor = searchPage([source], { scope: 'global' }).data!.next_cursor!
  assert.throws(
    () => searchPage([source], { scope: 'global', queries: ['other'], cursor }),
    /cursor_invalid/
  )
  assert.throws(
    () => searchPage([{ ...source, generation: 'reloaded' }], { scope: 'global', cursor }),
    /cursor_invalid/
  )
  const project = snapshot(rows(10, 'project'), 'project:project-1')
  const input: SearchInput = { scope: 'project', project_path: '/fixture', include_global: true }
  const combined = searchPage([project, source], input)
  assert.throws(
    () =>
      searchPage([project, { ...source, generation: 'changed' }], {
        ...input,
        cursor: combined.data!.next_cursor
      }),
    /cursor_invalid/
  )
  assert.throws(
    () => searchPage([project], { ...input, cursor: combined.data!.next_cursor }),
    /cursor_invalid/
  )
})
test('whole serialized responses obey UTF-8 budgets including cursors/warnings; impossible budgets never repeat an empty cursor', () => {
  const source = snapshot(rows(20).map((hit) => ({ ...hit, summary: '中文🙂'.repeat(100) })))
  const response = searchPage([source], { scope: 'global', limit: 20 })
  assert.ok(Buffer.byteLength(JSON.stringify(response)) <= 8192)
  assert.equal(response.data!.truncated, true)
  assert.ok(response.data!.results.length > 0)
  const capped = searchPage([source], { scope: 'global', limit: 20 }, 100000)
  assert.ok(Buffer.byteLength(JSON.stringify(capped)) <= 32768)
  assert.throws(() => searchPage([source], { scope: 'global' }, 40), /response_budget_exceeded/)
  const partial = searchPage(
    [{ ...snapshot(rows(1)), warnings: [{ code: 'record_corrupt', id: randomUUID() }] }],
    { scope: 'global' }
  )
  assert.equal(partial.outcome, 'partial')
  assert.equal(partial.warnings?.[0].code, 'record_corrupt')
})

test('many corrupt-file warnings cannot crowd valid results out of the response budget', () => {
  const source = {
    ...snapshot(rows(3)),
    warnings: Array.from({ length: 100 }, () => ({
      code: 'record_schema_unsupported',
      id: randomUUID()
    }))
  }
  const response = searchPage([source], { scope: 'global' })
  assert.equal(response.outcome, 'partial')
  assert.equal(response.data!.results.length, 3)
  assert.ok(response.warnings?.some((warning) => warning.code === 'warnings_truncated'))
  assert.ok(Buffer.byteLength(JSON.stringify(response)) <= 8192)
})
