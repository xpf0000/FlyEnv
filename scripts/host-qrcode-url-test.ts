import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const hostList = readFileSync(join(root, 'src/render/components/Host/ListTable.vue'), 'utf8')
const tomcatHostList = readFileSync(
  join(root, 'src/render/components/Host/Tomcat/ListTable.vue'),
  'utf8'
)

assert.match(hostList, /<QrcodePopper :url="siteName\(scope\.row\)">/)
assert.match(tomcatHostList, /<QrcodePopper :url="`http:\/\/\$\{siteName\(scope\.row\)\}`">/)
assert.doesNotMatch(hostList, /<QrcodePopper :url="scope\.row\.name">/)
assert.doesNotMatch(tomcatHostList, /<QrcodePopper :url="scope\.row\.name">/)

console.log('host QR code URL regression tests passed')
