import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../src/render/components/HttpServe/Index.vue', import.meta.url),
  'utf8'
)

assert.match(source, /<el-radio-button[^>]*@click\.stop="doAdd"/s)
assert.match(source, /const list = ref<HttpServeListInstance>\(\)/)
assert.match(source, /list\.value\?\.choosePath\(\)/)

console.log('http serve add button test passed')
