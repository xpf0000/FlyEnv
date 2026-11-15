import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reactive } from 'vue'
import { memoryNavigationTab } from '../render/navigation'
test('memory tabs reuse global module tab selection across page lifetimes', () => {
  const registry = reactive<Record<string, number>>({ mcp: 2 })
  const firstPage = memoryNavigationTab(registry)
  assert.equal(firstPage.value, 'memories')
  firstPage.value = 'connect'
  assert.equal(registry['ai-memory'], 1)
  assert.equal(memoryNavigationTab(registry).value, 'connect')
  const nextPage = memoryNavigationTab(registry)
  nextPage.value = 'maintenance'
  assert.equal(firstPage.value, 'maintenance')
  assert.equal(registry.mcp, 2)
  registry['ai-memory'] = 99
  assert.equal(nextPage.value, 'memories')
})
