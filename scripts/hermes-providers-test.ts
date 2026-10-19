import assert from 'node:assert/strict'
import { HermesProviders } from '../src/render/components/Hermes/providers'

const minimax = HermesProviders.find((provider) => provider.name === 'MiniMax')
assert.ok(minimax)
assert.deepEqual(minimax.models, ['MiniMax-M3.1-Flash', 'MiniMax-M3'])
assert.deepEqual(
  minimax.modelDetails?.map((model) => model.id),
  minimax.models
)
const [flash, m3] = minimax.modelDetails!
for (const model of minimax.modelDetails!) {
  assert.equal(model.contextWindow, 1000000)
  assert.equal(model.maxOutputTokens, 524288)
  assert.deepEqual(model.inputModalities, ['text', 'image', 'video'])
  assert.equal(model.pricingUsdPerMillionTokens.cacheWrite, null)
}
assert.deepEqual(flash.pricingUsdPerMillionTokens, {
  input: 0.15,
  output: 0.6,
  cacheRead: 0.015,
  cacheWrite: null
})
assert.deepEqual(flash.thinking, ['adaptive'])
assert.deepEqual(flash.thinkingDefaults, { openai: 'adaptive', anthropic: 'adaptive' })
assert.deepEqual(flash.reasoningEffort, ['low', 'medium', 'high', 'xhigh', 'max'])
assert.equal(flash.reasoningEffortDefault, 'max')
assert.equal(flash.serviceTierSupported, false)
assert.equal(flash.pricingTiers, undefined)
assert.deepEqual(m3.pricingUsdPerMillionTokens, {
  input: 0.3,
  output: 1.2,
  cacheRead: 0.06,
  cacheWrite: null
})
assert.deepEqual(m3.pricingTiers, [
  { inputTokenCondition: '<=512k', input: 0.3, output: 1.2, cacheRead: 0.06 },
  { inputTokenCondition: '>512k', input: 0.6, output: 2.4, cacheRead: 0.12 }
])
assert.equal(m3.priorityPriceMultiplier, 1.5)
assert.deepEqual(m3.thinking, ['adaptive', 'disabled'])
assert.deepEqual(m3.thinkingDefaults, { openai: 'adaptive', anthropic: 'disabled' })
assert.deepEqual(m3.reasoningEffort, [])
assert.equal(m3.reasoningEffortDefault, null)
assert.equal(m3.serviceTierSupported, true)
assert.deepEqual(minimax.endpoints, [
  { region: 'global_en', protocol: 'openai', baseUrl: 'https://api.minimax.io/v1' },
  { region: 'global_en', protocol: 'anthropic', baseUrl: 'https://api.minimax.io/anthropic' },
  { region: 'cn_zh', protocol: 'openai', baseUrl: 'https://api.minimaxi.com/v1' },
  { region: 'cn_zh', protocol: 'anthropic', baseUrl: 'https://api.minimaxi.com/anthropic' }
])
assert.deepEqual(
  HermesProviders.filter((provider) => provider !== minimax),
  [
    { name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
    { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    { name: 'Anthropic', baseUrl: 'https://api.anthropic.com' }
  ]
)
console.log('Hermes provider metadata checks passed')
