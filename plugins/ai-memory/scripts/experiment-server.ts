// Short-lived stdio server for the effect experiment. Never opens a user data root.
import { readFile, appendFile } from 'node:fs/promises'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { memoryInputSchema } from '../core/schema'
import { createExperimentAPI } from './experiment-api'
import type { MemoryMethod } from '../shared'

const fixtures = JSON.parse(
  await readFile(new URL('../tests/fixtures/memories.json', import.meta.url), 'utf8')
)
const api = createExperimentAPI(fixtures, { writesFail: process.argv.includes('--fail-writes') })
const methods: MemoryMethod[] = ['search', 'get', 'store', 'update', 'forget']
const server = new Server(
  { name: 'flyenv-memory-effect-experiment', version: '0.0.0' },
  { capabilities: { tools: {} } }
)
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: methods.map((method) => ({
    name: `flyenv_memory_${method}`,
    description: `${method} local project/global memory. Store requires type, topic, title, summary, tags, content (Markdown string), source, request_id (UUID), scope, and project_path for project scope. Evaluation uses volatile synthetic data only.`,
    inputSchema: memoryInputSchema(method),
    annotations: {
      readOnlyHint: method === 'search' || method === 'get',
      destructiveHint: method === 'forget',
      openWorldHint: false
    }
  }))
}))
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const method = request.params.name.replace(/^flyenv_memory_/, '') as MemoryMethod
  const result = await api.call(method, request.params.arguments as never)
  const logIndex = process.argv.indexOf('--evidence')
  if (logIndex >= 0)
    await appendFile(
      process.argv[logIndex + 1],
      JSON.stringify({ method, input: request.params.arguments, result }) + '\n'
    )
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    isError: !['success', 'already_deleted'].includes(result.outcome)
  }
})
await server.connect(new StdioServerTransport())
