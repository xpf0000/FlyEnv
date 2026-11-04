import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import compressing from 'compressing'
import {
  compatiblePeclArchive,
  peclDlls,
  installPeclArchive
} from '../src/fork/module/Php.win/PeclWindows'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep, win32 } from 'node:path'
import axios from 'axios'
import {
  configuredExtensions,
  extensionIsLoaded,
  extensionDirectory,
  updateExtensionIni
} from '../src/fork/module/Php.win/ExtensionConfig'
import { isPeclPublisher, packageExtensionName } from '../src/fork/module/Php.win/ExtensionHttp'
import { replaceIniIfUnchanged, withPhpIniMutation } from '../src/fork/module/Php.win/IniMutation'
import { parsePhpIniPath, phpIniPathScript } from '../src/fork/module/Php/LoadedExtensions'
import type { SoftInstalled } from '../src/shared/app'
import {
  parsePhpExtensionProfile,
  phpExtensionTarget,
  pieInstallArguments,
  phpExtensionProfileScript,
  verifyPieDownload
} from '../src/fork/module/Php.win/WindowsExtensions'
import { WindowsExtensionController } from '../src/render/components/PHP/Extension/Windows/Operation'
import { extensionRows } from '../src/render/components/PHP/Extension/Windows/Catalog'
import { extensionRequest } from '../src/render/components/PHP/Extension/Request'
import type { ExtensionInstallResult } from '../src/fork/module/Php.win/WindowsExtensions'

const version = { bin: 'C:\\PHP 8.3\\php-cgi.exe', path: 'C:\\PHP 8.3' } as SoftInstalled
const target = phpExtensionTarget(version)
assert.equal(target.bin, 'C:\\PHP 8.3\\php.exe')
const info = `PHP Extension Build => API20230831,NTS,VS16\r\nArchitecture => x64\r\nThread Safety => disabled\r\nFLYENV_EXT_PROFILE=${JSON.stringify({ version: '8.3.36', ini: target.ini, dir: 'ext', loaded: ['Core'] })}`
const profile = parsePhpExtensionProfile(info, target)
assert.equal(profile.version, '8.3.36')
assert.equal(profile.build, 'API20230831,NTS,VS16')
assert.equal(profile.extensionDir, 'C:\\PHP 8.3\\ext')
const catalogProfile = {
  ...profile,
  loaded: ['Core', 'redis', 'curl', 'Zend OPcache'],
  configured: [
    { name: 'redis', loaded: true, zend: false },
    { name: 'curl', loaded: true, zend: false },
    { name: 'imagick', loaded: false, zend: false }
  ]
}
const catalogPackages = [
  {
    name: 'phpredis/phpredis',
    extension: packageExtensionName('phpredis/phpredis'),
    description: 'Redis client'
  },
  { name: 'other/redis', extension: 'redis', description: 'Another publisher' },
  { name: 'imagick/imagick', description: 'Image processing' },
  { name: 'vendor/opcache', description: '' },
  { name: 'php-ds/ext-ds', extension: packageExtensionName('php-ds/ext-ds'), description: '' }
]
const catalogRows = extensionRows(catalogProfile, catalogPackages)
assert.equal(
  catalogRows.length,
  6,
  'matching configuration is merged without dropping other publishers'
)
assert.equal(catalogRows.find((row) => row.packageName === 'phpredis/phpredis')?.status, 'loaded')
assert.equal(catalogRows.find((row) => row.packageName === 'other/redis')?.status, 'loaded')
assert.equal(catalogRows.find((row) => row.name === 'curl')?.configuredName, 'curl')
assert.equal(catalogRows.find((row) => row.name === 'curl')?.description, '')
assert.equal(catalogRows[0].name, 'imagick', 'configuration needing attention is shown first')
assert.equal(catalogRows[0].status, 'unloaded')
assert.equal(catalogRows.find((row) => row.name === 'opcache')?.status, 'loaded')
assert.equal(catalogRows.find((row) => row.name === 'opcache')?.configuredName, undefined)
assert.equal(catalogRows.find((row) => row.name === 'ds')?.status, 'available')
assert.equal(extensionRows(catalogProfile, [], 'REDIS')[0].name, 'redis')
assert.equal(extensionRows(catalogProfile, [], 'not-found').length, 0)
assert.equal(extensionRows(undefined, []).length, 0)
const disabledRows = extensionRows(
  { ...profile, configured: [], loaded: ['Core'] },
  catalogPackages
)
assert.equal(disabledRows.find((row) => row.name === 'redis')?.status, 'available')
for (const [pkg, extension] of [
  ['phpredis/phpredis', 'redis'],
  ['mongodb/mongodb-extension', 'mongodb'],
  ['grpc/grpc-php-ext', 'grpc'],
  ['nikic/php-ast', 'ast'],
  ['custom/ext-example', 'example']
])
  assert.equal(packageExtensionName(pkg), extension)
