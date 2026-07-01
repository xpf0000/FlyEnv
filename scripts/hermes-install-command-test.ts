import assert from 'node:assert/strict'
import {
  getHermesInstallCommandLines,
  getHermesInstallDisplayCommand,
  resolveHermesInstallPlatform
} from '../src/render/components/Hermes/install'

assert.equal(resolveHermesInstallPlatform('win32'), 'windows')
assert.equal(resolveHermesInstallPlatform('darwin'), 'macos')
assert.equal(resolveHermesInstallPlatform('linux'), 'linux')

assert.equal(
  getHermesInstallDisplayCommand('windows'),
  'powershell -ExecutionPolicy ByPass -c "irm https://hermes-agent.nousresearch.com/install.ps1 | iex"'
)
assert.equal(
  getHermesInstallDisplayCommand('macos'),
  'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash'
)
assert.equal(
  getHermesInstallDisplayCommand('linux'),
  'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash'
)

assert.deepEqual(
  getHermesInstallCommandLines('windows', {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    HERMES_TEST: "o'hara"
  }),
  [
    "$env:HTTPS_PROXY='http://127.0.0.1:7890'",
    "$env:HERMES_TEST='o''hara'",
    'powershell -ExecutionPolicy ByPass -c "irm https://hermes-agent.nousresearch.com/install.ps1 | iex"'
  ]
)

assert.deepEqual(
  getHermesInstallCommandLines('linux', {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    HERMES_TEST: 'value"$HOME`\\'
  }),
  [
    'export HTTPS_PROXY="http://127.0.0.1:7890"',
    'export HERMES_TEST="value\\"\\$HOME\\`\\\\"',
    'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash'
  ]
)

console.log('hermes-install-command-test: ok')
