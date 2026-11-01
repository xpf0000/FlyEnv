import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SAMWAF_EXECUTABLES,
  filterStableReleases,
  parseAssetTarget,
  parseChecksums,
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
    // Gitee marks beta builds with prerelease=false; the tag suffix must
    // still exclude them (real Gitee payload, v1.3.24-beta.7).
    tag_name: 'v1.3.24-beta.7',
    prerelease: false,
    assets: [
      {
        name: 'SamWaf_Windows_x86_64.v1.3.24-beta.7.zip',
        browser_download_url:
          'https://gitee.com/samwaf/SamWaf/releases/download/v1.3.24-beta.7/SamWaf_Windows_x86_64.v1.3.24-beta.7.zip'
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

test('parses upstream checksums.txt with space-separated version names', () => {
  // Real format from SamWaf_1.3.24_checksums.txt on Gitee.
  const content = [
    'f7b853229ae1468f27c29a5121b6f410116d628476dda01b27d8de333a4ae62d  SamWaf_Linux_arm64 v1.3.24.tar.gz',
    '50071240229924b31ec260e76508d4d02d01b641be477113110a42ddd94e6b3e  SamWaf_Linux_x86_64 v1.3.24.tar.gz',
    '7796852f2f03e4a8a24e6352ce85ca86af0a1591fdc898085726f070a27b1a4c  SamWaf_Windows_x86_64 v1.3.24.zip',
    ''
  ].join('\n')
  const map = parseChecksums(content)
  assert.equal(
    map['SamWaf_Linux_arm64.v1.3.24.tar.gz'],
    'f7b853229ae1468f27c29a5121b6f410116d628476dda01b27d8de333a4ae62d'
  )
  assert.equal(
    map['SamWaf_Windows_x86_64.v1.3.24.zip'],
    '7796852f2f03e4a8a24e6352ce85ca86af0a1591fdc898085726f070a27b1a4c'
  )
  assert.equal(parseChecksums('')['anything'], undefined)
  assert.equal(Object.keys(parseChecksums('garbage line')).length, 0)
})
