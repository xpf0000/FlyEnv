import assert from 'node:assert/strict'
import { webPanelOpeningState } from '../src/render/util/WebPanelOpening'

const pgAdmin = webPanelOpeningState('pgadmin4')
assert.equal(pgAdmin.opening.value, false)
assert.equal(pgAdmin.start(), true)
assert.equal(pgAdmin.opening.value, true)

// A new page instance must observe the in-flight operation instead of resetting its button.
assert.equal(webPanelOpeningState('pgadmin4').opening.value, true)
assert.equal(pgAdmin.start(), false)

pgAdmin.finish()
assert.equal(webPanelOpeningState('pgadmin4').opening.value, false)

const dbGate = webPanelOpeningState('dbgate')
assert.equal(dbGate.opening.value, false)
assert.equal(dbGate.start(), true)
assert.equal(dbGate.opening.value, true)
dbGate.finish()
assert.equal(dbGate.opening.value, false)

console.log('Web panel opening state tests passed')
