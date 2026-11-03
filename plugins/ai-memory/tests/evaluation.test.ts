import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rankMetadata } from '../core/search'
import type { SearchHit } from '../shared'

const hit = (id: string, patch: Partial<SearchHit> = {}): SearchHit => ({
  id,
  scope: 'global',
  revision: 1,
  type: 'decision',
  title: 'Choice',
  summary: 'A fact',
  topic: 'storage',
  tags: [],
  status: 'active',
  pinned: false,
  source: { kind: 'document', agent: 'fixture', description: 'Constructed sample' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...patch
})
test('title/topic/tag matches outrank summary and unrelated pins do not leak', () => {
  const rows = [
    hit('s', { summary: 'PostgreSQL' }),
    hit('p', { pinned: true }),
    hit('t', { title: 'PostgreSQL' })
  ]
  assert.deepEqual(
    rankMetadata(rows, { scope: 'global', queries: ['PostgreSQL'] }).map((x) => x.id),
    ['t', 's']
  )
  assert.deepEqual(rankMetadata(rows, { scope: 'global', queries: ['unfindable'] }), [])
})
test('hard filters apply before scoring and expired records require opt-in', () => {
  const rows = [
    hit('a'),
    hit('b', { status: 'archived' }),
    hit('c', { expires_at: '2000-01-01T00:00:00Z' }),
    hit('d', { scope: 'project', projectId: 'p' })
  ]
  assert.deepEqual(
    rankMetadata(rows, { scope: 'global' }).map((x) => x.id),
    ['a']
  )
  assert.deepEqual(
    rankMetadata(rows, { scope: 'global', include_expired: true }).map((x) => x.id),
    ['a', 'c']
  )
  assert.deepEqual(
    rankMetadata(rows, { scope: 'global', status: 'archived' }).map((x) => x.id),
    ['b']
  )
})
test('CJK phrases, expanded aliases and technical identifiers are searchable', () => {
  const rows = [
    hit('a', { title: 'Linux 托盘修复', tags: ['Ubuntu', 'tray'] }),
    hit('b', { title: 'Fix issue-913 with Node.js 22.1', topic: 'helper/install' })
  ]
  for (const queries of [['托盘'], ['ubuntu tray'], ['通知区域', 'tray']])
    assert.equal(rankMetadata(rows, { scope: 'global', queries })[0]?.id, 'a')
  assert.equal(rankMetadata(rows, { scope: 'global', queries: ['issue-913'] })[0]?.id, 'b')
  assert.deepEqual(rankMetadata(rows, { scope: 'global', queries: ['issue-91'] }), [])
})
test('ties are deterministic and empty queries prefer pinned then recent records', () => {
  const rows = [hit('b'), hit('a'), hit('c', { pinned: true })]
  assert.deepEqual(
    rankMetadata(rows, { scope: 'global' }).map((x) => x.id),
    ['c', 'a', 'b']
  )
  assert.deepEqual(
    rankMetadata([...rows].reverse(), { scope: 'global' }).map((x) => x.id),
    ['c', 'a', 'b']
  )
})
