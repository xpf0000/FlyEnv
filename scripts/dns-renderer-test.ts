import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSiteHostnames, splitHostAliases } from '../src/shared/siteRuntime'

assert.deepEqual(buildSiteHostnames({ name: 'app.test', alias: undefined as unknown as string }), [
  'app.test'
])
assert.deepEqual(splitHostAliases(undefined), [])

for (const path of [
  'src/fork/Fn.ts',
  'src/fork/module/Host/index.ts',
  'src/render/util/Host.ts',
  'src/render/components/Host/Link.vue',
  'src/render/components/Host/Index.vue',
  'src/render/components/CloudflareTunnel/add.vue',
  'src/render/components/CloudflareTunnel/addDNS.vue',
  'src/render/components/CloudflareTunnel/editDNS.vue',
  'src/render/components/DNS/dns.ts'
]) {
  assert.doesNotMatch(
    readFileSync(path, 'utf-8'),
    /\.alias\.split\(/,
    `${path} has an unsafe alias split`
  )
}

console.log('dns renderer regression tests passed')
