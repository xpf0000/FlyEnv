import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCircuitField } from '../render/neural/circuit-field'
import { buildNeuralData } from '../render/neural/data'
const buildNeuralModel = () => buildNeuralData([]).model

test('deterministic open circuit islands fill multiple depths while preserving all eight semantic hubs', () => {
  const model = buildNeuralModel()
  const original = structuredClone(model)
  const field = buildCircuitField(model)
  assert.deepEqual(field, buildCircuitField(model))
  assert.deepEqual(model, original)
  assert.deepEqual(
    [...new Set(field.paths.filter((p) => p.category >= 0).map((p) => p.category))].sort(),
    [0, 1, 2, 3, 4, 5, 6, 7]
  )
  assert.ok(field.paths.length >= 400 && field.paths.length <= 2000)
  let inner = 0,
    outer = 0
  for (const path of field.paths) {
    assert.ok(path.points.length >= 3)
    assert.notDeepEqual(path.points[0], path.points.at(-1))
    for (const point of path.points) {
      assert.ok(point.every(Number.isFinite))
      const radius = Math.hypot(...point)
      assert.ok(radius <= field.radius)
      if (radius < 7) inner++
      if (radius > 8) outer++
    }
  }
  assert.ok(inner > 100 && outer > 100)
})

test('circuit plates share bus junctions rather than only independent stair fragments', () => {
  const field = buildCircuitField(buildNeuralModel())
  const starts = new Map<string, number>()
  let connected = 0
  for (const path of field.paths.filter((p) => p.category < 0)) {
    const key = path.points[0].map((x) => x.toFixed(5)).join(',')
    if (starts.has(key)) connected++
    starts.set(key, (starts.get(key) ?? 0) + 1)
  }
  assert.ok(connected > 250, 'outer and middle circuitry must share plate-level bus junctions')
  assert.ok(
    field.paths.some((p) => p.points.length >= 8),
    'include connected turn/bus motifs'
  )
})
