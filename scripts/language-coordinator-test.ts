import assert from 'node:assert/strict'
import { LanguageCoordinator } from '../src/main/core/LanguageCoordinator'
import type { LanguageAsset, LanguageChanged } from '../src/shared/LanguageProtocol'

const assets: Record<string, LanguageAsset> = {
  en: { schemaVersion: 1, locale: 'en', messages: { base: { title: 'English' } } },
  zh: { schemaVersion: 1, locale: 'zh', messages: { base: { title: '中文' } } },
  de: { schemaVersion: 1, locale: 'de', messages: { base: { title: 'Deutsch' } } }
}
const applied: string[] = []
const persisted: string[] = []
const published: LanguageChanged[] = []
const retained: string[] = []
let now = 1_000
let tokenNumber = 0

const coordinator = new LanguageCoordinator({
  repository: {
    load: async (locale: string) => {
      const asset = assets[locale]
      if (!asset) throw new Error(`missing ${locale}`)
      return asset
    },
    retain: (locale: string) => retained.push(locale)
  },
  runtime: {
    apply: (payload) => applied.push(payload.locale)
  },
  persist: (locale) => {
    persisted.push(locale)
  },
  publish: async (message) => {
    published.push(message)
  },
  refreshNativeUi: () => {},
  setServerLocale: () => {},
  now: () => now,
  token: () => `token-${++tokenNumber}`,
  requestId: () => `change-${tokenNumber}`
})

const startup = await coordinator.initialize('zh')
assert.equal(startup.locale, 'zh')
assert.deepEqual(applied, ['zh'])
assert.deepEqual(persisted, [])
assert.equal(coordinator.bootstrap().warning, undefined)

const stale = await coordinator.prepare('de')
const latest = await coordinator.prepare('zh')
await assert.rejects(() => coordinator.commit(stale.token), /Stale language preparation/)

const committed = await coordinator.commit(latest.token)
assert.equal(committed.locale, 'zh')
assert.deepEqual(persisted, ['zh'])
assert.equal(published.at(-1)?.payload.locale, 'zh')
assert.equal(retained.at(-1), 'zh')
await assert.rejects(() => coordinator.commit(latest.token), /Unknown language preparation/)

const expiring = await coordinator.prepare('de')
now = expiring.expiresAt + 1
await assert.rejects(() => coordinator.commit(expiring.token), /Expired language preparation/)

const fallbackCoordinator = new LanguageCoordinator({
  repository: {
    load: async (locale: string) => {
      if (locale === 'missing') throw new Error('corrupt locale')
      return assets.en
    },
    retain: () => {}
  },
  runtime: { apply: (payload) => applied.push(payload.locale) },
  persist: () => {
    throw new Error('startup fallback must not overwrite preference')
  },
  publish: async () => {},
  refreshNativeUi: () => {},
  setServerLocale: () => {},
  now: () => now,
  token: () => 'fallback-token',
  requestId: () => 'fallback-change'
})
assert.equal((await fallbackCoordinator.initialize('missing')).locale, 'en')
assert.match(fallbackCoordinator.bootstrap().warning || '', /corrupt locale/)
assert.equal(fallbackCoordinator.bootstrap().warning, undefined)
console.log('language coordinator tests passed')
