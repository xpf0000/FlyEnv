import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TomcatSiteSaveOperation } from '../src/render/components/Host/Tomcat/TomcatSiteSaveOperation'

const root = join(import.meta.dirname, '..')
const controller = readFileSync(
  join(root, 'src/render/components/Host/Tomcat/TomcatSiteController.ts'),
  'utf8'
)
const edit = readFileSync(join(root, 'src/render/components/Host/Tomcat/Edit.vue'), 'utf8')

assert.match(controller, /saving = false/)
assert.doesNotMatch(controller, /this\.saving\.value/)
assert.doesNotMatch(controller, /from 'vue'/)
assert.doesNotMatch(controller, /markRaw\(/)
assert.match(edit, /tomcatSiteController\.saving/)
assert.doesNotMatch(edit, /tomcatSiteController\.saving\.value/)

let releasePersist!: (value: { host: any[] }) => void
let persistCalls = 0
let restartCalls = 0
const operation = new TomcatSiteSaveOperation({
  persist: () =>
    new Promise((resolve) => {
      persistCalls += 1
      releasePersist = resolve
    }),
  applyHosts: () => {},
  writeHosts: async () => true,
  restart: async () => {
    restartCalls += 1
    return true
  }
})
const first = operation.save({ wasRunning: true } as any)
assert.equal(operation.saving, true)
assert.equal(await operation.save({ wasRunning: true } as any), false)
assert.equal(persistCalls, 1)
releasePersist({ host: [] })
assert.equal(await first, true)
assert.equal(restartCalls, 1)
assert.equal(operation.saving, false)

const stopped = new TomcatSiteSaveOperation({
  persist: async () => ({ host: [] }),
  applyHosts: () => {},
  writeHosts: async () => true,
  restart: async () => {
    throw new Error('must not restart')
  }
})
assert.equal(await stopped.save({ wasRunning: false } as any), true)
assert.equal(stopped.saving, false)

const failing = new TomcatSiteSaveOperation({
  persist: async () => {
    throw new Error('descriptor conflict')
  },
  applyHosts: () => {},
  writeHosts: async () => true,
  restart: async () => true
})
assert.equal(await failing.save({ wasRunning: false } as any), false)
assert.equal(failing.saving, false)
assert.equal(await failing.save({ wasRunning: false } as any), false)

const warning = new TomcatSiteSaveOperation({
  persist: async () => ({ host: [] }),
  applyHosts: () => {},
  writeHosts: async () => {
    throw new Error('hosts file unavailable')
  },
  restart: async () => true
})
assert.equal(await warning.save({ wasRunning: false } as any), true)
assert.equal(warning.phase, 'savedWithWarning')

const restartWarning = new TomcatSiteSaveOperation({
  persist: async () => ({ host: [] }),
  applyHosts: () => {},
  writeHosts: async () => true,
  restart: async () => 'restart failed'
})
assert.equal(await restartWarning.save({ wasRunning: true } as any), true)
assert.equal(restartWarning.phase, 'savedWithWarning')

console.log('tomcat site controller tests passed')
