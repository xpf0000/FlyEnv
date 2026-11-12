import type { NeuralModel } from './model'
import { createOuterTracks, OUTER_BOUND_RADIUS } from './outer-arc-model'
import type { OuterTrack } from './outer-arc-model'

export type EntityParticle = {
  position: [number, number, number]
  color: string
  size: number
  phase: number
}

export type EntityArc = {
  system: 'core' | 'shell'
  group: number
  track: number
  role: 'primary' | 'companion'
  energy: number
  points: [number, number, number][]
  color: string
  parentPoints?: [number, number, number][]
  parentStart?: number
}

export type EntityCircuit = {
  group: number
  kind: 'rung' | 'circuit'
  attachment?: 'orbit' | 'fiber' | 'radial'
  offset?: { side: number; radial: number }
  energy: number
  points: [number, number, number][]
  color: string
}

export type EntityFiber = {
  category: number
  points: [number, number, number][]
  colors: string[]
}

export type EntityFlow = {
  system: 'core' | 'shell' | 'fiber'
  group: number
  points: [number, number, number][]
  coverage: number[]
  color: string
  speed: number
  phase: number
  closed: boolean
}

export type EntityModel = {
  outerTracks: OuterTrack[]
  particles: EntityParticle[]
  arcs: EntityArc[]
  circuits: EntityCircuit[]
  fibers: EntityFiber[]
  flows: EntityFlow[]
  bounds: {
    center: [number, number, number]
    radius: number
  }
}

type Point = [number, number, number]

export const CORE_PARTICLE_COUNT = 720

const AMBER = '#fbbf24'
const IVORY = '#fef3c7'
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function rotate(point: Point, pitch: number, yaw: number, roll: number): Point {
  const [x, y, z] = point
  const cosX = Math.cos(pitch)
  const sinX = Math.sin(pitch)
  const cosY = Math.cos(yaw)
  const sinY = Math.sin(yaw)
  const cosZ = Math.cos(roll)
  const sinZ = Math.sin(roll)
  const rotatedY = y * cosX - z * sinX
  const rotatedZ = y * sinX + z * cosX
  const rotatedX = x * cosY + rotatedZ * sinY
  const depth = -x * sinY + rotatedZ * cosY
  return [rotatedX * cosZ - rotatedY * sinZ, rotatedX * sinZ + rotatedY * cosZ, depth]
}

