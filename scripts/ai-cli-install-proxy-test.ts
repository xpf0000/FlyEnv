import assert from 'node:assert/strict'
import { buildInstallProxyEnvCommands } from '../src/shared/installProxyEnv'

assert.deepEqual(buildInstallProxyEnvCommands('windows', {}), [])
assert.deepEqual(buildInstallProxyEnvCommands('linux', {}), [])

assert.deepEqual(
  buildInstallProxyEnvCommands('windows', {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    APOSTROPHE: "o'hara",
    SPECIAL: 'value"$HOME`\\path'
  }),
  [
    "$env:HTTPS_PROXY='http://127.0.0.1:7890'",
    "$env:APOSTROPHE='o''hara'",
    `$env:SPECIAL='value"$HOME\`\\path'`
  ]
)

assert.deepEqual(
  buildInstallProxyEnvCommands('linux', {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    APOSTROPHE: "o'hara",
    SPECIAL: 'value"$HOME`\\path'
  }),
  [
    'export HTTPS_PROXY="http://127.0.0.1:7890"',
    `export APOSTROPHE="o'hara"`,
    'export SPECIAL="value\\"\\$HOME\\`\\\\path"'
  ]
)

console.log('ai-cli-install-proxy-test: ok')
