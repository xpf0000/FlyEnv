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
