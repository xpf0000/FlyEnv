import assert from 'node:assert/strict'
import {
  getCodexInstallCommandLines,
  getCodexInstallDisplayCommand,
  resolveCodexInstallPlatform
} from '../src/render/components/Codex/install'

assert.equal(resolveCodexInstallPlatform('win32'), 'windows')
assert.equal(resolveCodexInstallPlatform('darwin'), 'macos')
assert.equal(resolveCodexInstallPlatform('linux'), 'linux')

assert.equal(
  getCodexInstallDisplayCommand('windows'),
  'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"'
)
assert.equal(
  getCodexInstallDisplayCommand('macos'),
  'curl -fsSL https://chatgpt.com/codex/install.sh | sh'
)
assert.equal(
  getCodexInstallDisplayCommand('linux'),
  'curl -fsSL https://chatgpt.com/codex/install.sh | sh'
)

assert.deepEqual(
  getCodexInstallCommandLines('windows', {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    CODEX_TEST: "o'hara"
  }),
  [
    "$env:HTTPS_PROXY='http://127.0.0.1:7890'",
    "$env:CODEX_TEST='o''hara'",
    'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"'
  ]
)

assert.deepEqual(
  getCodexInstallCommandLines('linux', {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    CODEX_TEST: 'value"$HOME`\\'
  }),
  [
    'export HTTPS_PROXY="http://127.0.0.1:7890"',
    'export CODEX_TEST="value\\"\\$HOME\\`\\\\"',
    'curl -fsSL https://chatgpt.com/codex/install.sh | sh'
  ]
)

console.log('codex-install-command-test: ok')
