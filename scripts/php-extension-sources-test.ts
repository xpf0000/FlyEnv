import assert from 'node:assert/strict'
import { PeclRepository } from '../src/fork/module/Php.win/PeclRepository'
import { compatiblePeclArchive } from '../src/fork/module/Php.win/PeclWindows'
import type { PhpExtensionProfile } from '../src/fork/module/Php.win/WindowsExtensions'
import {
  WindowsExtensionInstaller,
  pieInstallArguments
} from '../src/fork/module/Php.win/WindowsExtensions'
import axios from 'axios'
import peclRepository from '../src/fork/module/Php.win/PeclRepository'
import type { SoftInstalled } from '../src/shared/app'

const profile = {
  version: '8.4.27',
  build: 'API20240924,TS,VS17',
  architecture: 'x64'
} as PhpExtensionProfile
const requests: string[] = []
let fail = false
const xml = {
  catalog:
    '<a><c>pecl.php.net</c><p>PDO_OCI</p><p>solr</p><p>timezonedb</p><p>../invalid</p><p><bad>invalid candidate</bad></p></a>',
  releases:
    '<a><p>pdo_oci</p><r><v>1.3.0</v><s>stable</s></r><r><v>1.2.0</v><s>stable</s></r><r><v>1.4.0RC1</v><s>beta</s></r></a>'
}
const repository = new PeclRepository(async (url) => {
  requests.push(url)
  if (fail) throw new Error('network unavailable')
  if (url.endsWith('/packages.xml')) return xml.catalog
  if (url.endsWith('/allreleases.xml')) return xml.releases
  if (url.endsWith('/info.xml')) return '<p><n>PDO_OCI</n><s>Oracle extension</s></p>'
  if (url.endsWith('/package.1.2.0.xml'))
    return '<package><name>pdo_oci</name><version><release>1.2.0</release></version><providesextension>pdo_oci</providesextension><extsrcrelease/></package>'
  if (url.endsWith('/1.3.0/'))
    return '<a href="php_pdo_oci-1.3.0-8.5-ts-vs17-x64.zip">newer PHP</a>'
  if (url.endsWith('/1.2.0/')) return '<a href="php_pdo_oci-1.2.0-8.4-ts-vs17-x64.zip">DLL</a>'
  throw new Error('Unexpected URL: ' + url)
})
assert.deepEqual(
  (await repository.catalog('PDO')).map((x) => x.name),
  ['pecl:pdo_oci']
)
assert.equal((await repository.catalog('solr'))[0].source, 'pecl')
assert.equal(requests.filter((x) => x.endsWith('/packages.xml')).length, 1, 'catalog cached')
assert.equal((await repository.catalog('invalid')).length, 0, 'reject invalid official identifiers')
await repository.catalog('', true)
assert.equal(
  requests.filter((x) => x.endsWith('/packages.xml')).length,
  2,
  'manual refresh bypasses cache'
)
const prepared = await repository.prepare('pecl:pdo_oci', profile)
assert.equal(prepared.source, 'pecl')
assert.equal(prepared.releases[0].version, '1.3.0')
assert.equal(prepared.releases[0].compatible, false, 'do not silently choose an older release')
assert.equal(prepared.releases[1].compatible, null, 'historical versions checked on selection only')
const older = await repository.prepare('pecl:pdo_oci', profile, '1.2.0')
assert.equal(older.releases[1].compatible, true)
assert.equal(older.extension, 'pdo_oci')
assert.equal(older.zend, false)
assert.match(older.releases[1].url!, /pdo_oci\/1.2.0\/php_pdo_oci-1.2.0-8.4-ts-vs17-x64.zip$/)
assert.equal(prepared.releases.length, 2, 'stable releases only')
await assert.rejects(repository.archive('pecl:pdo_oci', profile, '1.3.0'), /compatible/)
assert.equal(await repository.archive('pecl:pdo_oci', profile, '1.2.0'), older.releases[1].url)
await assert.rejects(repository.archive('pecl:pdo_oci', profile, '1.1.0'), /release/)
await assert.rejects(repository.prepare('pecl:../../escape', profile), /PECL/)
await assert.rejects(repository.prepare('pecl:not-official', profile), /official/)
assert.equal(compatiblePeclArchive('php_timezonedb-2026.5-8.4-ts-vs17-x64.zip', profile), true)
assert.equal(compatiblePeclArchive('php_timezonedb-2026.5-8.4-ts-vs17-x86_64.zip', profile), true)
assert.equal(compatiblePeclArchive('php_timezonedb-2026.5-8.4-nts-vs17-x64.zip', profile), false)
fail = true
await assert.rejects(repository.catalog('', true), /network unavailable/)
fail = false
assert.equal(
  (await repository.catalog('solr', true)).length,
  1,
  'failed lookup does not poison cache'
)
let listingFailed = true
const independent = new PeclRepository(async (url) => {
  if (url.endsWith('/packages.xml')) return xml.catalog
  if (url.endsWith('/allreleases.xml')) return xml.releases
  if (url.endsWith('/info.xml')) return '<p><n>PDO_OCI</n><s>Oracle extension</s></p>'
  if (url.endsWith('/package.1.2.0.xml'))
    return '<package><name>pdo_oci</name><version><release>1.2.0</release></version><providesextension>pdo_oci</providesextension><extsrcrelease/></package>'
  if (url.endsWith('/1.3.0/') && listingFailed) throw new Error('temporary listing failure')
  return '<a href="php_pdo_oci-1.2.0-8.4-ts-vs17-x64.zip">DLL</a>'
})
const partial = await independent.prepare('pecl:pdo_oci', profile)
assert.equal(partial.releases[0].compatible, null, 'network error is not incompatible')
assert.match(partial.releases[0].error!, /temporary listing failure/)
assert.equal(
  (await independent.prepare('pecl:pdo_oci', profile, '1.2.0')).releases[1].compatible,
  true,
  'valid sibling survives'
)
listingFailed = false
assert.equal((await independent.prepare('pecl:pdo_oci', profile)).releases[0].error, undefined)
const zendRepository = new PeclRepository(async (url) => {
  if (url.endsWith('packages.xml')) return '<a><c>pecl.php.net</c><p>testzend</p></a>'
  if (url.endsWith('allreleases.xml')) return '<a><p>testzend</p><r><v>1.0</v><s>stable</s></r></a>'
  if (url.endsWith('package.1.0.xml'))
    return '<package><name>testzend</name><version><release>1.0</release></version><providesextension>zend_module</providesextension><zendextsrcrelease/></package>'
  return '<a href="php_testzend-1.0-8.4-ts-vs17-x64.zip">DLL</a>'
})
const zendPrepared = await zendRepository.prepare('pecl:testzend', profile)
assert.equal(zendPrepared.extension, 'zend_module', 'module name comes from release metadata')
assert.equal(zendPrepared.zend, true, 'Zend load mode comes from authoritative release metadata')
let metadataAttempts = 0
const repairableMetadata = new PeclRepository(async (url) => {
  if (url.endsWith('packages.xml')) return xml.catalog
  if (url.endsWith('allreleases.xml')) return xml.releases
  if (url.endsWith('package.1.2.0.xml')) {
    if (++metadataAttempts === 1) return '<package><name>wrong-identity</name></package>'
    return '<package><name>pdo_oci</name><version><release>1.2.0</release></version><providesextension>pdo_oci</providesextension><extsrcrelease/></package>'
  }
  return '<a href="php_pdo_oci-1.2.0-8.4-ts-vs17-x64.zip">DLL</a>'
})
const unknownMetadata = await repairableMetadata.prepare('pecl:pdo_oci', profile, '1.2.0')
assert.equal(unknownMetadata.releases[1].compatible, null)
assert.match(unknownMetadata.releases[1].error!, /identity/)
assert.equal(
  (await repairableMetadata.prepare('pecl:pdo_oci', profile, '1.2.0')).releases[1].compatible,
  true,
  'invalid metadata is not cached as unsupported'
)
console.log(
  'PHP extension official source discovery, exact releases, cache and failure boundaries passed'
)

