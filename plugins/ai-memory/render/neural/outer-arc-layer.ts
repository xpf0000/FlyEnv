import * as THREE from 'three'
import {
  createOuterArcState,
  createOuterSlots,
  OUTER_BOUND_RADIUS,
  sampleOuterArc,
  writeOuterPoint
} from './outer-arc-model'
import type { OuterTrack, OuterArcState } from './outer-arc-model'
import { createRibbonGeometry } from './ribbon'
import { createRibbonMaterial } from './ribbon-material'

const SEGMENTS = 48
const DETAIL_COUNT = 48
const DETAIL_VERTICES = 6
const GOLD = '#e8a933'

type RibbonBuffer = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  strands: number
  position: THREE.BufferAttribute
  previous: THREE.BufferAttribute
  next: THREE.BufferAttribute
  alpha: THREE.BufferAttribute
}

function feather(value: number) {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

function envelope(progress: number) {
  return feather(progress / 0.12) * feather((1 - progress) / 0.06)
}

const DETAIL_VERTEX = `
  attribute float aAlpha;
  uniform float uCenterDepth;
  uniform float uRadius;
  varying float vAlpha;
  void main() {
    vec4 point = modelViewMatrix * vec4(position, 1.0);
    float depth = clamp((-point.z - (uCenterDepth - uRadius)) / (2.0 * uRadius), 0.0, 1.0);
    vAlpha = aAlpha * mix(1.0, 0.25, depth);
    gl_Position = projectionMatrix * point;
  }
`
const DETAIL_FRAGMENT = `
  uniform float uAlpha;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float alpha = uAlpha * vAlpha;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export class OuterArcLayer {
  readonly root = new THREE.Group()
  private readonly slots
  private readonly states: OuterArcState[]
  private readonly ribbons: RibbonBuffer[]
  private readonly scratch = new Float32Array((SEGMENTS + 1) * 3)
  private readonly detail: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>
  private lastTime?: number
  private disabled = false

  constructor(tracks: OuterTrack[]) {
    this.root.name = 'transient-outer-arcs'
    this.slots = createOuterSlots(0x7a11ce, tracks)
    this.states = this.slots.map(() => createOuterArcState())
    this.ribbons = [this.createRibbon(2, 1.8), this.createRibbon(8, 0.9)]
    const geometry = new THREE.BufferGeometry()
    const vertices = this.slots.length * DETAIL_COUNT * DETAIL_VERTICES
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage)
    )
    geometry.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(new Float32Array(vertices), 1).setUsage(THREE.DynamicDrawUsage)
    )
    const material = new THREE.ShaderMaterial({
      defines: { FLYENV_OUTER_ARC_LAYER: 1 },
      uniforms: {
        uAlpha: { value: 0 },
        uColor: { value: new THREE.Color(GOLD) },
        uCenterDepth: { value: 40 },
        uRadius: { value: OUTER_BOUND_RADIUS }
      },
      vertexShader: DETAIL_VERTEX,
      fragmentShader: DETAIL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    this.detail = new THREE.LineSegments(geometry, material)
    this.detail.name = 'transient-outer-details'
    this.detail.frustumCulled = false
    this.root.add(this.detail)
  }

  private createRibbon(strands: number, width: number): RibbonBuffer {
    const geometry = createRibbonGeometry(
      Array.from({ length: this.slots.length * strands }, () => ({
        points: Array.from(
          { length: SEGMENTS + 1 },
          (_, i) => [i, 0, 0] as [number, number, number]
        ),
        color: GOLD,
        energy: 0.85,
        alphas: Array(SEGMENTS + 1).fill(0)
      }))
    )
    const material = createRibbonMaterial(width, 0, 1.7, 'flow')
    material.defines.FLYENV_OUTER_ARC_LAYER = 1
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = strands === 2 ? 'transient-outer-primary' : 'transient-outer-companions'
    mesh.frustumCulled = false
    this.root.add(mesh)
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    const previous = geometry.getAttribute('aPrevious') as THREE.BufferAttribute
    const next = geometry.getAttribute('aNext') as THREE.BufferAttribute
    const alpha = geometry.getAttribute('aAlpha') as THREE.BufferAttribute
    for (const attribute of [position, previous, next, alpha])
      attribute.setUsage(THREE.DynamicDrawUsage)
    return { mesh, strands, position, previous, next, alpha }
  }

  resize(width: number, height: number) {
    for (const ribbon of this.ribbons)
      ribbon.mesh.material.uniforms.uResolution.value.set(width, height)
  }

  disable() {
    this.disabled = true
    this.root.visible = false
  }

  render(time: number, visibility: number, centerDepth: number) {
    if (this.disabled) return
    for (const ribbon of this.ribbons) {
      const uniforms = ribbon.mesh.material.uniforms
      uniforms.uAlpha.value = visibility * (ribbon.strands === 2 ? 0.82 : 0.48)
      uniforms.uCenterDepth.value = centerDepth
      uniforms.uRadius.value = OUTER_BOUND_RADIUS
    }
    this.detail.material.uniforms.uAlpha.value = visibility * 0.54
    this.detail.material.uniforms.uCenterDepth.value = centerDepth
    if (this.lastTime === time) return
    this.lastTime = time
    for (let slotIndex = 0; slotIndex < this.slots.length; slotIndex++) {
      const slot = this.slots[slotIndex]
      const state = sampleOuterArc(slot, time, this.states[slotIndex])
      for (const ribbon of this.ribbons) {
        for (let strand = 0; strand < ribbon.strands; strand++) {
          const offset =
            ribbon.strands === 2 ? (strand === 0 ? -0.5 : 0.5) : strand / (ribbon.strands - 1) - 0.5
          for (let j = 0; j <= SEGMENTS; j++) {
            const progress = state.head - state.direction * state.length * (1 - j / SEGMENTS)
            writeOuterPoint(
              slot.track,
              progress,
              offset * slot.track.width,
              Math.sin(strand * 1.7) * 0.028,
              this.scratch,
              j * 3
            )
          }
          const start = (slotIndex * ribbon.strands + strand) * SEGMENTS * 6
          for (let segment = 0; segment < SEGMENTS; segment++) {
            for (let corner = 0; corner < 6; corner++) {
              const sample = segment + (corner === 2 || corner === 3 || corner === 5 ? 1 : 0)
              const vertex = start + segment * 6 + corner
              const pointOffset = sample * 3
              for (let axis = 0; axis < 3; axis++) {
                ribbon.position.array[vertex * 3 + axis] = this.scratch[pointOffset + axis]
                ribbon.previous.array[vertex * 3 + axis] =
                  this.scratch[Math.max(0, sample - 1) * 3 + axis]
                ribbon.next.array[vertex * 3 + axis] =
                  this.scratch[Math.min(SEGMENTS, sample + 1) * 3 + axis]
              }
              const local = sample / SEGMENTS
              ribbon.alpha.array[vertex] =
                state.alpha *
                state.energy *
                envelope(local) *
                (0.68 + 0.32 * local) *
                (ribbon.strands === 2
                  ? 1
                  : 0.35 + 0.65 * feather(Math.sin(local * 73 + strand * 4) * 0.5 + 0.5))
            }
          }
        }
      }
      this.writeDetails(slotIndex, state)
    }
    for (const ribbon of this.ribbons) {
      for (const attribute of [ribbon.position, ribbon.previous, ribbon.next, ribbon.alpha])
        attribute.needsUpdate = true
    }
    this.detail.geometry.getAttribute('position').needsUpdate = true
    this.detail.geometry.getAttribute('aAlpha').needsUpdate = true
  }

  private writeDetails(slotIndex: number, state: OuterArcState) {
    const position = this.detail.geometry.getAttribute('position').array as Float32Array
    const alpha = this.detail.geometry.getAttribute('aAlpha').array as Float32Array
    const track = this.slots[slotIndex].track
    const tail = state.head - state.direction * state.length
    const firstAnchor = Math.floor(Math.min(tail, state.head) * 64)
    for (let detail = 0; detail < DETAIL_COUNT; detail++) {
      const anchor = (firstAnchor + detail) / 64
      const local = state.length > 0 ? (anchor - tail) / (state.direction * state.length) : -1
      const endLocal =
        state.length > 0 ? (anchor + 0.003 - tail) / (state.direction * state.length) : -1
      const strength =
        state.alpha *
        state.energy *
        Math.min(envelope(local), envelope(endLocal)) *
        (Math.sin((firstAnchor + detail) * 7.19) > -0.3 ? 1 : 0.12)
      const start = (slotIndex * DETAIL_COUNT + detail) * DETAIL_VERTICES
      // Three connected, track-anchored steps; no full underlying tick ring.
      for (let corner = 0; corner < DETAIL_VERTICES; corner++) {
        const point = corner === 0 ? 0 : corner < 3 ? 1 : corner < 5 ? 2 : 3
        const progress = anchor + (point >= 2 ? 0.003 : 0)
        const anchorId = firstAnchor + detail
        const radial =
          point === 0
            ? -track.width * (0.18 + 0.32 * Math.abs(Math.sin(anchorId * 3.1)))
            : point === 3
              ? track.width * (0.16 + 0.34 * Math.abs(Math.cos(anchorId * 2.3)))
              : track.width * ((Math.abs(anchorId) % 3) - 1) * 0.13
        const side = point === 0 ? 0 : 0.028
        writeOuterPoint(track, progress, radial, side, position, (start + corner) * 3)
        alpha[start + corner] = strength
      }
    }
  }
}
