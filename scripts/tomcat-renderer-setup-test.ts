import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const setup = readFileSync(join(root, 'src/render/components/Tomcat/setup.ts'), 'utf8')
const aside = readFileSync(join(root, 'src/render/components/Tomcat/aside.vue'), 'utf8')
const index = readFileSync(join(root, 'src/render/components/Tomcat/Index.vue'), 'utf8')
const config = readFileSync(join(root, 'src/render/components/Tomcat/Config.vue'), 'utf8')
const logs = readFileSync(join(root, 'src/render/components/Tomcat/Logs.vue'), 'utf8')

assert.match(setup, /init: \(\) => Promise<void>/)
assert.match(setup, /export const tomcatCatalinaBase = \(version: SoftInstalled\)/)
assert.match(setup, /export const tomcatDefaultCatalinaBase = \(version: SoftInstalled\)/)
assert.match(aside, /await TomcatSetup\.init\(\)/)
assert.match(aside, /resolve\(\[tomcatCatalinaBase\(version\)\]\)/)
assert.match(index, /tomcatCatalinaBase\(currentVersion\.value\)/)
assert.match(config, /tomcatCatalinaBase\(currentVersion\.value as SoftInstalled\)/)
assert.match(logs, /tomcatCatalinaBase\(currentVersion\.value as SoftInstalled\)/)

console.log('tomcat renderer setup tests passed')
