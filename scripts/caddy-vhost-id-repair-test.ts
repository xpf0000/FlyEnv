import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/fork/module/Caddy/index.ts', 'utf8')

assert.match(source, /import \{ makeCaddyConf \} from '\.\/Host'/)
assert.match(source, /import \{ vhostName \} from '\.\.\/Host\/vhostName'/)
assert.match(source, /const fileBase = vhostName\(host\)/)
assert.match(source, /await makeCaddyConf\(host\)/)
assert.match(source, /const legacyConf = join\(vhostDir, `\$\{host\.name\}\.conf`\)/)
assert.match(
  source,
  /const legacyLog = join\(global\.Server\.BaseDir!, `vhost\/logs\/\$\{host\.name\}\.caddy\.log`\)/
)
assert.match(source, /legacyConf !== confFile/)
assert.match(source, /legacyLog !== logFile/)
assert.match(source, /await removeByRoot\(legacyConf\)/)
assert.match(source, /await removeByRoot\(legacyLog\)/)

assert.doesNotMatch(source, /const confFile = join\(vhostDir, `\$\{name\}\.conf`\)/)
assert.doesNotMatch(source, /vhost\/logs\/\$\{hostName\}\.caddy\.log/)

console.log('caddy vhost id repair tests passed')
