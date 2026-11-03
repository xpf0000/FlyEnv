import assert from 'node:assert/strict'
import {
  MCP_DATABASE_FLAGS,
  MCP_INSTALLABLE_FLAGS,
  MCP_LIFECYCLE_FLAGS,
  MCP_QUERYABLE_FLAGS,
  MCP_TOOL_DESCRIPTIONS,
  isMcpDatabaseFlag,
  isMcpInstallableFlag,
  isMcpLifecycleFlag,
  isMcpQueryableFlag
} from '../src/main/core/mcpToolMetadata'
import { MCPTools } from '../src/main/core/MCPTools'

assert.equal(isMcpLifecycleFlag('bun'), false)
assert.equal(isMcpLifecycleFlag('node'), false)
assert.equal(isMcpLifecycleFlag('dns'), false)
assert.equal(isMcpLifecycleFlag('ftp-srv'), false)
assert.equal(isMcpLifecycleFlag('nginx'), true)
assert.equal(isMcpLifecycleFlag('mysql'), true)
assert.equal(isMcpLifecycleFlag('php'), true)

assert.equal(MCP_LIFECYCLE_FLAGS.includes('bun'), false)
assert.equal(MCP_INSTALLABLE_FLAGS.includes('bun'), true)
assert.equal(MCP_INSTALLABLE_FLAGS.includes('mkcert'), true)
assert.equal(MCP_INSTALLABLE_FLAGS.includes('mcp'), false)
assert.equal(isMcpInstallableFlag('bun'), true)
assert.equal(isMcpInstallableFlag('mcp'), false)
assert.equal(MCP_QUERYABLE_FLAGS.includes('node'), true)
assert.equal(MCP_QUERYABLE_FLAGS.includes('pure-ftpd'), true)
assert.equal(MCP_QUERYABLE_FLAGS.includes('dns'), false)
assert.equal(isMcpQueryableFlag('node'), true)
assert.equal(isMcpQueryableFlag('dns'), false)
assert.deepEqual(MCP_DATABASE_FLAGS, [
  'mysql',
  'mariadb',
  'postgresql',
  'clickhouse',
  'redis',
  'mongodb',
  'memcached'
])
assert.equal(isMcpDatabaseFlag('redis'), true)
assert.equal(isMcpDatabaseFlag('bun'), false)

assert.match(MCP_TOOL_DESCRIPTIONS.startService, /already-installed/i)
assert.match(MCP_TOOL_DESCRIPTIONS.startService, /install_service/)
assert.match(MCP_TOOL_DESCRIPTIONS.installService, /does not start/i)
assert.match(MCP_TOOL_DESCRIPTIONS.getManagedFileMap, /version-managed module/i)

const tools = new MCPTools(
  { send: () => ({ on: () => ({ then: () => ({ catch: () => {} }) }) }) } as any,
  { getConfig: () => false } as any
)

await assert.rejects(() => tools.startService('bun'), /not a lifecycle-managed FlyEnv service/i)
await assert.rejects(() => tools.getServiceExecInfo('dns'), /not a version-managed FlyEnv module/i)
