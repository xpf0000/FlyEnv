import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const deepwiki = readFileSync(join(root, 'docs/deepwiki/tomcat.md'), 'utf8')
const openmrs = readFileSync(
  '/Users/x/Desktop/www/flyenv-tomcat-test/docs/openmrs-tomcat-demo.md',
  'utf8'
)

assert.equal(packageJson.scripts['test:tomcat-site'], 'tsx scripts/tomcat-site-test.ts')
assert.equal(packageJson.scripts['test:tomcat-site-save'], 'tsx scripts/tomcat-site-save-test.ts')
assert.equal(
  packageJson.scripts['test:tomcat'],
  'yarn test:tomcat-site && yarn test:tomcat-site-save && tsx scripts/tomcat-server-xml-test.ts'
)
assert.match(deepwiki, /conf\/Catalina\/<host>\//)
assert.match(deepwiki, /deployOnStartup="true"/)
assert.match(deepwiki, /reconcileTomcatBase\(\)/)
assert.match(deepwiki, /`ROOT`.*`\/`/)
assert.match(deepwiki, /Tomcat 自动部署/)
assert.match(deepwiki, /不生成 Context descriptor/)
assert.doesNotMatch(deepwiki, /makeCustomTomcatServerXML/)
assert.doesNotMatch(deepwiki, /别名|alias/i)
assert.match(openmrs, /Application mappings/)
assert.match(openmrs, /\/openmrs.*openmrs\.war/s)
assert.match(openmrs, /RewriteRule \^\/\$ \/openmrs\/ \[R=302,L\]/)
assert.doesNotMatch(openmrs, /<Context path="\/openmrs"/)
assert.doesNotMatch(openmrs, /deployOnStartup="false"/)

console.log('tomcat documentation tests passed')
