import assert from 'node:assert/strict'
import type { SoftInstalled } from '../src/shared/app'
import type { ExtensionPreparation } from '../src/fork/module/Php.win/ExtensionSources'
import { WindowsExtensionController } from '../src/render/components/PHP/Extension/Windows/Operation'

const profile = { bin: 'C:\\PHP\\php.exe' } as ExtensionPreparation['profile']
const preparation: ExtensionPreparation = {
  name: 'pecl:pdo_oci',
  source: 'pecl',
  homepage: 'https://pecl.php.net/package/pdo_oci',
  profile,
  releases: [{ version: '1.2.0', compatible: true, url: 'https://example.invalid/php_pdo_oci.zip' }]
}
const version = { bin: profile.bin } as SoftInstalled
const pending: { method: string; args: unknown[]; resolve: (value: unknown) => void }[] = []
const controller = new WindowsExtensionController({
  request: <T>(method: string, args: unknown[]) =>
    new Promise<T>((resolve) =>
      pending.push({ method, args, resolve: resolve as (value: unknown) => void })
    ),
  notice: () => {},
  refresh: () => {},
  successMessage: () => 'installed'
})

const first = controller.prepare(version, 'pecl:pdo_oci')
const duplicate = controller.prepare({ ...version }, 'pecl:pdo_oci')
assert.equal(first, duplicate, 'same preparation is coalesced across page re-entry')
await Promise.resolve()
assert.equal(pending[0].method, 'windowsExtensionPrepare')
assert.deepEqual(pending[0].args[1], 'pecl:pdo_oci')
pending[0].resolve(preparation)
assert.deepEqual(await first, preparation)
assert.equal(controller.entry(version).preparing, false)

const install = controller.install(version, 'pecl:pdo_oci', '1.2.0')
await Promise.resolve()
const request = pending.at(-1)!
assert.equal(request.method, 'windowsExtensionInstall')
assert.equal(request.args[2], '1.2.0', 'selected release is pinned in IPC')
assert.equal(
  await controller.prepare(version, 'pecl:pdo_oci'),
  undefined,
  'prepare cannot overlap install'
)
request.resolve({ profile, package: 'pecl:pdo_oci', verified: true, warning: '', backup: '' })
assert.equal(await install, true)
assert.equal(controller.entry(version).installing, false)

const raceRequests: { method: string; args: unknown[]; resolve: (value: unknown) => void }[] = []
const racing = new WindowsExtensionController({
  request: <T>(method: string, args: unknown[]) =>
    new Promise<T>((resolve) =>
      raceRequests.push({ method, args, resolve: resolve as (value: unknown) => void })
    ),
  notice: () => {},
  refresh: () => {},
  successMessage: () => 'installed'
})
const oldPrepare = racing.prepare(version, 'pecl:old')
const newPrepare = racing.prepare(version, 'pecl:new')
await Promise.resolve()
assert.equal(racing.entry(version).preparing, true)
raceRequests[1].resolve({ ...preparation, name: 'pecl:new' })
assert.equal((await newPrepare)?.name, 'pecl:new')
assert.equal(
  racing.entry(version).preparing,
  true,
  'one completion keeps preparation busy while sibling is pending'
)
raceRequests[0].resolve({ ...preparation, name: 'pecl:old' })
await oldPrepare
assert.equal(
  racing.entry(version).preparation?.name,
  'pecl:new',
  'stale completion cannot replace newer result'
)
assert.equal(racing.entry(version).preparing, false)

const refreshRequests: { args: unknown[]; resolve: (value: unknown) => void }[] = []
const refreshing = new WindowsExtensionController({
  request: <T>(_method: string, args: unknown[]) =>
    new Promise<T>((resolve) =>
      refreshRequests.push({ args, resolve: resolve as (value: unknown) => void })
    ),
  notice: () => {},
  refresh: () => {},
  successMessage: () => 'installed'
})
const ordinarySearch = refreshing.search(version, 'pdo')
await Promise.resolve()
void refreshing.search(version, 'pdo', true)
refreshRequests[0].resolve({ profile, packages: [], partial: false })
await Promise.resolve()
assert.equal(refreshRequests.length, 2, 'a refresh requested during search is not dropped')
assert.equal(refreshRequests[1].args[2], true)
refreshRequests[1].resolve({ profile, packages: [], partial: false })
await ordinarySearch

let syncThrow = true
const syncThrowing = new WindowsExtensionController({
  request: <T>() => {
    if (syncThrow) {
      syncThrow = false
      throw new Error('sync transport error')
    }
    return Promise.resolve(preparation as T)
  },
  notice: () => {},
  refresh: () => {},
  successMessage: () => 'installed'
})
assert.equal(await syncThrowing.prepare(version, 'pecl:pdo_oci'), undefined)
assert.equal(
  syncThrowing.entry(version).preparing,
  false,
  'synchronous transport error settles preparation state'
)
assert.match(syncThrowing.entry(version).error, /sync transport error/)
assert.equal(
  await syncThrowing.prepare(version, 'pecl:pdo_oci'),
  preparation,
  'preparation can retry after sync throw'
)

const busy = new WindowsExtensionController({
  request: <T>(method: string, args: unknown[]) =>
    new Promise<T>((resolve) =>
      pending.push({ method, args, resolve: resolve as (value: unknown) => void })
    ),
  notice: () => {},
  refresh: () => {},
  successMessage: () => 'installed'
})
const busyPrepare = busy.prepare(version, 'pecl:pdo_oci')
await Promise.resolve()
assert.equal(
  await busy.install(version, 'pecl:pdo_oci', '1.2.0'),
  false,
  'install cannot race preparation'
)
assert.equal(await busy.disable(version, 'pdo_oci'), false, 'disable cannot race preparation')
await busy.search(version, '', true)
assert.equal(busy.entry(version).fetching, false, 'catalog search cannot start during preparation')
pending.at(-1)!.resolve(preparation)
await busyPrepare
console.log('PHP extension source controller lifecycle tests passed')
