import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SAMWAF_EXECUTABLES,
  filterStableReleases,
  parseAssetTarget,
  pickAsset,
  releaseVersionNum,
  sha256OfDigest,
  type SamWafRelease
} from '../fork/SamWaf/release'

const releases: SamWafRelease[] = [
  {
    tag_name: 'v1.3.25-beta.9',
    prerelease: true,
    assets: [
      {
        name: 'SamWaf_Linux_x86_64.v1.3.25-beta.9.tar.gz',
        browser_download_url:
          'https://github.com/samwafgo/SamWaf/releases/download/v1.3.25-beta.9/SamWaf_Linux_x86_64.v1.3.25-beta.9.tar.gz',
        digest: 'sha256:0b57556bdf81a3b6cc2e642ce8e2a6ea50799ce7f4922a3d23ff295b619afb5a'
      }
    ]
  },
  {
    tag_name: 'v1.3.24',
    prerelease: false,
    assets: [
      {
        name: 'SamWaf_Windows_x86_64.v1.3.24.zip',
        browser_download_url:
          'https://github.com/samwafgo/SamWaf/releases/download/v1.3.24/SamWaf_Windows_x86_64.v1.3.24.zip',
        digest: 'sha256:aaaa5633bdf81a3b6cc2e642ce8e2a6ea50799ce7f4922a3d23ff295b619afb5'
      },
      {
        name: 'SamWaf_Darwin_arm64.v1.3.24.tar.gz',
        browser_download_url:
          'https://github.com/samwafgo/SamWaf/releases/download/v1.3.24/SamWaf_Darwin_arm64.v1.3.24.tar.gz',
        digest: 'sha256:bbbb5633bdf81a3b6cc2e642ce8e2a6ea50799ce7f4922a3d23ff295b619afb5'
      }
    ]
  }
]

test('parses every supported asset target and rejects foreign ones', () => {
  assert.deepEqual(parseAssetTarget('SamWaf_Windows_x86_64.v1.3.24.zip'), {
    platform: 'windows',
    arch: 'x64',
    ext: 'zip',
    executable: 'SamWaf64.exe'
  })
  assert.deepEqual(parseAssetTarget('SamWaf_Linux_arm64.v1.3.24.tar.gz'), {
    platform: 'linux',
    arch: 'arm64',
    ext: 'tar.gz',
    executable: 'SamWafLinuxArm64'
  })
  assert.deepEqual(parseAssetTarget('SamWaf_Darwin_arm64.v1.3.24.tar.gz'), {
    platform: 'macos',
    arch: 'arm64',
    ext: 'tar.gz',
    executable: 'SamWafDarwinArm64'
  })
  assert.equal(parseAssetTarget('checksums.txt'), undefined)
  assert.equal(parseAssetTarget('SamWaf_Linux_386.v1.3.24.tar.gz'), undefined)
})

test('keeps only stable releases and picks the host asset with its sha256', () => {
  const stable = filterStableReleases(releases)
  assert.equal(stable.length, 1)
  assert.equal(stable[0].tag_name, 'v1.3.24')
  const picked = pickAsset(stable[0], 'macos', 'arm64')
  assert.ok(picked)
  assert.equal(picked.version, 'v1.3.24')
  assert.equal(picked.executable, 'SamWafDarwinArm64')
  assert.equal(
    picked.sha256,
    'bbbb5633bdf81a3b6cc2e642ce8e2a6ea50799ce7f4922a3d23ff295b619afb5'
  )
  assert.equal(pickAsset(stable[0], 'linux', 'x64'), undefined)
})

test('extracts sha256 only from well-formed digest fields', () => {
  assert.equal(sha256OfDigest('sha256:' + 'a'.repeat(64)), 'a'.repeat(64))
  assert.equal(sha256OfDigest('md5:deadbeef'), undefined)
  assert.equal(sha256OfDigest(undefined), undefined)
  assert.equal(sha256OfDigest('sha256:not-hex'), undefined)
})

test('computes a sortable version number from tags with and without v prefix', () => {
  assert.equal(releaseVersionNum('v1.3.24'), 10324)
  assert.equal(releaseVersionNum('1.10.0'), 11000)
  assert.equal(releaseVersionNum('garbage'), 0)
})

test('executable table stays in sync with the parser', () => {
  for (const [key, executable] of Object.entries(SAMWAF_EXECUTABLES)) {
    const [platform, arch] = key.split('/')
    const asset =
      `SamWaf_${platform === 'windows' ? 'Windows' : platform === 'linux' ? 'Linux' : 'Darwin'}` +
      `_${arch === 'x64' ? 'x86_64' : 'arm64'}.v0.0.0.${platform === 'windows' ? 'zip' : 'tar.gz'}`
    assert.equal(parseAssetTarget(asset)?.executable, executable, `${key} mismatch`)
  }
})
