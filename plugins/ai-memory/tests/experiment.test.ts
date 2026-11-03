import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createExperimentAPI } from '../scripts/experiment-api'

test('experimental Agent writes produce readable receipts and failures stay failures', async () => {
  const api = createExperimentAPI([])
  const input = {
    scope: 'global' as const,
    type: 'preference' as const,
    topic: 'style',
    title: 'Short replies',
    summary: 'Keep replies brief',
    tags: [],
    content: 'User asked for brief replies.',
    source: { kind: 'user_statement' as const, agent: 'fixture', description: 'Explicit request' },
    request_id: '00000000-0000-4000-8000-000000000101'
  }
  const saved = await api.call('store', input)
  assert.equal(saved.outcome, 'success')
  assert.equal(saved.revision, 1)
  assert.equal(
    (await api.call('get', { scope: 'global', id: saved.id! })).data?.content,
    input.content
  )
  assert.equal((await api.call('store', input)).id, saved.id)
  assert.equal((await api.call('store', { ...input, content: 'different' })).outcome, 'conflict')
  const fail = createExperimentAPI([], { writesFail: true })
  assert.equal((await fail.call('store', input)).outcome, 'failed')
  assert.deepEqual((await fail.call('search', { scope: 'global' })).data?.results, [])
})
