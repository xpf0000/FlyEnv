import assert from 'node:assert/strict'
import { getModelSizeColorForHardware } from '../src/render/util/ModelSize'

// Crossing the VRAM limit must not make a larger model look easier to run.
const hardware = { ramGB: 8, vramGB: 1, loaded: true }
const cases = [
  { size: 800 / 1024, color: 'success' },
  { size: 1, color: 'success' },
  { size: 1.2, color: 'success' },
  { size: 1.3, color: 'warning' },
  { size: 2.4, color: 'warning' },
  { size: 2.5, color: 'danger' }
] as const
for (const { size, color } of cases) {
  assert.equal(getModelSizeColorForHardware(size, hardware), color, `${size} GiB`)
}
for (const vramGB of [0, 1, 2, 8]) {
  let previous = -1
  for (let size = 0.1; size <= 16; size += 0.1) {
    const color = getModelSizeColorForHardware(size, { ...hardware, vramGB })
    const severity = ['success', 'warning', 'danger'].indexOf(color!)
    assert.ok(severity >= previous, `color regressed at ${size} GiB with ${vramGB} GiB VRAM`)
    previous = severity
  }
}
console.log('Model size color regressions passed')
