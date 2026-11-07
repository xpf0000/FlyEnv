import assert from 'node:assert/strict'
import { loadIsolated } from './helpers/load-isolated'
import { HomebrewOperationCoordinator } from '../src/main/core/HomebrewOperationCoordinator'
const { copyHomebrewExtension } = await loadIsolated(
  'src/render/components/PHP/Extension/Homebrew/ExtensionPackage.ts',
  { '@/util/path-browserify': await import('node:path') }
)
const copied: string[][] = []
const result = { identity: { prefix: '/brew', cellar: '/brew/Cellar' } }
const files = {
  realpath: async () => '/brew/Cellar/imagick@8.5/3.8.1',
  readdir: async () => ['/brew/Cellar/imagick@8.5/3.8.1/lib/imagick.so'],
  mkdirp: async () => {},
  copyFile: async (source: string, dest: string) => {
    copied.push([source, dest])
  }
}
await copyHomebrewExtension(
  result,
  'shivammathur/extensions/imagick@8.5',
  '/user/extensions',
  files
)
assert.deepEqual(copied, [
  ['/brew/Cellar/imagick@8.5/3.8.1/lib/imagick.so', '/user/extensions/imagick.so']
])
await assert.rejects(
  copyHomebrewExtension(result, 'shivammathur/extensions/imagick@8.5', '/user/extensions', {
    ...files,
    realpath: async () => '/other/Cellar/imagick@8.5/3.8.1'
  }),
  /confirmed Cellar/
)
const snapshot: any = {
  identity: { prefix: '/brew', cellar: '/brew/Cellar' },
  formula: 'homebrew/core/php',
  affectedRacks: ['/brew/Cellar/php'],
  fingerprint: 'v1',
  eligible: true
}
let release!: () => void
const owner = new HomebrewOperationCoordinator({
  inspect: async () => snapshot,
  running: () => [],
  idle: async () => {},
  run: async (id, action) => {
    await new Promise<void>((r) => {
      release = r
    })
    return { operationId: id, action, outcome: 'succeeded', logs: '' }
  }
})
const preview = await owner.prepareUpgrade('php', 'php')
const extension = owner.mutate('install', snapshot, () => {})
await new Promise((r) => setTimeout(r, 0))
await assert.rejects(owner.beginUpgrade(preview.previewId), /busy/)
release()
await extension
const upgrade = await owner.beginUpgrade(preview.previewId)
await assert.rejects(
  owner.mutate('uninstall', snapshot, () => {}),
  /busy/
)
owner.cancelPending(upgrade.operationId)
console.log(
  'PASS extension: exact active prefix/keg copy, foreign prefix rejected, install/uninstall and upgrade mutually excluded in both directions'
)
// Consume the actual extension entry command: it delegates to the package controller and copies only after success.
let delegated: any
let metadataRefreshes = 0
const domain: any = { dir: { php: '/user/extensions' }, dirFile: {} }
const { Setup } = await loadIsolated(
  'src/render/components/PHP/Extension/Homebrew/setup.ts',
  {
    '@/util/IPC': {},
    '@/util/Element': {},
    '@lang/index': { I18nT: (key: string) => key },
    '@/core/Base': {},
    '@/components/PHP/Extension/setup': { ExtensionSetup: domain },
    '@/util/path-browserify': await import('node:path'),
    '@/util/NodeFn': {
      fs: {
        ...files,
        readdir: async (dir: string) =>
          dir === '/user/extensions' ? ['imagick.so'] : files.readdir()
      }
    },
    './Catalog': {
      BrewExtensionCatalog: { list: {}, fetching: {}, reFetch() {} },
      fetchHomebrewExtensions: async () => {
        metadataRefreshes++
      }
    },
    './ExtensionPackage': { copyHomebrewExtension },
    '@/components/VersionManager/brew/Controller': {
      homebrewUpgrade: {
        package: async (request: any, options: any) => {
          delegated = request
          await options.afterPackage(result)
          return result
        }
      }
    }
  },
  { window: { Server: {} } }
)
const page = Setup({ bin: 'php', version: '8.5.7' })
await page.handleEdit({ libName: 'shivammathur/extensions/imagick@8.5', status: false })
assert.deepEqual(JSON.parse(JSON.stringify(delegated)), {
  name: 'shivammathur/extensions/imagick@8.5',
  installed: false,
  typeFlag: 'php'
})
assert.deepEqual(domain.dirFile.php, ['imagick.so'])
assert.equal(metadataRefreshes, 2)
console.log(
  'PASS actual extension entry delegates package mutation and preserves separate extension copy/refresh'
)
