import { MCP_ALL_TOOLS } from '../mcpToolCatalog'

export type PluginMCPTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  method: string
  readOnly: boolean
  risky: boolean
}

export type PluginMCPDeclaration = {
  audit: 'metadata-volatile'
  tools: PluginMCPTool[]
}

const methods = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const forbiddenMethods = new Set(['constructor', 'prototype', '__proto__', 'init', 'close'])

/** A bounded, JSON-only schema; remote references may never cause network I/O. */
function validateSchema(schema: unknown) {
  let bytes: number
  try {
    bytes = new TextEncoder().encode(JSON.stringify(schema)).byteLength
  } catch {
    throw new Error('Plugin MCP inputSchema must be JSON')
  }
  if (bytes > 64 * 1024) throw new Error('Plugin MCP inputSchema is too large')
  const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
  const walk = (node: any, depth: number) => {
    if (depth > 32) throw new Error('Plugin MCP inputSchema is too deep')
    if (typeof node === 'boolean') return
    if (!node || typeof node !== 'object' || Array.isArray(node))
      throw new Error('Invalid plugin MCP inputSchema')
    if (node.$ref !== undefined && (typeof node.$ref !== 'string' || !node.$ref.startsWith('#/')))
      throw new Error('Plugin MCP schema references must be local')
    if (node.type !== undefined && ![node.type].flat().every((type) => types.has(type)))
      throw new Error('Invalid plugin MCP schema type')
    if (
      node.required !== undefined &&
      (!Array.isArray(node.required) ||
        !node.required.every((key: unknown) => typeof key === 'string'))
    )
      throw new Error('Invalid plugin MCP schema required')
    for (const key of ['properties', 'patternProperties', '$defs', 'definitions']) {
      if (node[key] === undefined) continue
      if (!node[key] || typeof node[key] !== 'object' || Array.isArray(node[key]))
        throw new Error('Invalid plugin MCP schema properties')
      for (const child of Object.values(node[key])) walk(child, depth + 1)
    }
    for (const key of ['items', 'additionalProperties', 'not', 'if', 'then', 'else'])
      if (node[key] !== undefined) walk(node[key], depth + 1)
    for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems']) {
      if (node[key] === undefined) continue
      if (!Array.isArray(node[key]) || !node[key].length)
        throw new Error('Invalid plugin MCP schema alternatives')
      for (const child of node[key]) walk(child, depth + 1)
    }
    if (node.enum !== undefined && (!Array.isArray(node.enum) || !node.enum.length))
      throw new Error('Invalid plugin MCP schema enum')
    for (const key of [
      'minLength',
      'maxLength',
      'minItems',
      'maxItems',
      'minProperties',
      'maxProperties'
    ])
      if (node[key] !== undefined && (!Number.isSafeInteger(node[key]) || node[key] < 0))
        throw new Error('Invalid plugin MCP schema limit')
    for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'])
      if (node[key] !== undefined && (typeof node[key] !== 'number' || !Number.isFinite(node[key])))
        throw new Error('Invalid plugin MCP schema number')
    if (node.pattern !== undefined) {
      if (typeof node.pattern !== 'string') throw new Error('Invalid plugin MCP schema pattern')
      new RegExp(node.pattern, 'u')
    }
  }
  if (!schema || typeof schema !== 'object' || (schema as any).type !== 'object')
    throw new Error('Plugin MCP inputSchema must describe an object')
  walk(schema, 0)
}

export function validatePluginMCP(value: PluginMCPDeclaration) {
  if (
    value.audit !== 'metadata-volatile' ||
    !Array.isArray(value.tools) ||
    !value.tools.length ||
    value.tools.length > 32
  )
    throw new Error('Invalid plugin MCP declaration')
  const names = new Set<string>(MCP_ALL_TOOLS)
  for (const tool of value.tools) {
    if (
      !tool ||
      typeof tool.name !== 'string' ||
      !/^[A-Za-z0-9_]{1,64}$/.test(tool.name) ||
      names.has(tool.name)
    )
      throw new Error('Plugin MCP tool name is invalid or duplicated')
    names.add(tool.name)
    if (
      typeof tool.method !== 'string' ||
      !methods.test(tool.method) ||
      forbiddenMethods.has(tool.method)
    )
      throw new Error('Plugin MCP method is invalid')
    if (
      typeof tool.description !== 'string' ||
      !tool.description ||
      tool.description.length > 4096 ||
      typeof tool.readOnly !== 'boolean' ||
      typeof tool.risky !== 'boolean'
    )
      throw new Error('Invalid plugin MCP tool metadata')
    validateSchema(tool.inputSchema)
  }
}

/** Plugins may distinguish useful partial reads from incomplete mutations. */
export function pluginToolIsError(result: { isError?: boolean; outcome?: string } | undefined) {
  if (typeof result?.isError === 'boolean') return result.isError
  return (
    !!result?.outcome &&
    !['success', 'partial', 'deleted', 'already_deleted'].includes(result.outcome)
  )
}
