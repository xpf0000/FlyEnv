import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const result = spawnSync('node', ['src/lang/check.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8'
})

assert.equal(result.status, 0, result.stderr)

const output = `${result.stdout}\n${result.stderr}`

assert.equal(
  output.includes('• copilot-cli.cmd.help'),
  false,
  'check.mjs should not report copilotCli keys under the raw filename namespace'
)

assert.equal(
  output.includes('• claude-code.cmd.help'),
  false,
  'check.mjs should not report claudeCode keys under the raw filename namespace'
)

assert.equal(
  output.includes('  - copilot-cli.cmd.help'),
  false,
  'duplicate candidate output should use the registered copilotCli namespace'
)

assert.equal(
  output.includes('  - claude-code.cmd.help'),
  false,
  'duplicate candidate output should use the registered claudeCode namespace'
)

console.log('lang check namespace test passed')