assert.equal(compatiblePeclArchive('php_redis-6.3.0-8.3-nts-vs16-x64.zip', profile), true)
for (const archive of [
  'php_redis-6.3.0-8.5-nts-vs16-x64.zip',
  'php_redis-6.3.0-8.3-ts-vs16-x64.zip',
  'php_redis-6.3.0-8.3-nts-vs17-x64.zip',
  'php_redis-6.3.0-8.3-nts-vs16-x86.zip',
  'php_redis-6.4.0RC1-8.3-nts-vs16-x64.zip'
])
  assert.equal(compatiblePeclArchive(archive, profile), false, archive)

const archiveBytes = async (entries: [string, Buffer][]) => {
  const stream = new compressing.zip.Stream()
  for (const [relativePath, bytes] of entries) stream.addEntry(bytes, { relativePath })
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
}
const safeZip = await archiveBytes([
  ['php_redis.dll', Buffer.from('MZ-test-dll')],
  ['nested/not-installed.dll', Buffer.from('MZ-not-installed')],
  ['readme.txt', Buffer.from('documentation')]
])
assert.deepEqual(
  [...(await peclDlls(safeZip))].map(([name]) => name),
  ['php_redis.dll']
)
await assert.rejects(
  peclDlls(await archiveBytes([['php_redis.dll', Buffer.from('not a DLL')]])),
  /Invalid Windows DLL/
)
assert.throws(
  () => parsePhpExtensionProfile(info.replace('php.ini', 'other.ini'), target),
  /different php.ini/
)
assert.throws(() => parsePhpExtensionProfile('', target), /Could not read/)
assert.deepEqual(pieInstallArguments(target.bin, 'phpredis/phpredis'), [
  '--no-interaction',
  '--no-ansi',
  'install',
  '--with-php-path=C:\\PHP 8.3\\php.exe',
  'phpredis/phpredis'
])
for (const name of [
  '--help',
  'foo/bar;calc',
  '../file',
  'foo/bar:dev-main',
  'https://example.com'
]) {
  assert.throws(() => pieInstallArguments(target.bin, name), /valid vendor\/package/)
}
const bytes = Buffer.from('verified PIE download')
verifyPieDownload(bytes, `sha256:${createHash('sha256').update(bytes).digest('hex')}`)
assert.throws(() => verifyPieDownload(bytes, 'sha256:' + '0'.repeat(64)), /checksum/)

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { resolve, reject, promise }
}
const requests: {
  method: string
  args: unknown[]
  progress?: (text: string) => void
  pending: ReturnType<typeof deferred<unknown>>
}[] = []
const notices: string[] = []
const controller = new WindowsExtensionController({
  request: <T>(method: string, args: unknown[], progress?: (text: string) => void) => {
    const pending = deferred<unknown>()
    requests.push({ method, args, progress, pending })
    return pending.promise as Promise<T>
  },
  notice: (kind) => {
    notices.push(kind)
  },
  refresh: () => {
    throw new Error('supplementary refresh failure')
  },
  successMessage: () => 'installed'
})
const search = controller.search(version, 'redis')
assert.equal(controller.search(version, 'redis'), search)
await Promise.resolve()
assert.equal(requests.length, 1)
requests[0].pending.resolve({
  profile,
  packages: [{ name: 'phpredis/phpredis', description: '' }],
  partial: true
})
await search
assert.equal(controller.entry(version).partial, true)
assert.equal(controller.entry(version).fetching, false)

