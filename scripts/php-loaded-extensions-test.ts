import assert from 'node:assert/strict'
import {
  loadedExtensionsCommand,
  parseLoadedExtensions,
  parsePhpIniPath
} from '../src/fork/module/Php/LoadedExtensions'
import { LoadedExtensionsController } from '../src/render/components/PHP/Extension/Loaded/Operation'
import type { LoadedPhpExtension } from '../src/fork/module/Php/LoadedExtensions'
import type { SoftInstalled } from '../src/shared/app'

const runtime = (path: string, phpBin?: string) =>
  ({ path, bin: path + '/service', phpBin }) as SoftInstalled
const windows = loadedExtensionsCommand(runtime('C:\\PHP 8.5'), 'C:\\PHP 8.5\\php.ini', true)
assert.equal(windows.bin, 'C:\\PHP 8.5\\php.exe')
assert.equal(windows.cwd, 'C:\\PHP 8.5')
assert.deepEqual(windows.args.slice(0, 3), ['-c', 'C:\\PHP 8.5\\php.ini', '-r'])
assert.match(windows.args[3], /get_loaded_extensions\(true\)/)
for (const path of [
  '/opt/homebrew/Cellar/php/8.5.12',
  '/usr/local/Cellar/php@8.3/8.3.36',
  '/opt/custom PHP/8.3'
]) {
  const command = loadedExtensionsCommand(runtime(path), '/etc/php/custom php.ini', false)
  assert.equal(command.bin, path + '/bin/php')
  assert.equal(command.cwd, path + '/bin')
  assert.equal(command.args[1], '/etc/php/custom php.ini')
}
for (const phpBin of ['/opt/local/bin/php83', '/usr/bin/php8.3', '/opt/custom PHP/php']) {
  assert.equal(
    loadedExtensionsCommand(runtime('/ignored', phpBin), '/etc/php.ini', false).bin,
    phpBin
  )
}
assert.equal(
  loadedExtensionsCommand(
    runtime('C:\\ignored', 'D:\\Custom PHP\\php.exe'),
    'D:\\Custom PHP\\php.ini',
    true
  ).bin,
  'D:\\Custom PHP\\php.exe'
)

for (const newline of ['\n', '\r\n']) {
  const result = parseLoadedExtensions(
    `PHP Warning: an unrelated startup warning${newline}FLYENV_LOADED_EXTENSIONS=["Core","curl","Zend OPcache","CURL"]${newline}`
  )
  assert.deepEqual(result, [{ name: 'core' }, { name: 'curl' }, { name: 'zend opcache' }])
}
assert.throws(() => parseLoadedExtensions('[PHP Modules]\ncurl\n'), /did not return/)
assert.throws(() => parseLoadedExtensions('FLYENV_LOADED_EXTENSIONS=["curl",false]'), /invalid/)
assert.throws(() => parseLoadedExtensions('FLYENV_LOADED_EXTENSIONS=not-json'), SyntaxError)
const specialIni = '/opt/custom PHP [8.3] & $/配置/php.ini'
assert.equal(
  parsePhpIniPath(
    `Warning: unrelated startup output\nFLYENV_PHP_INI=${Buffer.from(specialIni).toString('base64')}`
  ),
  specialIni
)
assert.equal(parsePhpIniPath('FLYENV_PHP_INI='), '')

const deferred = () => {
  let resolve!: (rows: LoadedPhpExtension[]) => void
  let reject!: (error: Error) => void
  const promise = new Promise<LoadedPhpExtension[]>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const requests: { version: SoftInstalled; task: ReturnType<typeof deferred> }[] = []
const controller = new LoadedExtensionsController((version) => {
  const task = deferred()
  requests.push({ version, task })
  return task.promise
})
const php83 = runtime('C:\\PHP 8.3')
const php85 = runtime('C:\\PHP 8.5')
const reading = controller.load(php83)
assert.equal(controller.load({ ...php83 }), reading, 'page re-entry shares the pending request')
await Promise.resolve()
assert.equal(requests.length, 1)
assert.notEqual(requests[0].version, php83, 'the request owns an immutable snapshot')
assert.equal(controller.fetching[php83.bin], true)
requests[0].task.resolve([{ name: 'curl' }])
await reading
assert.equal(controller.fetching[php83.bin], undefined)
assert.deepEqual(controller.list[php83.bin], [{ name: 'curl' }])
await controller.load(php83)
assert.equal(requests.length, 1, 'cached re-entry makes no new request')

const refresh83 = controller.reFetch(php83)
const read85 = controller.load(php85)
await Promise.resolve()
requests[1].task.reject(new Error('PHP process failed'))
requests[2].task.resolve([{ name: 'redis' }])
await Promise.all([refresh83, read85])
assert.deepEqual(
  controller.list[php83.bin],
  [{ name: 'curl' }],
  'failed refresh preserves completed data'
)
assert.equal(controller.errors[php83.bin], 'PHP process failed')
assert.deepEqual(controller.list[php85.bin], [{ name: 'redis' }])
assert.equal(controller.errors[php85.bin], undefined)
const retry = controller.reFetch(php83)
await Promise.resolve()
requests[3].task.resolve([{ name: 'curl' }, { name: 'xdebug' }])
await retry
assert.equal(controller.errors[php83.bin], undefined)
assert.equal(controller.list[php83.bin]?.length, 2)
assert.equal(controller.fetching[php83.bin], undefined)

const stale = controller.reFetch(php83)
await Promise.resolve()
assert.equal(controller.reFetch(php83), stale)
assert.equal(controller.reFetch(php83), stale, 'refreshes during a read coalesce')
requests[4].task.resolve([{ name: 'old-before-install' }])
await new Promise((resolve) => setImmediate(resolve))
assert.equal(requests.length, 6, 'a refresh requested during a read runs afterwards')
assert.notEqual(controller.list[php83.bin]?.[0]?.name, 'old-before-install')
assert.equal(controller.fetching[php83.bin], true)
requests[5].task.resolve([{ name: 'redis' }])
await stale
assert.deepEqual(controller.list[php83.bin], [{ name: 'redis' }])
assert.equal(controller.fetching[php83.bin], undefined)
console.log(
  'Loaded PHP extensions: Windows/macOS/Linux paths, JSON, per-version refresh, re-entry and failure/retry passed'
)
