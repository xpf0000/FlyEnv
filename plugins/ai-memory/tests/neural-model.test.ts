import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MEMORY_TYPES, type SearchHit } from '../shared'
import { buildNeuralData } from '../render/neural/data'
import { getNodeNeighborhoodIndices, getCategoryNodeIndices } from '../render/neural/camera'
import memories from './fixtures/memories.json'

const hit = (changes: Partial<SearchHit> = {}): SearchHit => ({
  ...(memories[0] as SearchHit),
  scope: 'global',
  pinned: false,
  ...changes
})

test('keeps eight real type hubs even for empty or single-type search pages', () => {
  const empty = buildNeuralData([], (type) => `translated:${type}`)
  assert.deepEqual(
    empty.model.nodes.map((node) => node.label),
    MEMORY_TYPES.map((type) => `translated:${type}`)
  )
  assert.equal(empty.model.nodes.filter((node) => node.kind === 'memory').length, 0)
  assert.equal(empty.model.edges.length, 0)
  const data = buildNeuralData([hit()])
  assert.equal(data.model.nodes.length, 9)
  assert.equal(data.model.edges.filter((edge) => edge.kind === 'membership').length, 1)
  assert.equal(data.semanticEdgeCount, 0)
  assert.equal(data.model.nodes[data.model.edges[0].source].kind, 'category')
})

test('same UUID in different scopes retains independent original detail targets', () => {
  const global = hit({ id: 'same' })
  const project = hit({ id: 'same', scope: 'project', projectId: 'project-a' })
  const other = hit({ id: 'same', scope: 'project', projectId: 'project-b' })
  const data = buildNeuralData([global, project, other])
  const nodes = data.model.nodes.filter((node) => node.kind === 'memory')
  assert.equal(new Set(nodes.map((node) => node.id)).size, 3)
  nodes.forEach((node, index) =>
    assert.equal(data.hitsByNodeId.get(node.id), [global, project, other][index])
  )
})

test('only shared nonempty topics or normalized tags create semantic relationships', () => {
  const data = buildNeuralData([
    hit({ id: 'a', topic: 'Shared', tags: [] }),
    hit({ id: 'b', topic: ' shared ', type: 'fact', tags: [' Link '] }),
    hit({ id: 'c', topic: '', tags: ['link'] }),
    hit({ id: 'd', topic: '', tags: [] })
  ])
  const edges = data.model.edges.filter((edge) => edge.kind === 'semantic')
  assert.equal(data.semanticEdgeCount, 2)
  assert.deepEqual(
    edges.map((edge) => [
      data.hitsByNodeId.get(data.model.nodes[edge.source].id)?.id,
      data.hitsByNodeId.get(data.model.nodes[edge.target].id)?.id
    ]),
    [
      ['a', 'b'],
      ['b', 'c']
    ]
  )
  assert.ok(data.model.edges.every((edge) => edge.kind !== 'visual' && edge.source !== edge.target))
})

test('placement survives reorder and a sparse page while pinned and inactive states remain', () => {
  const a = hit({ id: 'a', pinned: true })
  const b = hit({ id: 'b', status: 'archived' })
  const c = hit({ id: 'c', expired: true })
  const first = buildNeuralData([a, b, c])
  const second = buildNeuralData([c, a])
  for (const node of second.model.nodes) {
    assert.deepEqual(node.position, first.model.nodes.find((old) => old.id === node.id)?.position)
    assert.ok(node.position.every(Number.isFinite))
    assert.ok(Math.hypot(...node.position) < 12)
  }
  const nodes = first.model.nodes.filter((node) => node.kind === 'memory')
  assert.ok(nodes[0].size > nodes[1].size)
  assert.equal(nodes[0].inactive, false)
  assert.equal(nodes[1].inactive, true)
  assert.equal(nodes[2].inactive, true)
})

test('all 1000 memories retain complete neighborhoods while rendered relationship geometry stays bounded', () => {
  const data = buildNeuralData(
    Array.from({ length: 1000 }, (_, index) =>
      hit({ id: `dense-${index}`, topic: 'shared', tags: [] })
    )
  )
  assert.equal(data.model.nodes.filter((node) => node.kind === 'memory').length, 1000)
  assert.equal(data.semanticEdgeCount, 499500)
  assert.ok(data.model.edges.filter((edge) => edge.kind === 'semantic').length <= 4000)
  const neighbors = data.model.semanticNeighbors?.(8)
  assert.equal(neighbors?.length, 999)
  assert.ok(!neighbors?.includes(8))
  assert.equal(getNodeNeighborhoodIndices(data.model, 8).length, 1000)
  assert.equal(getCategoryNodeIndices(data.model, 0).length, 1001)
})
