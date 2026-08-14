import assert from 'node:assert/strict'
import { XMLParser } from 'fast-xml-parser'
import { makeTomcatServerXML } from '../src/fork/module/Tomcat/ServerXML'

;(global as any).Server = { BaseDir: '/tmp/flyenv-tomcat-test' }

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  attributesGroupName: ''
})

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

const host = (overrides: Record<string, any> = {}): any => ({
  id: 1,
  name: 'a.test',
  root: '/var/www/a-appbase',
  type: 'tomcat',
  useSSL: true,
  autoSSL: false,
  ssl: { cert: '/certs/a.crt', key: '/certs/a.key' },
  port: { tomcat: 8080, tomcat_ssl: 8443 },
  tomcat: { contexts: [], rewrite: { enabled: true, content: 'RewriteRule ^/$ /app/ [R=302,L]' } },
  ...overrides
})

const baseConfig = `<?xml version="1.0" encoding="UTF-8"?>
<Server><Service><Engine name="Catalina" defaultHost="localhost">
  <Host name="a.test" appBase="/var/www/old" appFlag="FlyEnv">
    <Context path="" docBase=""></Context>
    <Context path="/app" docBase="/var/www/app"><Resource name="jdbc/app" /></Context>
  </Host>
  <Host name="manual.test" appBase="/var/www/manual">
    <Context path="" docBase=""></Context>
  </Host>
</Engine></Service></Server>`

const created = makeTomcatServerXML('/tmp/tomcat/conf', baseConfig, [
  host(),
  host({
    id: 2,
    name: 'b.test',
    root: '/var/www/b-appbase',
    ssl: { cert: '/certs/b.crt', key: '/certs/b.key' }
  })
])
const httpOnlyWhenCertificateUnavailable = makeTomcatServerXML(
  '/tmp/tomcat/conf',
  '<Server><Service><Engine /></Service></Server>',
  [host()],
  []
)
const httpOnlyConnectors = asArray<any>(
  parser.parse(httpOnlyWhenCertificateUnavailable).Server.Service.Connector
)
assert.ok(httpOnlyConnectors.some((connector) => connector.port === '8080'))
assert.equal(
  httpOnlyConnectors.some((connector) => connector.port === '8443'),
  false
)
const parsed = parser.parse(created)
const hosts = asArray<any>(parsed.Server.Service.Engine.Host)
const flyEnvHost = hosts.find((item) => item.name === 'a.test')
const manualHost = hosts.find((item) => item.name === 'manual.test')
assert.equal(flyEnvHost.unpackWARs, 'true')
assert.equal(flyEnvHost.deployOnStartup, 'true')
assert.equal(flyEnvHost.autoDeploy, 'true')
const flyEnvContexts = asArray<any>(flyEnvHost.Context)
assert.equal(flyEnvContexts.length, 1)
assert.equal(flyEnvContexts[0].path, '/app')
assert.equal(flyEnvContexts[0].docBase, '/var/www/app')
assert.equal(manualHost.Context.path, '')
assert.equal(manualHost.Context.docBase, '')

const aValves = asArray<any>(flyEnvHost.Valve)
const flyEnvRewriteValve = aValves.find(
  (valve) =>
    valve.appFlag === 'FlyEnv' &&
    valve.className === 'org.apache.catalina.valves.rewrite.RewriteValve'
)
assert.equal(flyEnvRewriteValve.appFlag, 'FlyEnv')
assert.equal(flyEnvRewriteValve.className, 'org.apache.catalina.valves.rewrite.RewriteValve')

const connectors = asArray<any>(parsed.Server.Service.Connector)
const sslConnector = connectors.find((connector) => connector.port === '8443')
assert.equal(sslConnector.appFlag, 'FlyEnv')
assert.equal(sslConnector.SSLEnabled, 'true')
assert.equal(sslConnector.scheme, 'https')
assert.equal(sslConnector.secure, 'true')
assert.equal(sslConnector.defaultSSLHostConfigName, '_default_')
const configs = asArray<any>(sslConnector.SSLHostConfig)
const byName = new Map(configs.map((config) => [config.hostName, config]))
for (const name of ['_default_', 'a.test', 'b.test']) {
  assert.ok(byName.has(name), `missing SNI config for ${name}`)
}
assert.equal(byName.get('_default_').Certificate.certificateFile, '/certs/a.crt')
assert.equal(byName.get('a.test').Certificate.certificateKeyFile, '/certs/a.key')
assert.equal(byName.get('b.test').Certificate.certificateFile, '/certs/b.crt')
assert.equal(configs.length, 3)
assert.equal(hosts.filter((item) => item.appFlag === 'FlyEnv').length, 2)

