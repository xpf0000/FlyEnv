import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runAiCliSessionTasks } from '../src/fork/util/AiCliSession'

let running = 0
let peak = 0

const results = await runAiCliSessionTasks(
  Array.from({ length: 9 }, (_, index) => async () => {
    running += 1
    peak = Math.max(peak, running)
    await new Promise((resolve) => setTimeout(resolve, 5))
    running -= 1
    return index
  })
)

assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8])
assert.equal(peak, 4)

const tolerantResults = await runAiCliSessionTasks([
  async () => 'first',
  async () => {
    throw new Error('unreadable session')
  },
  async () => 'last'
])

assert.deepEqual(tolerantResults, ['first', undefined, 'last'])

const root = join(import.meta.dirname, '..')
const sessionModules = [
  ['Antigravity', 'AntigravitySetup'],
  ['ClaudeCode', 'ClaudeCodeSetup'],
  ['Codex', 'CodexSetup'],
  ['CopilotCli', 'CopilotCliSetup'],
  ['Hermes', 'HermesSetup'],
  ['Kimi', 'KimiSetup'],
  ['OpenCode', 'OpenCodeSetup']
] as const

for (const [directory, setupName] of sessionModules) {
  const setup = readFileSync(
    join(root, 'src', 'render', 'components', directory, 'setup.ts'),
    'utf-8'
  )
  const view = readFileSync(
    join(root, 'src', 'render', 'components', directory, 'Sessions.vue'),
    'utf-8'
  )
  assert.match(setup, /sessionLoading = false/)
  assert.match(setup, /private sessionRefreshPromise/)
  assert.match(setup, /if \(this\.sessionRefreshPromise\)/)
  assert.match(setup, /this\.sessionLoading = true/)
  assert.match(setup, /this\.sessionLoading = false/)
  assert.match(view, new RegExp(`v-loading="${setupName}\\.sessionLoading"`))
  assert.match(view, new RegExp(`:disabled="${setupName}\\.sessionLoading"`))
  assert.match(view, new RegExp(`'fa-spin': ${setupName}\\.sessionLoading`))
}

console.log('ai-cli session list tests passed')
