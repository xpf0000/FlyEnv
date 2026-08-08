import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Config from '../src/main/ui/SiteSucker/Config'

Config.update({
  dir: '/tmp/site-sucker',
  proxy: ' http://127.0.0.1:1087 ',
  excludeLink: ' example.com\n\n static.example.com ',
  pageLimit: ' docs.example.com ',
  timeout: 12_000,
  maxImgSize: 5,
  maxVideoSize: 25,
  maxRetryTimes: 6,
  windowCount: 3
})

assert.equal(Config.dir, '/tmp/site-sucker')
assert.equal(Config.proxy, 'http://127.0.0.1:1087')
assert.equal(Config.excludeLink, 'example.com\n\n static.example.com')
assert.equal(Config.pageLimit, 'docs.example.com')
assert.equal(Config.timeout, 12_000)
assert.equal(Config.maxImgSize, 5)
assert.equal(Config.maxVideoSize, 25)
assert.equal(Config.maxRetryTimes, 6)
assert.equal(Config.windowCount, 3)
assert.deepEqual(Config.ExcludeHost.slice(-2), ['example.com', 'static.example.com'])

Config.update({
  dir: '',
  proxy: '   ',
  excludeLink: '',
  pageLimit: '',
  timeout: Number.NaN,
  maxImgSize: -1,
  maxVideoSize: Number.POSITIVE_INFINITY,
  maxRetryTimes: -1,
  windowCount: 0
})

assert.equal(Config.dir, '')
assert.equal(Config.proxy, '', 'clearing the proxy must clear the active runtime proxy')
assert.equal(Config.excludeLink, '')
assert.equal(Config.pageLimit, '')
assert.equal(Config.timeout, 5_000)
assert.equal(Config.maxImgSize, 0)
assert.equal(Config.maxVideoSize, 0)
assert.equal(Config.maxRetryTimes, 3)
assert.equal(Config.windowCount, 2)

const ipcHandlerSource = readFileSync('src/main/core/IPCHandler.ts', 'utf8')
assert.match(
  ipcHandlerSource,
  /siteSuckerRuntime\.peek\(\)\?\.updateConfig\(args\[0\]\?\.commonSetup\)/,
  'live settings updates must unwrap the persisted commonSetup payload'
)

const siteSuckerSource = readFileSync('src/main/ui/SiteSucker/index.ts', 'utf8')
assert.match(siteSuckerSource, /PageTask\.init\(Config\.windowCount\)/)

const pageTaskSource = readFileSync('src/main/ui/SiteSucker/PageTask.ts', 'utf8')
assert.match(pageTaskSource, /if \(Config\.proxy\.trim\(\)\)/)
assert.match(pageTaskSource, /setProxy\(\{\s*proxyRules: proxy\s*\}\)/)

const rendererStoreSource = readFileSync('src/render/components/Tools/SiteSucker/store.ts', 'utf8')
for (const field of ['timeout', 'maxImgSize', 'maxVideoSize', 'maxRetryTimes', 'windowCount']) {
  assert.match(rendererStoreSource, new RegExp(`${field}: number`))
}

console.log('site sucker config tests passed')
