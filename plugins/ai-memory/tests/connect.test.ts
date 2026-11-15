import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MemoryConnectController, type ConnectDeps } from '../render/connect-controller'
import { prepareMemoryService } from '../render/connect-service'
const settings = { serverUrl: 'http://127.0.0.1:7682', token: 'test-token' }
function fixture(overrides: Partial<ConnectDeps> = {}) {
  const calls: string[] = []
  const deps: ConnectDeps = {
    prepareService: async () => {
      calls.push('service')
      return settings
    },
    readStatus: async () => false,
    readSettings: async () => {
      calls.push('settings')
      return settings
    },
    configure: async (client) => {
      calls.push(client)
      return { success: true }
    },
    installRules: async (client, project) => {
      calls.push(`rules:${client}:${project ?? 'global'}`)
      return { path: '/instructions' }
    },
    snippet: async (transport) => `${transport}-config`,
    copy: async (text) => {
      calls.push(`copy:${text}`)
    },
    rules: () => 'memory-rules',
    notify: () => {},
    ...overrides
  }
  return { controller: new MemoryConnectController(deps), calls }
}
test('global connect coalesces work across page reentry and retains all terminal steps', async () => {
  let ready!: (value: typeof settings) => void
  const f = fixture({
    prepareService: () =>
      new Promise((resolve) => {
        ready = resolve
      })
  })
  const first = f.controller.connect('codex')
  assert.equal(first, f.controller.connect('codex'))
  assert.equal(first, f.controller.connect('kimi'))
  assert.equal(f.controller.busy, true)
  await Promise.resolve()
  ready(settings)
  await first
  assert.equal(f.controller.busy, false)
  assert.equal(f.controller.operations.codex?.status, 'complete')
  assert.deepEqual(f.controller.operations.codex?.steps, ['done', 'done', 'done'])
  assert.equal(f.controller.operations.kimi, undefined)
  assert.deepEqual(f.calls, ['codex', 'rules:codex:global'])
})
test('required service failure prevents client writes and clears busy', async () => {
  const f = fixture({
    prepareService: async () => {
      throw new Error('service_unavailable')
    }
  })
  await f.controller.connect('claudeCode')
  assert.deepEqual(f.calls, [])
  assert.equal(f.controller.operations.claudeCode?.status, 'failed')
  assert.equal(f.controller.operations.claudeCode?.steps[0], 'failed')
  assert.equal(f.controller.busy, false)
})
test('rules failure preserves successful client configuration, retry skips completed write', async () => {
  let fail = true
  const f = fixture({
    installRules: async () => {
      if (fail) throw new Error('rules_unavailable')
      return { path: '/AGENTS.md' }
    }
  })
  await f.controller.connect('codex')
  assert.equal(f.controller.operations.codex?.status, 'partial')
  assert.deepEqual(f.controller.operations.codex?.steps, ['done', 'done', 'failed'])
  fail = false
  await f.controller.connect('codex')
  assert.equal(f.controller.operations.codex?.status, 'complete')
  assert.equal(f.calls.filter((call) => call === 'codex').length, 1)
  assert.equal(f.controller.operations.codex?.rulesPath, '/AGENTS.md')
})
test('client unknown result never installs rules or claims completion', async () => {
  const f = fixture({
    configure: async () => ({ success: false, errorCode: 'client_config_unknown' })
  })
  await f.controller.connect('openCode')
  assert.equal(f.controller.operations.openCode?.status, 'failed')
  assert.equal(f.controller.operations.openCode?.steps[1], 'unknown')
  assert.equal(
    f.calls.some((call) => call.startsWith('rules:')),
    false
  )
})
test('generic snippets display without preparing service; copying has no configuration side effects', async () => {
  const f = fixture()
  await f.controller.loadSnippets()
  assert.deepEqual(f.calls, ['settings'])
  assert.equal(f.controller.snippets.http, 'http-config')
  assert.equal(f.controller.snippets.stdio, 'stdio-config')
  assert.equal(f.controller.operations.generic, undefined)
  assert.equal(f.controller.serviceReady, false)
  await f.controller.copyConfig('http')
  assert.deepEqual(f.calls, ['settings', 'copy:http-config'])
})
test('generic HTTP survives independent stdio failure and clipboard failure', async () => {
  const f = fixture({
    snippet: async (transport) => {
      if (transport === 'stdio') throw new Error('bridge_unavailable')
      return 'http-config'
    },
    copy: async () => {
      throw new Error('denied')
    }
  })
  await f.controller.loadSnippets()
  assert.equal(f.controller.snippets.http, 'http-config')
  assert.equal(f.controller.snippets.stdio, undefined)
  assert.equal(f.controller.snippetErrors.stdio, 'bridge_unavailable')
  await f.controller.copyConfig('http')
  assert.equal(f.controller.feedback['config:http'], 'copyFailed')
  assert.equal(f.controller.snippets.http, 'http-config')
})
test('generic reads coalesce across page reentry and clear stale snippets on read failure', async () => {
  let resolve!: (value: typeof settings) => void
  let fail = false
  const f = fixture({
    readSettings: async () => {
      if (fail) throw new Error('config_unavailable')
      return new Promise((done) => {
        resolve = done
      })
    }
  })
  const first = f.controller.loadSnippets()
  assert.equal(first, f.controller.loadSnippets())
  await Promise.resolve()
  resolve(settings)
  await first
  fail = true
  await f.controller.loadSnippets()
  assert.equal(f.controller.snippets.http, undefined)
  assert.equal(f.controller.snippets.stdio, undefined)
  assert.equal(f.controller.snippetBusy, false)
})
test('optional project rules are independent of the global connection', async () => {
  const f = fixture()
  await f.controller.connect('kimi')
  const operation = f.controller.operations.kimi
  await f.controller.installProjectRules('kimi', '/project')
  assert.equal(f.controller.operations.kimi, operation)
  assert.equal(f.controller.projectOperations['kimi:/project']?.status, 'complete')
  assert.equal(f.calls.at(-1), 'rules:kimi:/project')
})
test('service preparation preserves unrelated tools, approvals and remote settings', async () => {
  const calls: { command: string; args: any[] }[] = []
  let config: any = {
    port: 7682,
    token: 'token',
    allowRemote: false,
    host: '0.0.0.0',
    transport: { http: false, stdio: true },
    enabledTools: ['other'],
    approval: { other: 'always' }
  }
  let running = false
  const request = async <T>(command: string, args: any[] = []): Promise<T> => {
    calls.push({ command, args })
    if (command === 'mcp:getConfig') return structuredClone(config)
    if (command === 'mcp:setConfig') {
      config = { ...config, ...args[0] }
      return structuredClone(config)
    }
    if (command === 'mcp:setToolsEnabled') {
      config.enabledTools = [...new Set([...config.enabledTools, ...args[0]])]
      return { enabledTools: config.enabledTools } as T
    }
    if (command === 'mcp:start') running = true
    return { running } as T
  }
  const result = await prepareMemoryService(request)
  assert.equal(result.serverUrl, 'http://127.0.0.1:7682')
  assert.equal(config.enabledTools.includes('other'), true)
  assert.equal(config.enabledTools.length, 6)
  assert.deepEqual(config.transport, { http: true, stdio: true })
  assert.deepEqual(config.approval, { other: 'always' })
  assert.equal(config.allowRemote, false)
  assert.equal(calls.filter((c) => c.command === 'mcp:start').length, 1)
  assert.equal(
    calls.some((c) => c.command === 'mcp:stop'),
    false
  )
})

