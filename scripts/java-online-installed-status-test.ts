import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(), 'flyenv-java-status-'))
const fixture = { platform: 'linux' }
;(globalThis as any).__javaStatusTest = fixture
;(globalThis as any).Server = { AppDir: join(directory, 'app'), Cache: join(directory, 'cache') }
const mocks: Record<string, string> = {
  '../Base': `export class Base {async _fetchOnlineVersion(){return [{type:'Temurin',version:'21.0.8'},{type:'Zulu',version:'21.0.8'}]}}`,
  '../../TaskQueue': 'export default {}',
  '@shared/utils': `export const isWindows=()=>globalThis.__javaStatusTest.platform==='win32',isMacOS=()=>globalThis.__javaStatusTest.platform==='darwin'`,
  '../../Fn': `export const brewInfoJson=()=>{},brewSearch=()=>{},mkdirp=()=>{},moveChildDirToParent=()=>{},portSearch=()=>{},remove=()=>{},versionBinVersion=()=>{},versionFilterSame=()=>{},versionFixed=()=>{},versionLocalFetch=()=>{},versionSort=()=>{},zipUnpack=()=>{}`
}
try {
  const result = await build({
    entryPoints: ['src/fork/module/Java/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'java-status-fixtures',
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            mocks[path] ? { path, namespace: 'fixture' } : undefined
          )
          builder.onLoad({ filter: /./, namespace: 'fixture' }, ({ path }) => ({
            contents: mocks[path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const bundle = join(directory, 'java.mjs')
  await writeFile(bundle, result.outputFiles[0].text)
  const { default: java } = await import(pathToFileURL(bundle).href)
  for (const platform of ['linux', 'darwin', 'win32']) {
    fixture.platform = platform
    const name = `${platform === 'win32' ? '' : 'static-'}Temurin-21.0.8`
    const relativeBin =
      platform === 'win32'
        ? 'bin/java.exe'
        : platform === 'darwin'
          ? 'Contents/Home/bin/java'
          : 'bin/java'
    const expectedBin = join(directory, 'app', name, relativeBin)
    await mkdir(dirname(expectedBin), { recursive: true })
    await writeFile(expectedBin, '')
    let rows = await java.fetchAllOnlineVersion()
    assert.equal(rows[0].bin, expectedBin, `${platform} must check its own JDK layout`)
    assert.equal(rows[0].installed, true)
    assert.equal(rows[1].installed, false, 'another vendor with the same version is independent')
    await rm(expectedBin)
    rows = await java.fetchAllOnlineVersion()
    assert.equal(rows[0].installed, false, 'refresh must reflect removal')
  }
  console.log('java-online-installed-status-test: ok')
} finally {
  await rm(directory, { recursive: true, force: true })
  delete (globalThis as any).__javaStatusTest
  delete (globalThis as any).Server
}
