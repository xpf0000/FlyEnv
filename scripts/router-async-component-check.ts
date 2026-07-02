import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { defineAsyncComponent } from 'vue'

import { normalizeRouteComponent } from '../src/render/router/route-component'

const syncComponent = { name: 'SyncComponent' }
assert.equal(normalizeRouteComponent(syncComponent as any), syncComponent)

const loader = async () => ({ default: syncComponent })
const asyncWrapper = defineAsyncComponent(loader)
const normalized = normalizeRouteComponent(asyncWrapper as any) as any
assert.equal(typeof normalized, 'function')
assert.notEqual(normalized, asyncWrapper)
assert.equal(normalized.name, 'load')

const routerSource = fs.readFileSync(path.join(process.cwd(), 'src/render/router/index.ts'), 'utf-8')

assert.match(
  routerSource,
  /component:\s*\(\)\s*=>\s*import\(['"]@\/components\/Setup\/Index\.vue['"]\)/
)
assert.match(
  routerSource,
  /component:\s*\(\)\s*=>\s*import\(['"]@\/components\/CustomerModule\/Index\.vue['"]\)/
)
assert.match(routerSource, /component:\s*normalizeRouteComponent\(item\.index\)/)
assert.doesNotMatch(routerSource, /component:\s*defineAsyncComponent\(/)
assert.doesNotMatch(routerSource, /component:\s*item\.index\b/)

console.log('router-async-component: checks passed')
