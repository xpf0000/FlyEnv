import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createScaledPageOptions } from '../src/main/ui/PageOptions'

const baseOptions = {
  attrs: {
    title: 'FlyEnv',
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600
  },
  bindCloseToHide: true,
  url: 'index.html'
}
const originalOptions = structuredClone(baseOptions)

const firstLowResolutionResult = createScaledPageOptions(baseOptions, {
  width: 1024,
  height: 768
})
const secondLowResolutionResult = createScaledPageOptions(baseOptions, {
  width: 1024,
  height: 768
})

assert.deepEqual(firstLowResolutionResult, secondLowResolutionResult)
assert.deepEqual(
  firstLowResolutionResult?.attrs,
  {
    title: 'FlyEnv',
    width: 1050,
    height: 700,
    minWidth: 700,
    minHeight: 525
  },
  'window size and minimum size must use the same low-resolution scale'
)
assert.deepEqual(baseOptions, originalOptions, 'the shared page config must remain unchanged')
assert.notStrictEqual(firstLowResolutionResult, baseOptions)
assert.notStrictEqual(firstLowResolutionResult?.attrs, baseOptions.attrs)

const regularResolutionResult = createScaledPageOptions(baseOptions, {
  width: 1280,
  height: 800
})
assert.deepEqual(regularResolutionResult, baseOptions)
assert.notStrictEqual(regularResolutionResult, baseOptions)
assert.notStrictEqual(regularResolutionResult?.attrs, baseOptions.attrs)

const shortDisplayResult = createScaledPageOptions(baseOptions, {
  width: 1280,
  height: 768
})
assert.deepEqual(shortDisplayResult.attrs, {
  title: 'FlyEnv',
  width: 1200,
  height: 700,
  minWidth: 800,
  minHeight: 525
})

const trayOptions = {
  attrs: {},
  bindCloseToHide: true,
  url: 'tray.html'
}
assert.deepEqual(createScaledPageOptions(trayOptions, { width: 1024, height: 768 }), trayOptions)
assert.equal(createScaledPageOptions(undefined, { width: 1024, height: 768 }), undefined)

const windowManagerSource = readFileSync('src/main/ui/WindowManager.ts', 'utf8')
assert.match(windowManagerSource, /createScaledPageOptions\(/)
assert.match(windowManagerSource, /screen\.getPrimaryDisplay\(\)\.workAreaSize/)
assert.doesNotMatch(windowManagerSource, /pageConfig\[page\][\s\S]*?attrs\.(?:width|height)\s*\*=/)

console.log('window page options tests passed')
