import assert from 'node:assert/strict'
import { test } from 'node:test'

test('ribbon geometry expands each curve segment into six vertices with two sides', async () => {
  const ribbon = await import('../render/neural/ribbon').catch(() => undefined)
  assert.ok(ribbon)
  if (!ribbon) return

  const geometry = ribbon.createRibbonGeometry([
    {
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 1, 0],
        [3, 1, 0]
      ],
      color: '#fbbf24',
      energy: 1
    }
  ])
  assert.equal(geometry.getAttribute('position').count, 18)
  assert.equal(geometry.getAttribute('aSide').count, 18)
  assert.ok(geometry.getAttribute('aColor').array.every(Number.isFinite))
  assert.ok(geometry.getAttribute('position').array.every(Number.isFinite))
  assert.deepEqual(
    Array.from(geometry.getAttribute('aSide').array.slice(0, 12)),
    [-1, 1, -1, -1, 1, 1, -1, 1, -1, -1, 1, 1]
  )
  geometry.dispose()
})

test('flow sampling uses actual path distance rather than point indices', async () => {
  const ribbon = await import('../render/neural/ribbon').catch(() => undefined)
  assert.ok(ribbon?.createPathMetrics)
  assert.ok(ribbon?.samplePathByDistance)
  if (!ribbon) return

  const metrics = ribbon.createPathMetrics([
    [0, 0, 0],
    [10, 0, 0],
    [10, 1, 0]
  ])
  assert.equal(metrics.totalLength, 11)
  const sample = ribbon.samplePathByDistance(metrics, 0.5)
  assert.deepEqual(sample.point, [5.5, 0, 0])
  assert.equal(sample.segment, 0)
})

test('ribbon progress follows accumulated segment and parent-ring distance', async () => {
  const { createRibbonGeometry } = await import('../render/neural/ribbon')
  const geometry = createRibbonGeometry([
    {
      points: [
        [0, 0, 0],
        [2, 0, 0],
        [2, 1, 0]
      ],
      parentPoints: [
        [0, 0, 0],
        [4, 0, 0],
        [4, 4, 0],
        [0, 4, 0],
        [0, 0, 0]
      ],
      parentStart: 0.25,
      color: '#e8a933',
      energy: 1
    }
  ])
  const segment = geometry.getAttribute('aSegmentProgress')
  const parent = geometry.getAttribute('aPathProgress')
  assert.ok(segment)
  assert.ok(parent)
  assert.equal(segment.getX(0), 0)
  assert.ok(Math.abs(segment.getX(2) - 2 / 3) < 1e-6)
  assert.equal(segment.getX(segment.count - 1), 1)
  assert.equal(parent.getX(0), 0.25)
  assert.equal(parent.getX(2), 0.375)
  assert.equal(parent.getX(parent.count - 1), 0.4375)
  geometry.dispose()
})

test('flow ribbons expose progress without changing their authored alpha envelope', async () => {
  const { createRibbonGeometry } = await import('../render/neural/ribbon')
  const geometry = createRibbonGeometry([
    {
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0]
      ],
      alphas: [0, 0.8, 0],
      purpose: 'flow',
      color: '#ffe0a3',
      energy: 1
    }
  ])
  assert.ok(geometry.getAttribute('aSegmentProgress'))
  assert.ok(geometry.getAttribute('aPathProgress'))
  Array.from(geometry.getAttribute('aAlpha').array.slice(0, 6)).forEach((alpha, index) => {
    assert.ok(Math.abs(alpha - [0, 0, 0.8, 0.8, 0, 0.8][index]) < 1e-6)
  })
  geometry.dispose()
})
