import assert from 'node:assert/strict'
import {
  getGroupManagedServiceEntries,
  getGroupManagedTypeFlags,
  isGroupManagedServiceModule
} from '../src/render/components/Aside/groupService'

function makeService(participatesInGroup?: boolean, running = false, fetching = false) {
  return {
    groupDo: () => [],
    switchChange() {},
    serviceRunning: running,
    serviceFetching: fetching,
    serviceDisabled: false,
    showItem: true,
    participatesInGroup
  }
}

async function main() {
  const serviceModules = {
    nginx: makeService(true, false, false),
    mcp: makeService(false, true, true)
  }

  assert.equal(isGroupManagedServiceModule(serviceModules.nginx as any), true)
  assert.equal(isGroupManagedServiceModule(serviceModules.mcp as any), false)
  assert.equal(isGroupManagedServiceModule(makeService(undefined) as any), true)

  const groupFlags = getGroupManagedTypeFlags(
    [
      { typeFlag: 'nginx', isService: true },
      { typeFlag: 'mcp', isService: true },
      { typeFlag: 'git', isService: false }
    ] as any,
    { nginx: true, mcp: true },
    serviceModules as any
  )

  assert.deepEqual(groupFlags, ['nginx'])

  const groupEntries = getGroupManagedServiceEntries(serviceModules as any)
  assert.deepEqual(
    groupEntries.map((entry) => entry.typeFlag),
    ['nginx']
  )
  assert.equal(
    groupEntries.some((entry) => !!entry.module.serviceRunning),
    false
  )

  console.log('mcp-group-service-test: ok')
}

main().catch((error) => {
  console.error('mcp-group-service-test: failed', error)
  process.exit(1)
})
