import assert from 'node:assert/strict'
import { test } from 'node:test'
import { folderInitial, folderGradient } from '../render/avatar'

test('folder avatar follows the name and keeps whole Unicode characters', () => {
  assert.equal(folderInitial(' flyenv '), 'F')
  assert.equal(folderInitial('中文'), '中')
  assert.equal(folderInitial('🚀 Project'), '🚀')
  assert.equal(folderInitial(''), '?')
  assert.equal(folderGradient('same-id'), folderGradient('same-id'))
  assert.match(folderGradient('same-id'), /^linear-gradient\(135deg, /)
})