const installing = controller.install(version, 'phpredis/phpredis')
const request = requests.at(-1)!
assert.equal(request.method, 'windowsExtensionInstall')
const entry = controller.entry(version)
assert.equal(controller.entry({ ...version }), entry, 'a remounted page binds the same operation')
assert.equal(await controller.install({ ...version, bin: 'different' }, 'imagick/imagick'), false)
request.progress?.('download progress\n')
assert.equal(entry.installing, true)
assert.deepEqual(entry.operation, { type: 'install', name: 'phpredis/phpredis', status: 'running' })
assert.match(entry.log, /download progress/)
const result: ExtensionInstallResult = {
  profile,
  package: 'phpredis/phpredis',
  verified: true,
  warning: '',
  backup: 'backup.ini'
}
request.pending.resolve(result)
assert.equal(await installing, true)
assert.equal(entry.installing, false)
assert.equal(controller.installingBin, '')
assert.equal(entry.result, result)
assert.equal(entry.operation?.status, 'success')
assert.equal(notices.at(-1), 'success', 'refresh failure preserves successful installation')

const failed = controller.install(version, 'phpredis/phpredis')
requests.at(-1)!.pending.reject(new Error('no compatible Windows binary'))
assert.equal(await failed, false)
assert.match(entry.error, /no compatible/)
assert.equal(entry.operation?.status, 'error')
assert.match(entry.operation?.error ?? '', /no compatible/)
assert.equal(entry.installing, false)
const retry = controller.install(version, 'phpredis/phpredis')
requests.at(-1)!.pending.resolve({ ...result, verified: false, warning: 'not enabled' })
assert.equal(await retry, true)
assert.equal(notices.at(-1), 'warning')
assert.equal(entry.result?.verified, false)
assert.equal(entry.operation?.status, 'warning')

let receive!: (key: string, response: { code: number; data?: unknown; msg?: string }) => void
const removed: string[] = []
const transport = {
  send: () => ({
    then: (callback: typeof receive) => {
      receive = callback
    }
  }),
  off: (key: string) => {
    removed.push(key)
  }
}
const progress: string[] = []
const ipc = extensionRequest(
  transport,
  'windowsExtensionInstall',
  [version, 'phpredis/phpredis'],
  (text) => progress.push(text)
)
receive('operation-key', { code: 200, msg: 'progress' })
assert.deepEqual(removed, [])
assert.deepEqual(progress, ['progress'])
receive('operation-key', { code: 0, data: result })
assert.equal(await ipc, result)
assert.deepEqual(removed, ['operation-key'])
const ipcFailure = extensionRequest(transport, 'windowsExtensionInstall', [])
receive('failure-key', { code: 1, msg: 'failure' })
await assert.rejects(ipcFailure, /failure/)
assert.deepEqual(removed, ['operation-key', 'failure-key'])

const searching = controller.search(version, '')
await Promise.resolve()
const initialSearch = requests.at(-1)!
assert.equal(controller.search(version, 'redis'), searching)
controller.search(version, 'xdebug')
initialSearch.pending.resolve({ profile, packages: [{ name: 'old/results' }], partial: false })
await new Promise((resolve) => setImmediate(resolve))
assert.deepEqual(requests.at(-1)!.args, [version, 'xdebug'])
assert.notEqual(entry.packages[0]?.name, 'old/results')
requests.at(-1)!.pending.resolve({ profile, packages: [{ name: 'xdebug/xdebug' }], partial: false })
await searching
assert.equal(entry.packages[0].name, 'xdebug/xdebug')
assert.equal(entry.fetching, false)

