import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  contextDescriptorName,
  tomcatAutoSSLDeletionId,
  tomcatHostName,
  validateTomcatSite
} from '../src/fork/module/Tomcat/Site'

const root = await mkdtemp(join(tmpdir(), 'flyenv-tomcat-site-'))
const appBase = join(root, 'appBase')
const appBasePortal = join(appBase, 'portal')
const appBaseWar = join(appBase, 'openmrs.WAR')
const appBaseRootWar = join(appBase, 'ROOT.war')
const exploded = join(root, 'applications', 'portal')
const war = join(root, 'artifacts', 'openmrs.war')
await mkdir(appBase, { recursive: true })
await mkdir(appBasePortal, { recursive: true })
await writeFile(appBaseWar, 'not-a-real-war')
await writeFile(appBaseRootWar, 'not-a-real-war')
await mkdir(exploded, { recursive: true })
await mkdir(join(root, 'artifacts'), { recursive: true })
await writeFile(war, 'not-a-real-war')
await writeFile(join(root, 'README.txt'), 'not an application')

assert.equal(contextDescriptorName('/'), 'ROOT.xml')
assert.equal(contextDescriptorName('/openmrs'), 'openmrs.xml')
assert.equal(contextDescriptorName('/api/v1'), 'api#v1.xml')
assert.throws(() => contextDescriptorName('openmrs'), /start with "\//)
assert.throws(() => contextDescriptorName('/api//v1'), /empty segment/)
assert.throws(() => contextDescriptorName('/api/../v1'), /unsafe segment/)
assert.throws(() => contextDescriptorName('/api#v1'), /unsafe character/)
assert.throws(() => contextDescriptorName('/api\\v1'), /unsafe character/)
assert.throws(() => contextDescriptorName('/api?v=1'), /unsafe character/)

const site: any = {
  id: 9,
  type: 'tomcat',
  name: 'openmrs.test',
  root: appBase,
  useSSL: false,
  autoSSL: false,
  ssl: { cert: '', key: '' },
  port: { tomcat: 8080, tomcat_ssl: 8443 },
  tomcat: {
    contexts: [
      { id: 'root', path: '/', docBase: exploded },
      { id: 'openmrs', path: '/openmrs', docBase: war }
    ],
    rewrite: { enabled: false, content: '' }
  }
}

assert.equal(tomcatHostName(site), 'openmrs.test')
await validateTomcatSite(site, [])
await validateTomcatSite(
  { ...site, root: join(root, 'missing-app-base'), tomcat: { ...site.tomcat, contexts: [] } },
  [],
  { requireExistingPaths: false, validateCertificateFiles: false }
)
for (const unsafeName of ['../outside.test', 'openmrs/test', 'openmrs\\test', 'openmrs test']) {
  await assert.rejects(
    () => validateTomcatSite({ ...site, name: unsafeName }, []),
    /hostname is invalid/
  )
}
await assert.rejects(
  () =>
    validateTomcatSite(
      {
        ...site,
        tomcat: {
          ...site.tomcat,
          contexts: [
            { id: 'one', path: '/same', docBase: exploded },
            { id: 'two', path: '/same', docBase: war }
          ]
        }
      },
      []
    ),
  /duplicate Context path/
)
await assert.rejects(
  () =>
    validateTomcatSite(
      {
        ...site,
        tomcat: { ...site.tomcat, contexts: [{ id: 'inside', path: '/inside', docBase: appBase }] }
      },
      []
    ),
  /outside appBase/
)
await validateTomcatSite(
  {
    ...site,
    tomcat: {
      ...site.tomcat,
      contexts: [{ id: 'appbaseportal', path: '/portal', docBase: appBasePortal }]
    }
  },
  []
)
await validateTomcatSite(
  {
    ...site,
    tomcat: {
      ...site.tomcat,
      contexts: [{ id: 'appbasewar', path: '/openmrs', docBase: appBaseWar }]
    }
  },
  []
)
await validateTomcatSite(
  {
    ...site,
    tomcat: {
      ...site.tomcat,
      contexts: [{ id: 'appbaserootwar', path: '/', docBase: appBaseRootWar }]
    }
  },
  []
)
await assert.rejects(
  () =>
    validateTomcatSite(
      {
        ...site,
        tomcat: {
          ...site.tomcat,
          contexts: [{ id: 'appbasewrong', path: '/other', docBase: appBasePortal }]
        }
      },
      []
    ),
  /outside appBase/
)
await assert.rejects(
  () =>
    validateTomcatSite(
      {
        ...site,
        tomcat: {
          ...site.tomcat,
          contexts: [{ id: 'file', path: '/file', docBase: join(root, 'README.txt') }]
        }
      },
      []
    ),
  /directory or a \.war file/
)
await validateTomcatSite(site, [{ ...site, id: 10, name: 'other.test' }])
await assert.rejects(
  () =>
    validateTomcatSite(
      {
        ...site,
        useSSL: true,
        ssl: { cert: join(root, 'missing.crt'), key: join(root, 'missing.key') }
      },
      []
    ),
  /certificate and private key files must exist/
)
const cert = join(root, 'site.crt')
const key = join(root, 'site.key')
await writeFile(cert, 'certificate')
await writeFile(key, 'private key')
await validateTomcatSite({ ...site, useSSL: true, ssl: { cert, key } }, [])
await validateTomcatSite({ ...site, useSSL: true, autoSSL: true }, [])
assert.equal(tomcatAutoSSLDeletionId(site), undefined)
assert.equal(tomcatAutoSSLDeletionId({ ...site, autoSSL: true } as any), site.id)
assert.equal(tomcatAutoSSLDeletionId(site, { ...site, id: 10, autoSSL: true } as any), 10)
await assert.rejects(
  () => validateTomcatSite({ ...site, port: { tomcat: 0, tomcat_ssl: 8443 } }, []),
  /HTTP port must be an integer from 1 to 65535/
)
await assert.rejects(
  () => validateTomcatSite({ ...site, port: { tomcat: 8080, tomcat_ssl: 65536 } }, []),
  /HTTPS port must be an integer from 1 to 65535/
)
await assert.rejects(
  () => validateTomcatSite({ ...site, useSSL: true, port: { tomcat: 8443, tomcat_ssl: 8443 } }, []),
  /same HTTP and HTTPS port/
)
await assert.rejects(
  () => validateTomcatSite(site, [{ ...site, id: 10, name: 'OPENMRS.TEST' }]),
  /already belongs to another Tomcat site/
)

await rm(root, { recursive: true, force: true })
console.log('tomcat site validation tests passed')
