import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { X509Certificate } from 'node:crypto'
import { macOSCertificateIsTrusted } from '../src/fork/module/Host/CertificateTrust'

const directory = await mkdtemp(join(tmpdir(), 'flyenv-ca-trust-test-'))
try {
  for (const name of ['a', 'b']) {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:1024',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=FlyEnv-Root-CA',
        '-keyout',
        join(directory, name + '.key'),
        '-out',
        join(directory, name + '.crt')
      ],
      { stdio: 'ignore' }
    )
  }
  const path = join(directory, 'a.crt')
  const pem = await readFile(path, 'utf8')
  const other = await readFile(join(directory, 'b.crt'), 'utf8')
  const certificate = new X509Certificate(pem)
  const calls: string[][] = []
  const trusted = (args: string[]) => {
    calls.push(args)
    return Promise.resolve({ stdout: args[0] === 'find-certificate' ? pem : '' })
  }
  assert.equal(await macOSCertificateIsTrusted(path, certificate, trusted), true)
  assert.deepEqual(calls, [
    ['find-certificate', '-a', '-p', '-Z', '/Library/Keychains/System.keychain'],
    [
      'verify-cert',
      '-c',
      path,
      '-p',
      'basic',
      '-l',
      '-L',
      '-k',
      '/Library/Keychains/System.keychain'
    ]
  ])
  assert.equal(
    await macOSCertificateIsTrusted(path, certificate, async () => ({ stdout: other })),
    false,
    'same CN is not the same CA'
  )
  assert.equal(
    await macOSCertificateIsTrusted(path, certificate, async (args) => {
      if (args[0] === 'verify-cert') throw Object.assign(new Error('not trusted'), { code: 1 })
      return { stdout: pem }
    }),
    false
  )
  assert.equal(
    await macOSCertificateIsTrusted(path, certificate, async () => {
      throw Object.assign(new Error('empty'), { code: 44 })
    }),
    false
  )
  await assert.rejects(
    macOSCertificateIsTrusted(path, certificate, async () => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' })
    }),
    /denied/
  )
  await assert.rejects(
    macOSCertificateIsTrusted(path, certificate, async (args) => {
      if (args[0] === 'verify-cert')
        throw Object.assign(new Error('security missing'), { code: 'ENOENT' })
      return { stdout: pem }
    }),
    /security missing/
  )
  console.log(
    'macOS certificate trust: exact fingerprint, explicit system keychain and real verification failures passed'
  )
} finally {
  await rm(directory, { recursive: true, force: true })
}