const certificateReplaced = makeTomcatServerXML('/tmp/tomcat/conf', created, [
  host({ ssl: { cert: '/certs/a-new.crt', key: '/certs/a-new.key' } }),
  host({
    id: 2,
    name: 'b.test',
    root: '/var/www/b-appbase',
    ssl: { cert: '/certs/b.crt', key: '/certs/b.key' }
  })
])
const replacedConnector = asArray<any>(
  parser.parse(certificateReplaced).Server.Service.Connector
).find((connector) => connector.port === '8443')
const replacedA = asArray<any>(replacedConnector.SSLHostConfig).find(
  (config) => config.hostName === 'a.test'
)
assert.equal(replacedA.Certificate.certificateFile, '/certs/a-new.crt')
assert.equal(replacedA.Certificate.certificateKeyFile, '/certs/a-new.key')

const disabled = makeTomcatServerXML('/tmp/tomcat/conf', certificateReplaced, [
  host({
    useSSL: false,
    ssl: { cert: '', key: '' },
    tomcat: { contexts: [], rewrite: { enabled: false, content: '' } }
  }),
  host({
    id: 2,
    name: 'b.test',
    root: '/var/www/b-appbase',
    ssl: { cert: '/certs/b.crt', key: '/certs/b.key' }
  })
])
const disabledParsed = parser.parse(disabled)
const disabledA = asArray<any>(disabledParsed.Server.Service.Engine.Host).find(
  (item) => item.name === 'a.test'
)
assert.equal(
  asArray<any>(disabledA.Valve).find(
    (valve) =>
      valve.appFlag === 'FlyEnv' &&
      valve.className === 'org.apache.catalina.valves.rewrite.RewriteValve'
  ),
  undefined
)
const disabledSsl = asArray<any>(disabledParsed.Server.Service.Connector).find(
  (connector) => connector.port === '8443'
)
assert.equal(
  asArray<any>(disabledSsl.SSLHostConfig).find(
    (config) => config.appFlag === 'FlyEnv' && config.hostName === 'a.test'
  ),
  undefined
)

const manualConnector = `<?xml version="1.0" encoding="UTF-8"?>
<Server><Service><Connector port="9443" SSLEnabled="true" scheme="https" secure="true"/><Engine /></Service></Server>`
assert.throws(
  () =>
    makeTomcatServerXML('/tmp/tomcat/conf', manualConnector, [
      host({ port: { tomcat: 8080, tomcat_ssl: 9443 } })
    ]),
  /user-managed HTTPS Connector/
)

const manualHttpTlsConnector = `<?xml version="1.0" encoding="UTF-8"?>
<Server><Service><Connector port="8080" SSLEnabled="true" scheme="https" secure="true"/><Engine /></Service></Server>`
assert.throws(
  () => makeTomcatServerXML('/tmp/tomcat/conf', manualHttpTlsConnector, [host()]),
  /HTTPS Connector on HTTP port/
)

const manualSNI = `<?xml version="1.0" encoding="UTF-8"?>
<Server><Service><Connector appFlag="FlyEnv" port="8443" SSLEnabled="true"><SSLHostConfig hostName="a.test"/><SSLHostConfig /></Connector><Engine /></Service></Server>`
assert.throws(
  () => makeTomcatServerXML('/tmp/tomcat/conf', manualSNI, [host()]),
  /user-managed SSLHostConfig/
)

const manualRewriteValve = `<?xml version="1.0" encoding="UTF-8"?>
<Server><Service><Engine><Host name="a.test" appFlag="FlyEnv"><Valve className="org.apache.catalina.valves.rewrite.RewriteValve"/></Host></Engine></Service></Server>`
assert.throws(
  () => makeTomcatServerXML('/tmp/tomcat/conf', manualRewriteValve, [host()]),
  /user-managed RewriteValve/
)

assert.throws(
  () =>
    makeTomcatServerXML('/tmp/tomcat/conf', baseConfig, [
      host({
        tomcat: {
          contexts: [{ id: 'app', path: '/app', docBase: '/var/www/external-app.war' }],
          rewrite: { enabled: false, content: '' }
        }
      })
    ]),
  /user-managed inline Context/
)

assert.throws(
  () =>
    makeTomcatServerXML('/tmp/tomcat/conf', baseConfig, [
      host({ port: { tomcat: 8443, tomcat_ssl: 8443 } })
    ]),
  /same HTTP and HTTPS Connector port/
)

console.log('tomcat server.xml regression tests passed')
