#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

type ToolResult = {
  content?: Array<{ type?: string; text?: string }>
  isError?: boolean
}

type ServiceStatus = {
  flag: string
  installed: number
  running: boolean
  versions: Array<{ version?: string; enable?: boolean }>
}

const url = process.argv[2] || 'http://127.0.0.1:7682'
const token = process.argv[3]

if (!token) {
  console.error('Usage: npx tsx scripts/mcp-all-tools-audit-test.ts <url> <token>')
  process.exit(1)
}

const configPath =
  process.env.MCP_CONFIG_PATH || join(homedir(), 'Library/Application Support/Electron/mcp.json')
const auditLogPath =
  process.env.MCP_AUDIT_LOG || join(homedir(), 'Library/PhpWebStudy/server/mcp/audit.log')

const fetchWithAuth = (target: any, init: any) => {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(target, { ...(init || {}), headers })
}

function parseText<T = any>(result: ToolResult): T {
  const text = result?.content?.find((item) => item?.type === 'text')?.text
  assert.equal(typeof text, 'string', 'tool result should contain text content')
  return JSON.parse(text as string) as T
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout<T>(label: string, promise: Promise<T>, timeoutMs = 15000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
    })
  ])
}

function readConfig() {
  return JSON.parse(readFileSync(configPath, 'utf-8'))
}

function writeConfig(config: any) {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

async function waitForTools(client: Client, expected: string[], timeoutMs = 8000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const tools = await client.listTools()
    const names = tools.tools.map((item: any) => item.name)
    if (expected.every((name) => names.includes(name))) {
      return names
    }
    await delay(250)
  }
  throw new Error(`Expected tools not active: ${expected.join(', ')}`)
}

async function waitForServiceState(
  client: Client,
  flag: string,
  expectedRunning: boolean,
  timeoutMs = 15000
) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const result = await client.callTool({ name: 'service_status', arguments: { flag } })
    if (!result.isError) {
      const status = parseText<ServiceStatus>(result)
      if (!!status.running === expectedRunning) {
        return status
      }
    }
    await delay(500)
  }
  throw new Error(`Service ${flag} did not reach running=${expectedRunning}`)
}

async function chooseService(client: Client): Promise<{ flag: string; version: string; running: boolean }> {
  const candidates = [
    'nginx',
    'mailpit',
    'caddy',
    'redis',
    'mysql',
    'apache',
    'postgresql',
    'mariadb',
    'mongodb',
    'memcached'
  ]

  for (const flag of candidates) {
    const result = await client.callTool({ name: 'service_status', arguments: { flag } })
    if (result.isError) continue
    const status = parseText<ServiceStatus>(result)
    if (status.installed > 0 && Array.isArray(status.versions) && status.versions.length > 0) {
      const selected =
        status.versions.find((item) => item.enable && item.version)?.version ||
        status.versions.find((item) => item.version)?.version
      if (selected) {
        return { flag, version: selected, running: !!status.running }
      }
    }
  }

  throw new Error('No controllable installed service found for start/stop/restart testing')
}

function assertAuditContains(entries: any[], tool: string, success?: boolean) {
  const match = entries.find((item) => {
    if (item.tool !== tool) return false
    if (typeof success === 'boolean') {
      return item.success === success
    }
    return true
  })
  assert.ok(match, `audit.log should contain ${tool}${typeof success === 'boolean' ? ` success=${success}` : ''}`)
}

