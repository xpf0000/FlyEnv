import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildUniverse, pickUniverseNode, projectNode } from '../render/universe'
import memories from './fixtures/memories.json'

test('layout is stable and connects shared topics or tags without self links', () => {
  const hits = memories as any
  const first = buildUniverse(hits)
  assert.deepEqual(buildUniverse(hits), first)
  assert.equal(first.nodes.length, hits.length)
  assert.ok(first.edges.every((edge) => edge.source !== edge.target))
  assert.ok(first.edges.some((edge) => edge.reason === 'tag'))
  assert.ok(first.nodes.every((node) => Number.isFinite(node.x + node.y + node.z)))
  assert.equal(buildUniverse([]).edges.length, 0)
})

test('unrelated memories do not acquire synthetic relationships', () => {
  assert.equal(buildUniverse(memories.slice(0, 6) as any).edges.length, 0)
})

test('projection preserves identity and picking respects screen radius and depth', () => {
  const graph = buildUniverse(memories.slice(0, 3) as any)
  const point = projectNode(graph.nodes[0], { yaw: 0.4, pitch: -0.2, zoom: 1 }, 800, 500)
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y) && point.depth > 0)
  assert.equal(pickUniverseNode([point], point.x, point.y)?.id, point.id)
  assert.equal(pickUniverseNode([point], point.x + 100, point.y + 100), undefined)
  const near = { ...point, id: 'near', depth: 1 }
  const far = { ...point, id: 'far', depth: 2 }
  assert.equal(pickUniverseNode([far, near], point.x, point.y)?.id, 'near')
})

test('identical topics create a topic edge even when tags differ', () => {
  const first = { ...memories[0], id: crypto.randomUUID(), topic: 'shared/topic', tags: ['one'] }
  const second = { ...memories[1], id: crypto.randomUUID(), topic: 'shared/topic', tags: ['two'] }
  const graph = buildUniverse([first, second] as any)
  assert.deepEqual(graph.edges, [{ source: first.id, target: second.id, reason: 'topic' }])
})
