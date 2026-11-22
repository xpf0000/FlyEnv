import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultSettings, parseConfig, settingsFromConfig, updateConfig } from '../config'
import type { NtpSettings } from '../config'
import { releaseTarget, selectRelease } from '../fork/release'

test('defaults listen on all IPv4 interfaces with configurable upstream time', () => {
  const settings = defaultSettings()
  const config = updateConfig({}, settings)
  assert.deepEqual(settingsFromConfig(config), settings)
  assert.deepEqual(config.ntp, { listenAddress: '0.0.0.0:12300', logRequests: true })
  assert.equal(settingsFromConfig({ ntp: { listenAddress: '127.0.0.1:12300' } }).host, '127.0.0.1')
  assert.equal(config.clock?.mode, 'real')
  assert.equal(config.upstream?.enabled, true)
  assert.equal(config.api?.enabled, false)
})

test('switching clock modes clears stale values and preserves native configuration', () => {
  const settings = {
    ...defaultSettings(),
    host: '::1',
    mode: 'frozen' as const,
    frozenTime: '2030-02-01T12:00:00+08:00'
  }
  const frozen = updateConfig({ ntp: { workers: 4 } }, settings)
  assert.equal(frozen.ntp?.listenAddress, '[::1]:12300')
  assert.equal(frozen.ntp?.workers, 4)
  assert.equal(frozen.clock?.frozenTime, '2030-02-01T04:00:00.000Z')
  const offset = updateConfig(frozen, { ...settings, mode: 'offset', offsetSeconds: -7200 })
  assert.deepEqual(offset.clock, { mode: 'offset', offsetSeconds: -7200 })
  assert.deepEqual(updateConfig(offset, { ...settings, mode: 'real' }).clock, { mode: 'real' })
})

test('the editor draft keeps advanced JSON fields when quick settings change the listener', () => {
  const raw = parseConfig(
    '\uFEFF{"ntp":{"listenAddress":":123","workers":4},"api":{"enabled":true}}'
  )
  const settings = settingsFromConfig(raw)
  assert.equal(settings.host, '::')
  const changed = updateConfig(raw, { ...settings, port: 12300 })
  assert.equal(changed.ntp?.listenAddress, '[::]:12300')
  assert.equal(changed.ntp?.workers, 4)
  assert.equal(changed.api?.enabled, true)
  assert.equal(raw.ntp?.listenAddress, ':123')
  assert.throws(() => parseConfig('[]'), /invalidConfig/)
})

test('invalid frozen dates, offsets, ports and empty active upstreams fail validation', () => {
  const settings = defaultSettings()
  const invalidSettings: Partial<NtpSettings>[] = [
    { mode: 'frozen', frozenTime: '2030-02-30T10:00:00Z' },
    { mode: 'frozen', frozenTime: '2030-01-01T10:00:00' },
    { mode: 'offset', offsetSeconds: 2147483648 },
    { mode: 'offset', offsetSeconds: 1.5 },
    { host: '127.0.0.1:123' },
    { port: 0 },
    { upstreamServers: '' }
  ]
  for (const invalid of invalidSettings) {
    assert.throws(() => updateConfig({}, { ...settings, ...invalid }))
  }
})

const digest = 'a'.repeat(64)
const publishedAsset = (version: string, name: string) => ({
  name,
  state: 'uploaded',
  digest: `sha256:${digest}`,
  browser_download_url: `https://github.com/xpf0000/ntp-server/releases/download/v${version}/${name}`
})

test('all six published builds use the release tag and exact host asset', () => {
  for (const platform of ['darwin', 'linux', 'win32']) {
    for (const arch of ['x64', 'arm64']) {
      const name = `ntp-server-${platform === 'win32' ? 'windows' : platform}-${arch === 'x64' ? 'amd64' : arch}`
      const target = releaseTarget(platform, arch)
      assert.ok(target)
      assert.equal(target.executable, name + (platform === 'win32' ? '.exe' : ''))
      const asset = publishedAsset('0.0.3', `${name}.zip`)
      assert.deepEqual(selectRelease({ tag_name: 'v0.0.3', assets: [asset] }, target), {
        version: '0.0.3',
        url: asset.browser_download_url,
        sha256: digest
      })
    }
  }
  assert.equal(releaseTarget('win32', 'ia32'), undefined)
})

test('incomplete or unverifiable releases are skipped individually', () => {
  const target = releaseTarget('win32', 'x64')!
  const release = (v: string, asset = publishedAsset(v, target.archive)) => ({
    tag_name: `v${v}`,
    assets: [asset]
  })
  for (const unsupported of [
    release('0.1.0', publishedAsset('0.1.0', 'ntp-server-windows-arm64.zip')),
    { ...release('1.0.0'), draft: true },
    { ...release('1.1.0'), prerelease: true },
    release('0.2.0', { ...publishedAsset('0.2.0', target.archive), digest: '' }),
    release('0.3.0', {
      ...publishedAsset('0.3.0', target.archive),
      browser_download_url: 'https://example.com/file.zip'
    })
  ]) {
    assert.equal(selectRelease(unsupported, target), undefined)
  }
  assert.equal(selectRelease(release('0.0.10'), target)?.version, '0.0.10')
})
