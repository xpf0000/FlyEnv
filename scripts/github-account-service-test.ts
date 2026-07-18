import assert from 'node:assert/strict'
import { GitHubAccountService } from '../src/fork/module/App/GitHubAccount'

const requests: any[] = []
let machineCalls = 0
const service = new GitHubAccountService({
  machineId: async () => {
    machineCalls += 1
    return 'machine-1'
  },
  request: async (config: any) => {
    requests.push(config)
    if (config.url.endsWith('/user_github_auth')) {
      return { data: { data: { user: { uuid: 'user-1' }, license: [] } } }
    }
    if (config.url.endsWith('/user_github_license')) {
      return { data: { data: [{ uuid: 'machine-1', license: 'code' }] } }
    }
    if (config.url.endsWith('/user_github_license_del')) {
      return { data: { data: [{ uuid: 'machine-2', license: 'code-2' }] } }
    }
    if (config.url.endsWith('/user_github_license_add')) {
      return { data: { data: [{ uuid: 'machine-3', license: 'code-3' }] } }
    }
    return { data: { data: [] } }
  },
  getProxy: () => false,
  failureMessage: () => 'failed'
})

assert.deepEqual(await service.fetchUser(''), {})
assert.deepEqual(await service.fetchLicenses(''), [])
assert.equal(requests.length, 0)
assert.deepEqual(await service.fetchUser('user-1'), { user: { uuid: 'user-1' }, license: [] })
assert.deepEqual(await service.fetchLicenses('user-1'), [{ uuid: 'machine-1', license: 'code' }])
assert.deepEqual(await service.deleteBinding('user-1', 'machine-2', 'code-2'), [
  { uuid: 'machine-2', license: 'code-2' }
])
assert.deepEqual(await service.addBinding('user-1', 'machine-3', 'code-3'), [
  { uuid: 'machine-3', license: 'code-3' }
])
assert.equal(machineCalls, 1, 'machine ID must be cached')
assert.equal(requests[0].data.uuid, 'machine-1')
assert.equal(requests[0].proxy, false)
assert.equal(requests[0].timeout, 30000)
assert.deepEqual(requests[2].data, {
  user_uuid: 'user-1',
  uuid: 'machine-2',
  license: 'code-2'
})
assert.deepEqual(requests[3].data, {
  user_uuid: 'user-1',
  uuid: 'machine-3',
  license: 'code-3'
})

const failing = new GitHubAccountService({
  machineId: async () => 'machine-1',
  request: async () => ({ data: { message: 'server failed' } }),
  getProxy: () => false,
  failureMessage: () => 'fallback failed'
})
await assert.rejects(failing.addBinding('user-1', 'machine-1', 'code'), /server failed/)
await assert.rejects(failing.deleteBinding('', 'machine-1', 'code'), /fallback failed/)

console.log('GitHub account service tests passed')