const originalAdapter = axios.defaults.adapter
const server = global.Server
try {
  global.Server = { ...server, Proxy: {}, Cache: 'C:\\FlyEnv-test-cache' }
  let peclFailed = false
  const urls: string[] = []
  axios.defaults.adapter = async (config) => {
    urls.push(config.url!)
    let data: unknown
    if (config.url!.endsWith('packages.xml')) {
      if (peclFailed) throw new Error('PECL offline')
      data = xml.catalog
    } else if (config.url!.includes('search.json'))
      data = {
        results: [
          { name: 'other/pdo_oci', description: 'Independent publisher' },
          { name: 'pecl/pdo_oci', description: 'Package publisher' }
        ]
      }
    else if (config.url!.includes('/p2/'))
      data = {
        packages: {
          'other/pdo_oci': [
            { version: 'v1.2.0', type: 'php-ext', 'php-ext': { 'extension-name': 'pdo_oci' } },
            { version: 'v1.1.0' },
            { version: 'v1.3.0RC1' }
          ]
        }
      }
    else if (config.url!.endsWith('allreleases.xml')) data = xml.releases
    else data = '<a href="php_pdo_oci-1.2.0-8.4-ts-vs17-x64.zip">DLL</a>'
    return { config, data, status: 200, statusText: 'OK', headers: {} }
  }
  const installer = new WindowsExtensionInstaller()
  installer.profile = async () => profile
  const version = { bin: 'C:\\PHP\\php.exe', path: 'C:\\PHP' } as SoftInstalled
  const catalog = await installer.catalog(version, 'pdo', true)
  assert.ok(catalog.packages.some((item) => item.name === 'pecl:pdo_oci'))
  assert.ok(
    catalog.packages.some((item) => item.name === 'other/pdo_oci'),
    'unknown publisher kept independent'
  )
  const preparedPie = await installer.prepare(version, 'other/pdo_oci')
  assert.equal(preparedPie.source, 'pie')
  assert.deepEqual(
    preparedPie.releases.map((item) => item.version),
    ['v1.2.0', 'v1.1.0']
  )
  assert.equal(preparedPie.releases[0].compatible, null)
  assert.ok(
    !urls.some((url) => url.includes('/pdo_oci/')),
    'unknown publisher never probes same-name PECL'
  )
  await assert.rejects(installer.prepare(version, 'other/pdo_oci', 'v9.9.9'), /release/)
  assert.deepEqual(pieInstallArguments('C:\\PHP\\php.exe', 'other/pdo_oci', 'v1.2.0').slice(-1), [
    'other/pdo_oci:v1.2.0'
  ])
  assert.throws(() => pieInstallArguments('bin', 'other/pdo_oci', '1.2.0 --help'), /release/)
  const official = await installer.prepare(version, 'pecl:pdo_oci')
  assert.equal(official.releases[0].compatible, false)
  await assert.rejects(installer.install(version, 'pecl:pdo_oci', '1.3.0'), /compatible/)
  peclFailed = true
  const partialCatalog = await installer.catalog(version, 'pdo', true)
  assert.equal(partialCatalog.partial, true)
  assert.ok(partialCatalog.packages.some((item) => item.name === 'other/pdo_oci'))
  await assert.rejects(peclRepository.catalog('', true), /offline/)
} finally {
  axios.defaults.adapter = originalAdapter
  global.Server = server
}
console.log('PHP extension source identity, independent catalogs and pinned PIE preparation passed')

if (process.argv.includes('--live')) {
  const repository = new PeclRepository()
  for (const name of ['pdo_oci', 'solr', 'timezonedb']) {
    const prepared = await repository.prepare(`pecl:${name}`, profile)
    const latest = prepared.releases[0]
    assert.ok(latest, `${name}: official stable release exists`)
    assert.equal(
      latest.compatible,
      true,
      `${name}: PHP 8.4 TS VS17 x64 official archive found (${latest.error ?? 'no archive'})`
    )
    console.log(`Official PECL live discovery: ${name} ${latest.version} ${latest.url}`)
  }
}
