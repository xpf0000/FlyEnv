export type NeuralNode = {
  id: string
  kind: 'category' | 'memory'
  category: number
  label: string
  summary: string
  tags: string[]
  color: string
  inactive?: boolean
  size: number
  position: [number, number, number]
}

export type NeuralEdge = {
  source: number
  target: number
  kind: 'membership' | 'semantic' | 'visual'
  strength: number
}

export type NeuralModel = {
  nodes: NeuralNode[]
  edges: NeuralEdge[]
  semanticNeighbors?: (index: number) => number[]
}
