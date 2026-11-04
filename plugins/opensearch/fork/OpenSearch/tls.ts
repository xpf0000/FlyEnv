import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { hostname } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import YAML from 'yamljs'
import { resolveConfDir } from './homebrew'
import { OpenSearchT } from '../lang'

const require = createRequire(import.meta.url)
const forge = require('node-forge')

export type LocalTLSInput = { caCert: string; caKey: string }
export type LocalTLSResult = { directory: string; backup: string; caCert: string }

const operations = new Map<string, Promise<LocalTLSResult>>()
const configKey = (path: string) => resolve(resolveConfDir(path))
export const isTLSConfiguring = (path: string) => operations.has(configKey(path))

/** Preserve unrelated settings/comments, and retain existing node/admin identities. */
export function localTLSConfig(content: string, folder: string, nodeDN: string, adminDN: string) {
  const parsed = YAML.parse(content) ?? {}
  if (
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.plugins?.security ||
    Object.keys(parsed).some(
      (key) =>
        key.startsWith('plugins.security') &&
        parsed[key] &&
        typeof parsed[key] === 'object' &&
        !Array.isArray(parsed[key])
    )
  ) {
    throw new Error(OpenSearchT('tlsFlatConfigRequired'))
  }
  const identities = (key: string, dn: string) => {
    const existing = parsed[key]
    if (
      existing !== undefined &&
      (!Array.isArray(existing) || existing.some((value: unknown) => typeof value !== 'string'))
    ) {
      throw new Error(`${key}: ${OpenSearchT('tlsIdentityInvalid')}`)
    }
    return [...new Set([...(existing ?? []), dn])]
  }
  const settings: Record<string, unknown> = {
    'plugins.security.disabled': false,
    'plugins.security.ssl.transport.pemcert_filepath': `${folder}/node.pem`,
    'plugins.security.ssl.transport.pemkey_filepath': `${folder}/node-key.pem`,
    'plugins.security.ssl.transport.pemtrustedcas_filepath': `${folder}/root-ca.pem`,
    'plugins.security.ssl.http.enabled': true,
    'plugins.security.ssl.http.pemcert_filepath': `${folder}/node.pem`,
    'plugins.security.ssl.http.pemkey_filepath': `${folder}/node-key.pem`,
    'plugins.security.ssl.http.pemtrustedcas_filepath': `${folder}/root-ca.pem`,
    'plugins.security.nodes_dn': identities('plugins.security.nodes_dn', nodeDN),
    'plugins.security.authcz.admin_dn': identities('plugins.security.authcz.admin_dn', adminDN)
  }
  // Do not silently leave an alternative JKS/PFX or split transport TLS setup active.
  for (const key of Object.keys(parsed)) {
    if (
      /^plugins\.security\.ssl\.(transport|http)\.(?:key|trust)store|^plugins\.security\.ssl\.transport\.(?:server|client)\./.test(
        key
      )
    ) {
      throw new Error(`${key}: ${OpenSearchT('tlsCustomConfig')}`)
    }
  }
  const lines = content.split(/\r?\n/)
  const out: string[] = []
  let skipping = false
  for (const line of lines) {
    if (line.trim() === '# FlyEnv local TLS') continue
    if (!line.trim() || line.trimStart().startsWith('#')) {
      out.push(line)
      continue
    }
    const match = /^(?:["']([^"']+)["']|([A-Za-z_][\w.]*))\s*:/.exec(line)
    if (match) skipping = (match[1] ?? match[2]) in settings
    if (!skipping) out.push(line)
  }
  while (out.length && !out[out.length - 1].trim()) out.pop()
  out.push('', '# FlyEnv local TLS')
  for (const [key, value] of Object.entries(settings)) out.push(`${key}: ${JSON.stringify(value)}`)
  const updated = out.join('\n') + '\n'
  // Reject malformed/unsupported YAML before committing any configuration.
  const check = YAML.parse(updated)
  for (const [key, value] of Object.entries(settings)) {
    if (JSON.stringify(check[key]) !== JSON.stringify(value)) throw new Error(`Invalid ${key}`)
  }
  return updated
}

