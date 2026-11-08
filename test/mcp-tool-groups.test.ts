import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groupMcpTools, resolveMcpToolGroup } from '../src/render/components/MCP/toolGroups'

test('groups built-in and plugin tools with display names and stable order', () => {
  const groups = groupMcpTools([
    { name: 'flyenv_service', description: '', risky: false, readOnly: true },
    {
      name: 'memory_get',
      description: '',
      risky: false,
      readOnly: true,
      pluginId: 'ai-memory',
      pluginName: 'AI Memory'
    },
    {
      name: 'memory_store',
      description: '',
      risky: true,
      readOnly: false,
      pluginId: 'ai-memory',
      pluginName: 'AI Memory'
    },
    {
      name: 'other_run',
      description: '',
      risky: true,
      readOnly: false,
      pluginId: 'other'
    }
  ])
  assert.deepEqual(
    groups.map((group) => group.id),
    ['builtin', 'plugin:ai-memory', 'plugin:other']
  )
  assert.equal(groups[1].label, 'AI Memory')
  assert.equal(groups[2].label, 'other')
  assert.equal(groups[1].tools.length, 2)
  assert.equal(resolveMcpToolGroup(groups, 'plugin:missing'), 'builtin')
  assert.equal(resolveMcpToolGroup(groups, 'plugin:other'), 'plugin:other')
})

test('keeps an empty built-in group when no tools are available', () => {
  assert.deepEqual(groupMcpTools([]), [{ id: 'builtin', label: 'FlyEnv', tools: [] }])
})
