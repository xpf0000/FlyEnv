import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  groupMcpTools,
  resolveMcpToolGroup,
  pluginMcpToolDescription
} from '../src/render/components/MCP/toolGroups'

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

test('plugin descriptions follow UI locale, fall back to English and keep legacy descriptions', () => {
  const tool = {
    name: 'memory_get',
    description: 'Read a memory',
    descriptionI18n: { en: 'Read a memory', zh: '读取记忆正文' },
    risky: false,
    readOnly: true
  }
  assert.equal(pluginMcpToolDescription(tool, 'zh'), '读取记忆正文')
  assert.equal(pluginMcpToolDescription(tool, 'zh-hant'), '读取记忆正文')
  assert.equal(pluginMcpToolDescription(tool, 'en'), 'Read a memory')
  assert.equal(pluginMcpToolDescription(tool, 'de'), 'Read a memory')
  assert.equal(
    pluginMcpToolDescription({ ...tool, descriptionI18n: undefined }, 'zh'),
    'Read a memory'
  )
})

test('all five AI Memory tools have Chinese and English display descriptions', async () => {
  const { readFile } = await import('node:fs/promises')
  const manifest = JSON.parse(
    await readFile(new URL('../plugins/ai-memory/plugin.json', import.meta.url), 'utf8')
  )
  assert.equal(manifest.mcp.tools.length, 5)
  for (const tool of manifest.mcp.tools) {
    assert.match(pluginMcpToolDescription(tool, 'zh'), /[\u4e00-\u9fff]/, tool.name)
    assert.equal(pluginMcpToolDescription(tool, 'en'), tool.description)
  }
})
