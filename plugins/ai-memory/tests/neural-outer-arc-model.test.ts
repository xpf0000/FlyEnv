import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createOuterTracks,
  createOuterSlots,
  createOuterArcState,
  sampleOuterArc,
  writeOuterPoint
} from '../render/neural/outer-arc-model'

const slots = () => createOuterSlots(0xa7c, createOuterTracks())

test('varied main and fragment planes stay unique and cover their complete motion bound', () => {
  const tracks = createOuterTracks()
  assert.equal(tracks.length, 6)
  const point = new Float32Array(3)
  tracks.forEach((track, index) => {
    for (let j = 0; j < 128; j++) {
      writeOuterPoint(track, j / 128, 0, 0, point, 0)
      assert.ok(Math.abs(Math.hypot(...point) - track.radius) < 1e-5)
    }
    for (const other of tracks.slice(index + 1)) {
      const dot = track.normal.reduce((sum, n, axis) => sum + n * other.normal[axis], 0)
      assert.ok(Math.abs(dot) < 0.99, 'opposite normals also represent the same plane')
    }
  })
})

test('timeline can seek in any order and is independent of frame sampling', () => {
  const configs = slots()
  const at = (time: number) =>
    configs.map((slot) => ({ ...sampleOuterArc(slot, time, createOuterArcState()) }))
  const snapshot = at(18.37)
  for (let time = 0; time < 30; time += 1 / 30) at(time)
  assert.deepEqual(at(18.37), snapshot)
  assert.deepEqual(configs, slots())
  assert.notDeepEqual(at(18.37), at(26.01))
  assert.equal(new Set(configs.map((slot) => slot.track.id)).size, configs.length)
})

test('each event grows, moves, shrinks and truly sleeps with continuous transitions', () => {
  for (const slot of slots()) {
    const cycleStart = 3 * slot.period - slot.phase
    const metadata = sampleOuterArc(slot, cycleStart, createOuterArcState())
    const birth = cycleStart + metadata.delay
    const at = (u: number) =>
      sampleOuterArc(slot, birth + u * metadata.duration, createOuterArcState())
    assert.ok(at(0).alpha < 1e-12)
    assert.ok(at(0.12).length < at(0.4).length)
    assert.ok(at(0.4).alpha > 0.9)
    assert.notEqual(at(0.4).head, at(0.5).head)
    assert.ok(at(0.88).length < at(0.6).length)
    assert.ok(at(0.99).alpha < 0.03)
    assert.equal(at(1.01).length, 0)
    assert.equal(at(1.01).alpha, 0)
    assert.ok(slot.period - metadata.delay - metadata.duration >= 1)
    for (const u of [0.12, 0.25, 0.65, 0.82, 1]) {
      assert.ok(Math.abs(at(u - 1e-6).length - at(u + 1e-6).length) < 1e-4)
      assert.ok(Math.abs(at(u - 1e-6).alpha - at(u + 1e-6).alpha) < 1e-4)
    }
  }
})

test('both directions crossing the circle seam stay local and never draw a diameter', () => {
  const track = createOuterTracks()[0]
  const a = new Float32Array(3)
  const b = new Float32Array(3)
  for (const direction of [-1, 1]) {
    for (const head of [-0.001, 0.001, 0.999, 1.001]) {
      let previous = head - direction * 0.25
      for (let j = 1; j <= 48; j++) {
        const current = head - direction * 0.25 * (1 - j / 48)
        writeOuterPoint(track, previous, 0, 0, a, 0)
        writeOuterPoint(track, current, 0, 0, b, 0)
        assert.ok(Math.hypot(...a.map((n, axis) => n - b[axis])) < 0.5)
        previous = current
      }
    }
  }
})

test('many cycles keep finite bounded arcs with real dark intervals', () => {
  const state = createOuterArcState()
  let active = 0
  let dark = 0
  for (const slot of slots()) {
    for (let time = 0; time < 120; time += 0.017) {
      sampleOuterArc(slot, time, state)
      assert.ok(Object.values(state).every(Number.isFinite))
      assert.ok(state.length >= 0 && state.length <= 0.58)
      assert.ok(state.alpha >= 0 && state.alpha <= 1)
      if (state.alpha > 0.1) active++
      else dark++
    }
  }
  assert.ok(active > 1000 && dark > 1000)
})

test('main C bands and short fragments have distinct spatial widths and lifetimes', () => {
  const configs = slots()
  for (const slot of configs) {
    const time = 3 * slot.period - slot.phase
    const meta = sampleOuterArc(slot, time, createOuterArcState())
    const peak = sampleOuterArc(
      slot,
      time + meta.delay + meta.duration * 0.5,
      createOuterArcState()
    )
    if (slot.track.kind === 'main') {
      assert.ok(peak.length >= 0.28 && peak.length <= 0.56)
      assert.ok(meta.duration >= 5 && slot.track.width >= 0.65)
    } else {
      assert.ok(peak.length >= 0.07 && peak.length <= 0.19)
      assert.ok(meta.duration < 4 && slot.track.width < 0.65)
    }
  }
})
