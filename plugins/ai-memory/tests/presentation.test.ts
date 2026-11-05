import assert from 'node:assert/strict'
import { test } from 'node:test'
import { editorTimestamp } from '../render/presentation'
import { validateInput } from '../core/validation'

test('editor date selections preserve the instant and serialize to the canonical UTC protocol', () => {
  const selected = '2026-11-05T18:00:00.000+08:00'
  const canonical = editorTimestamp(selected)
  assert.equal(canonical, '2026-11-05T10:00:00.000Z')
  const result = validateInput('update', {
    scope: 'global',
    id: '00000000-0000-4000-8000-000000000000',
    request_id: '00000000-0000-4000-8000-000000000001',
    expected_revision: 1,
    reason: 'Set expiry',
    changes: { expires_at: canonical }
  })
  assert.equal(result.changes.expires_at, canonical)
  assert.equal(editorTimestamp(''), null)
})

test('recovery cannot present inaccessible directories as an empty successful scan', async () => {
  const { recoverySummary } = await import('../render/presentation')
  const report = {
    primary: { status: 'valid' },
    previous: { status: 'valid' },
    projectDirectoryIds: [],
    unmappedProjectIds: [],
    unmappedAfterPreviousRestore: ['newer-project'],
    warnings: [{ code: 'project_directories_unavailable' }]
  } as any
  assert.equal(recoverySummary(report).unmappedCount, undefined)
  assert.deepEqual(recoverySummary(report).restoreMissingIds, ['newer-project'])
  report.warnings = []
  assert.equal(recoverySummary(report).unmappedCount, 0)
})
