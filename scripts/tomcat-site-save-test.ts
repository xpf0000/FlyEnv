import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  reconcileTomcatBase,
  restoreTomcatBase,
  snapshotTomcatBase
} from '../src/fork/module/Tomcat/ServerXML'

;(global as any).Server = { BaseDir: '/tmp/flyenv-tomcat-test' }

const root = await mkdtemp(join(tmpdir(), 'flyenv-tomcat-save-'))
const base = join(root, 'tomcat')
const appBase = join(root, 'appBase')
const nativePortal = join(appBase, 'portal')
const exploded = join(root, 'applications', 'portal')
const war = join(root, 'artifacts', 'openmrs.war')
const hostDir = join(base, 'conf', 'Catalina', 'openmrs.test')
await mkdir(appBase, { recursive: true })
await mkdir(nativePortal, { recursive: true })
await mkdir(exploded, { recursive: true })
await mkdir(join(root, 'artifacts'), { recursive: true })
await mkdir(hostDir, { recursive: true })
await writeFile(
  join(base, 'conf', 'server.xml'),
  '<?xml version="1.0" encoding="UTF-8"?><Server><Service><Engine /></Service></Server>'
)
await writeFile(war, 'war')
await writeFile(join(hostDir, 'manual.xml'), '<Context docBase="/manual" />\n')
await writeFile(join(hostDir, 'ROOT.xml'), '<Context docBase="/manual-root" />\n')
await writeFile(
  join(hostDir, 'portal.xml'),
  '<!-- FlyEnv Tomcat Context site=9 context=portal -->\n<Context docBase="/previous/portal" />\n'
)

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
      { id: 'api', path: '/api/v1', docBase: war },
      { id: 'portal', path: '/portal', docBase: nativePortal }
    ],
    rewrite: { enabled: true, content: 'RewriteRule ^/$ /openmrs/ [R=302,L]' }
  }
}

await assert.rejects(() => reconcileTomcatBase(base, [site]), /user-managed Context descriptor/)
await rm(join(hostDir, 'ROOT.xml'))
await reconcileTomcatBase(base, [site])
assert.equal(
  await readFile(join(base, 'conf/Catalina/openmrs.test/ROOT.xml'), 'utf8'),
  `<!-- FlyEnv Tomcat Context site=9 context=root -->\n<Context docBase="${exploded}" />\n`
)
assert.equal(
  await readFile(join(base, 'conf/Catalina/openmrs.test/api#v1.xml'), 'utf8'),
  `<!-- FlyEnv Tomcat Context site=9 context=api -->\n<Context docBase="${war}" />\n`
)
await assert.rejects(() => readFile(join(hostDir, 'portal.xml'), 'utf8'))
assert.equal(
  await readFile(join(hostDir, 'rewrite.config'), 'utf8'),
  '# FlyEnv Tomcat Rewrite site=9\nRewriteRule ^/$ /openmrs/ [R=302,L]\n'
)
assert.equal(await readFile(join(hostDir, 'manual.xml'), 'utf8'), '<Context docBase="/manual" />\n')

const renamed = {
  ...site,
  name: 'portal.test',
  tomcat: { ...site.tomcat, rewrite: { enabled: false, content: '' } }
}
await reconcileTomcatBase(base, [renamed])
await assert.rejects(() => readFile(join(hostDir, 'ROOT.xml'), 'utf8'))
await assert.rejects(() => readFile(join(hostDir, 'rewrite.config'), 'utf8'))
assert.equal(await readFile(join(hostDir, 'manual.xml'), 'utf8'), '<Context docBase="/manual" />\n')

const manualRewrite = join(base, 'conf', 'Catalina', 'portal.test', 'rewrite.config')
await writeFile(manualRewrite, '# Manual rewrite\nRewriteRule ^/$ /manual/ [L]\n')
const nestedManual = join(base, 'conf', 'Catalina', 'portal.test', 'manual', 'nested.xml')
await mkdir(join(base, 'conf', 'Catalina', 'portal.test', 'manual'), { recursive: true })
await writeFile(nestedManual, '<Context docBase="/nested" />\n')
await assert.rejects(
  () =>
    reconcileTomcatBase(base, [
      {
        ...renamed,
        tomcat: {
          ...renamed.tomcat,
          rewrite: { enabled: true, content: 'RewriteRule ^/$ /openmrs/ [R=302,L]' }
        }
      }
    ]),
  /user-managed rewrite.config/
)
assert.equal(
  await readFile(manualRewrite, 'utf8'),
  '# Manual rewrite\nRewriteRule ^/$ /manual/ [L]\n'
)
assert.match(await readFile(join(base, 'conf', 'server.xml'), 'utf8'), /deployOnStartup="true"/)

const snapshot = await snapshotTomcatBase(base)
const serverBeforeFailedSave = await readFile(join(base, 'conf', 'server.xml'), 'utf8')
const manualBeforeFailedSave = await readFile(manualRewrite, 'utf8')
await assert.rejects(
  () =>
    reconcileTomcatBase(base, [
      {
        ...renamed,
        tomcat: {
          ...renamed.tomcat,
          rewrite: { enabled: true, content: 'RewriteRule ^/$ /replacement/ [L]' }
        }
      }
    ]),
  /user-managed rewrite.config/
)
await restoreTomcatBase(base, snapshot)
assert.equal(await readFile(join(base, 'conf', 'server.xml'), 'utf8'), serverBeforeFailedSave)
assert.equal(await readFile(manualRewrite, 'utf8'), manualBeforeFailedSave)
assert.equal(await readFile(nestedManual, 'utf8'), '<Context docBase="/nested" />\n')

await rm(root, { recursive: true, force: true })
console.log('tomcat site file reconciliation tests passed')