test('request adapter ignores progress and releases listeners on terminal response and timeout', async () => {
  const { createConnectRequest } = await import('../render/connect-request')
  let callback!: (key: string, value: any) => void
  const removed: string[] = []
  const request = createConnectRequest(
    {
      sendSensitive: () => ({
        key: 'request',
        then: (cb) => {
          callback = cb
        }
      }),
      off: (key) => {
        removed.push(key)
      }
    },
    15
  )
  let settled = false
  const flight = request('mcp:start').then((value) => {
    settled = true
    return value
  })
  callback('request', { code: 200, data: 'progress' })
  await Promise.resolve()
  assert.equal(settled, false)
  callback('request', { code: 0, data: { running: true } })
  assert.deepEqual(await flight, { running: true })
  assert.deepEqual(removed, ['request'])
  await assert.rejects(request('mcp:start'), /operation_unknown/)
  assert.deepEqual(removed, ['request', 'request'])
})

test('late readiness refresh cannot overwrite a newer successful connect', async () => {
  let report!: (value: boolean) => void
  const f = fixture({
    readStatus: () =>
      new Promise((resolve) => {
        report = resolve
      })
  })
  const status = f.controller.refreshStatus()
  await f.controller.connect('codex')
  report(false)
  await status
  assert.equal(f.controller.serviceReady, true)
})
test('changing server settings retries the client write while notice failures stay supplementary', async () => {
  let changed = false
  let writes = 0
  const f = fixture({
    prepareService: async () => ({ ...settings, token: changed ? 'new-token' : settings.token }),
    configure: async () => {
      writes++
      return { success: true }
    },
    notify: () => {
      throw new Error('notice')
    }
  })
  await f.controller.connect('kimi')
  changed = true
  await f.controller.connect('kimi')
  assert.equal(writes, 2)
  assert.equal(f.controller.operations.kimi?.status, 'complete')
})

test('ready HTTP configuration can be copied while the independent stdio bridge is still loading', async () => {
  let resolveStdio!: (value: string) => void
  const f = fixture({
    snippet: (transport) =>
      transport === 'http'
        ? Promise.resolve('http-ready')
        : new Promise((resolve) => {
            resolveStdio = resolve
          })
  })
  const loading = f.controller.loadSnippets()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(f.controller.snippetBusy, true)
  assert.equal(f.controller.snippets.http, 'http-ready')
  await f.controller.copyConfig('http')
  assert.equal(f.calls.at(-1), 'copy:http-ready')
  resolveStdio('stdio-ready')
  await loading
})

test('returning to the connection page preserves a client chosen after generic settings', async () => {
  const { memoryConnectionClient } = await import('../render/navigation')
  const firstPage = memoryConnectionClient()
  firstPage.value = 'generic'
  await fixture().controller.loadSnippets()
  firstPage.value = 'codex'
  assert.equal(memoryConnectionClient().value, 'codex')
  firstPage.value = 'kimi'
  assert.equal(memoryConnectionClient().value, 'kimi')
  firstPage.value = 'codex'
})
test('a delayed generic configuration response cannot restore an old client selection', async () => {
  const { memoryConnectionClient } = await import('../render/navigation')
  let resolveSettings!: (value: typeof settings) => void
  const f = fixture({
    readSettings: () =>
      new Promise((resolve) => {
        resolveSettings = resolve
      })
  })
  const firstPage = memoryConnectionClient()
  firstPage.value = 'generic'
  const request = f.controller.loadSnippets()
  await Promise.resolve()
  firstPage.value = 'codex'
  resolveSettings(settings)
  await request
  assert.equal(firstPage.value, 'codex')
  assert.equal(memoryConnectionClient().value, 'codex')
  assert.equal(f.controller.operations.generic, undefined)
})
