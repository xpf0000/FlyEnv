import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

console.log('frankenphp-php-ini-test: ok')
