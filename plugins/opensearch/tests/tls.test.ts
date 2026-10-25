import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import YAML from 'yamljs'
import {
  configureLocalTLS,
  isTLSConfiguring,
  issueLocalCertificates,
  localTLSConfig
} from '../fork/OpenSearch/tls'

const { pki, md } = createRequire(import.meta.url)('node-forge')
const keys = pki.rsa.generateKeyPair(2048)
const ca = pki.createCertificate()
ca.publicKey = keys.publicKey
ca.serialNumber = '01'
ca.validity.notBefore = new Date(Date.now() - 60_000)
ca.validity.notAfter = new Date(Date.now() + 86_400_000)
ca.setSubject([{ name: 'commonName', value: 'FlyEnv test CA' }])
ca.setIssuer(ca.subject.attributes)
ca.setExtensions([
  { name: 'basicConstraints', cA: true },
  { name: 'keyUsage', keyCertSign: true }
])
ca.sign(keys.privateKey, md.sha256.create())
const caPEM = pki.certificateToPem(ca)
const keyPEM = pki.privateKeyToPem(keys.privateKey)

test('reuses a CA to issue distinct node/admin identities with PKCS8, SAN and transport EKUs', () => {
  const certificates = issueLocalCertificates(caPEM, keyPEM)
  assert.notEqual(certificates.node.dn, certificates.admin.dn)
  for (const issued of [certificates.node, certificates.admin]) {
    const cert = pki.certificateFromPem(issued.cert)
    assert.equal(ca.verify(cert), true)
    assert.ok(cert.validity.notAfter <= ca.validity.notAfter)
    assert.match(issued.key, /^-----BEGIN PRIVATE KEY-----/)
    assert.equal(cert.getExtension('extKeyUsage').clientAuth, true)
  }
  const node = pki.certificateFromPem(certificates.node.cert)
  assert.equal(node.getExtension('extKeyUsage').serverAuth, true)
  assert.ok(
    node.getExtension('subjectAltName').altNames.some((item: any) => item.value === 'localhost')
  )
  assert.ok(
    node.getExtension('subjectAltName').altNames.some((item: any) => item.ip === '127.0.0.1')
  )
  assert.throws(() => issueLocalCertificates(certificates.node.cert, certificates.node.key), /CA/)
  assert.throws(() => issueLocalCertificates(caPEM, certificates.node.key), /CA/)
})

