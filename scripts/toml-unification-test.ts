import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { buildHttpClientConfigSnippet, parseCodexToml } from '../src/shared/mcpClientConfig'

const repoRoot = process.cwd()
const legacyTomlPackage = '@iarna' + '/toml'

function walkFiles(dir: string, out: string[]) {
  for (const item of readdirSync(dir)) {
    const full = join(dir, item)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (item === 'node_modules' || item === 'dist') {
        continue
      }
      walkFiles(full, out)
      continue
    }
    if (/\.(ts|tsx|vue|js|mjs|json)$/.test(item)) {
      out.push(full)
    }
  }
}

function testProjectUsesSingleTomlImplementation() {
  const files: string[] = []
  walkFiles(join(repoRoot, 'src'), files)
  walkFiles(join(repoRoot, 'scripts'), files)
  files.push(join(repoRoot, 'package.json'))

  const offenders = files.filter((file) => readFileSync(file, 'utf-8').includes(legacyTomlPackage))
  assert.deepEqual(offenders, [], `unexpected legacy TOML usage:\n${offenders.join('\n')}`)
}

function testCodexSnippetStillRoundTrips() {
  const snippet = buildHttpClientConfigSnippet('codex', 'http://127.0.0.1:7682', 'abc')
  assert.equal(typeof snippet, 'string')
  const parsed = parseCodexToml(snippet)
  assert.equal(parsed.features.rmcp_client, true)
  assert.equal(parsed.mcp_servers.flyenv.url, 'http://127.0.0.1:7682')
  assert.equal(parsed.mcp_servers.flyenv.http_headers.Authorization, 'Bearer abc')
}

function main() {
  testProjectUsesSingleTomlImplementation()
  testCodexSnippetStillRoundTrips()
  console.log('toml unification tests passed')
}

main()
