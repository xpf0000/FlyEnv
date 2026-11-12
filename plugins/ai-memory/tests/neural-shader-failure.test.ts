import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeShaderFailure } from '../render/neural/shader-failure'

test('only exact exterior program defines isolate failures; other shaders retain shared fallback', () => {
  const source = (text: string) => ({ getShaderSource: () => text })
  let outer = 0
  let shared = 0
  const dispatch = (text: string | null) =>
    routeShaderFailure(
      source(text as string),
      {},
      {},
      () => outer++,
      () => shared++
    )
  dispatch('#version 300 es\n#define FLYENV_OUTER_ARC_LAYER 1\nvoid main() {}')
  assert.deepEqual([outer, shared], [1, 0])
  dispatch('#define FLYENV_OUTER_ARC_LAYER_OTHER 1')
  dispatch('// FLYENV_OUTER_ARC_LAYER')
  dispatch(null)
  assert.deepEqual([outer, shared], [1, 3])
})

test('circuit-field compilation errors disable their own decorative owner', () => {
  let field = 0,
    outer = 0,
    shared = 0
  routeShaderFailure(
    { getShaderSource: () => '#define FLYENV_CIRCUIT_FIELD_LAYER 1\nvoid main() {}' },
    {},
    {},
    () => outer++,
    () => shared++,
    () => field++
  )
  assert.deepEqual([field, outer, shared], [1, 0, 0])
})
