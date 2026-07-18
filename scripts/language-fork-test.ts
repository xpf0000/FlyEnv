import assert from 'node:assert/strict'
import { ForkLanguageService } from '../src/fork/LanguageService'
import type { LanguageChanged, LanguageRuntimePayload } from '../src/shared/LanguageProtocol'

const applied: string[] = []
const sent: unknown[] = []
const service = new ForkLanguageService({
  apply: (payload) => applied.push(payload.locale),
  send: (message) => sent.push(message)
})

const payload: LanguageRuntimePayload = {
  locale: 'zh',
  fallbackLocale: 'en',
  messages: { base: { title: '中文' } },
  fallbackMessages: { base: { title: 'English' } }
}

service.initialize(payload)
assert.deepEqual(applied, ['zh'])

const changed: LanguageChanged = {
  type: 'language-changed',
  requestId: 'change-1',
  payload: { ...payload, locale: 'de', messages: { base: { title: 'Deutsch' } } }
}
assert.equal(service.handle(changed), true)
assert.deepEqual(applied, ['zh', 'de'])
assert.deepEqual(sent, [{ type: 'language-changed-ack', requestId: 'change-1', locale: 'de' }])
assert.equal(service.handle({ type: 'normal-command' }), false)
console.log('language fork tests passed')
