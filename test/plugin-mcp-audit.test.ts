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
