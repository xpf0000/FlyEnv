import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const buildEntry = async (entryPoint: string) =>
  build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    target: 'esnext',
    packages: 'external',
    logLevel: 'silent'
  })

for (const entry of ['src/main/index.ts', 'src/fork/index.ts']) {
  const result = await buildEntry(entry)
  const localePayloadInputs = Object.keys(result.metafile!.inputs).filter((file) =>
    /src\/lang\/(ar|az|bg|bn|cs|da|de|el|en|es|fi|fr|hr|hu|id|it|ja|ko|nl|no|pl|pt|pt-br|ro|ru|sv|tr|uk|vi|zh|zh-hant)\//.test(
      file
    )
  )
  assert.deepEqual(localePayloadInputs, [], `${entry} bundled locale payloads`)
}

const indexSource = readFileSync('src/lang/index.ts', 'utf8')
assert.doesNotMatch(indexSource, /^import AR from/m)
assert.doesNotMatch(indexSource, /^import ZH from/m)
assert.doesNotMatch(indexSource, /const lang =/)
console.log('language bundle audit tests passed')
