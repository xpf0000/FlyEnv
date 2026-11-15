import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readMcpClientConfig, validateMcpConfig } from '../../../src/fork/util/MCPClientConfig'
test('strict MCP client reads preserve JSONC settings and reject corrupt files without writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mcp-config-test-'))
  try {
    const file = join(root, 'opencode.jsonc')
    await writeFile(
      file,
      '{ // Keep model and existing connections\n"model":"keep","mcp":{"existing":{"type":"remote","url":"http://localhost"},},}'
    )
    const config = await readMcpClientConfig(file, 'mcp', true)
    assert.equal(config.model, 'keep')
    assert.equal(config.mcp.existing.type, 'remote')
    for (const raw of ['{invalid', '{"mcpServers":[]}', '[1,2]', 'null']) {
      await writeFile(file, raw)
      await assert.rejects(readMcpClientConfig(file, 'mcpServers'))
      assert.equal(await readFile(file, 'utf8'), raw)
    }
    assert.throws(() => validateMcpConfig({ mcp_servers: [] }, 'mcp_servers'))
    assert.deepEqual(await readMcpClientConfig(join(root, 'new.json'), 'mcpServers'), {})
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Claude MCP profile respects the same custom home as global instructions', async () => {
  const { claudeMcpConfigPath } = await import('../../../src/fork/module/ClaudeCode/config-path')
  assert.equal(claudeMcpConfigPath('/user', {}), join('/user', '.claude.json'))
  assert.equal(
    claudeMcpConfigPath('/user', { CLAUDE_CONFIG_DIR: '/custom' }),
    join('/custom', '.claude.json')
  )
})
