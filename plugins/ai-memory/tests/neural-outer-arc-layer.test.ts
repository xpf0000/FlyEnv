import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { OuterArcLayer } from '../render/neural/outer-arc-layer'
import { createOuterTracks, OUTER_BOUND_RADIUS } from '../render/neural/outer-arc-model'
import { NeuralEntity } from '../render/neural/entity-scene'
import { buildNeuralData } from '../render/neural/data'
const buildNeuralModel = () => buildNeuralData([]).model

test('real layer reuses buffers, stays bounded and fully removes sleeping bundles', () => {
  const layer = new OuterArcLayer(createOuterTracks())
  const geometries = layer.root.children.map((child) => (child as THREE.Mesh).geometry)
  const arrays = geometries.map((g) => g.getAttribute('position').array)
  let bright = false
  let changes = 0
  let previous = 0
  for (let time = 0; time < 24; time += 0.1) {
    layer.render(time, 1, 40)
    geometries.forEach((geometry, i) => {
      assert.equal(geometry.getAttribute('position').array, arrays[i])
      const alpha = geometry.getAttribute('aAlpha')
      const position = geometry.getAttribute('position')
      assert.ok([...position.array].every(Number.isFinite))
      for (let j = 0; j < position.count; j++) {
        if (alpha.getX(j) > 0.01) {
          bright = true
          assert.ok(
            Math.hypot(position.getX(j), position.getY(j), position.getZ(j)) <= OUTER_BOUND_RADIUS
          )
        }
      }
    })
    const current = geometries[0].getAttribute('aAlpha').getX(60)
    if (Math.abs(current - previous) > 0.001) changes++
    previous = current
  }
  assert.ok(bright && changes > 20)
  layer.render(5, 0, 40)
  layer.root.children.forEach((child) =>
    assert.equal(
      (child as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms.uAlpha
        .value,
      0
    )
  )
  layer.disable()
  layer.render(8, 1, 40)
  assert.equal(layer.root.visible, false)
})

test('entity replaces old meridian shell, freezing time keeps buffers stable and failure preserves core', (context) => {
  // Canvas rasterization is outside this geometry/lifecycle test.
  context.mock.method(
    NeuralEntity.prototype as unknown as { createCoreTexture(): THREE.Texture },
    'createCoreTexture',
    () => new THREE.Texture()
  )
  const entity = new NeuralEntity(buildNeuralModel())
  const exterior = entity.root.getObjectByName('transient-outer-arcs')!
  assert.ok(exterior)
  assert.equal(entity.root.getObjectByName('entity-primary-11'), undefined)
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 100)
  camera.position.z = 40
  camera.updateMatrixWorld()
  entity.render(3, 16, false, camera)
  const mesh = exterior.children[0] as THREE.Mesh
  const before = Array.from(mesh.geometry.getAttribute('position').array)
  const beforeScale = entity.root.scale.clone()
  entity.render(3, 16, true, camera)
  assert.deepEqual(
    entity.root.scale,
    beforeScale,
    'reduced motion must retain the frozen world scale'
  )
  assert.deepEqual(Array.from(mesh.geometry.getAttribute('position').array), before)
  entity.disableOuterArcs()
  entity.render(4, 16, false, camera)
  assert.equal(exterior.visible, false)
  assert.equal(entity.root.getObjectByName('entity-primary-0')?.visible, true)
  entity.dispose()
  entity.dispose()
  assert.equal(entity.root.children.length, 0)
})

test('every lit detail endpoint stays inside its live arc window, including closing heads', () => {
  const tracks = createOuterTracks()
  const layer = new OuterArcLayer(tracks)
  const main = (layer.root.children[0] as THREE.Mesh).geometry
  const detail = (layer.root.children[2] as THREE.LineSegments).geometry
  const position = main.getAttribute('position')
  const mainStride = position.count / tracks.length
  const detailStride = detail.getAttribute('position').count / tracks.length
  const detailPosition = detail.getAttribute('position')
  const detailAlpha = detail.getAttribute('aAlpha')
  const wrap = (p: number) => ((p + 1.5) % 1) - 0.5
  const angle = (
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    vertex: number,
    track: (typeof tracks)[number]
  ) => {
    const x =
      attribute.getX(vertex) * track.u[0] +
      attribute.getY(vertex) * track.u[1] +
      attribute.getZ(vertex) * track.u[2]
    const y =
      attribute.getX(vertex) * track.v[0] +
      attribute.getY(vertex) * track.v[1] +
      attribute.getZ(vertex) * track.v[2]
    return Math.atan2(y, x) / (2 * Math.PI)
  }
  for (let time = 0; time < 32; time += 0.037) {
    layer.render(time, 1, 40)
    tracks.forEach((track, slot) => {
      const tail = angle(position, slot * mainStride, track)
      let span = 0,
        last = tail
      for (let segment = 0; segment < 48; segment++) {
        const current = angle(position, slot * mainStride + segment * 6 + 2, track)
        span += wrap(current - last)
        last = current
      }
      for (let vertex = slot * detailStride; vertex < (slot + 1) * detailStride; vertex++) {
        if (detailAlpha.getX(vertex) <= 0.002) continue
        let local = wrap(angle(detailPosition, vertex, track) - tail)
        if (span > 0 && local < -1e-7) local += 1
        if (span < 0 && local > 1e-7) local -= 1
        assert.ok(
          local >= Math.min(0, span) - 1e-7 && local <= Math.max(0, span) + 1e-7,
          'lit circuit extends beyond arc head/tail'
        )
      }
    })
  }
})