const disabling = controller.disable(version, 'xdebug')
assert.deepEqual(entry.operation, { type: 'disable', name: 'xdebug', status: 'running' })
assert.equal(entry.log, '', 'disabling does not show an earlier installation log')
assert.equal(entry.result, undefined)
assert.equal(requests.at(-1)!.method, 'windowsExtensionDisable')
assert.equal(await controller.install(version, 'phpredis/phpredis'), false)
requests.at(-1)!.pending.resolve({ ...profile, loaded: ['Core'] })
assert.equal(await disabling, true)
assert.equal(entry.operation?.status, 'success')
assert.equal(entry.installing, false)
assert.equal(controller.installingBin, '')
const disableFailure = controller.disable(version, 'redis')
requests.at(-1)!.pending.reject(new Error('configuration write failed'))
assert.equal(await disableFailure, false)
assert.equal(entry.operation?.status, 'error')
assert.equal(entry.operation?.error, 'configuration write failed')
assert.equal(entry.installing, false)

assert.equal(isPeclPublisher('phpredis/phpredis', 'redis'), true)
assert.equal(
  isPeclPublisher('bsn4/grpc', 'grpc'),
  false,
  'a different implementation must use its own publisher'
)
assert.equal(isPeclPublisher('other-vendor/redis', 'redis'), false)
assert.equal(isPeclPublisher('phpredis/phpredis', 'xdebug'), false)
const customTarget = phpExtensionTarget({ ...version, phpBin: 'D:/Custom PHP [8.3]/php.exe' })
assert.equal(customTarget.bin, 'D:\\Custom PHP [8.3]\\php.exe')
assert.equal(customTarget.ini, 'D:\\Custom PHP [8.3]\\php.ini')
assert.equal(
  parsePhpExtensionProfile(
    info.replaceAll(target.ini.replaceAll('\\', '\\\\'), target.ini.replaceAll('\\', '/')),
    target
  ).version,
  profile.version
)
for (const directory of [
  'C:/Extensions with spaces',
  'C:\\Extensions with spaces',
  '\\\\server\\PHP share\\ext',
  'extra extensions'
]) {
  assert.equal(
    extensionDirectory(`extension_dir = "${directory}" ; comment`, target.bin),
    win32.resolve(win32.dirname(target.bin), directory)
  )
}
const originalIni =
  [
    '[PHP]',
    'extension="C:/old PHP/php_redis.dll"',
    "extension = 'C:\\old PHP\\PHP_REDIS.DLL' ; old path",
    ';extension=redis',
    'extension=php_rediscluster.dll',
    'extension="C:/old PHP/php_curl.dll"',
    '[PATH=C:/a website]'
  ].join('\r\n') + '\r\n'
const newIni = updateExtensionIni(
  originalIni,
  'redis',
  true,
  false,
  'C:\\New PHP\\ext\\php_redis.dll'
)
assert.match(newIni, /^\[PHP\]\r\nextension="C:\/New PHP\/ext\/php_redis.dll"\r\n/)
assert.equal(newIni.includes('old PHP/php_redis.dll'), false)
assert.equal(newIni.includes('PHP_REDIS.DLL'), false)
assert.equal(newIni.includes('php_rediscluster.dll'), true)
assert.deepEqual(
  configuredExtensions(newIni, ['redis', 'curl']).map((row) => [row.name, row.loaded]),
  [
    ['redis', true],
    ['rediscluster', false],
    ['curl', true]
  ]
)
assert.equal(
  configuredExtensions(updateExtensionIni(newIni, 'redis', false), []).some(
    (row) => row.name === 'redis'
  ),
  false
)
const xdebugIni = updateExtensionIni(
  '[PHP]\nxdebug.client_port=9011\n',
  'xdebug',
  true,
  true,
  'C:\\PHP [8.3]\\ext\\php_xdebug.dll',
  'C:\\PHP data\\xdebug'
)
assert.match(xdebugIni, /xdebug.mode = debug/)
assert.match(xdebugIni, /xdebug.output_dir = "C:\/PHP data\/xdebug"/)
assert.match(xdebugIni, /xdebug.client_port=9011/)
assert.doesNotMatch(xdebugIni, /xdebug.client_port = 9003/)
assert.equal(
  updateExtensionIni(
    xdebugIni,
    'xdebug',
    true,
    true,
    'C:/PHP [8.3]/ext/php_xdebug.dll',
    'C:/PHP data/xdebug'
  ),
  xdebugIni
)
assert.doesNotMatch(updateExtensionIni(xdebugIni, 'xdebug', false), /xdebug.mode|zend_extension/)
const versionedXdebug = updateExtensionIni(
  'zend_extension="C:/PHP old/php_xdebug-3.5.3-8.3-ts-vs16-x86_64.dll"\n',
  'xdebug',
  false
)
assert.doesNotMatch(versionedXdebug, /zend_extension/)
assert.equal(
  extensionIsLoaded(['redis'], 'redis', 'PHP Warning: Module "redis" is already loaded'),
  false
)
assert.equal(
  extensionIsLoaded(['xdebug'], 'xdebug', 'Cannot load Xdebug - it was already loaded'),
  false
)
assert.equal(extensionIsLoaded(['redis'], 'redis', 'Module "curl" is already loaded'), true)
const bomIni = updateExtensionIni('\uFEFF[PHP]\n', 'redis', true)
assert.ok(bomIni.startsWith('\uFEFF[PHP]\nextension='))
assert.equal((bomIni.match(/\uFEFF/g) ?? []).length, 1)

