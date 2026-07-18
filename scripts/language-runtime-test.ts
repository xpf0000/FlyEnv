import assert from 'node:assert/strict'
import {
  isLanguageAsset,
  isLanguageChanged,
  isLanguageManifest,
  type LanguageRuntimePayload
} from '../src/shared/LanguageProtocol'
import {
  AppI18n,
  I18nT,
  applyLanguagePayload,
  getActiveLocale,
  releaseLocalePayload
} from '../src/lang/runtime'

const english = { base: { greeting: 'Hello', fallbackOnly: 'Fallback' } }
const chinese = { base: { greeting: '你好' } }

assert.equal(
  isLanguageAsset({ schemaVersion: 1, locale: 'en', messages: english }),
  true
)
assert.equal(isLanguageAsset({ schemaVersion: 2, locale: 'en', messages: english }), false)
assert.equal(
  isLanguageManifest({
    schemaVersion: 1,
    fallbackLocale: 'en',
    locales: { en: { file: 'en.json', label: 'English' } }
  }),
  true
)
assert.equal(
  isLanguageChanged({
    type: 'language-changed',
    requestId: 'change-1',
    payload: {
      locale: 'zh',
      fallbackLocale: 'en',
      messages: chinese,
      fallbackMessages: english
    }
  }),
  true
)

const payload: LanguageRuntimePayload = {
  locale: 'zh',
  fallbackLocale: 'en',
  messages: chinese,
  fallbackMessages: english
}
applyLanguagePayload(payload)
assert.equal(getActiveLocale(), 'zh')
assert.equal(I18nT('base.greeting'), '你好')
assert.equal(I18nT('base.fallbackOnly'), 'Fallback')

applyLanguagePayload({
  locale: 'de',
  fallbackLocale: 'en',
  messages: { base: { greeting: 'Hallo' } },
  fallbackMessages: english
})
assert.equal(getActiveLocale(), 'de')
assert.equal(I18nT('base.greeting'), 'Hallo')
assert.deepEqual(AppI18n().global.getLocaleMessage('zh'), {})

releaseLocalePayload('zh')
assert.deepEqual(AppI18n().global.getLocaleMessage('zh'), {})
console.log('language runtime tests passed')
