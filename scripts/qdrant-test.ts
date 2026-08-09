import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  QDRANT_WEB_UI_VERSION,
  qdrantWebUiDir,
  qdrantWebUiEnvironment
} from '../src/fork/module/Qdrant'

const bin = join('qdrant', '1.16.3', process.platform === 'win32' ? 'qdrant.exe' : 'qdrant')
const staticDir = join(dirname(bin), 'static')

assert.equal(QDRANT_WEB_UI_VERSION, 'v0.2.13')
assert.equal(qdrantWebUiDir(bin), staticDir)
assert.deepEqual(qdrantWebUiEnvironment(bin), {
  QDRANT__SERVICE__STATIC_CONTENT_DIR: staticDir
})

const source = readFileSync(join(import.meta.dirname, '../src/fork/module/Qdrant/index.ts'), 'utf8')
assert.match(source, /ensureWebUi\(bin, version\.version\)/)
assert.match(source, /join\(staticDir, 'index\.html'\)/)
assert.match(source, /QDRANT__SERVICE__STATIC_CONTENT_DIR/)
assert.match(source, /qdrant-web-ui-\$\{QDRANT_WEB_UI_VERSION\}\.zip/)

console.log('Qdrant contract tests passed')
