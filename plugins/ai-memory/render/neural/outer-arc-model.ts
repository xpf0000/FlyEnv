export type OuterTrack = {
  id: number
  radius: number
  width: number
  kind: 'main' | 'fragment'
  u: [number, number, number]
  v: [number, number, number]
  normal: [number, number, number]
}
export type OuterArcSlot = { track: OuterTrack; seed: number; period: number; phase: number }
export type OuterArcState = {
  event: number
  delay: number
  duration: number
  head: number
  direction: number
  length: number
  alpha: number
  energy: number
}

export const OUTER_RADIUS = 10.9
export const OUTER_BOUND_RADIUS = 11.5

function randomAt(seed: number, index: number) {
  let value = (seed + Math.imul(index + 1, 0x9e3779b9)) | 0
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97)
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296
}

export function createOuterTracks(): OuterTrack[] {
  const poses = [
    [0.35, 0.2, -0.25],
    [1.15, -0.45, 0.6],
    [0.8, 1.05, 0.2],
    [1.5, 0.4, -0.7],
    [0.5, -0.9, 1.2],
    [1.05, 0.7, 0.8]
  ]
  const radii = [9.2, 8.8, 9.7, 8.1, 10.0, 7.5]
  return poses.map(([pitch, yaw, roll], id) => {
    const transform = (x: number, y: number, z: number): [number, number, number] => {
      const py = y * Math.cos(pitch) - z * Math.sin(pitch),
        pz = y * Math.sin(pitch) + z * Math.cos(pitch)
      const px = x * Math.cos(yaw) + pz * Math.sin(yaw),
        depth = -x * Math.sin(yaw) + pz * Math.cos(yaw)
      return [
        px * Math.cos(roll) - py * Math.sin(roll),
        px * Math.sin(roll) + py * Math.cos(roll),
        depth
      ]
    }
    const u = transform(1, 0, 0),
      v = transform(0, 1, 0)
    const normal: [number, number, number] = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0]
    ]
    return {
      id,
      radius: radii[id],
      width: id < 4 ? 0.8 + (id % 3) * 0.14 : 0.44,
      kind: id < 4 ? 'main' : 'fragment',
      u,
      v,
      normal
    }
  })
}

export function createOuterSlots(seed: number, tracks: OuterTrack[]): OuterArcSlot[] {
  const unique: OuterTrack[] = []
  for (const track of tracks) {
    if (
      !Number.isFinite(track.radius) ||
      track.radius <= 0 ||
      ![...track.u, ...track.v, ...track.normal].every(Number.isFinite)
    ) {
      console.warn(`Skipping invalid exterior track ${track.id}`)
      continue
    }
    if (
      unique.some(
        (other) =>
          Math.abs(other.normal.reduce((dot, n, i) => dot + n * track.normal[i], 0)) > 0.99999
      )
    )
      continue
    unique.push(track)
    if (unique.length === 6) break
  }
  return unique.map((track, index) => {
    const slotSeed = (seed ^ Math.imul(index + 1, 0x45d9f3b)) >>> 0
    const period =
      track.kind === 'main' ? 10 + randomAt(slotSeed, 0) * 3 : 5.5 + randomAt(slotSeed, 0) * 2
    return { track, seed: slotSeed, period, phase: period * ((index / 6 + 0.2) % 1) }
  })
}

export function createOuterArcState(): OuterArcState {
  return { event: 0, delay: 0, duration: 0, head: 0, direction: 1, length: 0, alpha: 0, energy: 1 }
}

function smooth(value: number) {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

export function sampleOuterArc(slot: OuterArcSlot, time: number, state: OuterArcState) {
  const localTime = Math.max(0, Number.isFinite(time) ? time : 0) + slot.phase
  const event = Math.floor(localTime / slot.period)
  const eventSeed = (slot.seed ^ Math.imul(event + 1, 0x27d4eb2d)) >>> 0
  const delay = randomAt(eventSeed, 0) * 0.6
  const main = slot.track.kind === 'main'
  const duration = main ? 5 + randomAt(eventSeed, 1) * 3 : 1.8 + randomAt(eventSeed, 1) * 1.6
  const age = localTime - event * slot.period - delay
  const u = age / duration
  const direction = randomAt(eventSeed, 2) < 0.5 ? -1 : 1
  state.event = event
  state.delay = delay
  state.duration = duration
  state.direction = direction
  state.energy = 0.8 + randomAt(eventSeed, 5) * 0.3
  state.head =
    randomAt(eventSeed, 3) +
    direction *
      (main ? 0.018 + randomAt(eventSeed, 4) * 0.026 : 0.045 + randomAt(eventSeed, 4) * 0.06) *
      Math.max(0, age)
  state.length =
    (main ? 0.28 + randomAt(eventSeed, 6) * 0.28 : 0.07 + randomAt(eventSeed, 6) * 0.12) *
    smooth(u / 0.25) *
    (1 - smooth((u - 0.65) / 0.35))
  state.alpha = smooth(u / 0.12) * (1 - smooth((u - 0.82) / 0.18))
  return state
}

export function writeOuterPoint(
  track: OuterTrack,
  progress: number,
  radialOffset: number,
  sideOffset: number,
  buffer: Float32Array,
  offset: number
) {
  const angle = progress * Math.PI * 2
  const x = Math.cos(angle) * (track.radius + radialOffset)
  const y = Math.sin(angle) * (track.radius + radialOffset)
  for (let axis = 0; axis < 3; axis++) {
    buffer[offset + axis] = track.u[axis] * x + track.v[axis] * y + track.normal[axis] * sideOffset
  }
}
