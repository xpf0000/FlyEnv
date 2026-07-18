import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const manifestFile = resolve(root, 'configs/element-plus-locales.ts')

assert.equal(
  existsSync(manifestFile),
  true,
  'configs/element-plus-locales.ts must declare every optimized Element Plus locale'
)

const { ElementPlusLocaleModules } = await import(pathToFileURL(manifestFile).href)
const { default: viteConfig } = await import('../configs/vite.config')
const rendererSource = readFileSync(resolve(root, 'src/lang/render.ts'), 'utf8')
const localeImportPattern = /(?:from\s+|import\()['"](element-plus\/es\/locale\/lang\/[^'"]+)['"]/g
const rendererModules = [...rendererSource.matchAll(localeImportPattern)].map((match) => match[1])
const expected = [...new Set(rendererModules)].sort()
const configured = [...ElementPlusLocaleModules].sort()
const serverIncludes = [...(viteConfig.serverConfig.optimizeDeps?.include ?? [])].sort()
const serveIncludes = [...(viteConfig.serveConfig.optimizeDeps?.include ?? [])].sort()

assert.deepEqual(configured, expected, 'Vite locale manifest must match renderer locale imports')
assert.deepEqual(serverIncludes, expected, 'serverConfig must pre-optimize every renderer locale')
assert.deepEqual(serveIncludes, expected, 'serveConfig must pre-optimize every renderer locale')

console.log('language Vite optimization tests passed')