async function main() {
  const originalConfig = readConfig()
  writeFileSync(auditLogPath, '', 'utf-8')

  const client = new Client({ name: 'flyenv-mcp-all-tools-audit-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch: fetchWithAuth })
  await client.connect(transport)

  const tempRoot = mkdtempSync(join(tmpdir(), 'flyenv-mcp-audit-site-'))
  mkdirSync(join(tempRoot, 'public'), { recursive: true })
  const siteName = `mcp-audit-${Date.now()}.test`
  let createdSite = false

  try {
    const patched = {
      ...originalConfig,
      enabledTools: Array.from(
        new Set([...(originalConfig.enabledTools || []), 'delete_site', 'install_service'])
      ),
      approval: {
        ...(originalConfig.approval || {}),
        start_service: 'auto',
        stop_service: 'auto',
        restart_service: 'auto',
        create_site: 'auto',
        update_site: 'auto',
        delete_site: 'auto',
        install_service: 'auto'
      }
    }
    writeConfig(patched)
    await waitForTools(client, ['delete_site', 'install_service'])

    const service = await chooseService(client)

    const listServices = await withTimeout(
      'list_services',
      client.callTool({ name: 'list_services', arguments: { flags: [service.flag] } })
    )
    assert.equal(listServices.isError, false)

    const serviceStatus = await withTimeout(
      'service_status',
      client.callTool({ name: 'service_status', arguments: { flag: service.flag } })
    )
    assert.equal(serviceStatus.isError, false)

    const listSites = await withTimeout('list_sites', client.callTool({ name: 'list_sites', arguments: {} }))
    assert.equal(listSites.isError, false)

    const listLogFiles = await withTimeout(
      'list_log_files',
      client.callTool({ name: 'list_log_files', arguments: { flag: service.flag, version: service.version } })
    )
    assert.equal(listLogFiles.isError, false)

    const listConfigFiles = await withTimeout(
      'list_config_files',
      client.callTool({ name: 'list_config_files', arguments: { flag: service.flag, version: service.version } })
    )
    assert.equal(listConfigFiles.isError, false)

    const listOnlineVersions = await withTimeout(
      'list_online_versions',
      client.callTool({ name: 'list_online_versions', arguments: { flag: 'nginx' } })
    )
    assert.equal(listOnlineVersions.isError, false)

    const servicesResource = await withTimeout(
      'read_resource flyenv://services',
      client.readResource({ uri: 'flyenv://services' })
    )
    assert.equal(servicesResource?.contents?.[0]?.uri, 'flyenv://services')

    const sitesResource = await withTimeout(
      'read_resource flyenv://sites',
      client.readResource({ uri: 'flyenv://sites' })
    )
    assert.equal(sitesResource?.contents?.[0]?.uri, 'flyenv://sites')

    if (service.running) {
      const restarted = await withTimeout(
        'restart_service',
        client.callTool({
          name: 'restart_service',
          arguments: { flag: service.flag, version: service.version }
        })
      )
      assert.equal(restarted.isError, false)
      await waitForServiceState(client, service.flag, true)

      const stopped = await withTimeout(
        'stop_service',
        client.callTool({
          name: 'stop_service',
          arguments: { flag: service.flag, version: service.version }
        })
      )
      assert.equal(stopped.isError, false)
      await waitForServiceState(client, service.flag, false)

      const started = await withTimeout(
        'start_service',
        client.callTool({
          name: 'start_service',
          arguments: { flag: service.flag, version: service.version }
        })
      )
      assert.equal(started.isError, false)
      await waitForServiceState(client, service.flag, true)
    } else {
      const started = await withTimeout(
        'start_service',
        client.callTool({
          name: 'start_service',
          arguments: { flag: service.flag, version: service.version }
        })
      )
      assert.equal(started.isError, false)
      await waitForServiceState(client, service.flag, true)

      const restarted = await withTimeout(
        'restart_service',
        client.callTool({
          name: 'restart_service',
          arguments: { flag: service.flag, version: service.version }
        })
      )
      assert.equal(restarted.isError, false)
      await waitForServiceState(client, service.flag, true)

      const stopped = await withTimeout(
        'stop_service',
        client.callTool({
          name: 'stop_service',
          arguments: { flag: service.flag, version: service.version }
        })
      )
      assert.equal(stopped.isError, false)
      await waitForServiceState(client, service.flag, false)
    }

    const created = await withTimeout(
      'create_site',
      client.callTool({
        name: 'create_site',
        arguments: {
          name: siteName,
          root: join(tempRoot, 'public')
        }
      })
    )
    assert.equal(created.isError, false)
    createdSite = true

    const updated = await withTimeout(
      'update_site',
      client.callTool({
        name: 'update_site',
        arguments: {
          siteName,
          alias: `www.${siteName}`
        }
      })
    )
    assert.equal(updated.isError, false)

    const deleted = await withTimeout(
      'delete_site',
      client.callTool({
        name: 'delete_site',
        arguments: { siteName }
      })
    )
    assert.equal(deleted.isError, false)
    createdSite = false

    const installed = await withTimeout(
      'install_service',
      client.callTool({
        name: 'install_service',
        arguments: { flag: 'git', version: '0.0.0' }
      })
    )
    assert.equal(installed.isError, true, 'install_service git should fail safely')

    await delay(500)

    const entries = readFileSync(auditLogPath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    for (const tool of [
      'list_services',
      'service_status',
      'list_sites',
      'list_log_files',
      'list_config_files',
      'list_online_versions',
      'start_service',
      'stop_service',
      'restart_service',
      'create_site',
      'update_site',
      'delete_site',
      'install_service'
    ]) {
      assertAuditContains(entries, tool)
    }

    assertAuditContains(entries, 'read_resource', true)

    assertAuditContains(entries, 'start_service', true)
    assertAuditContains(entries, 'stop_service', true)
    assertAuditContains(entries, 'restart_service', true)
    assertAuditContains(entries, 'create_site', true)
    assertAuditContains(entries, 'update_site', true)
    assertAuditContains(entries, 'delete_site', true)
    assertAuditContains(entries, 'install_service', false)

    console.log('mcp all tools audit test passed')
  } finally {
    if (createdSite) {
      try {
        await withTimeout(
          'cleanup delete_site',
          client.callTool({
            name: 'delete_site',
            arguments: { siteName }
          }),
          10000
        )
      } catch {}
    }

    writeConfig(originalConfig)
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
