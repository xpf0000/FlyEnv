import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const purePathModule = 'src/main/utils/AppResourcePath.ts'
const runtimePathModule = 'src/main/utils/AppRuntimePath.ts'

assert.equal(existsSync(purePathModule), true, 'pure resource path resolver must exist')
assert.equal(existsSync(runtimePathModule), true, 'Electron runtime path wrapper must exist')

const { resolveAppResourcePath, resolveElectronResourcePath, resolveRendererResourcePath } =
  await import('../src/main/utils/AppResourcePath')

const appRoot = resolve('tmp', 'flyenv-app')
assert.equal(resolveAppResourcePath(appRoot, 'app-update.yml'), resolve(appRoot, 'app-update.yml'))
assert.equal(
  resolveElectronResourcePath(appRoot, 'fork.mjs'),
  resolve(appRoot, 'dist', 'electron', 'fork.mjs')
)
assert.equal(
  resolveElectronResourcePath(appRoot, 'static'),
  resolve(appRoot, 'dist', 'electron', 'static')
)
assert.equal(
  resolveRendererResourcePath(appRoot, 'capturer', 'capturer.html'),
  resolve(appRoot, 'dist', 'render', 'capturer', 'capturer.html')
)

const runtimeSource = readFileSync(runtimePathModule, 'utf8')
assert.match(runtimeSource, /app\.getAppPath\(\)/)
assert.match(runtimeSource, /getAppResourcePath/)
assert.match(runtimeSource, /getElectronResourcePath/)
assert.match(runtimeSource, /getRendererResourcePath/)

const auditedSources = {
  index: readFileSync('src/main/index.ts', 'utf8'),
  pages: readFileSync('src/main/configs/page.ts', 'utf8'),
  application: readFileSync('src/main/Application.ts', 'utf8'),
  capturer: readFileSync('src/main/core/Capturer.ts', 'utf8'),
  updater: readFileSync('src/main/core/UpdateManager.ts', 'utf8')
}

for (const [name, source] of Object.entries(auditedSources)) {
  assert.doesNotMatch(
    source,
    /fileURLToPath\(import\.meta\.url\)|\b__dirname\b/,
    `${name} must not derive application resources from its generated module location`
  )
}

assert.match(auditedSources.index, /getElectronResourcePath\('static'\)/)
assert.match(auditedSources.pages, /getRendererResourcePath\('index\.html'\)/)
assert.match(auditedSources.pages, /getRendererResourcePath\('tray\.html'\)/)
assert.match(auditedSources.application, /getElectronResourcePath\('fork\.mjs'\)/)
assert.match(auditedSources.capturer, /getRendererResourcePath\('capturer', 'capturer\.html'\)/)
assert.match(auditedSources.updater, /getAppResourcePath\('app-update\.yml'\)/)

const capturerSource = auditedSources.capturer
assert.doesNotMatch(capturerSource, /load(?:URL|File)\([^\n]+\)\.catch\(\)/)
assert.match(capturerSource, /private handleWindowLoadError\(/)
assert.match(capturerSource, /globalShortcut\.unregister\('Escape'\)/)
assert.match(capturerSource, /this\.windowImage = null/)
assert.match(capturerSource, /this\.capturering = false/)
assert.match(capturerSource, /window\.isDestroyed\(\)/)
assert.match(capturerSource, /dialog\.showErrorBox\(/)
assert.match(capturerSource, /loadPage\.catch\(\(error\) =>/)

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
assert.equal(
  packageJson.scripts['test:main-resource-path'],
  'tsx scripts/main-process-resource-path-test.ts'
)
assert.match(packageJson.scripts['test:main-lazy'], /yarn test:main-resource-path/)

console.log('main process resource path tests passed')
