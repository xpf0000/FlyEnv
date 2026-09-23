import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const setup = await readFile('src/render/components/Setup/Index.vue', 'utf8')
const aside = await readFile('src/render/components/Aside/Index.vue', 'utf8')
const mailpitPluginIndex = await readFile('plugins/mailpit/render/Index.vue', 'utf8')
const mailpitPluginAside = await readFile('plugins/mailpit/render/aside.vue', 'utf8')
const pluginPage = await readFile('src/render/components/Setup/Plugins/index.vue', 'utf8').catch(
  () => ''
)
const controller = await readFile('src/render/components/Setup/Plugins/controller.ts', 'utf8')
const ipc = await readFile('src/main/core/IPCHandler.ts', 'utf8')
assert.match(setup, /Plugins/)
assert.ok(setup.indexOf("value: 'plugins'") > setup.indexOf("value: 'about'"))
assert.doesNotMatch(setup, /<el-radio-(?:group|button)/)
assert.match(setup, /role="tablist"/)
assert.match(setup, /v-for="item in tabs"/)
assert.match(setup, /store\.tab === item\.value/)
assert.match(setup, /cursor-pointer[^"\n]*h-7[^"\n]*px-3[^"\n]*text-xs/)
assert.match(setup, /!bg-\[var\(--el-color-primary\)\] !text-white/)
assert.match(setup, /border-\[var\(--flyenv-light-border\)\]/)
assert.doesNotMatch(aside, /pluginsTitle|navPluginMarket/)
assert.doesNotMatch(mailpitPluginIndex, /flyenv:mailpit/)
assert.doesNotMatch(mailpitPluginAside, /flyenv:mailpit-aside/)
assert.match(mailpitPluginIndex, /mailpit-plugin/)
assert.match(mailpitPluginIndex, /@\/components\/ServiceManager\/index\.vue/)
assert.match(mailpitPluginAside, /mailpit-plugin/)
assert.ok(pluginPage.length > 0)
assert.match(pluginPage, /third-party/i)
assert.match(pluginPage, /thirdParty/)
assert.match(pluginPage, /acknowledge/i)
// The marketplace visual spec is implemented entirely with Tailwind utilities.
// Each primary catalog state owns a bordered, full-height surface instead of
// placing loose content directly on the settings background.
assert.doesNotMatch(pluginPage, /\bplugin-market\b/)
assert.doesNotMatch(pluginPage, /<style(?:\s|>)/)
assert.equal((pluginPage.match(/min-h-\[420px\]/g) ?? []).length, 0)
assert.ok(
  (pluginPage.match(/min-h-0 flex-1 rounded-lg/g) ?? []).length >= 2,
  'official and installed surfaces should fill the remaining page height'
)
assert.match(pluginPage, /rounded-lg[^"\n]*border[^"\n]*shadow/)
assert.ok(
  (pluginPage.match(/<el-scrollbar/g) ?? []).length >= 3,
  'outer content scroll area plus official and installed inner scrollbars should be present'
)
assert.match(pluginPage, /flex h-full min-h-0 flex-col/)
assert.match(pluginPage, /shrink-0[^"\n]*px-6[^"\n]*pb-5[^"\n]*pt-5/)
assert.match(pluginPage, /cursor-pointer[^"\n]*h-7[^"\n]*px-3[^"\n]*text-xs/)
assert.match(pluginPage, /<el-scrollbar class="h-full min-h-0 flex-1">/)
assert.match(pluginPage, /!bg-\[var\(--el-color-primary\)\] !text-white/)
assert.doesNotMatch(pluginPage, /rounded-\[(?:9|10|14)px\]|rounded-(?:xl|2xl|3xl)/)
// Restart prompt is only a fallback when hot reload failed; three mutation
// handlers must all gate askRestart on restartRequired.
assert.equal(
  (pluginPage.match(/if \(PluginMarket\.restartRequired\) await askRestart\(\)/g) ?? []).length,
  3
)
assert.doesNotMatch(pluginPage, /const request =/)
assert.match(controller, /PluginMarketController/)
assert.match(controller, /busyById/)
assert.match(controller, /restartRequired/)
assert.match(controller, /applyHotReload/)
assert.match(controller, /third-party/i)
assert.match(controller, /application:plugin-market-list/)
assert.match(controller, /application:plugin-install/)
assert.match(controller, /application:plugin-uninstall/)
assert.match(controller, /comparePluginVersions/)
assert.match(controller, /reinstall/)
assert.match(controller, /inFlight/)
// Post-mutation refreshes must bypass the shared in-flight refresh and be
// guarded against stale overwrites (adding a source while the initial refresh
// is still fetching must surface the new source's plugins immediately).
assert.match(controller, /refreshSeq/)
assert.match(controller, /fresh/)
assert.equal((controller.match(/refresh\(\{ fresh: true \}\)/g) ?? []).length, 5)
assert.match(controller, /return existing/)
assert.match(controller, /IPC\.off\(call\.key\)/)
assert.match(controller, /setTimeout/)
assert.match(ipc, /application:plugin-source-add/)
assert.match(ipc, /application:plugin-toggle/)
console.log('plugin market UI test passed')
