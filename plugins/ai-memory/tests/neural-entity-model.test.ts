import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildEntityModel, CORE_PARTICLE_COUNT } from '../render/neural/entity-model'
import { buildNeuralData } from '../render/neural/data'
const CATEGORY_COUNT = 8
const buildNeuralModel = () => buildNeuralData([]).model

test('decorative entity geometry is deterministic, finite and separate from semantic edges', () => {
  const model = buildNeuralModel()
  const edgeSnapshot = structuredClone(model.edges)
  const first = buildEntityModel(model)

  assert.deepEqual(first, buildEntityModel(model))
  assert.deepEqual(model.edges, edgeSnapshot)
  assert.equal(first.particles.length, CORE_PARTICLE_COUNT)
  assert.equal(CORE_PARTICLE_COUNT, 720)
  assert.ok(
    first.particles.every(
      (particle) =>
        particle.position.every(Number.isFinite) &&
        particle.size > 0 &&
        Number.isFinite(particle.phase)
    )
  )
})

test('decorative bounds are origin-centered, rotation invariant and cover every animated path', () => {
  const entity = buildEntityModel(buildNeuralModel())

  assert.ok(entity.bounds !== undefined)
  assert.deepEqual(entity.bounds.center, [0, 0, 0])
  const points = [
    ...entity.arcs.flatMap((arc) => arc.points),
    ...entity.circuits.flatMap((circuit) => circuit.points),
    ...entity.flows.flatMap((flow) => flow.points)
  ]
  points.forEach((point) => {
    assert.ok(Math.hypot(...point) <= entity.bounds.radius)
  })
  assert.ok(entity.bounds.radius >= 10 && entity.bounds.radius < 13)
})

test('holographic arcs are fragmented rather than complete orbit shells', () => {
  const entity = buildEntityModel(buildNeuralModel())

  assert.ok(entity.arcs.length >= 20)
  for (const arc of entity.arcs) {
    assert.ok(arc.points.length >= 2)
    assert.ok(arc.points.every((point) => point.every(Number.isFinite)))
    assert.notDeepEqual(arc.points[0], arc.points.at(-1))
  }
})

test('primary and companion track roles are explicit and limited to a small structural subset', () => {
  const entity = buildEntityModel(buildNeuralModel())
  const primary = entity.arcs.filter((arc) => arc.role === 'primary')
  const companion = entity.arcs.filter((arc) => arc.role === 'companion')

  assert.ok(primary.length > 0)
  assert.ok(companion.length > primary.length)
  for (const group of [0, 1, 2]) {
    assert.ok(primary.some((arc) => arc.group === group))
  }
  assert.ok(entity.arcs.every((arc) => arc.role === 'primary' || arc.role === 'companion'))
  primary.forEach((arc) => {
    assert.ok(arc.parentPoints && arc.parentPoints.length >= 96)
    assert.ok(Number.isFinite(arc.parentStart))
    assert.deepEqual(arc.parentPoints?.[0], arc.parentPoints?.at(-1))
  })
})

test('persistent shell is removed while core tracks and bounded transient paths remain', () => {
  const entity = buildEntityModel(buildNeuralModel())
  const core = entity.arcs.filter((arc) => arc.system === 'core')
  const shell = entity.arcs.filter((arc) => arc.system === 'shell')

  assert.equal(core.length, 90)
  assert.equal(shell.length, 0)
  assert.equal(entity.outerTracks.length, 6)
  assert.ok(entity.outerTracks.every((track) => track.radius + 0.4 <= entity.bounds.radius))
  assert.deepEqual([...new Set(core.map((arc) => arc.group))].sort(), [0, 1, 2])
  for (const group of [0, 1, 2]) {
    assert.deepEqual(
      [...new Set(core.filter((arc) => arc.group === group).map((arc) => arc.track))].sort(),
      [0, 1, 2, 3, 4]
    )
  }
  assert.ok(entity.circuits.length >= 32)
  assert.ok(
    entity.circuits.every(
      (circuit) =>
        circuit.points.length >= 4 && circuit.points.every((point) => point.every(Number.isFinite))
    )
  )
})

