import { MEMORY_TYPES, type MemoryType, type SearchHit } from '../../shared'
import { MEMORY_COLORS } from '../universe'
import type { NeuralModel, NeuralNode } from './model'

export type NeuralData = {
  model: NeuralModel
  hitsByNodeId: Map<string, SearchHit>
  semanticEdgeCount: number
}

export const categoryNodeId = (type: MemoryType) => `category:${type}`

function randomFromSeed(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5)
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function idSeed(id: string) {
  let seed = 2166136261
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619)
  return seed >>> 0
}

export function buildNeuralData(
  memories: SearchHit[],
  label: (type: MemoryType) => string = (type) => type
): NeuralData {
  const random = randomFromSeed(0x5eeda11)
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const angles: number[] = []
  const nodes: NeuralNode[] = MEMORY_TYPES.map((type, category) => {
    const y = 1 - (2 * (category + 0.5)) / MEMORY_TYPES.length
    const ring = Math.sqrt(1 - y * y)
    const angle = category * goldenAngle + (random() - 0.5) * 0.22
    const radius = 5.7 + random() * 1.45
    const depth = (random() - 0.5) * 1.6
    angles.push(angle)
    return {
      id: categoryNodeId(type),
      kind: 'category',
      category,
      label: label(type),
      summary: '',
      tags: [],
      color: MEMORY_COLORS[type],
      size: 2.35 + random() * 0.4,
      position: [
        Math.cos(angle) * ring * radius * 1.08,
        y * radius * 0.85,
        Math.sin(angle) * ring * radius + depth
      ]
    }
  })
  const hitsByNodeId = new Map<string, SearchHit>()
  for (const hit of memories) {
    const id = `memory:${JSON.stringify([hit.scope, hit.projectId ?? '', hit.id])}`
    hitsByNodeId.set(id, hit)
  }
  const edges: NeuralModel['edges'] = []
  for (const [id, hit] of hitsByNodeId) {
    const category = MEMORY_TYPES.indexOf(hit.type)
    const hub = nodes[category]
    const localRandom = randomFromSeed(idSeed(id))
    const normal = () => localRandom() + localRandom() + localRandom() - 1.5
    const inward = 0.24 + Math.pow(localRandom(), 0.8) * 0.72
    const scale = 0.68 + localRandom() * 0.52
    const x = normal() * 2.3 * scale,
      y = normal() * 1.4 * scale,
      z = normal() * 2.2 * scale
    const angle = angles[category]
    edges.push({ source: category, target: nodes.length, kind: 'membership', strength: 0.7 })
    nodes.push({
      id,
      kind: 'memory',
      category,
      label: hit.title,
      summary: hit.summary,
      tags: [...hit.tags],
      color: hub.color,
      size: hit.pinned ? 1.95 : 1.45,
      inactive: hit.status === 'archived' || !!hit.expired,
      position: [
        hub.position[0] * inward + x * Math.cos(angle) - z * Math.sin(angle),
        hub.position[1] * inward + y,
        hub.position[2] * inward + x * Math.sin(angle) + z * Math.cos(angle)
      ]
    })
  }
  // Index true topic/tag groups once. Keep full neighborhoods without an O(N²) edge array.
  const groups = new Map<string, number[]>()
  const nodeGroups = new Map<number, string[]>()
  nodes.forEach((node, index) => {
    const hit = hitsByNodeId.get(node.id)
    if (!hit) return
    const topic = hit.topic.trim().toLowerCase()
    const keys = [
      ...new Set([
        ...(topic ? [`topic:${topic}`] : []),
        ...hit.tags
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
          .map((tag) => `tag:${tag}`)
      ])
    ]
    nodeGroups.set(index, keys)
    keys.forEach((key) => {
      const group = groups.get(key) ?? []
      group.push(index)
      groups.set(key, group)
    })
  })
  const semanticNeighbors = (index: number) => {
    const related = new Set<number>()
    for (const key of nodeGroups.get(index) ?? [])
      for (const neighbor of groups.get(key) ?? []) {
        if (neighbor !== index) related.add(neighbor)
      }
    return [...related]
  }
  const sampled = new Set<string>()
  let degreeSum = 0
  nodeGroups.forEach((_keys, index) => {
    const neighbors = semanticNeighbors(index)
    degreeSum += neighbors.length
    const limit = Math.min(4, neighbors.length)
    const start = idSeed(nodes[index].id) % Math.max(1, neighbors.length)
    for (let offset = 0; offset < limit; offset++) {
      const neighbor =
        neighbors[(start + Math.floor((offset * neighbors.length) / limit)) % neighbors.length]
      const source = Math.min(index, neighbor),
        target = Math.max(index, neighbor)
      const key = `${source}:${target}`
      if (sampled.has(key)) continue
      sampled.add(key)
      edges.push({ source, target, kind: 'semantic', strength: 0.7 })
    }
  })
  return {
    model: { nodes, edges, ...(nodeGroups.size ? { semanticNeighbors } : {}) },
    hitsByNodeId,
    semanticEdgeCount: degreeSum / 2
  }
}
