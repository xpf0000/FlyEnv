import * as THREE from 'three'

export type RibbonPath = {
  points: [number, number, number][]
  color: string
  energy: number
  alphas?: number[]
  parentPoints?: [number, number, number][]
  parentStart?: number
  purpose?: 'static' | 'flow'
}

export function createRibbonGeometry(paths: RibbonPath[]) {
  const positions: number[] = []
  const previous: number[] = []
  const next: number[] = []
  const sides: number[] = []
  const colors: number[] = []
  const alphas: number[] = []
  const segmentProgress: number[] = []
  const pathProgress: number[] = []

  paths.forEach((path) => {
    const color = new THREE.Color(path.color).multiplyScalar(0.72 + path.energy * 0.65)
    const metrics = createPathMetrics(path.points)
    const parentMetrics = path.parentPoints ? createPathMetrics(path.parentPoints) : undefined
    const progressAt = (index: number) => {
      const local =
        metrics.totalLength > 0 ? metrics.cumulativeLengths[index] / metrics.totalLength : 0
      if (!parentMetrics || parentMetrics.totalLength <= 0) {
        return local
      }
      return (path.parentStart ?? 0) + metrics.cumulativeLengths[index] / parentMetrics.totalLength
    }
    for (let index = 0; index < path.points.length - 1; index += 1) {
      const from = path.points[index]
      const to = path.points[index + 1]
      const beforeFrom = path.points[Math.max(0, index - 1)]
      const afterTo = path.points[Math.min(path.points.length - 1, index + 2)]
      const fromAlpha = path.alphas?.[index] ?? 1
      const toAlpha = path.alphas?.[index + 1] ?? 1
      const fromProgress =
        metrics.totalLength > 0 ? metrics.cumulativeLengths[index] / metrics.totalLength : 0
      const toProgress =
        metrics.totalLength > 0 ? metrics.cumulativeLengths[index + 1] / metrics.totalLength : 1
      const vertices = [
        {
          point: from,
          previous: beforeFrom,
          next: to,
          side: -1,
          alpha: fromAlpha,
          segment: fromProgress,
          parent: progressAt(index)
        },
        {
          point: from,
          previous: beforeFrom,
          next: to,
          side: 1,
          alpha: fromAlpha,
          segment: fromProgress,
          parent: progressAt(index)
        },
        {
          point: to,
          previous: from,
          next: afterTo,
          side: -1,
          alpha: toAlpha,
          segment: toProgress,
          parent: progressAt(index + 1)
        },
        {
          point: to,
          previous: from,
          next: afterTo,
          side: -1,
          alpha: toAlpha,
          segment: toProgress,
          parent: progressAt(index + 1)
        },
        {
          point: from,
          previous: beforeFrom,
          next: to,
          side: 1,
          alpha: fromAlpha,
          segment: fromProgress,
          parent: progressAt(index)
        },
        {
          point: to,
          previous: from,
          next: afterTo,
          side: 1,
          alpha: toAlpha,
          segment: toProgress,
          parent: progressAt(index + 1)
        }
      ]
      vertices.forEach((vertex) => {
        positions.push(...vertex.point)
        previous.push(...vertex.previous)
        next.push(...vertex.next)
        sides.push(vertex.side)
        colors.push(...color.toArray())
        alphas.push(vertex.alpha)
        segmentProgress.push(vertex.segment)
        pathProgress.push(vertex.parent)
      })
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aPrevious', new THREE.Float32BufferAttribute(previous, 3))
  geometry.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3))
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1))
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1))
  geometry.setAttribute('aSegmentProgress', new THREE.Float32BufferAttribute(segmentProgress, 1))
  geometry.setAttribute('aPathProgress', new THREE.Float32BufferAttribute(pathProgress, 1))
  return geometry
}

export type PathMetrics = {
  points: [number, number, number][]
  cumulativeLengths: number[]
  totalLength: number
}

export function createPathMetrics(points: [number, number, number][]): PathMetrics {
  const cumulativeLengths = [0]
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = Math.hypot(
      ...points[index].map((coordinate, axis) => points[index + 1][axis] - coordinate)
    )
    cumulativeLengths.push(cumulativeLengths[index] + length)
  }
  return { points, cumulativeLengths, totalLength: cumulativeLengths.at(-1) ?? 0 }
}

export function samplePathByDistance(metrics: PathMetrics, fraction: number) {
  const distance = THREE.MathUtils.clamp(fraction, 0, 1) * metrics.totalLength
  let low = 0
  let high = metrics.cumulativeLengths.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (metrics.cumulativeLengths[middle] <= distance) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  const segment = Math.min(low, Math.max(0, metrics.points.length - 2))
  const from = metrics.points[segment] ?? [0, 0, 0]
  const to = metrics.points[segment + 1] ?? from
  const segmentLength =
    metrics.cumulativeLengths[segment + 1] - metrics.cumulativeLengths[segment] || 1
  const blend = (distance - metrics.cumulativeLengths[segment]) / segmentLength
  return {
    point: from.map((coordinate, axis) => THREE.MathUtils.lerp(coordinate, to[axis], blend)) as [
      number,
      number,
      number
    ],
    segment,
    blend
  }
}
