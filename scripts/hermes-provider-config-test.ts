import assert from 'node:assert/strict'
import { HermesProviders } from '../src/render/components/Hermes/providers'

const provider = HermesProviders.find((item) => item.name === 'MiniMax')

assert.ok(provider, 'MiniMax should be available in the Hermes provider registry')
assert.equal(provider.baseUrl, 'https://api.minimax.io/v1')
assert.deepEqual(provider.models, ['MiniMax-M3', 'MiniMax-M2.7'])
assert.deepEqual(provider.endpoints, [
  {
    region: 'global_en',
    protocol: 'openai',
    baseUrl: 'https://api.minimax.io/v1'
  },
  {
    region: 'global_en',
    protocol: 'anthropic',
    baseUrl: 'https://api.minimax.io/anthropic'
  },
  {
    region: 'cn_zh',
    protocol: 'openai',
    baseUrl: 'https://api.minimaxi.com/v1'
  },
  {
    region: 'cn_zh',
    protocol: 'anthropic',
    baseUrl: 'https://api.minimaxi.com/anthropic'
  }
])

console.log('hermes-provider-config-test: ok')
