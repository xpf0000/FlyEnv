import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Antigravity from '../src/fork/module/Antigravity'
import Codex from '../src/fork/module/Codex'

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

    const list = await runFork((Antigravity as any).listMcp())
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
    const list = await runFork((Codex as any).listMcp())
    assert.equal(list[0]?.type, 'streamable_http')
    assert.equal(list[0]?.commandOrUrl, 'http://127.0.0.1:7682')
    assert.equal(list[0]?.scope, 'user')
  } finally {
    ;(Codex as any).runCommand = prevRunCommand
  }
}

await testAntigravityParsesServerUrlAndSharedScope()
await testCodexParsesNestedTransportOutput()

console.log('ai-cli-mcp-integration-test: partial ok')
