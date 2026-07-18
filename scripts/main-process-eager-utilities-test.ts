import assert from 'node:assert/strict'
import { debounce } from '../src/shared/debounce'
import { mergeProcessOptions } from '../src/shared/process-options'

const merged = mergeProcessOptions(
  { shell: '/bin/zsh', env: { PATH: '/usr/bin', HOME: '/tmp/home' } },
  { cwd: '/tmp/work', env: { PATH: '/custom/bin' } }
)
assert.deepEqual(merged, {
  shell: '/bin/zsh',
  cwd: '/tmp/work',
  env: { PATH: '/custom/bin', HOME: '/tmp/home' }
})

let calls = 0
let value = 0
const update = debounce((next: number) => {
  calls += 1
  value = next
}, 10)
update(1)
update(2)
await new Promise((resolve) => setTimeout(resolve, 25))
assert.equal(calls, 1)
assert.equal(value, 2)

console.log('main process eager utility tests passed')
