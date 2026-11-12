import type { NeuralModel } from './model'

export type CameraPoint = [number, number, number]

export type CameraBounds = {
  center: CameraPoint
  radius: number
}

export function calculateCameraBounds(points: CameraPoint[]): CameraBounds {
  if (points.length === 0) {
    return { center: [0, 0, 0], radius: 1 }
  }
  const minimum: CameraPoint = [...points[0]]
  const maximum: CameraPoint = [...points[0]]
  points.forEach((point) => {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], point[axis])
      maximum[axis] = Math.max(maximum[axis], point[axis])
    }
  })
  const center = minimum.map(
    (coordinate, axis) => (coordinate + maximum[axis]) * 0.5
  ) as CameraPoint
  const radius = Math.max(
    0.001,
    ...points.map((point) =>
      Math.hypot(...point.map((coordinate, axis) => coordinate - center[axis]))
    )
  )
  return { center, radius }
}

export function calculateFitDistance(
  radius: number,
  verticalFovDegrees: number,
  width: number,
  height: number,
  inset: number,
  margin = 1.06
): number {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const effectiveWidth = Math.max(1, safeWidth - inset * 2)
  const effectiveHeight = Math.max(1, safeHeight - inset * 2)
  const vertical = (verticalFovDegrees * Math.PI) / 360
  const horizontal = Math.atan(Math.tan(vertical) * (safeWidth / safeHeight))
  const effectiveHorizontal = Math.atan(Math.tan(horizontal) * (effectiveWidth / safeWidth))
  const effectiveVertical = Math.atan(Math.tan(vertical) * (effectiveHeight / safeHeight))
  return (radius / Math.sin(Math.min(effectiveHorizontal, effectiveVertical))) * margin
}

export function getCategoryNodeIndices(model: NeuralModel, category: number): number[] {
  const indices = new Set<number>()
  model.nodes.forEach((node, index) => {
    if (node.category === category) {
      indices.add(index)
    }
  })
  if (model.semanticNeighbors) {
    model.nodes.forEach((node, index) => {
      if (node.category === category)
        model.semanticNeighbors!(index).forEach((neighbor) => indices.add(neighbor))
    })
    return [...indices].sort((a, b) => a - b)
  }
  model.edges.forEach((edge) => {
    if (edge.kind !== 'semantic') {
      return
    }
    const sourceCategory = model.nodes[edge.source].category
    const targetCategory = model.nodes[edge.target].category
    if (sourceCategory === category && targetCategory !== category) {
      indices.add(edge.target)
    } else if (targetCategory === category && sourceCategory !== category) {
      indices.add(edge.source)
    }
  })
  return [...indices].sort((a, b) => a - b)
}

export function getNodeNeighborhoodIndices(model: NeuralModel, nodeIndex: number): number[] {
  const indices = new Set<number>([nodeIndex])
  if (model.semanticNeighbors) {
    model.semanticNeighbors(nodeIndex).forEach((index) => indices.add(index))
    return [...indices].sort((a, b) => a - b)
  }
  model.edges.forEach((edge) => {
    if (edge.kind !== 'semantic') {
      return
    }
    if (edge.source === nodeIndex) {
      indices.add(edge.target)
    } else if (edge.target === nodeIndex) {
      indices.add(edge.source)
    }
  })
  return [...indices].sort((a, b) => a - b)
}
