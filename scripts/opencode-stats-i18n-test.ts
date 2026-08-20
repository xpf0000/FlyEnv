import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { statTranslationKey } from '../src/render/components/OpenCode/statsI18n'

const expectedKeys = {
  OVERVIEW: 'openCode.statsLabels.overview',
  SESSIONS: 'openCode.statsLabels.sessions',
  MESSAGES: 'openCode.statsLabels.messages',
  DAYS: 'openCode.statsLabels.days',
  'COST & TOKENS': 'openCode.statsLabels.costAndTokens',
  'MODEL USAGE': 'openCode.statsLabels.models',
  'TOOL USAGE': 'openCode.statsLabels.toolUsage',
  'AVG COST/DAY': 'openCode.statsLabels.avgCostPerDay',
  'AVG TOKENS/SESSION': 'openCode.statsLabels.avgTokensPerSession',
  'MEDIAN TOKENS/SESSION': 'openCode.statsLabels.medianTokensPerSession',
  SUMMARY: 'openCode.statsLabels.summary',
  MODELS: 'openCode.statsLabels.models',
  'TOTAL COST': 'openCode.statsLabels.totalCost',
  'TOTAL TOKENS': 'openCode.statsLabels.totalTokens',
  'INPUT TOKENS': 'openCode.statsLabels.inputTokens',
  'OUTPUT TOKENS': 'openCode.statsLabels.outputTokens',
  'REASONING TOKENS': 'openCode.statsLabels.reasoningTokens',
  'CACHE READ TOKENS': 'openCode.statsLabels.cacheReadTokens',
  'CACHE WRITE TOKENS': 'openCode.statsLabels.cacheWriteTokens',
  COST: 'openCode.statsLabels.cost',
  'TOTAL REQUESTS': 'openCode.statsLabels.totalRequests',
  'TOTAL SESSIONS': 'openCode.statsLabels.totalSessions'
} as const

for (const [label, key] of Object.entries(expectedKeys)) {
  assert.equal(statTranslationKey(label), key)
}
assert.equal(statTranslationKey('A future OpenCode field'), undefined)

const statsView = readFileSync('src/render/components/OpenCode/Stats.vue', 'utf8')
assert.match(statsView, /localizeStatText\(group\.title\)/)
assert.match(statsView, /localizeStatText\(row\.label\)/)

for (const locale of ['en', 'zh']) {
  const messages = JSON.parse(readFileSync(`src/lang/${locale}/opencode.json`, 'utf8'))
  for (const key of Object.values(expectedKeys)) {
    const property = key.split('.').at(-1)!
    assert.equal(typeof messages.statsLabels?.[property], 'string', `${locale}: ${key}`)
  }
}

console.log('OpenCode statistics I18N tests passed')
