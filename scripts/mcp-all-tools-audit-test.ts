#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

type ToolResult = {
  [key: string]: unknown
  content?: Array<{ type?: string; text?: string }>
  isError?: boolean
  toolResult?: unknown
}

type ServiceStatus = {
  flag: string
  installed: number
  running: boolean
  versions: Array<{ version?: string; enable?: boolean }>
}

type OnlineVersion = {
  version?: string
  installed?: boolean
  downloaded?: boolean
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
  const selected = await chooseOptionalService(client, [
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
  ])

  if (selected) {
    return selected
  }

  throw new Error('No controllable installed service found for start/stop/restart testing')
}

async function chooseOptionalService(
  client: Client,
  candidates: string[]
): Promise<{ flag: string; version: string; running: boolean } | undefined> {
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
}

function chooseInstallCandidate(list: OnlineVersion[], flag: string): OnlineVersion & { version: string } {
  assert.ok(Array.isArray(list) && list.length > 0, `${flag} online version list should not be empty`)
  const candidate = list.find((item) => item?.version && !item.installed)
  assert.ok(candidate?.version, `No installable online ${flag} version found`)
  return candidate as OnlineVersion & { version: string }
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

function assertAuditContainsWhere(entries: any[], label: string, predicate: (entry: any) => boolean) {
  const match = entries.find(predicate)
  assert.ok(match, `audit.log should contain ${label}`)
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

    assert.equal(
      (
        await withTimeout(
          'get_service_exec_info',
          client.callTool({
            name: 'get_service_exec_info',
            arguments: { flag: service.flag, version: service.version }
          })
        )
      ).isError,
      false
    )

    assert.equal(
      (
        await withTimeout(
          'get_managed_file_map service',
          client.callTool({
            name: 'get_managed_file_map',
            arguments: { scope: 'service', flag: service.flag, version: service.version }
          })
        )
      ).isError,
      false
    )

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
    const onlineVersions = parseText<OnlineVersion[]>(listOnlineVersions)
    const nginxInstallCandidate = chooseInstallCandidate(onlineVersions, 'nginx')

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

    assert.equal(
      (
        await withTimeout(
          'resolve_site_runtime',
          client.callTool({
            name: 'resolve_site_runtime',
            arguments: { siteName }
          })
        )
      ).isError,
      false
    )

    assert.equal(
      (
        await withTimeout(
          'resolve_site_urls',
          client.callTool({
            name: 'resolve_site_urls',
            arguments: { siteName }
          })
        )
      ).isError,
      false
    )

    assert.equal(
      (
        await withTimeout(
          'get_managed_file_map site',
          client.callTool({
            name: 'get_managed_file_map',
            arguments: { scope: 'site', name: siteName }
          })
        )
      ).isError,
      false
    )

    const databaseService = await chooseOptionalService(client, [
      'mysql',
      'mariadb',
      'postgresql',
      'redis',
      'mongodb',
      'memcached'
    ])
    const dbInfo = await withTimeout(
      'get_database_connection_info',
      client.callTool({
        name: 'get_database_connection_info',
        arguments: databaseService
          ? { flag: databaseService.flag, version: databaseService.version }
          : { flag: 'mysql' }
      })
    )
    if (databaseService) {
      assert.equal(dbInfo.isError, false)
    } else {
      assert.equal(
        dbInfo.isError,
        true,
        'get_database_connection_info should fail safely when no database is installed'
      )
    }

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
        arguments: { flag: 'nginx', version: nginxInstallCandidate.version }
      }),
      30 * 60 * 1000
    )
    assert.equal(installed.isError, false, 'install_service nginx should succeed')
    const installedData = parseText<{ installed?: string }>(installed)
    assert.equal(installedData.installed, nginxInstallCandidate.version)

    const nginxStatusAfterInstall = await withTimeout(
      'service_status nginx after install',
      client.callTool({
        name: 'service_status',
        arguments: { flag: 'nginx' }
      }),
      60 * 1000
    )
    assert.equal(nginxStatusAfterInstall.isError, false)
    const nginxStatus = parseText<ServiceStatus>(nginxStatusAfterInstall)
    assert.ok(
      nginxStatus.versions.some((item) => item.version === nginxInstallCandidate.version),
      `service_status nginx should include installed version ${nginxInstallCandidate.version}`
    )

    await delay(500)

    const entries = readFileSync(auditLogPath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    for (const tool of [
      'list_services',
      'service_status',
      'get_service_exec_info',
      'list_sites',
      'get_database_connection_info',
      'resolve_site_runtime',
      'resolve_site_urls',
      'get_managed_file_map',
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

    assertAuditContains(entries, 'get_service_exec_info', true)
    assertAuditContains(entries, 'start_service', true)
    assertAuditContains(entries, 'stop_service', true)
    assertAuditContains(entries, 'restart_service', true)
    if (databaseService) {
      assertAuditContains(entries, 'get_database_connection_info', true)
    } else {
      assertAuditContains(entries, 'get_database_connection_info', false)
    }
    assertAuditContains(entries, 'resolve_site_runtime', true)
    assertAuditContains(entries, 'resolve_site_urls', true)
    assertAuditContains(entries, 'get_managed_file_map', true)
    assertAuditContains(entries, 'create_site', true)
    assertAuditContains(entries, 'update_site', true)
    assertAuditContains(entries, 'delete_site', true)
    assertAuditContains(entries, 'install_service', true)
    assertAuditContainsWhere(
      entries,
      'get_managed_file_map scope=service success=true',
      (item) => item.tool === 'get_managed_file_map' && item.success === true && item.args?.scope === 'service'
    )
    assertAuditContainsWhere(
      entries,
      'get_managed_file_map scope=site success=true',
      (item) => item.tool === 'get_managed_file_map' && item.success === true && item.args?.scope === 'site'
    )
    assertAuditContainsWhere(
      entries,
      'install_service nginx success=true',
      (item) => item.tool === 'install_service' && item.success === true && item.args?.flag === 'nginx'
    )

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
