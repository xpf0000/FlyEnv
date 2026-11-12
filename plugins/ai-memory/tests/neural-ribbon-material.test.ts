import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRibbonMaterial } from '../render/neural/ribbon-material'

test('static and flow ribbons have separate longitudinal envelope behavior', () => {
  const structure = createRibbonMaterial(5, 0.58, 1.05, 'static')
  const flow = createRibbonMaterial(3.2, 0.68, 1.08, 'flow')

  assert.equal(structure.uniforms.uStatic.value, 1)
  assert.equal(flow.uniforms.uStatic.value, 0)
  assert.equal(structure.uniforms.uWidth.value, 5)
  assert.equal(flow.uniforms.uWidth.value, 3.2)
  assert.equal(structure.uniforms.uBaseColor.value.getHexString(), 'e8a933')
  assert.equal(structure.uniforms.uHighlightColor.value.getHexString(), 'ffe0a3')
  assert.match(structure.vertexShader, /aSegmentProgress/)
  assert.match(structure.vertexShader, /aPathProgress/)
  assert.match(structure.fragmentShader, /segmentFade/)
  assert.match(structure.fragmentShader, /uStatic/)
  structure.dispose()
  flow.dispose()
})
