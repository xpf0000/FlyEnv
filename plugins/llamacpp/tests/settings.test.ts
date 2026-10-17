import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SettingsDraft } from '../render/settings/useSettingsDraft'
test('draft edits do not affect domain and late file picker cannot overwrite a new model', async () => {
  const a = { name: 'a', ref: '' },
    b = { name: 'b', ref: '' }
  const d = new SettingsDraft(a)
  const token = d.generation
  d.value.name = 'changed'
  assert.equal(a.name, 'a')
  assert.equal(d.dirty, true)
  assert.equal(
    await d.requestLeave(
      async () => 'cancel',
      async () => {}
    ),
    false
  )
  d.load(b)
  assert.equal(
    d.accept(token, (v) => {
      v.ref = '/old/file'
    }),
    false
  )
  assert.equal(d.value.ref, '')
  d.value.name = 'b changed'
  await assert.rejects(
    d.requestLeave(
      async () => 'save',
      async () => {
        throw Error('disk')
      }
    )
  )
  assert.equal(d.dirty, true)
})
test('discard clears a kept-alive page draft instead of asking again on the next leave', async () => {
  const d = new SettingsDraft({ value: 'original' })
  d.value.value = 'changed'
  assert.equal(
    await d.requestLeave(
      async () => 'discard',
      async () => {}
    ),
    true
  )
  assert.equal(d.dirty, false)
  assert.equal(d.value.value, 'original')
})
