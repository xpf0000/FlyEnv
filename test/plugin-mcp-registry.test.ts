import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PluginMCPRegistry } from '../src/main/core/PluginMCPRegistry'
import { PluginMCPAudit } from '../src/main/core/PluginMCPAudit'
import { MCPRuntime } from '../src/main/core/MCPRuntime'

const registration = (generation = 'i1') => ({
  pluginId: 'fixture',
  moduleId: 'fixture',
  installGeneration: generation,
  declaration: {
    audit: 'metadata-volatile' as const,
    tools: [
      {
        name: 'fixture_write',
        method: 'write',
        description: 'Increment counter',
        inputSchema: {
          type: 'object',
          properties: { increment: { type: 'integer' } },
          required: ['increment'],
          additionalProperties: false
        },
        readOnly: false,
        risky: true
      }
    ]
  }
})
function fixture() {
  let generation = 'i1'
  let count = 0
  const config = { enabledTools: [] as string[], approval: {} as Record<string, string> }
  const workers: any = {
    capture: async () => ({
      pluginId: 'fixture',
      moduleId: 'fixture',
      dataRoot: '/data',
      installGeneration: generation,
      workerGeneration: 'w1'
    }),
    dispatch: async (_module: string, _method: string, args: any[], token: any) => {
      if (generation !== token.installGeneration) throw new Error('plugin_stale_generation')
      count += args[0].increment
      return { code: 0, data: { outcome: 'success', count } }
    }
  }
  const audit = new PluginMCPAudit()
  const registry = new PluginMCPRegistry(
    workers,
    (key: string) => config[key as keyof typeof config],
    audit
  )
  registry.replace([registration()])
  return {
    config,
    workers,
    audit,
    registry,
    setGeneration: (value: string) => {
      generation = value
    },
    count: () => count
  }
}
test('installed tools can be listed without starting HTTP or granting permission', async () => {
  const f = fixture()
  let loads = 0
  const runtime = new MCPRuntime(
    { getConfig: () => ({}) },
    async () => {
      loads++
      throw new Error('must stay lazy')
    },
    f.registry
  )
  assert.ok(runtime.listTools().some((tool) => tool.name === 'fixture_write'))
  assert.equal(loads, 0)
  assert.equal(
    (await f.registry.invoke('fixture_write', { increment: 1 }, async () => true)).error_code,
    'tool_disabled'
  )
  f.config.enabledTools.push('fixture_write')
  let confirmations = 0
  assert.equal(
    (
      await f.registry.invoke('fixture_write', { increment: 1 }, async () => {
        confirmations++
        return true
      })
    ).outcome,
    'success'
  )
  assert.equal(confirmations, 1, 'mutating plugin tool defaults to confirmation')
  assert.equal(f.count(), 1)
  f.registry.replace([])
  assert.equal(f.registry.listTools().length, 0)
  assert.equal(
    (await f.registry.invoke('fixture_write', { increment: 2 }, async () => true)).error_code,
    'tool_unavailable'
  )
  assert.equal(f.count(), 1)
})
test('duplicate names are rejected before replacing the current catalog', () => {
  const f = fixture()
  assert.throws(
    () => f.registry.replace([registration(), { ...registration(), pluginId: 'other' }]),
    /duplicate/
  )
  assert.equal(f.registry.listTools().length, 1)
})
test('approval await rechecks disabled tools, removed registrations and installation generations', async () => {
  for (const mutation of ['disabled', 'removed', 'upgraded']) {
    const f = fixture()
    f.config.enabledTools.push('fixture_write')
    const result = await f.registry.invoke('fixture_write', { increment: 2 }, async () => {
      if (mutation === 'disabled') f.config.enabledTools.length = 0
      if (mutation === 'removed') f.registry.replace([])
      if (mutation === 'upgraded') {
        f.setGeneration('i2')
        f.registry.replace([registration('i2')])
      }
      return true
    })
    assert.equal(result.outcome, 'failed')
    assert.equal(f.count(), 0)
  }
})
test('invalid schema input is rejected before executing a plugin and audit failure is supplementary', async () => {
  const f = fixture()
  f.config.enabledTools.push('fixture_write')
  assert.equal(
    (await f.registry.invoke('fixture_write', { increment: 'secret' }, async () => true))
      .error_code,
    'invalid_input'
  )
  f.audit.log = () => {
    throw new Error('diagnostics unavailable')
  }
  assert.equal(
    (await f.registry.invoke('fixture_write', { increment: 3 }, async () => true)).outcome,
    'success'
  )
  assert.equal(f.count(), 3)
})

test('tool permission is rechecked at the actual worker dispatch boundary', async () => {
  const f = fixture()
  f.config.enabledTools.push('fixture_write')
  let sent = false
  f.workers.dispatch = async (
    _module: string,
    _method: string,
    _args: unknown[],
    _token: unknown,
    guard?: () => void
  ) => {
    // Simulate the asynchronous worker readiness boundary after approval.
    await Promise.resolve()
    f.config.enabledTools.length = 0
    guard?.()
    sent = true
    return { code: 0, data: { outcome: 'success' } }
  }
  const result = await f.registry.invoke('fixture_write', { increment: 1 }, async () => true)
  assert.equal(result.error_code, 'tool_disabled')
  assert.equal(sent, false)
})

test('an unchanged catalog refresh during lazy worker startup preserves the installation identity', async () => {
  const f = fixture()
  f.config.enabledTools.push('fixture_write')
  const capture = f.workers.capture
  f.workers.capture = async () => {
    f.registry.replace([registration()])
    return capture()
  }
  assert.equal(
    (await f.registry.invoke('fixture_write', { increment: 1 }, async () => true)).outcome,
    'success'
  )
})

test('all invocation outcomes retain only validated volatile metadata', async () => {
  const marker = 'PRIVATE_BODY_QUERY_EXCEPTION'
  for (const outcome of ['success', 'failed', 'unknown', 'exception', 'cancelled', 'disabled']) {
    const f = fixture()
    f.config.enabledTools.push('fixture_write')
    f.workers.dispatch = async () => {
      if (outcome === 'exception') throw new Error(marker)
      return { code: 0, data: { outcome, content: marker, error_code: marker, id: marker } }
    }
    if (outcome === 'disabled') f.config.enabledTools.length = 0
    await f.registry.invoke(
      'fixture_write',
      { increment: 1 },
      async () => outcome !== 'cancelled',
      { name: marker, version: marker }
    )
    const rows = f.audit.list('fixture')
    assert.equal(rows.length, 1)
    assert.equal(JSON.stringify(rows).includes(marker), false)
  }
})
