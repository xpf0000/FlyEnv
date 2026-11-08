import { MEMORY_TYPES, type MemoryType, type SearchHit } from '../shared'

export type UniverseNode = {
  hit: SearchHit
  id: string
  x: number
  y: number
  z: number
  color: string
  radius: number
}
export type UniverseEdge = {
  source: string
  target: string
  reason: 'topic' | 'tag'
}
export type UniverseGraph = { nodes: UniverseNode[]; edges: UniverseEdge[] }
export type UniverseCamera = { yaw: number; pitch: number; zoom: number }
export type ProjectedNode = Omit<UniverseNode, 'x' | 'y' | 'z'> & {
  x: number
  y: number
  depth: number
  screenRadius: number
}

export const MEMORY_COLORS: Record<MemoryType, string> = {
  preference: '#c084fc',
  fact: '#60a5fa',
  event: '#fb7185',
  procedure: '#34d399',
  project_state: '#fbbf24',
  decision: '#22d3ee',
  observation: '#a3e635',
  note: '#f472b6'
}

function hash(value: string) {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0) / 4294967295
}

export function buildUniverse(memories: SearchHit[]): UniverseGraph {
  const nodes = memories.map((hit) => {
    const typeIndex = Math.max(0, MEMORY_TYPES.indexOf(hit.type))
    const angle = typeIndex * 2.399963229728653
    const topic = hit.topic.trim().toLowerCase() || hit.type
    const spread = (axis: string) => (hash(`${topic}:${axis}`) - 0.5) * 0.7
    const jitter = (axis: string) => (hash(`${hit.id}:${axis}`) - 0.5) * 0.32
    return {
      hit,
      id: hit.id,
      x: Math.cos(angle) * 0.52 + spread('x') + jitter('x'),
      y: (typeIndex / Math.max(1, MEMORY_TYPES.length - 1) - 0.5) * 0.9 + spread('y') + jitter('y'),
      z: Math.sin(angle) * 0.52 + spread('z') + jitter('z'),
      color: MEMORY_COLORS[hit.type],
      radius: hit.pinned ? 10 : 7
    }
  })
  const edges: UniverseEdge[] = []
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left].hit
      const b = nodes[right].hit
      const topic = a.topic.trim().toLowerCase()
      const sameTopic = !!topic && topic === b.topic.trim().toLowerCase()
      const tags = new Set(a.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
      const sameTag = b.tags.some((tag) => tags.has(tag.trim().toLowerCase()))
      if (sameTopic || sameTag) {
        edges.push({ source: a.id, target: b.id, reason: sameTopic ? 'topic' : 'tag' })
      }
    }
  }
  return { nodes, edges }
}

export function projectNode(
  node: UniverseNode,
  camera: UniverseCamera,
  width: number,
  height: number
): ProjectedNode {
  const cosYaw = Math.cos(camera.yaw)
  const sinYaw = Math.sin(camera.yaw)
  const cosPitch = Math.cos(camera.pitch)
  const sinPitch = Math.sin(camera.pitch)
  const x = node.x * cosYaw + node.z * sinYaw
  const yawZ = -node.x * sinYaw + node.z * cosYaw
  const y = node.y * cosPitch - yawZ * sinPitch
  const rotatedZ = node.y * sinPitch + yawZ * cosPitch
  const depth = Math.max(0.3, rotatedZ + 4 / camera.zoom)
  const perspective = (Math.min(width, height) * 1.15) / depth
  return {
    hit: node.hit,
    id: node.id,
    color: node.color,
    radius: node.radius,
    x: width / 2 + x * perspective,
    y: height / 2 - y * perspective,
    depth,
    screenRadius: Math.max(4, (node.radius * perspective) / 90)
  }
}

export function pickUniverseNode(nodes: ProjectedNode[], x: number, y: number) {
  return [...nodes]
    .sort((a, b) => a.depth - b.depth)
    .find((node) => {
      const distance = Math.hypot(node.x - x, node.y - y)
      return distance <= Math.max(14, node.screenRadius + 6)
    })
}
