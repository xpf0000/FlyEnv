import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { PluginMCPAudit, pluginMCPAudit } from '../src/main/core/PluginMCPAudit'
import MCPAudit from '../src/main/core/MCPAudit'
import { ForkItem } from '../src/main/core/ForkItem'

const secret = 'PRIVATE_MEMORY_正文_QUERY_report'
test('private, removed and unknown tool paths never persist arguments or error content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-audit-'))
  const previous = global.Server
  try {
    ;(global as any).Server = { BaseDir: root }
    pluginMCPAudit.register('fixture', ['fixture_write'])
    for (const outcome of ['success', 'failed', 'cancelled', 'unknown', 'disabled']) {
      MCPAudit.log(
        'fixture_write',
        { nested: { content: secret }, query: secret, id: secret },
        outcome === 'success',
        `${outcome}: ${secret}`
      )
      pluginMCPAudit.log('fixture_write', {
        args: { id: secret, request_id: secret },
        result: { outcome, error_code: secret, content: secret },
        durationMs: 4,
        client: { name: secret, version: secret }
      })
    }
    MCPAudit.log(secret, { query: secret }, false, secret)
    const persisted = await readFile(join(root, 'mcp/audit.log'), 'utf8').catch(() => '')
    assert.equal(persisted, '')
    assert.equal(JSON.stringify(pluginMCPAudit.list('fixture')).includes(secret), false)
    MCPAudit.log('list_services', { flag: 'mysql' }, true)
    assert.match(await readFile(join(root, 'mcp/audit.log'), 'utf8'), /list_services/)
  } finally {
    global.Server = previous
    await rm(root, { recursive: true, force: true })
  }
})
test('volatile diagnostics validate metadata, evict oldest at 201, and restart empty', () => {
  const audit = new PluginMCPAudit()
  audit.register('fixture', ['fixture_write'])
  for (let i = 0; i < 201; i++)
    audit.log('fixture_write', {
      durationMs: i,
      args: { id: '123e4567-e89b-42d3-a456-426614174000', expected_revision: 1 },
      result: { outcome: 'success', revision: 2 },
      client: { name: 'Codex', version: '0.166.0' }
    })
  const rows = audit.list('fixture')
  assert.equal(rows.length, 200)
  assert.equal(rows[0].duration_ms, 1)
  assert.equal(rows[0].id, '123e4567-e89b-42d3-a456-426614174000')
  assert.equal(rows[0].client?.source, 'self-reported')
  assert.equal(new PluginMCPAudit().list('fixture').length, 0)
})
test('dedicated worker native error report is excluded from fork.error.txt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-fork-audit-'))
  const previous = global.Server
  try {
    ;(global as any).Server = { BaseDir: root }
    const child: any = Object.assign(new EventEmitter(), {
      pid: 456789,
      postMessage() {},
      kill() {}
    })
    const bridge: any = { handle: () => false }
    const item = new ForkItem(
      'fixture',
      {
        dedicated: true,
        idleTimeoutMs: 100,
        primary: false,
        forkProcess: () => child,
        killProcess: () => {}
      },
      bridge,
      bridge,
      bridge,
      () => undefined
    )
    child.emit('error', secret, secret, secret)
    child.emit('exit', 1)
    await item.actualExit
    assert.equal(await readFile(join(root, 'fork.error.txt'), 'utf8').catch(() => ''), '')
  } finally {
    global.Server = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('nested receipts and result-list counts survive metadata projection without retaining records', () => {
  const audit = new PluginMCPAudit()
  audit.register('fixture', ['fixture_write', 'fixture_read'])
  const id = '123e4567-e89b-42d3-a456-426614174001'
  audit.log('fixture_write', {
    result: { outcome: 'success', data: { id, revision: 3, content: secret } }
  })
  audit.log('fixture_read', {
    result: {
      outcome: 'partial',
      data: { results: [{ content: secret }, { query: secret }], truncated: true },
      error_code: secret
    }
  })
  const rows = audit.list('fixture')
  assert.equal(rows[0].id, id)
  assert.equal(rows[0].revision, 3)
  assert.equal(rows[1].hit_count, 2)
  assert.equal(rows[1].error_code, 'operation_failed')
  assert.equal(JSON.stringify(rows).includes(secret), false)
})

test('detailed search calls retain queries, filters and summaries without content', () => {
  const audit = new PluginMCPAudit()
  const id = '123e4567-e89b-42d3-a456-426614174010'
  audit.register('ai-memory', ['flyenv_memory_search'])
  audit.log('flyenv_memory_search', {
    args: {
      scope: 'project',
      project_path: '/work/FlyEnv',
      queries: ['没有命中', 'MCP'],
      topic: 'audit',
      tags: ['mcp'],
      limit: 8,
      cursor: secret,
      content: secret
    },
    result: {
      outcome: 'success',
      data: {
        results: [{ id, title: 'Hit', summary: '需要保留的摘要', content: secret }],
        truncated: true,
        next_cursor: secret
      }
    }
  })
  const row = audit.list('ai-memory')[0] as any
  assert.deepEqual(row.request.queries, ['没有命中', 'MCP'])
  assert.equal(row.request.topic, 'audit')
  assert.equal(row.request.cursor_provided, true)
  assert.equal(row.response.data.has_next_cursor, true)
  assert.equal(row.response.data.results[0].summary, '需要保留的摘要')
  assert.equal(JSON.stringify(row).includes(secret), false)
  assert.equal(JSON.stringify(row).includes('"content"'), false)
  assert.equal(Object.hasOwn(row.response.data, 'next_cursor'), false)
})

test('detailed mutation calls exclude nested request and response content', () => {
  const audit = new PluginMCPAudit()
  audit.register('ai-memory', ['flyenv_memory_update'])
  audit.log('flyenv_memory_update', {
    args: {
      scope: 'global',
      id: '123e4567-e89b-42d3-a456-426614174011',
      expected_revision: 1,
      request_id: '123e4567-e89b-42d3-a456-426614174012',
      reason: '补充记录',
      changes: { summary: '更新摘要', content: secret }
    },
    result: {
      outcome: 'success',
      data: { id: '123e4567-e89b-42d3-a456-426614174011', revision: 2, content: secret }
    }
  })
  const row = audit.list('ai-memory')[0] as any
  assert.equal(row.request.changes.summary, '更新摘要')
  assert.equal(row.response.data.revision, 2)
  assert.equal(JSON.stringify(row).includes(secret), false)
  assert.equal(JSON.stringify(row).includes('"content"'), false)
})

test('plugin MCP file audit persists only simplified validated metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-plugin-file-audit-'))
  const previous = global.Server
  const id = '123e4567-e89b-42d3-a456-426614174020'
  const requestId = '123e4567-e89b-42d3-a456-426614174021'
  try {
    ;(global as any).Server = { BaseDir: root }
    ;(MCPAudit as any).logPlugin('flyenv_memory_store', 'ai-memory', {
      args: { request_id: requestId, queries: [secret], summary: secret, content: secret },
      result: { outcome: 'success', data: { id, revision: 1, summary: secret, content: secret } },
      durationMs: 7.4,
      client: { name: 'Codex', version: '0.167.0' }
    })
    const row = JSON.parse((await readFile(join(root, 'mcp/audit.log'), 'utf8')).trim())
    assert.equal(row.tool, 'flyenv_memory_store')
    assert.equal(row.pluginId, 'ai-memory')
    assert.equal(row.id, id)
    assert.equal(row.request_id, requestId)
    assert.equal(row.revision, 1)
    assert.equal(row.duration_ms, 7)
    assert.equal(row.client.name, 'codex')
    assert.equal(row.outcome, 'success')
    assert.equal(JSON.stringify(row).includes(secret), false)
  } finally {
    global.Server = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('redirected volatile audit failure remains supplementary', () => {
  const original = pluginMCPAudit.log
  pluginMCPAudit.log = () => {
    throw new Error('volatile unavailable')
  }
  try {
    assert.doesNotThrow(() => MCPAudit.log('unknown_plugin_tool', {}, false))
  } finally {
    pluginMCPAudit.log = original
  }
})

test('call records have stable unique row identifiers', () => {
  const audit = new PluginMCPAudit()
  audit.register('ai-memory', ['flyenv_memory_search'])
  audit.log('flyenv_memory_search', { result: { outcome: 'success' } })
  audit.log('flyenv_memory_search', { result: { outcome: 'success' } })
  const rows = audit.list('ai-memory') as any[]
  assert.equal(typeof rows[0].call_id, 'number')
  assert.equal(new Set(rows.map((row) => row.call_id)).size, 2)
})
