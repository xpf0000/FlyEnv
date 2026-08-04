import assert from 'node:assert/strict'
import { XMLParser } from 'fast-xml-parser'
import { makeTomcatServerXML } from '../src/fork/module/Tomcat/ServerXML'

;(global as any).Server = { BaseDir: '/tmp/flyenv-tomcat-test' }

const tomcatHost: any = {
  id: 1,
  name: 'example.test',
  alias: '',
  root: '/var/www/example',
  type: 'tomcat',
  useSSL: false,
  ssl: { cert: '', key: '' },
  port: { tomcat: 8080 }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  attributesGroupName: ''
})

const baseConfig = `<?xml version="1.0" encoding="UTF-8"?>
<Server><Service><Engine name="Catalina" defaultHost="localhost" /></Service></Server>`

const created = makeTomcatServerXML('/tmp/tomcat/conf', baseConfig, [tomcatHost])
assert.doesNotMatch(created, /<Context(?:\s|>)/)

const existing = `<?xml version="1.0" encoding="UTF-8"?>
<Server><Service><Engine>
  <Host name="example.test" appBase="/var/www/old" appFlag="FlyEnv">
    <Context path="" docBase=""></Context>
    <Context path="/app" docBase="/var/www/app"><Resource name="jdbc/app" /></Context>
  </Host>
  <Host name="manual.test" appBase="/var/www/manual">
    <Context path="" docBase=""></Context>
  </Host>
</Engine></Service></Server>`

const repaired = makeTomcatServerXML('/tmp/tomcat/conf', existing, [tomcatHost])
const hosts = parser.parse(repaired).Server.Service.Engine.Host
const flyEnvHost = hosts.find((host: any) => host.name === 'example.test')
const manualHost = hosts.find((host: any) => host.name === 'manual.test')
const flyEnvContexts = Array.isArray(flyEnvHost.Context) ? flyEnvHost.Context : [flyEnvHost.Context]

assert.equal(flyEnvContexts.length, 1)
assert.equal(flyEnvContexts[0].path, '/app')
assert.equal(flyEnvContexts[0].docBase, '/var/www/app')
assert.equal(manualHost.Context.path, '')
assert.equal(manualHost.Context.docBase, '')

console.log('tomcat server.xml regression tests passed')
