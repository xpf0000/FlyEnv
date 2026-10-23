import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import compressing from 'compressing'
import { compatiblePeclArchive, peclDlls } from '../src/fork/module/Php.win/PeclWindows'
import type { SoftInstalled } from '../src/shared/app'
import {
  parsePhpExtensionProfile,
  phpExtensionTarget,
  pieInstallArguments,
  verifyPieDownload
} from '../src/fork/module/Php.win/WindowsExtensions'
import { WindowsExtensionController } from '../src/render/components/PHP/Extension/Windows/Operation'
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
assert.equal(notices.at(-1), 'success', 'refresh failure preserves successful installation')

const failed = controller.install(version, 'phpredis/phpredis')
requests.at(-1)!.pending.reject(new Error('no compatible Windows binary'))
assert.equal(await failed, false)
assert.match(entry.error, /no compatible/)
assert.equal(entry.installing, false)
const retry = controller.install(version, 'phpredis/phpredis')
requests.at(-1)!.pending.resolve({ ...result, verified: false, warning: 'not enabled' })
assert.equal(await retry, true)
assert.equal(notices.at(-1), 'warning')
assert.equal(entry.result?.verified, false)

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
console.log(
  'Windows PHP extension targeting, verification, controller lifecycle and IPC tests passed'
)
