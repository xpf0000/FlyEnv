import assert from 'node:assert/strict'
import { build, type Metafile } from 'esbuild'
import { readFileSync } from 'node:fs'

export const buildMainFixture = async () => {
  return build({
    entryPoints: { main: 'src/main/index.ts' },
    outdir: 'dist/main-lazy-audit',
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    outExtension: { '.js': '.mjs' },
    bundle: true,
    splitting: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    target: 'esnext',
    packages: 'external',
    logLevel: 'silent'
  })
}

export const eagerOutputs = (metafile: Metafile) => {
  const outputs = metafile.outputs
  const entry = Object.entries(outputs).find(
    ([, output]) => output.entryPoint === 'src/main/index.ts'
  )
  assert.ok(entry, 'main entry output must exist')
  assert.match(entry[0], /main\.mjs$/)

  const visited = new Set<string>()
  const visit = (path: string) => {
    if (visited.has(path)) return
    visited.add(path)
    for (const item of outputs[path]?.imports ?? []) {
      if (!item.external && item.kind !== 'dynamic-import') visit(item.path)
    }
  }
  visit(entry[0])
  return visited
}

const result = await buildMainFixture()
const configSource = readFileSync('configs/esbuild.config.ts', 'utf8')
const windowsConfigSource = readFileSync('configs/esbuild.config.win.ts', 'utf8')
const packageMain = JSON.parse(readFileSync('package.json', 'utf8')).main

assert.equal(packageMain, './dist/electron/main.mjs')
for (const source of [configSource, windowsConfigSource]) {
  assert.match(source, /splitting:\s*true/)
  assert.match(source, /outdir:\s*['"]dist\/electron['"]/)
  assert.match(source, /outExtension:\s*\{\s*['"]\.js['"]:\s*['"]\.mjs['"]\s*\}/)
  assert.doesNotMatch(source, /outfile:\s*['"]dist\/electron\/main\.mjs['"]/)
}

const eager = eagerOutputs(result.metafile!)
assert.ok(eager.size >= 1)
const eagerInputs = new Set(
  [...eager].flatMap((output) => Object.keys(result.metafile!.outputs[output]?.inputs ?? {}))
)
const eagerExternalImports = [...eager].flatMap((output) =>
  (result.metafile!.outputs[output]?.imports ?? [])
    .filter((item) => item.external && item.kind !== 'dynamic-import')
    .map((item) => item.path)
)

assert.equal(eagerExternalImports.includes('lodash-es'), false)
assert.equal(eagerExternalImports.includes('compressing'), false)
assert.equal(eagerInputs.has('src/shared/Sudo.ts'), false)
assert.equal(eagerInputs.has('src/shared/WindowsHelperFallback.ts'), false)
for (const dependency of [
  'node-forge',
  'mime-types',
  'markdown-it-async',
  'shiki',
  '@mdit-vue/plugin-frontmatter'
]) {
  assert.equal(
    eagerExternalImports.some((item) => item === dependency || item.startsWith(`${dependency}/`)),
    false,
    `${dependency} must not be eager`
  )
}
assert.equal(eagerInputs.has('src/render/util/markdown/markdown.ts'), false)
for (const input of [
  'src/main/core/NodePTY.ts',
  'src/main/core/Capturer.ts',
  'src/main/core/HttpServer.ts',
  'src/main/ui/SiteSucker/index.ts'
]) {
  assert.equal(eagerInputs.has(input), false, `${input} must not be eager`)
}
for (const dependency of ['node-pty', '@xpf0000/node-window-manager', 'serve-handler', 'hpagent']) {
  assert.equal(
    eagerExternalImports.some((item) => item === dependency || item.startsWith(`${dependency}/`)),
    false,
    `${dependency} must not be eager`
  )
}

const ipcHandlerSource = readFileSync('src/main/core/IPCHandler.ts', 'utf8')
assert.match(
  ipcHandlerSource,
  /handleCapturerConfigUpdate[\s\S]*?capturerRuntime\.peek\(\)\?\.configUpdate/,
  'capture config updates must use peek without loading the native runtime'
)
assert.equal(eagerInputs.has('src/main/core/OAuth.ts'), false)
for (const dependency of ['axios', 'node-machine-id']) {
  assert.equal(
    eagerExternalImports.some((item) => item === dependency || item.startsWith(`${dependency}/`)),
    false,
    `${dependency} must not be eager in main`
  )
}

const applicationSource = readFileSync('src/main/Application.ts', 'utf8')
assert.doesNotMatch(
  applicationSource,
  /oauthRuntime\s*\.load\(\)[\s\S]*?fetchUser\(\)/,
  'application startup must not load OAuth for cached-user refresh'
)
assert.doesNotMatch(applicationSource, /APP-User-UUID-Need-Update/)

for (const [command, action] of [
  ['GitHub-OAuth-License-Fetch', 'githubLicenseFetch'],
  ['GitHub-OAuth-License-Del-Bind', 'githubLicenseDelete'],
  ['GitHub-OAuth-License-Add-Bind', 'githubLicenseAdd']
]) {
  assert.match(ipcHandlerSource, new RegExp(`case '${command}'`))
  assert.match(ipcHandlerSource, new RegExp(`['"]${action}['"]`))
}

const setupStoreSource = readFileSync('src/render/components/Setup/store.ts', 'utf8')
assert.match(setupStoreSource, /githubUserRefresh\(\)/)
assert.match(setupStoreSource, /IPC\.send\('app-fork:app', 'githubUserFetch'\)/)
assert.doesNotMatch(
  readFileSync('src/render/util/GlobalIPCOn.ts', 'utf8'),
  /APP-User-UUID-Need-Update/
)
assert.ok(
  Object.values(result.metafile!.outputs).some((output) =>
    output.imports.some((item) => item.kind === 'dynamic-import')
  ),
  'fixture must retain at least one dynamic chunk'
)

for (const builder of [
  'configs/electron-builder.ts',
  'configs/electron-builder.win.ts',
  'configs/electron-builder.linux.ts'
]) {
  assert.match(readFileSync(builder, 'utf8'), /dist\/electron\/\*\*\/\*/)
}

console.log('main process lazy bundle tests passed')
