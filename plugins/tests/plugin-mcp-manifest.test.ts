import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildPlugin } from '../../scripts/plugin-builder'
import {
  validatePluginManifest,
  validatePluginCatalog
} from '../../src/shared/plugin/PluginManifest'

const v1 = () => ({
  apiVersion: 1,
  id: 'runtime-fixture',
  name: 'Runtime fixture',
  version: '1.0.0',
  module: { typeFlag: 'runtime-fixture' },
  entry: { fork: 'fork/index.mjs' }
})
const tool = () => ({
  name: 'fixture_counter_read',
  method: 'read',
  description: 'Read fixture counter',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  readOnly: true,
  risky: false
})
const v2 = () => ({
  ...v1(),
  apiVersion: 2,
  runtime: { mode: 'dedicated', dataAccess: 'exclusive' },
  mcp: { audit: 'metadata-volatile', tools: [tool()] }
})

test('new host accepts API 1 and explicit API 2 without silently downgrading capabilities', () => {
  assert.equal(validatePluginManifest(v1()).apiVersion, 1)
  assert.equal(validatePluginManifest(v2()).mcp?.tools[0].method, 'read')
  assert.throws(() => validatePluginManifest({ ...v2(), apiVersion: 1 }), /API 2|apiVersion/)
  assert.throws(() => validatePluginManifest({ ...v2(), apiVersion: 3 }), /Unsupported/)
  // A legacy host's strict supported-version predicate rejects the v2 package.
  assert.equal(v2().apiVersion === 1, false)
})
test('tool declarations reject invalid routing, duplicate names and unsafe schemas', () => {
  const bad = [
    { ...v2(), entry: { render: 'render/index.mjs' } },
    { ...v2(), runtime: undefined },
    { ...v2(), runtime: { mode: 'pool', dataAccess: 'exclusive' } },
    ...[
      { name: '' },
      { name: 'list_services' },
      { method: 'constructor' },
      { method: '__proto__' },
      { inputSchema: { type: 'string' } },
      { inputSchema: { type: 'object', required: 'id' } },
      { inputSchema: { type: 'object', $ref: 'https://example.com/schema.json' } },
      { readOnly: 'true' },
      { risky: undefined }
    ].map((patch) => ({
      ...v2(),
      mcp: { audit: 'metadata-volatile', tools: [{ ...tool(), ...patch }] }
    })),
    { ...v2(), mcp: { audit: 'metadata-volatile', tools: [tool(), tool()] } }
  ]
  for (const value of bad) assert.throws(() => validatePluginManifest(value))
})
test('catalog retains future API requirement so the UI can explain incompatibility', () => {
  const item = {
    id: 'fixture',
    name: 'Fixture',
    version: '1.0.0',
    apiVersion: 3,
    artifact: { url: 'https://example.com/fixture.zip' }
  }
  assert.equal(validatePluginCatalog({ plugins: [item] }).plugins[0].apiVersion, 3)
  assert.throws(() => validatePluginCatalog({ plugins: [{ ...item, apiVersion: '2' }] }))
})

test('isolated package build preserves API 2 capabilities, assets and executable entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-api2-build-'))
  try {
    const source = join(root, 'source')
    const outputRoot = join(root, 'package')
    await mkdir(join(source, 'assets'), { recursive: true })
    await writeFile(
      join(source, 'plugin.json'),
      JSON.stringify({ ...v2(), entry: { fork: 'index.ts' } })
    )
    await writeFile(join(source, 'index.ts'), 'export default { async read() { return 1 } }')
    await writeFile(join(source, 'assets/rules.md'), 'Fixture rules')
    await buildPlugin(source, { outputRoot, archive: false })
    const manifest = validatePluginManifest(
      JSON.parse(await readFile(join(outputRoot, 'plugin.json'), 'utf8'))
    )
    assert.deepEqual(manifest.mcp, v2().mcp)
    assert.deepEqual(manifest.runtime, v2().runtime)
    await access(join(outputRoot, manifest.entry.fork!))
    assert.equal(await readFile(join(outputRoot, 'assets/rules.md'), 'utf8'), 'Fixture rules')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