function mixColor(from: string, to: string, amount: number) {
  const parse = (color: string) =>
    [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16))
  const a = parse(from)
  const b = parse(to)
  const channels = a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export function buildEntityModel(model: NeuralModel): EntityModel {
  const random = mulberry32(0xc06a17e)
  const particles: EntityParticle[] = []
  const arcs: EntityArc[] = []
  const circuits: EntityCircuit[] = []
  const fibers: EntityFiber[] = []
  const flows: EntityFlow[] = []
  const hubs = model.nodes.filter((node) => node.kind === 'category')

  for (let index = 0; index < CORE_PARTICLE_COUNT; index += 1) {
    const azimuth = index * GOLDEN_ANGLE + random() * 0.32
    const elevation = Math.acos(random() * 2 - 1)
    const inner = random() < 0.82
    const radius = inner ? 0.25 + Math.pow(random(), 0.7) * 7.8 : 7.2 + random() * 4.5
    const colorChoice = random()
    const color =
      colorChoice < 0.68
        ? AMBER
        : colorChoice < 0.86
          ? IVORY
          : colorChoice < 0.98
            ? '#fb923c'
            : '#67e8f9'
    particles.push({
      position: [
        Math.sin(elevation) * Math.cos(azimuth) * radius,
        Math.cos(elevation) * radius * 0.82,
        Math.sin(elevation) * Math.sin(azimuth) * radius * 0.9
      ],
      color,
      size: 0.28 + random() * (inner ? 0.62 : 0.4),
      phase: random() * Math.PI * 2
    })
  }

  const addArc = (
    system: EntityArc['system'],
    group: number,
    track: number,
    energy: number,
    color: string,
    pointAt: (time: number) => Point,
    role: EntityArc['role'] = 'companion',
    parent?: { start: number; pointAt: (time: number) => Point }
  ) => {
    const points: Point[] = []
    for (let segment = 0; segment <= 32; segment += 1) {
      points.push(pointAt(segment / 32))
    }
    const parentPoints = parent
      ? Array.from({ length: 129 }, (_, segment) => parent.pointAt(segment / 128))
      : undefined
    if (parentPoints) {
      parentPoints[parentPoints.length - 1] = [...parentPoints[0]]
    }
    arcs.push({
      system,
      group,
      track,
      role,
      energy,
      points,
      color,
      parentPoints,
      parentStart: parent?.start
    })
  }

  const addClosedFlow = (
    system: 'core' | 'shell',
    group: number,
    color: string,
    speed: number,
    pointAt: (time: number) => Point
  ) => {
    const points: Point[] = []
    for (let segment = 0; segment < 128; segment += 1) {
      points.push(pointAt(segment / 128))
    }
    points.push([...points[0]])
    const carriers = arcs.filter((arc) => arc.system === system && arc.group === group)
    const coverage = points.map((point) => {
      let nearest = Number.POSITIVE_INFINITY
      carriers.forEach((arc) => {
        arc.points.forEach((carrier) => {
          nearest = Math.min(
            nearest,
            Math.hypot(...point.map((value, axis) => value - carrier[axis]))
          )
        })
      })
      return Math.max(0, Math.min(1, 1 - nearest / 0.24))
    })
    flows.push({ system, group, points, coverage, color, speed, phase: random(), closed: true })
  }

  const addRungs = (
    group: number,
    count: number,
    innerRadius: number,
    outerRadius: number,
    pointAt: (radius: number, angle: number) => Point
  ) => {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + random() * 0.035
      const middle = (innerRadius + outerRadius) * 0.5
      circuits.push({
        group,
        kind: 'rung',
        energy: 0.56 + random() * 0.3,
        points: [
          pointAt(innerRadius, angle - 0.006),
          pointAt(middle, angle),
          pointAt(middle, angle + 0.006),
          pointAt(outerRadius, angle + 0.006)
        ],
        color: AMBER
      })
    }
  }

  const coreRotations = [
    [0.35, 0.2, 0.1],
    [1.15, 0.6, 0.8],
    [0.7, -0.85, 1.3]
  ] as const
  const coreRadii = [3.5, 5.5, 7.5]
  coreRadii.forEach((baseRadius, group) => {
    const [pitch, yaw, roll] = coreRotations[group]
    const pointAt = (radius: number, angle: number, track = 2) =>
      rotate(
        [Math.cos(angle) * radius, Math.sin(angle) * radius, Math.sin(angle * 3 + track) * 0.025],
        pitch,
        yaw,
        roll
      )

    for (let track = 0; track < 5; track += 1) {
      const radius = baseRadius + (track - 2) * 0.11
      for (let fragment = 0; fragment < 6; fragment += 1) {
        const start = (fragment / 6) * Math.PI * 2 + random() * 0.08
        const length = 0.56 + random() * 0.42
        addArc(
          'core',
          group,
          track,
          track === 2 ? 0.95 + random() * 0.2 : 0.48 + random() * 0.3,
          track === 2 ? IVORY : AMBER,
          (time) => pointAt(radius, start + time * length, track),
          track === 2 ? 'primary' : 'companion',
          track === 2
            ? {
                start: start / (Math.PI * 2),
                pointAt: (time) => pointAt(baseRadius, time * Math.PI * 2)
              }
            : undefined
        )
      }
    }
    addRungs(group, 16, baseRadius - 0.25, baseRadius + 0.25, (radius, angle) =>
      pointAt(radius, angle)
    )
    addClosedFlow('core', group, IVORY, 0.035 + group * 0.009, (time) =>
      pointAt(baseRadius, time * Math.PI * 2)
    )
  })

  for (let index = 0; index < 144; index += 1) {
    const group = index % 3
    const [pitch, yaw, roll] = coreRotations[group]
    const radius = 1.8 + Math.pow(random(), 0.72) * 7.4
    const azimuth = index * GOLDEN_ANGLE
    const latitude = Math.asin(1 - 2 * ((index + 0.5) / 144)) * 0.86
    const point = (
      longitudeOffset: number,
      latitudeOffset: number,
      radialOffset: number
    ): Point => {
      const longitude = azimuth + longitudeOffset
      const fragmentLatitude = latitude + latitudeOffset
      const fragmentRadius = radius + radialOffset
      return rotate(
        [
          Math.cos(fragmentLatitude) * fragmentRadius * Math.cos(longitude),
          Math.sin(fragmentLatitude) * fragmentRadius * 0.82,
          Math.cos(fragmentLatitude) * fragmentRadius * Math.sin(longitude)
        ],
        pitch,
        yaw,
        roll
      )
    }
    circuits.push({
      group,
      kind: 'circuit',
      energy: 0.36 + random() * 0.42,
      points: [
        point(0, 0, 0),
        point(0.04, 0, 0),
        point(0.04, 0.025, 0),
        point(0.082, 0.025, 0.08),
        point(0.082, 0.052, 0.08)
      ],
      color: index % 18 === 0 ? IVORY : AMBER
    })
  }

  const shellRadius = 12.7
  const latitudes = [-0.95, -0.62, -0.31, 0, 0.31, 0.62, 0.95]
  latitudes.forEach((latitude, latitudeIndex) => {
    const pointAt = (radius: number, angle: number) =>
      rotate(
        [
          Math.cos(latitude) * radius * Math.cos(angle),
          Math.sin(latitude) * radius * 0.84,
          Math.cos(latitude) * radius * Math.sin(angle)
        ],
        0.12,
        0,
        0.08
      )
    const ringRadius = Math.cos(latitude) * shellRadius
    for (let track = 0; track < 3; track += 1) {
      const radius = shellRadius + (track - 1) * 0.1
      for (let fragment = 0; fragment < 6; fragment += 1) {
        const start = (fragment / 6) * Math.PI * 2 + random() * 0.06
        const length = 0.3 + random() * 0.38
        addArc(
          'shell',
          10,
          track,
          track === 1 ? 0.76 + random() * 0.2 : 0.4 + random() * 0.25,
          track === 1 && latitudeIndex % 3 === 0 ? IVORY : AMBER,
          (time) => {
            const angle = start + time * length
            return rotate(
              [
                Math.cos(angle) * Math.cos(latitude) * radius,
                Math.sin(latitude) * radius * 0.84,
                Math.sin(angle) * Math.cos(latitude) * radius
              ],
              0.12,
              0,
              0.08
            )
          },
          track === 1 && latitudeIndex % 3 === 0 ? 'primary' : 'companion',
          track === 1 && latitudeIndex % 3 === 0
            ? {
                start: start / (Math.PI * 2),
                pointAt: (time) => pointAt(shellRadius, time * Math.PI * 2)
              }
            : undefined
        )
      }
    }
    addRungs(10, 8, ringRadius - 0.12, ringRadius + 0.12, (radius, angle) =>
      rotate(
        [
          radius * Math.cos(angle),
          Math.sin(latitude) * shellRadius * 0.84,
          radius * Math.sin(angle)
        ],
        0.12,
        0,
        0.08
      )
    )
    addClosedFlow('shell', 10, AMBER, 0.018 + latitudeIndex * 0.0015, (time) =>
      pointAt(shellRadius, time * Math.PI * 2)
    )
  })

  for (let meridian = 0; meridian < 8; meridian += 1) {
    const longitude = (meridian / 8) * Math.PI * 2
    const pointAt = (radius: number, latitude: number) =>
      rotate(
        [
          Math.cos(latitude) * radius * Math.cos(longitude),
          Math.sin(latitude) * radius,
          Math.cos(latitude) * radius * Math.sin(longitude)
        ],
        0.2,
        0.1,
        -0.12
      )
    for (let track = 0; track < 3; track += 1) {
      const radius = 10.9 + (track - 1) * 0.1
      for (let fragment = 0; fragment < 6; fragment += 1) {
        const start = (fragment / 6) * Math.PI * 2 + random() * 0.06
        const length = 0.3 + random() * 0.36
        addArc(
          'shell',
          11,
          track,
          track === 1 ? 0.62 + random() * 0.22 : 0.36 + random() * 0.24,
          meridian % 4 === 0 && track === 1 ? IVORY : AMBER,
          (time) => pointAt(radius, start + time * length),
          meridian % 4 === 0 && track === 1 ? 'primary' : 'companion',
          meridian % 4 === 0 && track === 1
            ? {
                start: start / (Math.PI * 2),
                pointAt: (time) => pointAt(10.9, time * Math.PI * 2)
              }
            : undefined
        )
      }
    }
    addRungs(11, 8, 10.76, 11.04, (radius, angle) => pointAt(radius, angle))
    if (meridian % 2 === 0) {
      addClosedFlow('shell', 11, AMBER, 0.016 + meridian * 0.001, (time) =>
        pointAt(10.9, time * Math.PI * 2)
      )
    }
  }

  for (let index = 0; index < 96; index += 1) {
    const azimuth = index * GOLDEN_ANGLE
    const latitude = Math.asin(1 - 2 * ((index + 0.5) / 96)) * 0.92
    const pointOnShell = (longitudeOffset: number, latitudeOffset: number): Point => {
      const longitude = azimuth + longitudeOffset
      const fragmentLatitude = latitude + latitudeOffset
      return [
        Math.cos(fragmentLatitude) * shellRadius * Math.cos(longitude),
        Math.sin(fragmentLatitude) * shellRadius * 0.84,
        Math.cos(fragmentLatitude) * shellRadius * Math.sin(longitude)
      ]
    }
    circuits.push({
      group: 10,
      kind: 'circuit',
      energy: 0.42 + random() * 0.38,
      points: [
        pointOnShell(0, 0),
        pointOnShell(0.055, 0),
        pointOnShell(0.055, 0.036),
        pointOnShell(0.12, 0.036),
        pointOnShell(0.12, 0.072)
      ],
      color: index % 16 === 0 ? '#67e8f9' : AMBER
    })
  }

  hubs.forEach((hub) => {
    for (let strand = 0; strand < 8; strand += 1) {
      const start: Point = [
        hub.position[0] + (random() - 0.5) * 0.8,
        hub.position[1] + (random() - 0.5) * 0.8,
        hub.position[2] + (random() - 0.5) * 0.8
      ]
      const angle = strand * GOLDEN_ANGLE + hub.category * 0.47
      const endRadius = 0.35 + random() * 2.1
      const end: Point = [
        Math.cos(angle) * endRadius,
        (random() - 0.5) * 2.4,
        Math.sin(angle) * endRadius
      ]
      const control: Point = [
        start[0] * 0.48 + Math.sin(angle) * (0.6 + random() * 1.1),
        start[1] * 0.48 + (random() - 0.5) * 1.2,
        start[2] * 0.48 - Math.cos(angle) * (0.6 + random() * 1.1)
      ]
      const points: Point[] = []
      const colors: string[] = []
      for (let segment = 0; segment <= 24; segment += 1) {
        const time = segment / 24
        const inverse = 1 - time
        points.push([
          inverse * inverse * start[0] + 2 * inverse * time * control[0] + time * time * end[0],
          inverse * inverse * start[1] + 2 * inverse * time * control[1] + time * time * end[1],
          inverse * inverse * start[2] + 2 * inverse * time * control[2] + time * time * end[2]
        ])
        colors.push(
          time < 0.68
            ? mixColor(hub.color, AMBER, time / 0.68)
            : mixColor(AMBER, IVORY, (time - 0.68) / 0.32)
        )
      }
      fibers.push({ category: hub.category, points, colors })
      if (strand === 0) {
        flows.push({
          system: 'fiber',
          group: 20,
          points: points.map((point) => [...point]),
          coverage: points.map(() => 1),
          color: IVORY,
          speed: 0.13 + hub.category * 0.006,
          phase: random(),
          closed: false
        })
      }
    }
  })

  const primaryArcs = arcs.filter((arc) => arc.role === 'primary')
  for (let index = 0; index < 96; index += 1) {
    const arc = primaryArcs[index % primaryArcs.length]
    const start = 2 + ((index * 3) % (arc.points.length - 8))
    const side = (index % 2 === 0 ? 1 : -1) * (0.22 + (index % 3) * 0.045)
    const radial = ((index % 5) - 2) * 0.055 + (index % 2 === 0 ? 0.025 : -0.025)
    const frameAt = (sample: number, sideOffset: number, radialOffset: number): Point => {
      const center = arc.points[sample]
      const before = arc.points[Math.max(0, sample - 1)]
      const after = arc.points[Math.min(arc.points.length - 1, sample + 1)]
      const tangent = after.map((coordinate, axis) => coordinate - before[axis])
      const tangentLength = Math.max(0.0001, Math.hypot(...tangent))
      const radius = Math.max(0.0001, Math.hypot(...center))
      const radialUnit = center.map((coordinate) => coordinate / radius)
      const sideUnit = [
        (tangent[1] / tangentLength) * radialUnit[2] - (tangent[2] / tangentLength) * radialUnit[1],
        (tangent[2] / tangentLength) * radialUnit[0] - (tangent[0] / tangentLength) * radialUnit[2],
        (tangent[0] / tangentLength) * radialUnit[1] - (tangent[1] / tangentLength) * radialUnit[0]
      ]
      return center.map(
        (coordinate, axis) =>
          coordinate + sideUnit[axis] * sideOffset + radialUnit[axis] * radialOffset
      ) as Point
    }
    const points = [
      frameAt(start, 0, 0),
      frameAt(start, side, radial),
      frameAt(start + 1, side, radial),
      frameAt(start + 1, side * 1.45, radial * 1.4),
      frameAt(start + 3, side * 1.45, radial * 1.4),
      frameAt(start + 3, side * 1.9, radial * 1.4),
      frameAt(start + 4, side * 1.9, radial * 1.4)
    ]
    circuits.push({
      group: arc.group,
      kind: 'circuit',
      attachment: 'orbit',
      offset: { side, radial },
      energy: 0.42 + (index % 4) * 0.045 + random() * 0.18,
      points,
      color: index % 12 === 0 ? IVORY : AMBER
    })
  }

  for (let index = 0; index < 32; index += 1) {
    const latitude = latitudes[index % latitudes.length]
    const longitude = index * GOLDEN_ANGLE
    const startRadius = 9.4 + random() * 0.9
    const middleRadius = (startRadius + shellRadius) * 0.5
    const direction = index % 2 === 0 ? 1 : -1
    const pointAt = (radius: number, longitudeOffset = 0, latitudeOffset = 0): Point =>
      rotate(
        [
          Math.cos(latitude + latitudeOffset) * radius * Math.cos(longitude + longitudeOffset),
          Math.sin(latitude + latitudeOffset) * radius * 0.84,
          Math.cos(latitude + latitudeOffset) * radius * Math.sin(longitude + longitudeOffset)
        ],
        0.12,
        0,
        0.08
      )
    const points = [
      pointAt(startRadius),
      pointAt(middleRadius),
      pointAt(middleRadius, direction * 0.025),
      pointAt(middleRadius + 0.45, direction * 0.025),
      pointAt(middleRadius + 0.45, direction * 0.025, direction * 0.018),
      pointAt(shellRadius - 0.25, direction * 0.025, direction * 0.018),
      pointAt(shellRadius, direction * 0.025, direction * 0.018)
    ]
    circuits.push({
      group: 10,
      kind: 'circuit',
      attachment: 'radial',
      energy: 0.28 + random() * 0.24,
      points,
      color: AMBER
    })
  }

  for (let index = 0; index < 24; index += 1) {
    const fiber = fibers[index % fibers.length]
    const start = 3 + ((index * 3) % (fiber.points.length - 7))
    const points: Point[] = []
    for (let segment = 0; segment <= 4; segment += 1) {
      const point = fiber.points[Math.min(fiber.points.length - 1, start + segment)]
      const spread = segment * 0.07
      points.push([
        point[0] + Math.sin(index * 1.7) * spread,
        point[1] + Math.cos(index * 1.3) * spread,
        point[2] + Math.sin(index * 0.9) * spread
      ])
    }
    circuits.push({
      group: 20,
      kind: 'circuit',
      attachment: 'fiber',
      energy: 0.32 + random() * 0.28,
      points,
      color: AMBER
    })
  }

  const coreArcs = arcs.filter((arc) => arc.system === 'core')
  const attachedCircuits = circuits.filter(
    (circuit) =>
      (circuit.kind === 'rung' || circuit.attachment !== undefined) &&
      (circuit.group < 10 || circuit.group === 20)
  )
  const coreFlows = flows.filter((flow) => flow.system !== 'shell')
  const decorativePoints = [
    ...particles.map((particle) => particle.position),
    ...coreArcs.flatMap((arc) => arc.points),
    ...attachedCircuits.flatMap((circuit) => circuit.points),
    ...fibers.flatMap((fiber) => fiber.points),
    ...coreFlows.flatMap((flow) => flow.points)
  ]
  const bounds = {
    center: [0, 0, 0] as [number, number, number],
    radius:
      Math.max(OUTER_BOUND_RADIUS, ...decorativePoints.map((point) => Math.hypot(...point))) + 0.4
  }
  return {
    outerTracks: createOuterTracks(),
    particles,
    arcs: coreArcs,
    circuits: attachedCircuits,
    fibers,
    flows: coreFlows,
    bounds
  }
}
