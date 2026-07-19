import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const purePathModule = 'src/main/utils/AppResourcePath.ts'
const runtimePathModule = 'src/main/utils/AppRuntimePath.ts'

assert.equal(existsSync(purePathModule), true, 'pure resource path resolver must exist')
assert.equal(existsSync(runtimePathModule), true, 'Electron runtime path wrapper must exist')

const {
  resolveAppResourcePath,
  resolveElectronResourcePath,
  resolveRendererResourcePath
} = await import('../src/main/utils/AppResourcePath')

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

console.log('main process resource path tests passed')