test('keeps unrelated config and existing identities, replaces only TLS keys and enables security', () => {
  const original =
    '# my cluster\ncluster.name: custom\nplugins.security.disabled: true\nplugins.security.nodes_dn:\n  - "CN=existing-node"\nplugins.security.authcz.admin_dn: ["CN=existing-admin"]\nplugins.security.ssl.http.pemcert_filepath: "old.pem"\n# retained comment\nhttp.port: 19200\n'
  const updated = localTLSConfig(original, 'flyenv-tls/test', 'CN=new-node', 'CN=new-admin')
  const config = YAML.parse(updated)
  assert.equal(config['cluster.name'], 'custom')
  assert.equal(config['http.port'], 19200)
  assert.equal(config['plugins.security.disabled'], false)
  assert.deepEqual(config['plugins.security.nodes_dn'], ['CN=existing-node', 'CN=new-node'])
  assert.deepEqual(config['plugins.security.authcz.admin_dn'], [
    'CN=existing-admin',
    'CN=new-admin'
  ])
  assert.equal(config['plugins.security.ssl.http.pemcert_filepath'], 'flyenv-tls/test/node.pem')
  assert.equal(config['plugins.security.allow_default_init_securityindex'], undefined)
  assert.match(updated, /# retained comment/)
  assert.equal((updated.match(/^plugins.security.ssl.http.pemcert_filepath:/gm) ?? []).length, 1)
  assert.throws(() => localTLSConfig('plugins:\n  security:\n    disabled: true\n', 'a', 'n', 'a'))
  assert.throws(() =>
    localTLSConfig('plugins.security.ssl.transport.keystore_filepath: custom.jks', 'a', 'n', 'a')
  )
  assert.throws(() => localTLSConfig('plugins.security.nodes_dn: invalid', 'a', 'n', 'a'))
})

test('configuration snapshots, duplicate guard, backup, failure/retry and CA private key preservation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'FlyEnv OpenSearch TLS '))
  try {
    const conf = join(root, 'config')
    await mkdir(conf)
    const file = join(conf, 'opensearch.yml')
    const original = 'cluster.name: test\n'
    await writeFile(file, original)
    const input = { caCert: join(root, 'ca.pem'), caKey: join(root, 'ca-key.pem') }
    await writeFile(input.caCert, caPEM)
    await writeFile(input.caKey, keyPEM)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = configureLocalTLS(root, input, () => gate)
    assert.equal(isTLSConfiguring(root), true)
    assert.equal(configureLocalTLS(root, { caCert: 'bad', caKey: 'bad' }), first)
    release()
    const result = await first
    assert.equal(isTLSConfiguring(root), false)
    assert.equal(await readFile(result.backup, 'utf8'), original)
    assert.equal(await readFile(input.caKey, 'utf8'), keyPEM)
    assert.equal(await readFile(input.caCert, 'utf8'), caPEM)
    assert.deepEqual((await readdir(result.directory)).sort(), [
      'admin-key.pem',
      'admin.pem',
      'node-key.pem',
      'node.pem',
      'root-ca.pem'
    ])
    const successful = await readFile(file, 'utf8')
    await assert.rejects(configureLocalTLS(root, { caCert: 'missing', caKey: 'missing' }))
    assert.equal(isTLSConfiguring(root), false)
    assert.equal(await readFile(file, 'utf8'), successful)
    await assert.rejects(
      configureLocalTLS(root, input, async () => {
        throw new Error('service running')
      }),
      /service running/
    )
    assert.equal(await readFile(file, 'utf8'), successful)
    await configureLocalTLS(root, input)
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'FlyEnv OpenSearch TLS ')))
    await rm(root, { recursive: true, force: true })
  }
})

test('renderer controller retains progress across page re-entry, coalesces requests, cleans listeners and retries', async () => {
  const compiled = await build({
    entryPoints: [join(import.meta.dirname, '../render/LocalTLS.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'ui-fixture',
        setup(builder) {
          builder.onResolve(
            { filter: /^(?:@\/util\/(?:IPC|Index|Element)|\.\/lang)$/ },
            (args) => ({ path: args.path, namespace: 'fixture' })
          )
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents:
              'export const reactiveBind = v => v; export const OpenSearchT = v => v; export const MessageError = () => {}; export const MessageSuccess = () => {}; export default {};'
          }))
        }
      }
    ]
  })
  const { OpenSearchLocalTLS } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
  )
  let callback!: (key: string, response: any) => void
  let requests = 0
  const removed: string[] = []
  const notices: string[] = []
  let sent: any[] = []
  const controller = new OpenSearchLocalTLS({
    ipc: {
      send: (...args: any[]) => {
        sent = args
        requests++
        return {
          key: 'tls',
          then: (fn: typeof callback) => {
            callback = fn
          }
        }
      },
      off: (key: string) => removed.push(key)
    },
    success: (message: string) => notices.push(message),
    error: (message: string) => notices.push(message)
  })
  const version = { path: '/opensearch', run: false }
  const input = { caCert: '/ca.pem', caKey: '/ca-key.pem' }
  const first = controller.configure(version, input)
  version.path = '/changed'
  input.caCert = '/changed'
  assert.equal(controller.configure(version, input), first)
  assert.equal(requests, 1)
  assert.equal(sent[2].path, '/opensearch')
  assert.equal(sent[3].caCert, '/ca.pem')
  callback('tls', { code: 200 })
  assert.equal(controller.applying, true)
  assert.deepEqual(removed, [])
  callback('tls', { code: 0, data: { directory: '/certs', backup: '/backup' } })
  assert.equal(await first, true)
  assert.equal(controller.applying, false)
  assert.equal(controller.resultPath, '/opensearch')
  assert.deepEqual(removed, ['tls'])
  const retry = controller.configure(version, input)
  callback('tls', { code: 1, msg: 'CA missing' })
  assert.equal(await retry, false)
  assert.equal(controller.applying, false)
  assert.ok(notices.includes('CA missing'))
})