const positionedIni = [
  '; custom header',
  '[PHP]',
  'memory_limit=256M',
  'extension=igbinary',
  '  extension="old/php_redis.dll" ; keep this note',
  'extension=msgpack',
  '[PATH=C:/site]',
  'extension=php_redis.dll',
  'memory_limit=512M'
].join('\n')
const positioned = updateExtensionIni(positionedIni, 'redis', true)
assert.ok(positioned.startsWith('; custom header\n[PHP]\nmemory_limit=256M\n'))
assert.ok(
  positioned.indexOf('extension=igbinary') < positioned.indexOf('extension="php_redis.dll"')
)
assert.ok(positioned.indexOf('extension="php_redis.dll"') < positioned.indexOf('extension=msgpack'))
assert.match(positioned, /^ {2}extension="php_redis.dll" ; keep this note$/m)
assert.equal((positioned.match(/php_redis\.dll/g) ?? []).length, 1)
assert.match(positioned, /\[PATH=C:\/site\]\nmemory_limit=512M/)
assert.equal(updateExtensionIni(positioned, 'redis', true), positioned)

const commented = updateExtensionIni(
  '[PHP]\na=1\n;extension=redis ; enable here\nb=2\n',
  'redis',
  true
)
assert.match(commented, /a=1\nextension="php_redis.dll" ; enable here\nb=2/)
const grouped = updateExtensionIni(
  '[PHP]\n;extension=curl\n[Session]\nsession.name=TEST\n',
  'redis',
  true
)
assert.match(grouped, /;extension=curl\nextension="php_redis.dll"\n\[Session\]/)
const noGroup = updateExtensionIni('; header\n[PHP]\nmemory_limit=256M\n', 'redis', true)
assert.match(noGroup, /^; header\n\[PHP\]\nextension="php_redis.dll"\nmemory_limit=256M/)
const scopedOnly = updateExtensionIni('[HOST=example.com]\nextension=redis\na=1\n', 'redis', true)
assert.match(scopedOnly, /^extension="php_redis.dll"\n\[HOST=example.com\]\na=1/)
const scopedTemplate = updateExtensionIni(
  '[PHP]\na=1\n[PATH=C:/site]\n;extension=redis\n',
  'redis',
  true
)
assert.match(scopedTemplate, /^\[PHP\]\nextension="php_redis.dll"\na=1\n\[PATH=/)
const resumedGlobal = updateExtensionIni(
  '[PATH=C:/site]\na=1\n[PHP]\n;extension=redis\n',
  'redis',
  true
)
assert.match(resumedGlobal, /\[PHP\]\nextension="php_redis.dll"/)
assert.equal(updateExtensionIni('', 'redis', true), 'extension="php_redis.dll"\n')
const semicolonPath = updateExtensionIni(
  '[PHP]\nextension="C:/PHP;custom/php_redis.dll" ; note\n',
  'redis',
  true
)
assert.match(semicolonPath, /^\[PHP\]\nextension="php_redis.dll" ; note\n$/)

const opcacheLine = 'zend_extension="C:/PHP/ext/php_opcache.dll"'
const xdebugLine = 'zend_extension="C:/PHP/ext/php_xdebug.dll"'
for (const name of ['xdebug', 'opcache']) {
  for (const existing of [
    `${opcacheLine}\n${xdebugLine}`,
    `${xdebugLine}\n${opcacheLine}`,
    name === 'xdebug' ? opcacheLine : xdebugLine
  ]) {
    const input = `[PHP]\n${existing}\n[HOST=example.com]\na=1\n`
    const dll = `C:/PHP/ext/php_${name}.dll`
    const ordered = updateExtensionIni(input, name, true, true, dll, 'C:/xdebug')
    assert.ok(ordered.indexOf(opcacheLine) < ordered.indexOf(xdebugLine), name)
    assert.ok(ordered.indexOf(xdebugLine) < ordered.indexOf('[HOST='), name)
    assert.equal(updateExtensionIni(ordered, name, true, true, dll, 'C:/xdebug'), ordered)
  }
}
const scopedXdebug = updateExtensionIni(
  '[PHP]\n[PATH=C:/site]\nxdebug.client_port=9011\n',
  'xdebug',
  true,
  true,
  'php_xdebug.dll',
  'C:/xdebug'
)
assert.ok(scopedXdebug.indexOf('xdebug.client_port = 9003') < scopedXdebug.indexOf('[PATH='))
assert.match(scopedXdebug, /\[PATH=C:\/site\]\nxdebug.client_port=9011/)
assert.ok(scopedXdebug.startsWith('[PHP]\nzend_extension='))

const root = await mkdtemp(join(tmpdir(), 'FlyEnv PHP [路径] & $ '))
const previousServer = global.Server
const previousAdapter = axios.defaults.adapter
try {
  global.Server = {
    ...previousServer,
    Cache: root,
    PhpDir: root,
    Proxy: { https_proxy: 'http://127.0.0.1:6789' }
  }
  const ini = join(root, 'php.ini')
  await writeFile(ini, originalIni)
  const hold = deferred<void>()
  const order: string[] = []
  const first = withPhpIniMutation(ini, async () => {
    order.push('install')
    await hold.promise
    throw new Error('install failed')
  })
  const firstFailure = assert.rejects(first, /install failed/)
  const second = withPhpIniMutation(ini.replaceAll('\\', '/').toUpperCase(), async () => {
    order.push('toggle')
  })
  await withPhpIniMutation(join(root, 'other.ini'), async () => {
    order.push('other PHP')
  })
  assert.deepEqual(order, ['install', 'other PHP'])
  hold.resolve()
  await Promise.all([firstFailure, second])
  assert.deepEqual(order, ['install', 'other PHP', 'toggle'])
  await replaceIniIfUnchanged(ini, Buffer.from(originalIni), Buffer.from(newIni))
  await writeFile(ini, newIni + '; external edit\r\n')
  await assert.rejects(
    replaceIniIfUnchanged(ini, Buffer.from(newIni), Buffer.from(originalIni)),
    /newer configuration was preserved/
  )
  assert.match(await readFile(ini, 'utf8'), /external edit/)
  assert.equal(
    (await readdir(root)).some((name) => name.endsWith('.tmp')),
    false
  )

  const extensionDir = join(root, 'extensions with spaces')
  await mkdir(extensionDir)
  const dll = join(extensionDir, 'php_redis.dll')
  const oldDll = Buffer.from('MZ-old-version')
  await writeFile(dll, oldDll)
  const transactionProfile = { ...profile, ini, extensionDir, bin: join(root, 'php.exe') }
  axios.defaults.adapter = async (config) => {
    assert.deepEqual(config.proxy, { protocol: 'http', host: '127.0.0.1', port: '6789' })
    return { config, data: safeZip, status: 200, statusText: 'OK', headers: {} }
  }
  await writeFile(ini, originalIni)
  const installOptions = {
    url: 'https://downloads.php.net/~windows/pecl/releases/redis/6.3.0/php_redis-6.3.0-8.3-nts-vs16-x64.zip',
    extension: 'redis',
    zend: false,
    profile: transactionProfile,
    directory: join(root, 'backup'),
    progress: () => undefined,
    verify: async () => {
      const changed = await readFile(ini, 'utf8')
      assert.equal(
        configuredExtensions(changed, ['redis']).filter((row) => row.name === 'redis').length,
        1
      )
      assert.equal(changed.includes('old PHP/php_redis.dll'), false)
      throw new Error('PHP rejected the new DLL')
    }
  }
  await assert.rejects(
    installPeclArchive(installOptions),
    /Original extension files and php.ini were restored/
  )
  assert.equal(await readFile(ini, 'utf8'), originalIni)
  assert.deepEqual(await readFile(dll), oldDll)
  await assert.rejects(
    installPeclArchive({
      ...installOptions,
      verify: async () => {
        await writeFile(ini, (await readFile(ini, 'utf8')) + '; concurrent user edit\r\n')
        throw new Error('verification failed')
      }
    }),
    /Newer php.ini and installed files were preserved/
  )
  assert.match(await readFile(ini, 'utf8'), /concurrent user edit/)
  assert.deepEqual(await readFile(dll), Buffer.from('MZ-test-dll'))

  if (process.env.FLYENV_PHP_TEST_BIN) {
    const bin = process.env.FLYENV_PHP_TEST_BIN
    await writeFile(ini, '[PHP]\n')
    const output = execFileSync(bin, ['-c', ini, '-r', phpExtensionProfileScript()], {
      cwd: root,
      windowsHide: true,
      encoding: 'utf8',
      env: {
        ...process.env,
        PHP_INI_SCAN_DIR: '',
        FLYENV_LARGE_VARIABLE: 'x'.repeat(24000),
        FLYENV_LARGE_VARIABLE_2: 'y'.repeat(24000),
        FLYENV_LARGE_VARIABLE_3: 'z'.repeat(24000)
      }
    })
    assert.ok(output.length < 64000, 'profile output excludes large environment variables')
    const runtimeProfile = parsePhpExtensionProfile(output, { bin, ini })
    assert.equal(win32.resolve(runtimeProfile.ini), win32.resolve(ini))
    assert.ok(runtimeProfile.loaded.length > 0)
    const detectedIni = execFileSync(bin, ['-c', ini, '-r', phpIniPathScript()], {
      cwd: root,
      windowsHide: true,
      encoding: 'utf8'
    })
    assert.equal(parsePhpIniPath(detectedIni), ini)
    if ((await readdir(join(win32.dirname(bin), 'ext'))).includes('php_fileinfo.dll')) {
      const dll = join(win32.dirname(bin), 'ext', 'php_fileinfo.dll')
      for (const template of [
        '[PHP]\n;extension=fileinfo\nmemory_limit=128M\n[PATH=C:/site]\nmemory_limit=64M\n',
        '[HOST=example.com]\nextension=fileinfo\nmemory_limit=64M\n',
        '[PATH=C:/site]\nmemory_limit=64M\n[PHP]\n;extension=fileinfo\n'
      ]) {
        await writeFile(ini, updateExtensionIni(template, 'fileinfo', true, false, dll))
        const loaded = execFileSync(
          bin,
          ['-c', ini, '-r', 'echo extension_loaded("fileinfo") ? "loaded" : "missing";'],
          {
            windowsHide: true,
            encoding: 'utf8',
            env: { ...process.env, PHP_INI_SCAN_DIR: '' }
          }
        )
        assert.equal(loaded, 'loaded', 'real PHP loads extensions only from a global position')
      }
    }
    console.log(
      `Real PHP ${runtimeProfile.version}: spaced Unicode ini path and large environment passed`
    )
  }
} finally {
  axios.defaults.adapter = previousAdapter
  global.Server = previousServer
  const temporaryRoot = resolve(tmpdir())
  assert.ok(
    resolve(root).startsWith(temporaryRoot + sep) && root.includes('FlyEnv PHP [路径] & $ '),
    'Refusing to remove an unexpected temporary path'
  )
  await rm(root, { recursive: true, force: true })
}
console.log(
  'Windows PHP extension targeting, verification, controller lifecycle and IPC tests passed'
)