export function issueLocalCertificates(caPEM: string, keyPEM: string) {
  const { pki, md } = forge
  const ca = pki.certificateFromPem(caPEM)
  const caKey = pki.privateKeyFromPem(keyPEM)
  const now = new Date()
  if (
    !ca.getExtension('basicConstraints')?.cA ||
    (ca.getExtension('keyUsage') && !ca.getExtension('keyUsage').keyCertSign) ||
    ca.validity.notBefore > now ||
    ca.validity.notAfter <= now ||
    ca.publicKey.n.compareTo(caKey.n) !== 0 ||
    ca.publicKey.e.compareTo(caKey.e) !== 0
  ) {
    throw new Error(OpenSearchT('tlsCAInvalid'))
  }
  const token = randomBytes(8).toString('hex')
  const issue = (admin: boolean) => {
    const keys = pki.rsa.generateKeyPair(2048)
    const certificate = pki.createCertificate()
    certificate.publicKey = keys.publicKey
    certificate.serialNumber = `01${randomBytes(16).toString('hex')}`
    certificate.validity.notBefore = new Date(now.getTime() - 60_000)
    certificate.validity.notAfter = new Date(
      Math.min(ca.validity.notAfter.getTime(), now.getTime() + 365 * 24 * 60 * 60 * 1000)
    )
    const cn = `FlyEnv-OpenSearch-${admin ? 'Admin' : 'Node'}-${token}`
    certificate.setSubject([{ name: 'commonName', value: cn }])
    certificate.setIssuer(ca.subject.attributes)
    certificate.setExtensions([
      { name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', clientAuth: true, ...(!admin ? { serverAuth: true } : {}) },
      { name: 'subjectKeyIdentifier' },
      ...(!admin
        ? [
            {
              name: 'subjectAltName',
              altNames: [
                ...[...new Set(['localhost', hostname()])].map((value) => ({ type: 2, value })),
                { type: 7, ip: '127.0.0.1' },
                { type: 7, ip: '::1' }
              ]
            }
          ]
        : [])
    ])
    certificate.sign(caKey, md.sha256.create())
    return {
      cert: pki.certificateToPem(certificate),
      key: pki.privateKeyInfoToPem(pki.wrapRsaPrivateKey(pki.privateKeyToAsn1(keys.privateKey))),
      dn: `CN=${cn}`
    }
  }
  return { node: issue(false), admin: issue(true) }
}

export function configureLocalTLS(
  path: string,
  input: LocalTLSInput,
  validate?: () => Promise<void>
): Promise<LocalTLSResult> {
  const key = configKey(path)
  const existing = operations.get(key)
  if (existing) return existing
  const snapshot = { ...input }
  const operation = Promise.resolve()
    .then(async () => {
      await validate?.()
      return performConfiguration(key, snapshot)
    })
    .finally(() => operations.delete(key))
  operations.set(key, operation)
  return operation
}

async function performConfiguration(
  confDir: string,
  input: LocalTLSInput
): Promise<LocalTLSResult> {
  const file = join(confDir, 'opensearch.yml')
  const original = await readFile(file, 'utf8')
  const mode = (await stat(file)).mode & 0o777
  const [ca, key] = await Promise.all([
    readFile(input.caCert, 'utf8'),
    readFile(input.caKey, 'utf8')
  ])
  const certificates = issueLocalCertificates(ca, key)
  const directory = join(confDir, 'flyenv-tls', randomUUID())
  const folder = relative(confDir, directory).replaceAll('\\', '/')
  const updated = localTLSConfig(original, folder, certificates.node.dn, certificates.admin.dn)
  const backup = `${file}.flyenv-${randomUUID()}.bak`
  const temporary = `${file}.${randomUUID()}.tmp`
  await mkdir(directory, { recursive: true, mode: 0o700 })
  try {
    for (const [name, data] of Object.entries({
      'root-ca.pem': ca,
      'node.pem': certificates.node.cert,
      'node-key.pem': certificates.node.key,
      'admin.pem': certificates.admin.cert,
      'admin-key.pem': certificates.admin.key
    })) {
      await writeFile(join(directory, name), data, { mode: 0o600, flag: 'wx' })
    }
    await writeFile(backup, original, { mode, flag: 'wx' })
    await writeFile(temporary, updated, { mode, flag: 'wx' })
    if ((await readFile(file, 'utf8')) !== original)
      throw new Error(OpenSearchT('tlsConfigChanged'))
    await rename(temporary, file)
    return { directory, backup, caCert: input.caCert }
  } catch (error) {
    // Both paths are newly created here; never remove pre-existing certificates/backups.
    if (dirname(directory) !== join(confDir, 'flyenv-tls')) throw new Error('Invalid TLS directory')
    const cleanup = await Promise.allSettled([
      rm(directory, { recursive: true, force: true }),
      rm(temporary, { force: true })
    ])
    const failures = cleanup.filter((result) => result.status === 'rejected')
    if (failures.length)
      throw new Error(
        `${String(error)}\nTLS cleanup failed: ${failures.map((result) => String((result as PromiseRejectedResult).reason)).join('; ')}`
      )
    throw error
  }
}
