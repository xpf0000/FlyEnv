import assert from 'node:assert/strict'
import {
  buildProxyConfigCommand,
  parseProxyConfigCommand
} from '../src/shared/installProxyEnv'

const proxyEnv = {
  HTTPS_PROXY: 'http://127.0.0.1:7890',
  HTTP_PROXY: 'http://127.0.0.1:7890',
  ALL_PROXY: 'socks5://127.0.0.1:7890'
}

assert.equal(
  buildProxyConfigCommand('windows', proxyEnv),
  "$env:HTTPS_PROXY='http://127.0.0.1:7890'; $env:HTTP_PROXY='http://127.0.0.1:7890'; $env:ALL_PROXY='socks5://127.0.0.1:7890'"
)

assert.deepEqual(parseProxyConfigCommand(buildProxyConfigCommand('windows', proxyEnv)), proxyEnv)

assert.equal(
  buildProxyConfigCommand('linux', proxyEnv),
  'export HTTPS_PROXY="http://127.0.0.1:7890" HTTP_PROXY="http://127.0.0.1:7890" ALL_PROXY="socks5://127.0.0.1:7890"'
)

assert.deepEqual(parseProxyConfigCommand(buildProxyConfigCommand('linux', proxyEnv)), proxyEnv)

assert.deepEqual(
  parseProxyConfigCommand(
    'export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890'
  ),
  {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    HTTP_PROXY: 'http://127.0.0.1:7890'
  }
)

console.log('proxy-config-command-test: ok')
