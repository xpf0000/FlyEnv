import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const tokens = await readFile('src/render/style/theme/light-tokens.scss', 'utf8').catch(() => '')
const baseTokens = await readFile('src/render/style/theme/base-tokens.scss', 'utf8').catch(() => '')
const light = await readFile('src/render/style/light.scss', 'utf8')
const dark = await readFile('src/render/style/dark.scss', 'utf8')
const sharedStyle = await readFile('src/render/style/index.scss', 'utf8')
const aside = await readFile('src/render/components/Aside/Index.vue', 'utf8')
const pluginPage = await readFile('src/render/components/Setup/Plugins/index.vue', 'utf8')

assert.ok(tokens.length > 0, 'light theme tokens should have a dedicated definition file')
assert.ok(baseTokens.length > 0, 'shared theme tokens should have a dedicated definition file')
assert.match(tokens, /html\.light\s*\{/)
assert.match(baseTokens, /html\.light,\s*html\.dark\s*\{/)
assert.match(baseTokens, /--flyenv-color-success:\s*#01cc74/)
assert.match(baseTokens, /--el-color-success:\s*var\(--flyenv-color-success\)/)
assert.match(sharedStyle, /@use ['"]\.\/theme\/base-tokens['"];/)
for (const variable of [
  '--flyenv-light-canvas',
  '--flyenv-light-surface',
  '--flyenv-light-surface-muted',
  '--flyenv-light-text',
  '--flyenv-light-text-muted',
  '--flyenv-light-border',
  '--flyenv-light-primary'
]) {
  assert.match(tokens, new RegExp(`${variable}\\s*:`))
}
assert.match(tokens, /--flyenv-sidebar-divider-color:\s*var\(--flyenv-light-border\)/)
assert.match(sharedStyle, /border-top:\s*1px solid var\(--flyenv-sidebar-divider-color\)/)
assert.match(dark, /--flyenv-sidebar-divider-color:\s*#242737/)
assert.match(aside, /module-type[^>]*flex[^>]*items-center/)
assert.match(aside, /class="h-px flex-1 bg-\[var\(--flyenv-sidebar-divider-color\)\]"/)
assert.match(
  sharedStyle,
  /\.aside\s*\{[\s\S]*?\.el-switch\s*\{\s*--el-switch-on-color:\s*var\(--el-color-success\)/
)
assert.match(tokens, /--el-color-primary:\s*var\(--flyenv-light-primary\)/)
assert.match(tokens, /--main-bg-color:\s*var\(--flyenv-light-canvas\)/)

const primary = tokens.match(/--flyenv-light-primary:\s*(#[0-9a-f]{6})/i)?.[1]
assert.ok(primary, 'light theme primary color should be a six-digit hex value')
const channel = (value: number) => {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}
const rgb = primary
  .slice(1)
  .match(/../g)!
  .map((value) => Number.parseInt(value, 16))
const luminance = 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
assert.ok(1.05 / (luminance + 0.05) >= 4.5, 'primary buttons need AA contrast with white text')

assert.match(light, /@use ['"]\.\/theme\/light-tokens['"];/)
assert.doesNotMatch(light, /#f1f2f3|#345|#fdab1f/)
assert.doesNotMatch(pluginPage, /bg-white|rgba\(51,68,85/)
assert.match(pluginPage, /bg-\[var\(--flyenv-light-surface\)\]/)
assert.match(pluginPage, /border-\[var\(--flyenv-light-border\)\]/)
console.log('light theme test passed')
