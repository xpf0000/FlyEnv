import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type IniBuilderModule = {
  buildWindowsPhpIni?: (content: string, extensionExists: (name: string) => boolean) => string
}

const phpIni = (await import('../src/fork/module/FrankenPHP/PhpIni').catch(() => ({}))) as IniBuilderModule

assert.equal(typeof phpIni.buildWindowsPhpIni, 'function')

if (!phpIni.buildWindowsPhpIni) {
  throw new Error('buildWindowsPhpIni is unavailable')
}

const template = ';extension_dir = "ext"\r\n[PHP]\r\n'
const content = phpIni.buildWindowsPhpIni(template, (name) =>
  ['php_curl.dll', 'php_xdebug.dll'].includes(name)
)

assert.match(content, /^extension_dir = "ext"$/m)
assert.match(content, /extension=php_curl\.dll/)
assert.match(content, /zend_extension=php_xdebug\.dll/)
assert.doesNotMatch(content, /extension=php_gd\.dll/)
assert.match(content, /\[PHP\]/)

const root = join(import.meta.dirname, '..')
const moduleSource = readFileSync(join(root, 'src/fork/module/FrankenPHP/index.ts'), 'utf8')

assert.match(moduleSource, /ensureWindowsPhpIni/)
assert.match(moduleSource, /this\.ensureWindowsPhpIni\(row\.appDir\)/)
assert.match(moduleSource, /this\.ensureWindowsPhpIni\(version\.path\)/)
assert.match(moduleSource, /getIniPath\(version: SoftInstalled\)/)

const readSource = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
const phpConfigSource = readSource(join(root, 'src/render/components/PHP/Config.vue'))
const frankenPageSource = readSource(join(root, 'src/render/components/FrankenPHP/Index.vue'))
const frankenActionsSource = readSource(
  join(root, 'src/render/components/FrankenPHP/VersionActions.vue')
)

assert.match(phpConfigSource, /typeFlag\??:.*frankenphp/)
assert.match(phpConfigSource, /app-fork:\$\{.*typeFlag/)
assert.match(frankenPageSource, /#action/)
assert.match(frankenPageSource, /VersionActions/)
assert.match(frankenActionsSource, /typeFlag: 'frankenphp'/)
assert.match(frankenActionsSource, /window\.Server\.isWindows/)

console.log('frankenphp-php-ini-test: ok')
