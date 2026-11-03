import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateInput } from '../core/validation'

const id = '03fc77bf-773a-40f4-9461-9e69d2db1d9f'
const draft = () => ({
  scope: 'global',
  type: 'decision',
  topic: 'storage',
  title: 'Choice',
  summary: 'Use files',
  tags: [' JSON ', 'json'],
  content: 'Evidence',
  source: { kind: 'user_statement', agent: 'test', description: 'Explicit fixture choice' },
  request_id: id
})
const reject = (method: string, input: unknown) =>
  assert.throws(
    () => validateInput(method as never, input),
    (e: any) => e.code === 'invalid_input'
  )
test('store accepts UTF-8 boundary and normalizes tags without truncating content', () => {
  const input = { ...draft(), content: '😀'.repeat(4096), title: '😀'.repeat(120) }
  const parsed = validateInput('store', input)
  assert.equal(parsed.content, input.content)
  assert.deepEqual(parsed.tags, ['json'])
  reject('store', { ...input, content: input.content + '中' })
  reject('store', { ...input, title: input.title + '中' })
})
test('metadata limits and required evidence reject invalid writes', () => {
  for (const patch of [
    { summary: '中'.repeat(601) },
    { tags: Array.from({ length: 13 }, (_, i) => `${i}`) },
    { source: { kind: 'document', agent: 'test' } },
    { source: { kind: 'invented', agent: 'test', description: 'x' } },
    { type: 'unknown' },
    { title: '' },
    { request_id: 'secret text' },
    { body_ref: '../../secret' }
  ])
    reject('store', { ...draft(), ...patch })
})
test('scope never falls back to global and read protocol has no body cursor', () => {
  reject('get', { scope: 'global', project_path: '/tmp/project', id })
  reject('get', { scope: 'project', project_path: './project', id })
  reject('get', { scope: 'project', project_path: '/tmp/\0bad', id })
  reject('get', { id })
  reject('get', { scope: 'global', id, cursor: 'body-next' })
  reject('get', { scope: 'global', id, revision: 0 })
  reject('search', { scope: 'global', include_global: true })
  assert.equal(validateInput('get', { scope: 'project', project_path: '/tmp/项目 a', id }).id, id)
})
test('update requires reason and immutable identity and bounds changed content', () => {
  const input = {
    scope: 'global',
    id,
    expected_revision: 2,
    request_id: id,
    reason: 'Confirmed',
    changes: { status: 'archived' }
  }
  assert.equal(validateInput('update', input).reason, 'Confirmed')
  for (const patch of [
    { reason: '' },
    { expected_revision: 0 },
    { changes: {} },
    { changes: { id } },
    { changes: { content: '😀'.repeat(4097) } }
  ])
    reject('update', { ...input, ...patch })
  assert.deepEqual(input.changes, { status: 'archived' })
})
test('search validates finite limits, query budgets and expiry timestamps', () => {
  assert.equal(validateInput('search', { scope: 'global' }).limit, 8)
  for (const patch of [
    { limit: 21 },
    { limit: NaN },
    { queries: ['x'.repeat(241)] },
    { cursor: {} },
    { include_expired: 'yes' }
  ])
    reject('search', { scope: 'global', ...patch })
  reject('store', { ...draft(), expires_at: 'tomorrow' })
})