test('track rungs and attached circuits cover both hemispheres', () => {
  const entity = buildEntityModel(buildNeuralModel())
  const rungs = entity.circuits.filter((circuit) => circuit.kind === 'rung')
  const fragments = entity.circuits.filter((circuit) => circuit.kind === 'circuit')

  assert.equal(rungs.length, 48)
  assert.ok(fragments.some((circuit) => circuit.points[0][1] > 0.5))
  assert.ok(fragments.some((circuit) => circuit.points[0][1] < -0.5))
})

test('largest shell decoration and free-floating fragments are absent', () => {
  const entity = buildEntityModel(buildNeuralModel())
  const fragments = entity.circuits.filter((circuit) => circuit.kind === 'circuit')

  assert.ok(entity.arcs.every((arc) => arc.system === 'core'))
  assert.ok(entity.flows.every((flow) => flow.system !== 'shell'))
  assert.ok(fragments.every((circuit) => circuit.attachment !== undefined))
})

test('core attached circuits survive removal of all static shell attachments', () => {
  const entity = buildEntityModel(buildNeuralModel())
  const free = entity.circuits.filter(
    (circuit) => circuit.kind === 'circuit' && circuit.attachment === undefined
  )
  const orbit = entity.circuits.filter((circuit) => circuit.attachment === 'orbit')
  const fiber = entity.circuits.filter((circuit) => circuit.attachment === 'fiber')
  const radial = entity.circuits.filter((circuit) => circuit.attachment === 'radial')

  assert.equal(free.length, 0)
  assert.ok(orbit.length > 0)
  assert.equal(fiber.length, 24)
  assert.equal(radial.length, 0)
  assert.ok(orbit.every((circuit) => circuit.group < 10))
  assert.ok(orbit.every((circuit) => circuit.points.length === 7))
  assert.ok(orbit.every((circuit) => circuit.offset && Math.abs(circuit.offset.side) >= 0.2))
  assert.ok(fiber.every((circuit) => circuit.group === 20))
})

test('energy flows follow complete closed rings and category-to-core fibers', () => {
  const entity = buildEntityModel(buildNeuralModel())

  assert.ok(entity.flows !== undefined)
  const rings = entity.flows.filter((flow) => flow.system !== 'fiber')
  const fibers = entity.flows.filter((flow) => flow.system === 'fiber')
  assert.equal(rings.length, 3)
  assert.equal(fibers.length, CATEGORY_COUNT)
  rings.forEach((flow) => {
    assert.equal(flow.closed, true)
    assert.ok(flow.points.length >= 96)
    assert.deepEqual(flow.points[0], flow.points.at(-1))
    assert.equal(flow.coverage.length, flow.points.length)
    assert.ok(flow.coverage.some((value) => value > 0.9))
    assert.ok(flow.coverage.some((value) => value < 0.1))
    assert.ok(flow.speed > 0)
  })
  fibers.forEach((flow) => {
    assert.equal(flow.closed, false)
    assert.ok(flow.points.length >= 16)
  })
})

test('curved fibers connect every category into the cognitive core', () => {
  const entity = buildEntityModel(buildNeuralModel())
  const categories = new Set(entity.fibers.map((fiber) => fiber.category))

  assert.equal(categories.size, CATEGORY_COUNT)
  assert.equal(entity.fibers.length, CATEGORY_COUNT * 8)
  for (const fiber of entity.fibers) {
    assert.ok(fiber.points.length >= 8)
    assert.equal(fiber.points.length, fiber.colors.length)
    assert.ok(fiber.points.every((point) => point.every(Number.isFinite)))
    const endpoint = fiber.points.at(-1)!
    assert.ok(Math.hypot(...endpoint) < 4)
  }
})
