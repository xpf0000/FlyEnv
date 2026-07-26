import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reconcileSystemHostsBlock } from '../src/fork/module/Host/SystemHostsBlock'

const block = '#X-HOSTS-BEGIN#\n127.0.0.1     demo.test\n#X-HOSTS-END#'

assert.deepEqual(reconcileSystemHostsBlock('127.0.0.1 localhost\n', ''), {
  content: '127.0.0.1 localhost\n',
  changed: false
})
assert.deepEqual(reconcileSystemHostsBlock(`127.0.0.1 localhost\n${block}`, block), {
  content: `127.0.0.1 localhost\n${block}`,
  changed: false
})
assert.deepEqual(reconcileSystemHostsBlock('127.0.0.1 localhost', block), {
  content: `127.0.0.1 localhost\n${block}`,
  changed: true
})
assert.deepEqual(reconcileSystemHostsBlock(`127.0.0.1 localhost\n${block}`, ''), {
  content: '127.0.0.1 localhost\n',
  changed: true
})

const source = readFileSync(join(process.cwd(), 'src/fork/module/Host/index.ts'), 'utf8')
assert.match(source, /reconcileSystemHostsBlock\(content, x\)/)
assert.match(source, /if \(result\.changed\) \{\s*await writeFileByRoot\(this\.hostsFile, result\.content\)/)

console.log('hosts idempotent write checks passed')
