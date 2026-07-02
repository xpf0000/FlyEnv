import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Antigravity from '../src/fork/module/Antigravity'
import Codex from '../src/fork/module/Codex'
import CopilotCli from '../src/fork/module/CopilotCli'
import Kimi from '../src/fork/module/Kimi'
import { buildHttpClientConfigSnippet } from '../src/shared/mcpClientConfig'

async function runFork<T>(promiseLike: Promise<T>): Promise<T> {
  return await promiseLike
}

async function testAntigravityParsesServerUrlAndSharedScope() {
  const root = mkdtempSync(join(tmpdir(), 'flyenv-antigravity-mcp-'))
  const prevGeminiHome = process.env.GEMINI_HOME
  process.env.GEMINI_HOME = root
  try {
    mkdirSync(join(root, 'config'), { recursive: true })
    writeFileSync(
      join(root, 'config', 'mcp_config.json'),
      JSON.stringify(
        {
          mcpServers: {
            flyenv: {
              serverUrl: 'http://127.0.0.1:7682',
              headers: {
                Authorization: 'Bearer abc'
              }
            }
          }
        },
        null,
        2
      )
    )

    const list = (await runFork((Antigravity as any).listMcp())) as any[]
    assert.equal(list[0]?.type, 'http')
    assert.equal(list[0]?.commandOrUrl, 'http://127.0.0.1:7682')
    assert.equal(list[0]?.scope, 'shared')
  } finally {
    if (typeof prevGeminiHome === 'undefined') {
      delete process.env.GEMINI_HOME
    } else {
      process.env.GEMINI_HOME = prevGeminiHome
    }
    rmSync(root, { recursive: true, force: true })
  }
}

async function testCodexParsesNestedTransportOutput() {
  const prevRunCommand = (Codex as any).runCommand
  ;(Codex as any).runCommand = async () =>
    JSON.stringify([
      {
        name: 'flyenv',
        enabled: true,
        disabled_reason: null,
        transport: {
          type: 'streamable_http',
          url: 'http://127.0.0.1:7682',
          bearer_token_env_var: null,
          http_headers: {
            Authorization: 'Bearer abc'
          },
          env_http_headers: null
        },
        startup_timeout_sec: null,
        tool_timeout_sec: null,
        auth_status: 'bearer_token'
      }
    ])
  try {
    const list = (await runFork((Codex as any).listMcp())) as any[]
    assert.equal(list[0]?.type, 'streamable_http')
    assert.equal(list[0]?.commandOrUrl, 'http://127.0.0.1:7682')
    assert.equal(list[0]?.scope, 'user')
  } finally {
    ;(Codex as any).runCommand = prevRunCommand
  }
}

async function testCopilotUsesSourceAndConfigFileForRemoteAuth() {
  const root = mkdtempSync(join(tmpdir(), 'flyenv-copilot-mcp-'))
  const prevConfigDir = process.env.COPILOT_CONFIG_DIR
  const prevRunCommand = (CopilotCli as any).runCommand
  process.env.COPILOT_CONFIG_DIR = root
  ;(CopilotCli as any).runCommand = async () =>
    JSON.stringify({
      mcpServers: {
        flyenv: {
          tools: ['*'],
          type: 'http',
          url: 'http://127.0.0.1:7682',
          source: 'user'
        }
      }
    })
  try {
    mkdirSync(root, { recursive: true })
    const list = (await runFork((CopilotCli as any).listMcp())) as any[]
    assert.equal(list[0]?.scope, 'user')

    await runFork((CopilotCli as any).addMcp('flyenv', 'http', 'http://127.0.0.1:7682', 'abc'))
    const config = JSON.parse(readFileSync(join(root, 'mcp-config.json'), 'utf8'))
    assert.equal(config.mcpServers.flyenv.url, 'http://127.0.0.1:7682')
    assert.equal(config.mcpServers.flyenv.headers.Authorization, 'Bearer abc')
  } finally {
    if (typeof prevConfigDir === 'undefined') {
      delete process.env.COPILOT_CONFIG_DIR
    } else {
      process.env.COPILOT_CONFIG_DIR = prevConfigDir
    }
    ;(CopilotCli as any).runCommand = prevRunCommand
    rmSync(root, { recursive: true, force: true })
  }
}

async function testKimiListsAndWritesRemoteServersWithoutEmptyBearer() {
  const root = mkdtempSync(join(tmpdir(), 'flyenv-kimi-mcp-'))
  const prevKimiHome = process.env.KIMI_CODE_HOME
  process.env.KIMI_CODE_HOME = root
  try {
    mkdirSync(root, { recursive: true })

    await runFork((Kimi as any).addMcp('flyenv', 'http', 'http://127.0.0.1:7682', ''))
    const config = JSON.parse(readFileSync(join(root, 'mcp.json'), 'utf8'))
    assert.equal(config.mcpServers.flyenv.url, 'http://127.0.0.1:7682')
    assert.equal('headers' in config.mcpServers.flyenv, false)

    const list = (await runFork((Kimi as any).listMcp())) as any[]
    assert.equal(list[0]?.type, 'http')
    assert.equal(list[0]?.scope, 'user')

    await runFork((Kimi as any).removeMcp('flyenv'))
    const afterDelete = JSON.parse(readFileSync(join(root, 'mcp.json'), 'utf8'))
    assert.equal(afterDelete.mcpServers.flyenv, undefined)
  } finally {
    if (typeof prevKimiHome === 'undefined') {
      delete process.env.KIMI_CODE_HOME
    } else {
      process.env.KIMI_CODE_HOME = prevKimiHome
    }
    rmSync(root, { recursive: true, force: true })
  }
}

function testSnippetGenerationOmitsEmptyBearerAndSupportsNewClients() {
  const antigravitySnippet = buildHttpClientConfigSnippet(
    'antigravity' as any,
    'http://127.0.0.1:7682',
    ''
  )
  assert.match(antigravitySnippet, /serverUrl/)
  assert.doesNotMatch(antigravitySnippet, /Authorization/)

  const copilotSnippet = buildHttpClientConfigSnippet(
    'copilotCli' as any,
    'http://127.0.0.1:7682',
    'abc'
  )
  assert.match(copilotSnippet, /"type": "http"/)
  assert.match(copilotSnippet, /"Authorization": "Bearer abc"/)
}

await testAntigravityParsesServerUrlAndSharedScope()
await testCodexParsesNestedTransportOutput()
await testCopilotUsesSourceAndConfigFileForRemoteAuth()
await testKimiListsAndWritesRemoteServersWithoutEmptyBearer()
testSnippetGenerationOmitsEmptyBearerAndSupportsNewClients()

console.log('ai-cli-mcp-integration-test: snippet ok')
